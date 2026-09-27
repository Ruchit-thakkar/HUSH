"use client";

import React, { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";
import { EMOJI_LIST, REACTION_RATE_LIMIT, REACTION_WINDOW_MS } from "@/lib/reactions";
export { EMOJI_LIST };

/**
 * ReactionsBar: Floating/docked picker allowing users to send reactions
 */
export function ReactionsBar({ onSendReaction, userId }) {
  const [isOpen, setIsOpen] = useState(false);
  const timestampsRef = useRef([]);

  const handleEmojiClick = (emoji) => {
    const now = Date.now();
    // Rate limiting: maximum 5 reactions per second
    timestampsRef.current = timestampsRef.current.filter(
      (t) => now - t < REACTION_WINDOW_MS
    );
    if (timestampsRef.current.length >= REACTION_RATE_LIMIT) {
      return;
    }
    timestampsRef.current.push(now);

    const reaction = {
      type: "reaction",
      reactionId:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `react_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: userId || "Anonymous",
      emoji,
      timestamp: now,
    };

    onSendReaction?.(reaction);
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Send Reaction"
        className={`p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 transition-all cursor-pointer ${
          isOpen
            ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
        }`}
      >
        <Smile className="w-4 h-4" />
      </button>

      {/* Emoji Palette Popover */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 sm:left-auto sm:right-0 z-30 p-1.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl flex items-center gap-1 animate-in fade-in zoom-in-95 duration-100">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiClick(emoji)}
              className="p-1.5 sm:p-2 rounded-xl text-lg sm:text-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:scale-125 active:scale-95 transition-transform cursor-pointer select-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ReactionsOverlay: Full-viewport floating reaction animations
 * Disappears automatically in 2.5 - 3.5 seconds
 */
export function ReactionsOverlay({ reactions = [] }) {
  if (reactions.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {reactions.map((r) => (
        <FloatingReactionItem key={r.reactionId} reaction={r} />
      ))}
    </div>
  );
}

function FloatingReactionItem({ reaction }) {
  const { emoji, userId, reactionId } = reaction;

  // Generate deterministic-looking yet jittered layout offset based on reactionId
  const [styleParams] = useState(() => {
    let hash = 0;
    for (let i = 0; i < reactionId.length; i++) {
      hash = (hash << 5) - hash + reactionId.charCodeAt(i);
    }
    const leftPercent = 35 + (Math.abs(hash) % 35); // 35% to 70% of screen width
    const driftX = ((Math.abs(hash) % 80) - 40); // -40px to +40px horizontal drift
    return { leftPercent, driftX };
  });

  return (
    <div
      className="absolute bottom-16 flex flex-col items-center select-none"
      style={{
        left: `${styleParams.leftPercent}%`,
        animation: "hush-float-fade 2.8s cubic-bezier(0.2, 0.6, 0.35, 1) forwards",
        "--drift-x": `${styleParams.driftX}px`,
      }}
    >
      <span className="text-4xl sm:text-5xl filter drop-shadow-md transform transition-transform">
        {emoji}
      </span>
      {userId && (
        <span className="mt-1 px-2 py-0.5 rounded-full bg-neutral-900/80 dark:bg-neutral-100/90 text-neutral-100 dark:text-neutral-900 text-[10px] font-mono font-medium shadow-sm">
          {userId}
        </span>
      )}
    </div>
  );
}
