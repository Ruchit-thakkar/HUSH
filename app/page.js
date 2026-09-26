"use client";

import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Shield, ArrowRight, Plus, LogIn, Lock, Zap, EyeOff } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-3xl mx-auto w-full">
        {/* Minimal Shield Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-600 dark:text-neutral-400 mb-8 shadow-xs">
          <Shield className="w-3.5 h-3.5 text-neutral-500" />
          <span>Say it. Don&apos;t save it.</span>
        </div>

        {/* Brand Headline */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-4 font-mono">
          HUSH
        </h1>

        {/* Main Message */}
        <p className="text-xl sm:text-2xl font-medium text-neutral-700 dark:text-neutral-300 max-w-xl mb-4 tracking-tight">
          Private conversations. Nothing to keep.
        </p>

        {/* Secondary Info */}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mb-10 leading-relaxed">
          Messages are transmitted over encrypted peer-to-peer connections and exist only in active memory. Messages are not stored.
        </p>

        {/* Primary Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm mb-14">
          <Link
            href="/create"
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 font-medium text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-xs group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            <span>Create Room</span>
          </Link>

          <Link
            href="/join"
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-medium text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/80 transition-all shadow-xs"
          >
            <LogIn className="w-4 h-4" />
            <span>Join Room</span>
          </Link>
        </div>

        {/* Technical Architecture Guarantees (Clean, Monochromatic, Serious) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 mb-2.5">
              <EyeOff className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Zero Database
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              No message database, no storage, no message logs. Once you leave, it is gone forever.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 mb-2.5">
              <Zap className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              P2P DataChannel
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Peer-to-peer real-time transport with built-in DTLS encryption directly between participants.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 mb-2.5">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Ephemeral IDs
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              No email, no phone, no account required. Random session IDs that dissolve when closed.
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full border-t border-neutral-200 dark:border-neutral-800 py-6 text-center text-xs text-neutral-400 dark:text-neutral-600 transition-colors">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="font-mono">HUSH • Ephemeral Communication</p>
          <div className="flex items-center gap-4">
            <Link href="/history" className="hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
              Room History
            </Link>
            <Link href="/settings" className="hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
