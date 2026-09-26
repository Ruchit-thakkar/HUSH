"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { getRoomHistory, clearRoomHistory } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { History, Trash2, ShieldCheck, ArrowLeft, ArrowUpRight } from "lucide-react";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setHistory(getRoomHistory());
  }, []);

  const handleClearHistory = () => {
    clearRoomHistory();
    setHistory([]);
    setCleared(true);
    setTimeout(() => setCleared(false), 2500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/"
                className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Home</span>
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-mono">
              ROOM HISTORY
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Locally stored session metadata only. No message content is ever recorded.
            </p>
          </div>

          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Room History</span>
            </button>
          )}
        </div>

        {/* Privacy Callout */}
        <div className="mb-6 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            HUSH never persists message content, usernames, or media. The records below are saved in your browser&apos;s local storage strictly as a convenience log of rooms you visited.
          </p>
        </div>

        {cleared && (
          <div className="mb-4 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-xs font-mono text-neutral-600 dark:text-neutral-300 text-center animate-in fade-in">
            Local room history cleared.
          </div>
        )}

        {/* List of room metadata */}
        {history.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 p-8">
            <History className="w-8 h-8 mx-auto text-neutral-400 mb-3 opacity-60" />
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              No Room History
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs mx-auto">
              Rooms you create or join will appear here with basic timestamps.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((item, idx) => (
              <div
                key={`${item.roomCode}-${idx}`}
                className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {item.roomCode}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {item.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>Created: {formatDate(item.createdAt)}</span>
                    <span>•</span>
                    <span>Status: {item.status}</span>
                  </div>
                </div>

                <Link
                  href={`/join?code=${item.roomCode}`}
                  className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Revisit room code"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
