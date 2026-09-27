"use client";

import React, { useEffect, useRef, useState } from "react";
import { Monitor, StopCircle, Maximize2, Minimize2, ShieldCheck } from "lucide-react";

export function ScreenShareView({
  stream,
  sharerId,
  isLocal = false,
  onStopSharing,
  localCameraStream = null,
  isLocalCameraEnabled = false,
}) {
  const videoRef = useRef(null);
  const cameraPreviewRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Bind screen stream to main video element & clear srcObject on cleanup / null stream
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      if (stream) {
        if (videoEl.srcObject !== stream) {
          videoEl.srcObject = stream;
        }
      } else {
        videoEl.srcObject = null;
      }
    }

    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  // Clean up media source immediately if video track ends (prevents frozen last frame)
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();

    const handleTrackEnded = () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (isLocal && onStopSharing) {
        onStopSharing();
      }
    };

    tracks.forEach((track) => {
      track.addEventListener("ended", handleTrackEnded);
    });

    return () => {
      tracks.forEach((track) => {
        track.removeEventListener("ended", handleTrackEnded);
      });
    };
  }, [stream, isLocal, onStopSharing]);

  // Bind local camera preview if camera is on while screen sharing
  useEffect(() => {
    const cameraEl = cameraPreviewRef.current;
    if (cameraEl && localCameraStream && isLocalCameraEnabled) {
      if (cameraEl.srcObject !== localCameraStream) {
        cameraEl.srcObject = localCameraStream;
      }
    } else if (cameraEl) {
      cameraEl.srcObject = null;
    }

    return () => {
      if (cameraEl) {
        cameraEl.srcObject = null;
      }
    };
  }, [localCameraStream, isLocalCameraEnabled]);

  // Fullscreen management & auto-exit when screen share stops (Section 11 & 14)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentFs = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isCurrentFs);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

      // Section 14 edge case: Auto-exit fullscreen if component unmounts while in fullscreen
      if (
        document.fullscreenElement &&
        document.fullscreenElement === containerRef.current
      ) {
        try {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        } catch {}
      }
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      } else {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (containerRef.current.webkitRequestFullscreen) {
          await containerRef.current.webkitRequestFullscreen();
        }
      }
    } catch (err) {
      console.warn("[HUSH:UI] Fullscreen toggle error:", err);
    }
  };

  const displaySharerName = sharerId ? sharerId.toUpperCase() : "PARTICIPANT";

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col w-full h-full min-h-0 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden shadow-md select-none ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-0" : ""
      }`}
    >
      {/* Minimal Top Header Bar / Indicator */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-neutral-900/90 border-b border-neutral-800/80 backdrop-blur-xs z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="font-mono text-xs font-medium text-neutral-200">
            {isLocal ? "Sharing screen" : `${displaySharerName} is sharing their screen`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer shadow-xs border border-neutral-700/60"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fullscreen</span>
              </>
            )}
          </button>

          {isLocal && (
            <button
              type="button"
              onClick={onStopSharing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-red-600/90 hover:bg-red-600 text-white transition-colors cursor-pointer shadow-xs"
              title="Stop Screen Sharing"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop Sharing</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Screen Stream Video Container */}
      <div className="relative flex-1 w-full min-h-0 flex items-center justify-center bg-black p-1 sm:p-2 overflow-hidden">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={true}
            className={`w-full h-full ${
              isFullscreen ? "max-h-full" : "max-h-[50vh] lg:max-h-[65vh]"
            } object-contain rounded-lg`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-neutral-500">
            <Monitor className="w-10 h-10 mb-2 opacity-50" />
            <span className="text-xs font-mono">Connecting to screen share...</span>
          </div>
        )}

        {/* Small Camera Preview (Camera ON + Screen Share ON at the same time) */}
        {isLocal && isLocalCameraEnabled && localCameraStream && (
          <div className="absolute bottom-3 right-3 w-32 sm:w-44 aspect-video rounded-xl overflow-hidden border border-neutral-700 bg-neutral-900 shadow-xl z-20">
            <video
              ref={cameraPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-neutral-950/80 text-neutral-300">
              Camera Preview
            </div>
          </div>
        )}
      </div>

      {/* Minimal Privacy Guarantee Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-neutral-950/80 border-t border-neutral-900 text-[10px] font-mono text-neutral-400 shrink-0">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-neutral-400" />
          <span>Encrypted WebRTC P2P Transmission</span>
        </div>
        <span className="hidden sm:inline text-neutral-500">
          Not recorded or stored by HUSH
        </span>
      </div>
    </div>
  );
}
