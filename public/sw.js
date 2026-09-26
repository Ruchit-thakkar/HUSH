const CACHE_NAME = "hush-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.png",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("PWA cache addAll error (non-fatal):", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // STRICT REQUIREMENT: Never cache or intercept any /api/ signaling or dynamic routes
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Network first with cache fallback for HTML navigation
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
    return;
  }

  // Cache first for static images and icons
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default network pass-through
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
