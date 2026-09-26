"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { useUser } from "@/context/UserContext";
import { generateRoomId } from "@/lib/room";
import { Copy, Check, Share2, ArrowRight, RefreshCw, ShieldAlert, Loader2 } from "lucide-react";

export default function CreateRoomPage() {
  const router = useRouter();
  const { userId } = useUser();
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const initRef = useRef(false);

  // Initialize and register room on server
  const initRoom = async (codeToUse) => {
    if (!userId) return;
    setIsCreating(true);
    setError(null);

    const code = codeToUse || generateRoomId();
    setRoomCode(code);

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: userId, customRoomId: code }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to initialize room.");
      }
    } catch (err) {
      console.error("Create room error:", err);
      setError(err.message || "Failed to initialize room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    if (!initRef.current && userId) {
      initRef.current = true;
      initRoom();
    }
  }, [userId]);

  const handleCopy = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShare = async () => {
    if (!roomCode) return;
    const shareUrl = `${window.location.origin}/join?code=${roomCode}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join HUSH Room",
          text: `Join private temporary room on HUSH: ${roomCode}`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Share failed, falling back to clipboard:", err);
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {}
  };

  const handleEnterRoom = () => {
    if (!roomCode || !userId) return;
    router.push(`/room/${roomCode}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-lg mx-auto w-full">
        <div className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
              <span>Role: HOST</span>
            </div>

            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-pulse" />
              <span>Waiting for participant</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
            Room Created
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
            Share this temporary code with participants. You can close the room at any time.
          </p>

          {/* Room Code Display Card */}
          <div className="mb-6 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-wider font-mono text-neutral-400 dark:text-neutral-500 block mb-1">
                Room Code
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-neutral-900 dark:text-neutral-50">
                {roomCode || "••••-••••"}
              </span>
            </div>

            <button
              type="button"
              disabled={isCreating}
              onClick={() => initRoom()}
              title="Generate new code"
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isCreating ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg border border-red-200 dark:border-red-950 bg-red-50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!roomCode}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy Code"}</span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                disabled={!roomCode}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {shared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{shared ? "Link Copied" : "Share"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleEnterRoom}
              disabled={isCreating || !roomCode}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 font-medium text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparing Room...</span>
                </>
              ) : (
                <>
                  <span>Enter Room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-6 font-mono">
          The room code only identifies this temporary session.
        </p>
      </main>
    </div>
  );
}
