"use client";

import React, { useState, useRef } from "react";
import { Send } from "lucide-react";

export function MessageInput({ onSendMessage, disabled = false, placeholder = "Type a message..." }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    onSendMessage(text);
    setText("");
    // Keep focus on desktop
    if (window.innerWidth > 640) {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 sm:p-4 bg-white/90 dark:bg-neutral-950/90 border-t border-neutral-200 dark:border-neutral-800 backdrop-blur-md transition-colors"
    >
      <div className="max-w-4xl mx-auto flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={1000}
          className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="hidden sm:inline">Send</span>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
