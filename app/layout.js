import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider } from "@/context/UserContext";
import { PwaRegister } from "@/components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "HUSH — Private conversations. Nothing to keep.",
  description: "Say it. Don't save it. Ephemeral peer-to-peer chat rooms with zero message persistence.",
  keywords: ["ephemeral chat", "private chat", "temporary room", "webrtc", "p2p", "no persistence"],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HUSH",
  },
  applicationName: "HUSH",
  other: {
    "darkreader-lock": "true",
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <meta name="darkreader-lock" content="true" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090b" />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5]"
      >
        <PwaRegister />
        <ThemeProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
