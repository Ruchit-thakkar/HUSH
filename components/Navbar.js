"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "./ThemeToggle";
import { Users, Settings as SettingsIcon, LogOut, History, AlertTriangle, Link2, Check } from "lucide-react";

export function Navbar({
  roomId = null,
  connectedCount = 0,
  connectionState = "connected", // connecting | waiting_participant | waiting_host | connected | failed | disconnected
  hostConnected = true,
  onOpenParticipants = null,
  onLeaveRoom = null,
  isHost = false,
}) {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    if (!roomId || typeof window === "undefined") return;
    const link = `${window.location.origin}/join/${roomId}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const getConnectionLabel = () => {
    if (connectionState === "connecting") return "Connecting...";
    if (connectionState === "waiting_participant") return "Waiting for Participant";
    if (connectionState === "waiting_host" || !hostConnected) return "Waiting for Host";
    if (connectionState === "failed") return "Connection Failed";
    if (connectionState === "disconnected") return "Disconnected";
    return `Connected: ${connectedCount}`;
  };

  const isWarningState = connectionState === "failed" || !hostConnected;

  return (
    <header className="w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand & Room Info */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus:outline-none"
            title="HUSH Home"
          >
            <div className="w-7 h-7 rounded-md overflow-hidden bg-neutral-900 flex items-center justify-center transition-transform group-hover:scale-105 border border-neutral-200 dark:border-neutral-800">
              <Image
                src="/logo.png"
                alt="HUSH Logo"
                width={28}
                height={28}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <span className="font-semibold tracking-wider text-base text-neutral-900 dark:text-neutral-100 font-mono">
              HUSH
            </span>
          </Link>

          {roomId && (
            <div className="flex items-center gap-2 pl-3 border-l border-neutral-200 dark:border-neutral-800">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider font-mono hidden sm:inline">
                Room:
              </span>
              <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">
                {roomId}
              </span>
              {isHost && (
                <span className="text-[10px] font-mono uppercase bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-1.5 py-0.5 rounded font-medium">
                  Host
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {roomId ? (
            <>
              {/* Copy Room Link Button */}
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 transition-colors cursor-pointer"
                title="Copy Room Link (/join/CODE)"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500 font-semibold">Room link copied.</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Copy Room Link</span>
                    <span className="sm:hidden">Link</span>
                  </>
                )}
              </button>

              {/* Connection Status & Participant Count */}
              <button
                type="button"
                onClick={onOpenParticipants}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors border ${
                  isWarningState
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
                    : "text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-800"
                }`}
                title="View Participants & Connection Status"
              >
                {isWarningState ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-pulse" />
                    <Users className="w-3.5 h-3.5" />
                  </>
                )}
                <span>{getConnectionLabel()}</span>
              </button>

              <Link
                href="/settings"
                className="p-2 rounded-md text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                title="Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </Link>

              <ThemeToggle />

              {/* Leave Room Button */}
              <button
                type="button"
                onClick={onLeaveRoom}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 transition-colors"
                title="Leave Room"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leave Room</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/history"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                title="Room History"
              >
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Room History</span>
              </Link>

              <Link
                href="/settings"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                title="Settings"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </Link>

              <ThemeToggle />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
