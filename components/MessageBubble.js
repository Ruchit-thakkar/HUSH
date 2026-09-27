"use client";

import React from "react";
import { formatTime } from "@/lib/utils";
import { formatFileSize, triggerFileDownload } from "@/lib/file-transfer";
import { Download, FileText, Check, AlertCircle } from "lucide-react";

export function MessageBubble({
  message,
  isMe,
  isHostSender = false,
  onCancelTransfer,
}) {
  const {
    senderId,
    text,
    timestamp,
    isSystem,
    type,
    transferId,
    fileName,
    fileSize,
    blobUrl,
    blob,
    status,
    progress = 0,
    error,
  } = message;

  if (isSystem) {
    return (
      <div className="flex items-center justify-center my-2 text-center">
        <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-900/90 px-3 py-1 rounded-full border border-neutral-200/60 dark:border-neutral-800/80">
          {text}
        </span>
      </div>
    );
  }

  // Phase 5: Image Message
  if (type === "image") {
    return (
      <div
        className={`flex flex-col mb-3.5 max-w-[85%] sm:max-w-[75%] ${
          isMe ? "ml-auto items-end" : "mr-auto items-start"
        }`}
      >
        {/* Sender identification */}
        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
          <span>{isMe ? "You" : senderId}</span>
          {isHostSender && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold inline-flex items-center gap-0.5">
              <span>👑</span>
              <span>HOST</span>
            </span>
          )}
          <span>•</span>
          <span>{formatFileSize(fileSize)}</span>
          <span>•</span>
          <span>{formatTime(timestamp)}</span>
        </div>

        {/* Image Content Container */}
        <div
          className={`p-2.5 rounded-2xl border text-sm leading-relaxed overflow-hidden ${
            isMe
              ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 rounded-br-xs border-neutral-800 dark:border-neutral-700"
              : "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-200 rounded-bl-xs border-neutral-200 dark:border-neutral-800"
          }`}
        >
          {status === "cancelled" ? (
            <div className="p-3 text-xs font-mono text-amber-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Transfer cancelled.</span>
            </div>
          ) : status === "failed" ? (
            <div className="p-3 text-xs font-mono text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error || "Transfer failed because the connection was lost."}</span>
            </div>
          ) : status === "transferring" ? (
            <div className="p-2 min-w-[220px]">
              <div className="text-[11px] font-mono text-neutral-400 mb-1">
                {isMe ? "Sending..." : `${senderId} is sending:`}
              </div>
              <div className="text-xs font-semibold truncate mb-2">{fileName}</div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2 rounded-full overflow-hidden mb-2">
                <div
                  className="bg-neutral-900 dark:bg-neutral-100 h-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">{progress}%</span>
                {isMe && onCancelTransfer && (
                  <button
                    type="button"
                    onClick={() => onCancelTransfer(transferId)}
                    className="text-red-500 hover:text-red-400 cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Complete: Inline Image Preview */
            <div className="flex flex-col gap-2">
              {blobUrl && (
                <div className="rounded-xl overflow-hidden bg-neutral-950/30 flex items-center justify-center max-w-sm max-h-72">
                  <img
                    src={blobUrl}
                    alt={fileName || "Image"}
                    className="max-h-72 w-auto object-contain cursor-pointer"
                    onClick={() => blob && triggerFileDownload(blob, fileName)}
                    title="Click to download image"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold truncate max-w-[180px]">{fileName}</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {formatFileSize(fileSize)}
                  </span>
                </div>
                {isMe ? (
                  <span className="text-[11px] font-mono text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Sent</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => blob && triggerFileDownload(blob, fileName)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save Image</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 5: File Message
  if (type === "file") {
    return (
      <div
        className={`flex flex-col mb-3.5 max-w-[85%] sm:max-w-[75%] ${
          isMe ? "ml-auto items-end" : "mr-auto items-start"
        }`}
      >
        {/* Sender identification */}
        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
          <span>{isMe ? "You" : senderId}</span>
          {isHostSender && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold inline-flex items-center gap-0.5">
              <span>👑</span>
              <span>HOST</span>
            </span>
          )}
          <span>•</span>
          <span>{formatFileSize(fileSize)}</span>
          <span>•</span>
          <span>{formatTime(timestamp)}</span>
        </div>

        {/* File Card Container */}
        <div
          className={`p-3.5 rounded-2xl border text-sm leading-relaxed overflow-hidden min-w-[220px] sm:min-w-[260px] ${
            isMe
              ? "bg-neutral-900 text-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 rounded-br-xs border-neutral-800 dark:border-neutral-700"
              : "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-200 rounded-bl-xs border-neutral-200 dark:border-neutral-800"
          }`}
        >
          {status === "cancelled" ? (
            <div className="text-xs font-mono text-amber-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Transfer cancelled.</span>
            </div>
          ) : status === "failed" ? (
            <div className="text-xs font-mono text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error || "Transfer failed because the connection was lost."}</span>
            </div>
          ) : status === "transferring" ? (
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <FileText className="w-5 h-5 shrink-0 text-neutral-400" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate">{fileName}</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {formatFileSize(fileSize)}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-neutral-400 mb-1">
                {isMe ? "Sending..." : `${senderId} is sending:`}
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2 rounded-full overflow-hidden mb-2">
                <div
                  className="bg-neutral-900 dark:bg-neutral-100 h-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">{progress}%</span>
                {isMe && onCancelTransfer && (
                  <button
                    type="button"
                    onClick={() => onCancelTransfer(transferId)}
                    className="text-red-500 hover:text-red-400 cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Complete: File Card with Save File button */
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-neutral-200/70 dark:bg-neutral-700/60 text-neutral-800 dark:text-neutral-200 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate leading-tight select-all">
                    {fileName}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 mt-0.5">
                    {formatFileSize(fileSize)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-neutral-200/40 dark:border-neutral-700/40">
                {isMe ? (
                  <span className="text-xs font-mono text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Sent</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => blob && triggerFileDownload(blob, fileName)}
                    className="w-full py-2 px-3 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save File</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 1-4: Standard Text Message
  return (
    <div
      className={`flex flex-col mb-3.5 max-w-[85%] sm:max-w-[75%] ${
        isMe ? "ml-auto items-end" : "mr-auto items-start"
      }`}
    >
      {/* Sender identification */}
      <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
        <span>{isMe ? "You" : senderId}</span>
        {isHostSender && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold inline-flex items-center gap-0.5">
            <span>👑</span>
            <span>HOST</span>
          </span>
        )}
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
