"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText, AlertTriangle } from "lucide-react";
import { formatFileSize, MAX_FILE_SIZE, isAcceptedImageType } from "@/lib/file-transfer";
import { ReactionsBar } from "./Reactions";

export function MessageInput({
  onSendMessage,
  onSendFile,
  onSendReaction,
  userId,
  disabled = false,
  placeholder = "Type a message...",
}) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileError, setFileError] = useState(null);

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Manage in-memory preview object URL
  useEffect(() => {
    if (!pendingFile) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    if (isAcceptedImageType(pendingFile.type)) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [pendingFile]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    // Reset file input so same file can be selected again if cancelled
    e.target.value = "";

    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum file size is 100 MB.");
      return;
    }

    setFileError(null);
    setPendingFile(file);
  };

  const handleCancelFile = () => {
    setPendingFile(null);
    setFileError(null);
  };

  const handleSendFile = async () => {
    if (!pendingFile || !onSendFile) return;
    const fileToSend = pendingFile;
    setPendingFile(null);
    await onSendFile(fileToSend);
  };

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
    <>
      {/* File Size Error Alert Modal */}
      {fileError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">File is too large.</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-5 leading-relaxed">
              Maximum file size is 100 MB. Please select a smaller file.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setFileError(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Send Image & File Temporary Preview Modal */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-xs font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                {previewUrl ? "Image Preview" : "File Preview"}
              </span>
              <button
                type="button"
                onClick={handleCancelFile}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* In-Memory Preview Visual */}
            {previewUrl ? (
              <div className="w-full rounded-xl overflow-hidden bg-neutral-950/40 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center max-h-64">
                {/* Safe ephemeral preview - image rendered directly from local blob URL */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-64 w-auto object-contain select-none"
                />
              </div>
            ) : (
              <div className="w-full rounded-xl p-6 bg-neutral-100/60 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 mb-2">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono text-neutral-500 uppercase">
                  Binary File
                </span>
              </div>
            )}

            {/* Metadata (rendered safely as text, never innerHTML) */}
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 break-all select-all">
                {pendingFile.name}
              </span>
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                {formatFileSize(pendingFile.size)}
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-tight">
              Files are transferred directly through the active WebRTC connection and are not stored by HUSH.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleCancelFile}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendFile}
                className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Composer Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-3 sm:p-4 bg-white/90 dark:bg-neutral-950/90 border-t border-neutral-200 dark:border-neutral-800 backdrop-blur-md transition-colors"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {/* Hidden File Picker Input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            id="hush-file-picker"
          />

          {/* Attachment Button [ 📎 ] */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="Attach Image or File"
            className="inline-flex items-center justify-center p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Temporary Reactions Picker */}
          {onSendReaction && (
            <div className="shrink-0">
              <ReactionsBar onSendReaction={onSendReaction} userId={userId} />
            </div>
          )}

          {/* Text Message Input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            maxLength={1000}
            className="flex-1 min-w-0 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!text.trim() || disabled}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <span className="hidden sm:inline">Send</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </>
  );
}
