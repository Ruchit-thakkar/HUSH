"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => {
            console.warn("ServiceWorker registration failed: ", err);
          });
      });
    }
  }, []);

  return null;
}
