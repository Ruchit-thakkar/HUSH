"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { clearRoomHistory } from "@/lib/storage";
import { Sun, Moon, Trash2, ArrowLeft, RefreshCw, ShieldCheck, Check } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { userId, regenerateUserId } = useUser();
  const [historyCleared, setHistoryCleared] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  const handleClearHistory = () => {
    clearRoomHistory();
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2500);
  };

  const handleRegenerateId = () => {
    regenerateUserId();
    setRegenerated(true);
    setTimeout(() => setRegenerated(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 max-w-xl mx-auto px-4 py-12 w-full">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/"
            className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-mono mb-2">
          SETTINGS
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-8">
          Manage local appearance, session identity, and data.
        </p>

        <div className="space-y-6">
          {/* Appearance Section */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Appearance
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
              Select between Dark Mode and Light Mode.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs font-mono font-medium transition-all cursor-pointer ${
                  theme === "dark"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shadow-xs"
                    : "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-600"
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-xs font-mono font-medium transition-all cursor-pointer ${
                  theme === "light"
                    ? "border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 shadow-xs"
                    : "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-600"
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light Mode</span>
              </button>
            </div>
          </div>

          {/* Temporary User ID */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Temporary User ID
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
              Identifies your browser session inside chat rooms. Not tied to any real account.
            </p>

            <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
              <span className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {userId || "Generating..."}
              </span>

              <button
                type="button"
                onClick={handleRegenerateId}
                title="Generate new temporary ID"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
              >
                {regenerated ? <Check className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{regenerated ? "Regenerated" : "Regenerate"}</span>
              </button>
            </div>
          </div>

          {/* Local Room History */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Room History
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
              Clear the locally saved room code and timestamp records from your browser.
            </p>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-xs font-mono font-medium text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:border-neutral-400 dark:hover:border-neutral-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{historyCleared ? "History Cleared" : "Clear Room History"}</span>
              </button>

              <Link
                href="/history"
                className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-4 font-mono transition-colors"
              >
                View History
              </Link>
            </div>
          </div>

          {/* Privacy Information Notice */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-neutral-500" />
              <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 uppercase font-mono">
                Privacy Architecture
              </h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed mb-3">
              &ldquo;Messages are designed to be transmitted through an encrypted peer-to-peer connection and are not stored by HUSH.&rdquo;
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-500 leading-relaxed">
              HUSH operates with zero database, zero message logging, and zero chat analytics. Chat data exists solely in active memory and dissolves when your session concludes.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
