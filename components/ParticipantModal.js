"use client";

import React from "react";
import { X, UserMinus, Shield, User } from "lucide-react";

export function ParticipantModal({
  isOpen,
  onClose,
  participants = [],
  myUserId = "",
  isHost = false,
  onKickUser,
  onOpenCloseRoomModal,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
              PARTICIPANTS ({participants.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Participant List */}
        <div className="p-3 max-h-64 overflow-y-auto space-y-1.5">
          {participants.map((p) => {
            const isMe = p.id === myUserId;
            const isParticipantHost = p.role === "host";

            return (
              <div
                key={p.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-800 text-xs"
              >
                <div className="flex items-center gap-2">
                  {isParticipantHost ? (
                    <Shield className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                  <span className="font-mono text-neutral-800 dark:text-neutral-200 font-medium">
                    {p.id}
                  </span>
                  {isMe && (
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                      (You)
                    </span>
                  )}
                  {isParticipantHost && (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                      HOST
                    </span>
                  )}
                </div>

                {/* Host kick control */}
                {isHost && !isMe && (
                  <button
                    onClick={() => onKickUser(p.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                    title={`Remove ${p.id}`}
                  >
                    <UserMinus className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Host action footer */}
        {isHost && (
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50">
            <button
              onClick={() => {
                onClose();
                onOpenCloseRoomModal();
              }}
              className="w-full py-2 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-center"
            >
              Close Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
