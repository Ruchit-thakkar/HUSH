"use client";

import React from "react";
import { formatTime } from "@/lib/utils";

export function MessageBubble({ message, isMe }) {
  const { senderId, text, timestamp } = message;

  return (
    <div
      className={`flex flex-col mb-3.5 max-w-[85%] sm:max-w-[75%] ${
        isMe ? "ml-auto items-end" : "mr-auto items-start"
      }`}
    >
      {/* Sender identification */}
      <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
        <span>{isMe ? "You" : senderId}</span>
        <span>•</span>
        <span>{formatTime(timestamp)}</span>
      </div>

      {/* Message container */}
      <div
        className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
          isMe
            ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 rounded-br-xs border border-neutral-800 dark:border-neutral-700"
            : "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-200 rounded-bl-xs border border-neutral-200 dark:border-neutral-800"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
