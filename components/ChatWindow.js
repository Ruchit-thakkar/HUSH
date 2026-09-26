"use client";

import React, { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { Lock, ShieldCheck } from "lucide-react";

export function ChatWindow({ messages = [], myUserId = "" }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl w-full mx-auto flex flex-col justify-start">
      {/* Session Privacy Banner at the top of chat */}
      <div className="mx-auto mb-6 max-w-md w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
          <span>Active Ephemeral Session</span>
        </div>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Messages exist only in active device memory. No database, no chat logging.
        </p>
      </div>

      {/* Empty State */}
      {messages.length === 0 ? (
        <div className="my-auto text-center py-12 px-4 max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 mx-auto flex items-center justify-center text-neutral-400 dark:text-neutral-500 mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Say it. Don&apos;t save it.
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            This room is ready. Messages sent here will disappear permanently when the session ends or you leave.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isMe={msg.senderId === myUserId}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
