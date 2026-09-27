"use client";

import React from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, StopCircle } from "lucide-react";

export function CallControls({
  inCall = false,
  isAudioEnabled = false,
  isVideoEnabled = false,
  isScreenSharing = false,
  onToggleAudio,
  onToggleVideo,
  onStartScreenShare,
  onStopScreenShare,
  onLeaveCall,
  onStartCall,
}) {
  if (!inCall) {
    return (
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl bg-white/60 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 backdrop-blur-md">
        <button
          type="button"
          onClick={() => onStartCall?.({ audio: true, video: false })}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Join with Voice Only"
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Join Voice</span>
        </button>

        <span className="w-px h-4 bg-neutral-300 dark:bg-neutral-800" />

        <button
          type="button"
          onClick={() => onStartCall?.({ audio: true, video: true })}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Join with Video & Voice"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Join Video</span>
        </button>

        <span className="w-px h-4 bg-neutral-300 dark:bg-neutral-800" />

        <button
          type="button"
          onClick={onStartScreenShare}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Share Screen"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Share Screen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5 p-2 rounded-2xl bg-neutral-950/80 border border-neutral-800 backdrop-blur-md shadow-lg">
      {/* Microphone Mute / Unmute */}
      <button
        type="button"
        onClick={onToggleAudio}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
          isAudioEnabled
            ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            : "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
        }`}
        title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
      >
        {isAudioEnabled ? (
          <Mic className="w-4 h-4 text-emerald-400" />
        ) : (
          <MicOff className="w-4 h-4 text-red-400" />
        )}
        <span className="hidden sm:inline">
          {isAudioEnabled ? "Mute" : "Unmute"}
        </span>
      </button>

      {/* Camera On / Off */}
      <button
        type="button"
        onClick={onToggleVideo}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
          isVideoEnabled
            ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        }`}
        title={isVideoEnabled ? "Turn Off Camera" : "Turn On Camera"}
      >
        {isVideoEnabled ? (
          <Video className="w-4 h-4 text-emerald-400" />
        ) : (
          <VideoOff className="w-4 h-4 text-neutral-500" />
        )}
        <span className="hidden sm:inline">
          {isVideoEnabled ? "Camera Off" : "Camera On"}
        </span>
      </button>

      {/* Phase 4: Screen Share / Stop Sharing */}
      <button
        type="button"
        onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
          isScreenSharing
            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
            : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        }`}
        title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
      >
        {isScreenSharing ? (
          <StopCircle className="w-4 h-4 text-emerald-400" />
        ) : (
          <Monitor className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
        </span>
      </button>

      {/* Leave Call */}
      <button
        type="button"
        onClick={onLeaveCall}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-medium bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer shadow-xs"
        title="Leave Call (Chat remains active)"
      >
        <PhoneOff className="w-4 h-4" />
        <span className="hidden sm:inline">Leave</span>
      </button>
    </div>
  );
}
