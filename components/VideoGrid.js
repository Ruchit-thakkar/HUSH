"use client";

import React from "react";
import { VideoTile } from "./VideoTile";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function VideoGrid({
  myUserId,
  hostId,
  isHost,
  localStream,
  remoteStreams = new Map(),
  peerMediaStates = new Map(),
  isAudioEnabled,
  isVideoEnabled,
  inCall,
  mediaError,
  retryMedia,
}) {
  // Collect all call tiles (local + remote)
  const tiles = [];

  // Local tile if local user is in call
  if (inCall) {
    tiles.push({
      id: myUserId,
      isLocal: true,
      isHost: isHost,
      stream: localStream,
      isVideoEnabled: isVideoEnabled,
      isAudioEnabled: isAudioEnabled,
    });
  }

  // Remote tiles
  for (const [peerId, stream] of remoteStreams.entries()) {
    const mediaState = peerMediaStates.get(peerId);
    // Include if remote is sending stream or has signaled inCall
    const remoteInCall = mediaState ? mediaState.inCall !== false : true;
    if (remoteInCall) {
      tiles.push({
        id: peerId,
        isLocal: false,
        isHost: peerId === hostId,
        stream: stream,
        isVideoEnabled: mediaState?.isVideoEnabled ?? stream.getVideoTracks().length > 0,
        isAudioEnabled: mediaState?.isAudioEnabled ?? true,
      });
    }
  }

  // Check peerMediaStates for peers who joined voice-only without established stream yet
  for (const [peerId, mediaState] of peerMediaStates.entries()) {
    if (mediaState.inCall && !remoteStreams.has(peerId) && peerId !== myUserId) {
      tiles.push({
        id: peerId,
        isLocal: false,
        isHost: peerId === hostId,
        stream: null,
        isVideoEnabled: false,
        isAudioEnabled: mediaState.isAudioEnabled ?? true,
      });
    }
  }

  // Determine optimal responsive grid column layout
  const count = tiles.length;
  let gridColsClass = "grid-cols-1";
  if (count === 2) {
    gridColsClass = "grid-cols-1 sm:grid-cols-2";
  } else if (count >= 3 && count <= 4) {
    gridColsClass = "grid-cols-2";
  } else if (count > 4) {
    gridColsClass = "grid-cols-2 sm:grid-cols-3";
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-neutral-950/60 rounded-2xl p-2 sm:p-3 border border-neutral-800/80 overflow-hidden">
      {/* Media Permission Warning Banner */}
      {mediaError && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 mb-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="font-mono text-[11px] sm:text-xs">{mediaError}</span>
          </div>
          <button
            type="button"
            onClick={retryMedia}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[11px] font-medium transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Grid of Video/Voice Tiles */}
      <div
        className={`grid ${gridColsClass} gap-2 sm:gap-3 w-full h-full overflow-y-auto auto-rows-fr items-center justify-center`}
      >
        {tiles.map((tile) => (
          <VideoTile
            key={tile.id}
            userId={tile.id}
            isLocal={tile.isLocal}
            isHost={tile.isHost}
            stream={tile.stream}
            isVideoEnabled={tile.isVideoEnabled}
            isAudioEnabled={tile.isAudioEnabled}
          />
        ))}
      </div>
    </div>
  );
}
