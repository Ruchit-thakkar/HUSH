"use client";

import React, { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { ChatWindow } from "@/components/ChatWindow";
import { MessageInput } from "@/components/MessageInput";
import { ParticipantModal } from "@/components/ParticipantModal";
import { CloseRoomModal } from "@/components/CloseRoomModal";
import { useUser } from "@/context/UserContext";
import { useRoom } from "@/hooks/useRoom";
import { AlertCircle, ArrowLeft, Loader2, ShieldOff, UserX, AlertTriangle } from "lucide-react";

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const roomId = (unwrappedParams.id || "").toUpperCase();
  const router = useRouter();
  const { userId } = useUser();

  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

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
    sendMessage,
    closeRoom,
    kickUser,
    leaveRoom,
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
            {isHost
              ? "Messages from this session were not stored."
              : "This room has been closed by the host."}
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

  // State 5: Active Chat Room
  return (
    <div className="h-screen max-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] overflow-hidden transition-colors">
      <Navbar
        roomId={roomId}
        connectedCount={connectedCount}
        connectionState={connectionState}
        hostConnected={hostConnected}
        onOpenParticipants={() => setIsParticipantsOpen(true)}
        onLeaveRoom={handleLeave}
        isHost={isHost}
      />

      {/* Host Disconnected Notice (if non-host and host disconnected) */}
      {!isHost && !hostConnected && (
        <div className="w-full bg-amber-500/10 border-b border-amber-500/20 py-1.5 px-4 text-center text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 font-mono">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Host disconnected. Waiting for host to reconnect...</span>
        </div>
      )}

      {/* Main Chat Interface */}
      <ChatWindow
        messages={messages}
        myUserId={userId}
        hostId={hostId}
      />

      {/* Bottom Message Composer */}
      <MessageInput
        onSendMessage={sendMessage}
      />

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
