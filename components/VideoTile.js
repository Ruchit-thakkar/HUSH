"use client";

import React, { useEffect, useRef } from "react";
import { Mic, MicOff, User, Crown } from "lucide-react";

export function VideoTile({
  userId,
  isLocal = false,
  isHost = false,
  stream = null,
  isVideoEnabled = false,
  isAudioEnabled = false,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Bind video element to stream
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [stream, isVideoEnabled]);

  // Bind audio element to remote stream (local is never played to prevent echo)
  useEffect(() => {
    if (!isLocal && audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
    }
  }, [stream, isLocal]);

  // Short display name (e.g. USER-A821 or short hash)
  const displayName = userId ? userId.toUpperCase() : "PARTICIPANT";

  return (
    <div className="relative group w-full h-full min-h-[160px] sm:min-h-[190px] rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-all select-none shadow-sm">
      {/* Remote Audio Element (Never rendered for local to prevent feedback loop) */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {/* Video Stream or Avatar Placeholder */}
      {isVideoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? "-scale-x-100" : ""}`}
        />
      ) : (
        /* Voice-only / Camera-off Avatar Placeholder */
        <div className="flex flex-col items-center justify-center p-4">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all ${
              isAudioEnabled
                ? "bg-neutral-800 ring-2 ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-neutral-800/80 ring-1 ring-neutral-700"
            }`}
          >
            <User className="w-7 h-7 sm:w-8 sm:h-8 text-neutral-400" />
          </div>
          <span className="mt-2 text-[11px] font-mono text-neutral-400">
            {isAudioEnabled ? "Voice Active" : "Camera & Mic Off"}
          </span>
        </div>
      )}

      {/* Top Left: Badges (Host & Local tags) */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
        {isHost && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-amber-500/20 border border-amber-500/30 text-amber-300 backdrop-blur-xs">
            <Crown className="w-2.5 h-2.5 text-amber-400" />
            <span>Host</span>
          </span>
        )}
        {isLocal && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-neutral-800/80 border border-neutral-700/60 text-neutral-300 backdrop-blur-xs">
            You
          </span>
        )}
      </div>

      {/* Top Right: Audio Mute / Unmute Indicator */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <div
          className={`p-1.5 rounded-md backdrop-blur-xs border transition-colors ${
            isAudioEnabled
              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
              : "bg-neutral-800/90 border-neutral-700 text-neutral-400"
          }`}
          title={isAudioEnabled ? "Microphone active" : "Microphone muted"}
        >
          {isAudioEnabled ? (
            <Mic className="w-3.5 h-3.5" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-neutral-500" />
          )}
        </div>
      </div>

      {/* Bottom Left: User ID overlay label */}
      <div className="absolute bottom-2.5 left-2.5 z-10">
        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium text-neutral-200 bg-neutral-950/70 border border-neutral-800/80 backdrop-blur-xs">
          {displayName}
        </span>
      </div>
    </div>
  );
}
