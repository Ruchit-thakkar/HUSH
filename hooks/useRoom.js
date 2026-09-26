"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WebRTCMesh } from "@/lib/webrtc";
import { saveRoomMetadata, updateRoomMetadataStatus } from "@/lib/storage";

export function useRoom({ roomId, userId }) {
  const [roomStatus, setRoomStatus] = useState("connecting"); // connecting | active | closed | removed | error
  const [connectionState, setConnectionState] = useState("connecting"); // connecting | waiting_participant | waiting_host | connected | failed | disconnected
  const [errorMessage, setErrorMessage] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [peerStates, setPeerStates] = useState(new Map());
  const [isHost, setIsHost] = useState(false);
  const [hostConnected, setHostConnected] = useState(true);

  // CRITICAL PRIVACY: Messages stored ONLY in React state memory.
  // NEVER persisted to localStorage, sessionStorage, IndexedDB, or server.
  const [messages, setMessages] = useState([]);

  const meshRef = useRef(null);
  const pollTimerRef = useRef(null);
  const isJoinedRef = useRef(false);

  // Handle incoming chat message from peer DataChannel
  const handleIncomingMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Handle explicit room closed signal from host
  const handleRoomClosed = useCallback((reason) => {
    setRoomStatus("closed");
    setErrorMessage(reason || "This room has been closed by the host.");
    updateRoomMetadataStatus(roomId, "Closed");
    if (meshRef.current) {
      meshRef.current.destroy();
      meshRef.current = null;
    }
  }, [roomId]);

  // Handle user kicked signal
  const handleUserKicked = useCallback((reason) => {
    setRoomStatus("removed");
    setErrorMessage(reason || "You have been removed from this room.");
    updateRoomMetadataStatus(roomId, "Removed");
    if (meshRef.current) {
      meshRef.current.destroy();
      meshRef.current = null;
    }
  }, [roomId]);

  // Handle host disconnect
  const handleHostDisconnected = useCallback(() => {
    setHostConnected(false);
  }, []);

  // Send WebRTC signaling message via API
  const sendSignalApi = useCallback(async ({ signalId, fromPeerId, toPeerId, sessionId, type, payload }) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, fromPeerId, toPeerId, sessionId, type, payload }),
      });
      return await res.json();
    } catch {
      return { ok: false };
    }
  }, [roomId]);

  // Send a chat message over WebRTC DataChannels
  const sendMessage = useCallback((text) => {
    if (!text || !text.trim() || !userId) return;

    const trimmed = text.trim();
    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: userId,
      text: trimmed,
      timestamp: Date.now(),
    };

    // Add to local session memory immediately
    setMessages((prev) => [...prev, messageObj]);

    // Broadcast over encrypted WebRTC DataChannel to connected peers
    if (meshRef.current) {
      meshRef.current.broadcastChatMessage(messageObj);
    }
  }, [userId]);

  // Host: Explicitly close room
  const closeRoom = useCallback(async () => {
    if (!isHost) return;
    try {
      if (meshRef.current) {
        meshRef.current.broadcastRoomClosed("This room has been closed by the host.");
      }

      await fetch(`/api/rooms/${roomId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: userId }),
      });

      handleRoomClosed("This room has been closed by the host.");
    } catch (err) {
      console.error("Failed to close room:", err);
    }
  }, [roomId, userId, isHost, handleRoomClosed]);

  // Host: Remove/Kick user
  const kickUser = useCallback(async (targetUserId) => {
    if (!isHost || targetUserId === userId) return;
    try {
      if (meshRef.current) {
        meshRef.current.broadcastUserKicked(targetUserId);
        meshRef.current.closePeer(targetUserId);
      }

      await fetch(`/api/rooms/${roomId}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: userId, targetUserId }),
      });

      setParticipants((prev) => prev.filter((p) => p.id !== targetUserId));
    } catch (err) {
      console.error("Failed to kick user:", err);
    }
  }, [roomId, userId, isHost]);

  // Participant or Host explicitly leaves room
  const leaveRoom = useCallback(async () => {
    try {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      if (meshRef.current) {
        meshRef.current.destroy();
        meshRef.current = null;
      }

      updateRoomMetadataStatus(roomId, "Left");

      await fetch(`/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error("Failed to leave room:", err);
    } finally {
      setMessages([]);
    }
  }, [roomId, userId]);

  // Main connection and signaling loop
  useEffect(() => {
    if (!roomId || !userId) return;

    let isCancelled = false;
    let isPolling = false;

    async function initRoom() {
      try {
        setRoomStatus("connecting");
        setConnectionState("connecting");
        setErrorMessage(null);

        // 1. Join room via API
        const joinRes = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        const joinData = await joinRes.json().catch(() => ({}));

        if (isCancelled) return;

        if (!joinRes.ok || !joinData.ok) {
          setRoomStatus("error");
          if (joinData.code === "ROOM_NOT_FOUND" || joinRes.status === 404) {
            setErrorMessage("Room not found.");
          } else if (joinData.code === "ROOM_CLOSED" || joinRes.status === 410) {
            setRoomStatus("closed");
            setErrorMessage("This room has been closed by the host.");
          } else if (joinData.code === "ROOM_FULL") {
            setErrorMessage("Room is full.");
          } else {
            setErrorMessage(joinData.error || "Unable to establish connection.");
          }
          return;
        }

        const roomInfo = joinData.room;
        const hostStatus = roomInfo.hostId === userId;
        setIsHost(hostStatus);
        setHostConnected(roomInfo.hostConnected !== false);
        setParticipants(roomInfo.participants || []);
        isJoinedRef.current = true;
        setRoomStatus("active");

        // Save local room metadata history (strictly metadata, NO messages)
        saveRoomMetadata({
          roomCode: roomId,
          role: hostStatus ? "HOST" : "PARTICIPANT",
          status: "Active",
        });

        // 2. Initialize WebRTC Mesh
        const mesh = new WebRTCMesh({
          roomId,
          myId: userId,
          isHost: hostStatus,
          onMessage: handleIncomingMessage,
          onPeerStateChange: (states) => {
            if (!isCancelled) {
              setPeerStates(states);
              const anyConnected = Array.from(states.values()).some((s) => s === "connected");
              const anyFailed = Array.from(states.values()).some((s) => s === "failed");

              if (anyConnected) {
                setConnectionState("connected");
              } else if (anyFailed) {
                setConnectionState("failed");
              }
            }
          },
          onRoomClosed: handleRoomClosed,
          onUserKicked: handleUserKicked,
          onHostDisconnected: handleHostDisconnected,
          sendSignalApi,
        });

        meshRef.current = mesh;
        mesh.syncParticipants(roomInfo.participants || []);

        // 3. Polling loop for signaling & presence heartbeat
        const poll = async () => {
          if (isCancelled || !isJoinedRef.current || isPolling) return;
          isPolling = true;

          try {
            const pollRes = await fetch(
              `/api/rooms/${roomId}/poll?peerId=${encodeURIComponent(userId)}`,
              { cache: "no-store" }
            );

            if (isCancelled) return;

            const pollData = await pollRes.json().catch(() => ({}));

            if (!pollRes.ok) {
              if (pollData.code === "ROOM_NOT_FOUND") {
                return;
              }
            }

            // Explicit host closure check
            if (pollData.closed) {
              handleRoomClosed(pollData.error || "This room has been closed by the host.");
              return;
            }

            // Kicked check
            if (pollData.removed) {
              handleUserKicked(pollData.error || "You have been removed from this room.");
              return;
            }

            if (pollData.ok) {
              if (typeof pollData.hostConnected === "boolean") {
                setHostConnected(pollData.hostConnected);
              }

              if (Array.isArray(pollData.participants)) {
                setParticipants(pollData.participants);
                mesh.syncParticipants(pollData.participants);

                // Update connection state
                const otherPeers = pollData.participants.filter((p) => p.id !== userId);
                if (otherPeers.length === 0) {
                  if (hostStatus) {
                    setConnectionState("waiting_participant");
                  } else {
                    setConnectionState(pollData.hostConnected ? "connecting" : "waiting_host");
                  }
                } else {
                  const anyOpen = Array.from(mesh.dataChannels.values()).some(
                    (dc) => dc.readyState === "open"
                  );
                  if (anyOpen) {
                    setConnectionState("connected");
                  }
                }
              }

              if (Array.isArray(pollData.signals)) {
                for (const signal of pollData.signals) {
                  await mesh.handleSignal(signal);
                }
              }
            }
          } catch (err) {
            console.warn("[HUSH] Poll heartbeat transient glitch:", err);
          } finally {
            isPolling = false;
          }
        };

        // Poll every 1200ms with concurrency lock
        pollTimerRef.current = setInterval(poll, 1200);
      } catch (err) {
        if (!isCancelled) {
          console.error("Init room error:", err);
          setRoomStatus("error");
          setErrorMessage("Unable to establish connection. Please check your network and try again.");
        }
      }
    }

    initRoom();

    return () => {
      isCancelled = true;
      isJoinedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      if (meshRef.current) {
        meshRef.current.destroy();
        meshRef.current = null;
      }
    };
  }, [
    roomId,
    userId,
    handleIncomingMessage,
    handleRoomClosed,
    handleUserKicked,
    handleHostDisconnected,
    sendSignalApi,
  ]);

  const connectedCount = participants.length;

  return {
    roomStatus,
    connectionState,
    errorMessage,
    participants,
    peerStates,
    messages,
    isHost,
    hostConnected,
    connectedCount,
    sendMessage,
    closeRoom,
    kickUser,
    leaveRoom,
  };
}
