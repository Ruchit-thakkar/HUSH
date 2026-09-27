"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { ChatWindow } from "@/components/ChatWindow";
import { MessageInput } from "@/components/MessageInput";
import { ParticipantModal } from "@/components/ParticipantModal";
import { CloseRoomModal } from "@/components/CloseRoomModal";
import { VideoGrid } from "@/components/VideoGrid";
import { ScreenShareView } from "@/components/ScreenShareView";
import { CallControls } from "@/components/CallControls";
import { Whiteboard } from "@/components/Whiteboard";
import { ReactionsOverlay, ReactionsBar } from "@/components/Reactions";
import { useUser } from "@/context/UserContext";
import { useRoom } from "@/hooks/useRoom";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  ShieldOff,
  UserX,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  PenTool,
} from "lucide-react";

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const roomId = (unwrappedParams.id || "").toUpperCase();
  const router = useRouter();
  const { userId } = useUser();

  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [activeRoomTab, setActiveRoomTab] = useState("chat"); // 'chat' | 'whiteboard'

  const {
    roomStatus,
    connectionState,
    errorMessage,
    participants,
    messages,
    isHost,
    hostId,
    hostConnected,
    connectedCount,
    // Phase 3: Media & Call State
    localStream,
    remoteStreams,
    peerMediaStates,
    isAudioEnabled,
    isVideoEnabled,
    inCall,
    mediaError,
    toggleAudio,
    toggleVideo,
    startCall,
    leaveCall,
    retryMedia,
    // Phase 4: Screen Sharing State & Actions
    screenStream,
    isScreenSharing,
    screenSharerId,
    screenShareError,
    startScreenShare,
    stopScreenShare,
    retryScreenShare,
    // Room Actions
    sendMessage,
    closeRoom,
    kickUser,
    leaveRoom,
    // Phase 5: File & Image Transfer
    sendFile,
    cancelFileTransfer,
    // Phase 6: Reactions & Whiteboard
    reactions,
    sendReaction,
    whiteboardOps,
    sendWhiteboardOp,
    undoWhiteboardOp,
    redoWhiteboardOp,
    clearWhiteboard,
  } = useRoom({
    roomId,
    userId,
  });

  const handleLeave = async () => {
    await leaveRoom();
    router.push("/");
  };

  const handleConfirmClose = async () => {
    setIsCloseModalOpen(false);
    await closeRoom();
  };

  // Determine if any media call or screen sharing session is active
  const isMediaActive =
    inCall ||
    isScreenSharing ||
    Boolean(screenSharerId) ||
    remoteStreams.size > 0 ||
    Array.from(peerMediaStates.values()).some((s) => s.inCall);

  // State 1: Connecting initially
  if (roomStatus === "connecting" && !errorMessage) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5]">
        <Navbar roomId={roomId} connectedCount={1} connectionState="connecting" />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400 mb-4" />
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 font-mono mb-1">
            CONNECTING TO {roomId}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Connecting...
          </p>
        </div>
      </div>
    );
  }

  // State 2: Explicitly Closed Room
  if (roomStatus === "closed") {
    return (
      <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5]">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 mb-4">
            <ShieldOff className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2 font-mono">
            Room Closed
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
            Temporary files and messages from this session were discarded.
          </p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return Home</span>
          </button>
        </div>
      </div>
    );
  }

  // State 3: Removed / Kicked Participant
  if (roomStatus === "removed") {
    return (
      <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5]">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 mb-4">
            <UserX className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2 font-mono">
            Removed From Room
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6 leading-relaxed">
            You have been removed from this room.
          </p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return Home</span>
          </button>
        </div>
      </div>
    );
  }

  // State 4: Error State (Room not found, full, connection error)
  if (roomStatus === "error" || errorMessage) {
    const isNotFound = errorMessage === "Room not found.";
    const isClosed = errorMessage === "This room has been closed.";
    const isFull = errorMessage === "Room is full.";

    return (
      <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5]">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            {errorMessage || "Unable to establish connection."}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
            {isNotFound
              ? "The room code is invalid or has expired."
              : isClosed
              ? "All messages from this session have been discarded."
              : isFull
              ? "This room has reached maximum participant capacity."
              : "Unable to establish connection. Please check your network and try again."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return Home</span>
          </button>
        </div>
      </div>
    );
  }

  // State 5: Active Room (Text Chat + Video & Voice Call + Screen Share + Whiteboard + Reactions)
  return (
    <div className="h-screen max-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] overflow-hidden transition-colors relative">
      {/* Floating Ephemeral Reactions Overlay */}
      <ReactionsOverlay reactions={reactions} />

      <Navbar
        roomId={roomId}
        connectedCount={connectedCount}
        connectionState={connectionState}
        hostConnected={hostConnected}
        onOpenParticipants={() => setIsParticipantsOpen(true)}
        onLeaveRoom={handleLeave}
        isHost={isHost}
      />

      {/* Host Disconnected Notice */}
      {!isHost && !hostConnected && (
        <div className="w-full bg-amber-500/10 border-b border-amber-500/20 py-1.5 px-4 text-center text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 font-mono shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Host disconnected. Waiting for host to reconnect...</span>
        </div>
      )}

      {/* Call Toolbar when call is not active */}
      {!isMediaActive && (
        <div className="w-full border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-900/40 px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neutral-400" />
            <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
              Encrypted Voice, Video & Screen Sharing
            </span>
          </div>
          <CallControls
            inCall={false}
            onStartCall={startCall}
            onStartScreenShare={startScreenShare}
          />
        </div>
      )}

      {/* Media Permission Warning Banner */}
      {!isMediaActive && mediaError && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{mediaError}</span>
          </div>
          <button
            type="button"
            onClick={retryMedia}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Screen Sharing Notification / Error Banner */}
      {screenShareError && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{screenShareError}</span>
          </div>
          {screenShareError !== "Screen sharing cancelled." &&
            screenShareError !== "Someone is already sharing their screen." &&
            screenShareError !== "Screen sharing isn't supported in this browser." && (
              <button
                type="button"
                onClick={retryScreenShare}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try Again</span>
              </button>
            )}
        </div>
      )}

      {/* Main Room Body */}
      {isMediaActive ? (
        /* Video Grid / Screen Share + Chat/Whiteboard Split View */
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left/Top: Media Display (Screen Share or Video Grid) & Call Controls */}
          <div className="w-full lg:w-3/5 xl:w-2/3 flex flex-col p-2 sm:p-3 min-h-[260px] sm:min-h-[300px] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-neutral-950/20">
            {/* Active Display Area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {screenSharerId ? (
                /* Phase 4: Screen Share View with optional compact participant strip */
                <div className="flex flex-col w-full h-full min-h-0 gap-2">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ScreenShareView
                      stream={
                        isScreenSharing
                          ? screenStream
                          : remoteStreams.get(screenSharerId)
                      }
                      sharerId={screenSharerId}
                      isLocal={isScreenSharing}
                      onStopSharing={stopScreenShare}
                      localCameraStream={localStream}
                      isLocalCameraEnabled={isVideoEnabled}
                    />
                  </div>

                  {/* Compact Participant Strip if multiple users connected */}
                  {connectedCount > 1 && (
                    <div className="h-20 sm:h-24 shrink-0 overflow-hidden">
                      <VideoGrid
                        myUserId={userId}
                        hostId={hostId}
                        isHost={isHost}
                        localStream={localStream}
                        remoteStreams={remoteStreams}
                        peerMediaStates={peerMediaStates}
                        isAudioEnabled={isAudioEnabled}
                        isVideoEnabled={isVideoEnabled}
                        inCall={inCall}
                        mediaError={mediaError}
                        retryMedia={retryMedia}
                        compact={true}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Phase 3: Standard Responsive Video Grid */
                <VideoGrid
                  myUserId={userId}
                  hostId={hostId}
                  isHost={isHost}
                  localStream={localStream}
                  remoteStreams={remoteStreams}
                  peerMediaStates={peerMediaStates}
                  isAudioEnabled={isAudioEnabled}
                  isVideoEnabled={isVideoEnabled}
                  inCall={inCall}
                  mediaError={mediaError}
                  retryMedia={retryMedia}
                />
              )}
            </div>

            {/* Bottom Docked Call Controls */}
            <div className="shrink-0 flex justify-center pt-2">
              <CallControls
                inCall={inCall}
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
                onStartScreenShare={startScreenShare}
                onStopScreenShare={stopScreenShare}
                onLeaveCall={leaveCall}
                onStartCall={startCall}
              />
            </div>
          </div>

          {/* Right/Bottom: Parallel Chat / Whiteboard Column */}
          <div className="w-full lg:w-2/5 xl:w-1/3 flex-1 flex flex-col min-h-0 overflow-hidden border-t lg:border-t-0 border-neutral-200 dark:border-neutral-800">
            {/* View Mode Switcher Header: [ 💬 Chat ] [ 📝 Whiteboard ] */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/50 shrink-0">
              <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800/60 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveRoomTab("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                    activeRoomTab === "chat"
                      ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRoomTab("whiteboard")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                    activeRoomTab === "whiteboard"
                      ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Whiteboard</span>
                </button>
              </div>
              <ReactionsBar onSendReaction={sendReaction} userId={userId} />
            </div>

            {/* Tab Body */}
            {activeRoomTab === "chat" ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <ChatWindow
                  messages={messages}
                  myUserId={userId}
                  hostId={hostId}
                  onCancelTransfer={cancelFileTransfer}
                />
                <MessageInput
                  onSendMessage={sendMessage}
                  onSendFile={sendFile}
                  onSendReaction={sendReaction}
                  userId={userId}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Whiteboard
                  operations={whiteboardOps}
                  myUserId={userId}
                  onSendOperation={sendWhiteboardOp}
                  onUndoOperation={undoWhiteboardOp}
                  onRedoOperation={redoWhiteboardOp}
                  onClearWhiteboard={clearWhiteboard}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Standard View: Subheader with [ 💬 Chat ] [ 📝 Whiteboard ] & Reactions */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Subheader Bar with Tab Switcher */}
          <div className="w-full border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/30 px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-neutral-800/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveRoomTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                  activeRoomTab === "chat"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRoomTab("whiteboard")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                  activeRoomTab === "whiteboard"
                    ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Whiteboard</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <ReactionsBar onSendReaction={sendReaction} userId={userId} />
            </div>
          </div>

          {/* Tab Content */}
          {activeRoomTab === "chat" ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ChatWindow
                messages={messages}
                myUserId={userId}
                hostId={hostId}
                onCancelTransfer={cancelFileTransfer}
              />
              <MessageInput
                onSendMessage={sendMessage}
                onSendFile={sendFile}
                onSendReaction={sendReaction}
                userId={userId}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <Whiteboard
                operations={whiteboardOps}
                myUserId={userId}
                onSendOperation={sendWhiteboardOp}
                onUndoOperation={undoWhiteboardOp}
                onRedoOperation={redoWhiteboardOp}
                onClearWhiteboard={clearWhiteboard}
              />
            </div>
          )}
        </div>
      )}

      {/* Participants & Host Controls Modal */}
      <ParticipantModal
        isOpen={isParticipantsOpen}
        onClose={() => setIsParticipantsOpen(false)}
        participants={participants}
        myUserId={userId}
        isHost={isHost}
        onKickUser={kickUser}
        onOpenCloseRoomModal={() => setIsCloseModalOpen(true)}
      />

      {/* Close Room Confirmation Modal */}
      <CloseRoomModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onConfirm={handleConfirmClose}
      />
    </div>
  );
}
