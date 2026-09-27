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
  const [hostId, setHostId] = useState("");
  const [hostConnected, setHostConnected] = useState(true);

  // CRITICAL PRIVACY: Messages stored ONLY in React state memory.
  // NEVER persisted to localStorage, sessionStorage, IndexedDB, or server.
  const [messages, setMessages] = useState([]);

  // ==========================================
  // PHASE 3: VIDEO & VOICE CALL STATE
  // ==========================================
  const [localStream, setLocalStreamState] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // peerId -> MediaStream
  const [peerMediaStates, setPeerMediaStates] = useState(new Map()); // peerId -> { isAudioEnabled, isVideoEnabled, inCall }
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [pendingMediaType, setPendingMediaType] = useState(null); // 'video' | 'audio' | null

  const meshRef = useRef(null);
  const pollTimerRef = useRef(null);
  const isJoinedRef = useRef(false);
  const seenPeersRef = useRef(new Set());
  const localStreamRef = useRef(null);

  // Keep localStreamRef synced
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Handle incoming chat message from peer DataChannel
  const handleIncomingMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // System notification for user join
  const handlePeerJoined = useCallback(
    (peerId) => {
      if (!peerId || peerId === userId) return;
      if (!seenPeersRef.current.has(peerId)) {
        seenPeersRef.current.add(peerId);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_join_${peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            isSystem: true,
            text: `${peerId} joined the room`,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [userId]
  );

  // System notification for user leave
  const handlePeerLeft = useCallback(
    (peerId) => {
      if (!peerId || peerId === userId) return;
      if (seenPeersRef.current.has(peerId)) {
        seenPeersRef.current.delete(peerId);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_left_${peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            isSystem: true,
            text: `${peerId} left the room`,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [userId]
  );

  // Phase 3: Remote stream arrived from WebRTC peer
  const handleRemoteStream = useCallback((peerId, stream) => {
    setRemoteStreams((prev) => {
      const updated = new Map(prev);
      updated.set(peerId, stream);
      return updated;
    });
  }, []);

  // Phase 3: Remote stream removed
  const handleRemoteStreamRemoved = useCallback((peerId) => {
    setRemoteStreams((prev) => {
      const updated = new Map(prev);
      updated.delete(peerId);
      return updated;
    });
  }, []);

  // Phase 3: Remote peer media state (mic/cam toggles)
  const handlePeerMediaState = useCallback((peerId, state) => {
    setPeerMediaStates((prev) => {
      const updated = new Map(prev);
      updated.set(peerId, state);
      return updated;
    });
  }, []);

  // Clean stop of all local media tracks
  const stopLocalTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      setLocalStreamState(null);
      localStreamRef.current = null;
    }
    if (meshRef.current) {
      meshRef.current.stopLocalStream();
    }
    setInCall(false);
    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
    setMediaError(null);
  }, []);

  // Handle explicit room closed signal from host
  const handleRoomClosed = useCallback(
    (reason) => {
      stopLocalTracks();
      setRoomStatus("closed");
      setErrorMessage(reason || "This room has been closed by the host.");
      updateRoomMetadataStatus(roomId, "Closed");
      if (meshRef.current) {
        meshRef.current.destroy();
        meshRef.current = null;
      }
    },
    [roomId, stopLocalTracks]
  );

  // Handle user kicked signal
  const handleUserKicked = useCallback(
    (reason) => {
      stopLocalTracks();
      setRoomStatus("removed");
      setErrorMessage(reason || "You have been removed from this room.");
      updateRoomMetadataStatus(roomId, "Removed");
      if (meshRef.current) {
        meshRef.current.destroy();
        meshRef.current = null;
      }
    },
    [roomId, stopLocalTracks]
  );

  // Handle host disconnect
  const handleHostDisconnected = useCallback(() => {
    setHostConnected(false);
  }, []);

  // Send WebRTC signaling message via API
  const sendSignalApi = useCallback(
    async ({ signalId, fromPeerId, toPeerId, sessionId, type, payload }) => {
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
    },
    [roomId]
  );

  // ==========================================
  // PHASE 3: CALL CONTROLS IMPLEMENTATION
  // ==========================================

  /**
   * Start call requesting camera and/or microphone
   */
  const startCall = useCallback(
    async ({ video = false, audio = true }) => {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setMediaError("Media devices are not supported by this browser.");
        return;
      }

      setMediaError(null);
      setPendingMediaType(video ? "video" : "audio");

      try {
        const constraints = {
          audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Ensure tracks match desired initial state
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) audioTrack.enabled = audio;
        if (videoTrack) videoTrack.enabled = video;

        setLocalStreamState(stream);
        localStreamRef.current = stream;
        setIsAudioEnabled(audio);
        setIsVideoEnabled(video);
        setInCall(true);
        setMediaError(null);
        setPendingMediaType(null);

        // Attach to WebRTC Mesh
        if (meshRef.current) {
          meshRef.current.setLocalStream(stream);
          meshRef.current.broadcastMediaState({
            isAudioEnabled: audio,
            isVideoEnabled: video,
            inCall: true,
          });
        }
      } catch (err) {
        console.warn("[HUSH:MEDIA] getUserMedia error:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          if (video) {
            setMediaError("Camera permission is required for video.");
            setPendingMediaType("video");
          } else {
            setMediaError("Microphone permission is required for voice.");
            setPendingMediaType("audio");
          }
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setMediaError(
            video
              ? "Camera not found on this device."
              : "Microphone not found on this device."
          );
        } else {
          setMediaError("Unable to access media device. Please check permissions.");
        }
      }
    },
    []
  );

  /**
   * Toggle microphone mute / unmute
   */
  const toggleAudio = useCallback(async () => {
    if (!inCall) {
      await startCall({ audio: true, video: false });
      return;
    }

    const currentStream = localStreamRef.current;
    const existingAudio = currentStream?.getAudioTracks()[0];

    if (!existingAudio) {
      // Need to acquire audio track
      try {
        setMediaError(null);
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const newTrack = audioStream.getAudioTracks()[0];
        if (newTrack) {
          newTrack.enabled = true;
          if (currentStream) {
            currentStream.addTrack(newTrack);
          } else {
            const freshStream = new MediaStream([newTrack]);
            setLocalStreamState(freshStream);
            localStreamRef.current = freshStream;
          }
          if (meshRef.current) {
            meshRef.current.addLocalTrack(newTrack);
            meshRef.current.broadcastMediaState({ isAudioEnabled: true });
          }
          setIsAudioEnabled(true);
        }
      } catch (err) {
        console.warn("[HUSH:MEDIA] Audio permission error:", err);
        setMediaError("Microphone permission is required for voice.");
        setPendingMediaType("audio");
      }
    } else {
      const nextState = !isAudioEnabled;
      existingAudio.enabled = nextState;
      setIsAudioEnabled(nextState);
      if (meshRef.current) {
        meshRef.current.toggleTrack("audio", nextState);
        meshRef.current.broadcastMediaState({ isAudioEnabled: nextState });
      }
    }
  }, [inCall, isAudioEnabled, startCall]);

  /**
   * Toggle camera on / off
   */
  const toggleVideo = useCallback(async () => {
    if (!inCall) {
      await startCall({ video: true, audio: isAudioEnabled || true });
      return;
    }

    const currentStream = localStreamRef.current;
    const existingVideo = currentStream?.getVideoTracks()[0];

    if (!existingVideo) {
      // Need to acquire video track
      try {
        setMediaError(null);
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (newTrack) {
          newTrack.enabled = true;
          if (currentStream) {
            currentStream.addTrack(newTrack);
          } else {
            const freshStream = new MediaStream([newTrack]);
            setLocalStreamState(freshStream);
            localStreamRef.current = freshStream;
          }
          if (meshRef.current) {
            meshRef.current.addLocalTrack(newTrack);
            meshRef.current.broadcastMediaState({ isVideoEnabled: true });
          }
          setIsVideoEnabled(true);
        }
      } catch (err) {
        console.warn("[HUSH:MEDIA] Video permission error:", err);
        setMediaError("Camera permission is required for video.");
        setPendingMediaType("video");
      }
    } else {
      const nextState = !isVideoEnabled;
      existingVideo.enabled = nextState;
      setIsVideoEnabled(nextState);
      if (meshRef.current) {
        meshRef.current.toggleTrack("video", nextState);
        meshRef.current.broadcastMediaState({ isVideoEnabled: nextState });
      }
    }
  }, [inCall, isAudioEnabled, isVideoEnabled, startCall]);

  /**
   * Leave Call (Media only, preserves chat session)
   */
  const leaveCall = useCallback(() => {
    stopLocalTracks();
  }, [stopLocalTracks]);

  /**
   * Retry permission request after denial
   */
  const retryMedia = useCallback(() => {
    setMediaError(null);
    if (pendingMediaType === "video") {
      toggleVideo();
    } else {
      toggleAudio();
    }
  }, [pendingMediaType, toggleVideo, toggleAudio]);

  // ==========================================
  // CHAT & ROOM ACTIONS
  // ==========================================

  // Send a chat message over WebRTC DataChannels
  const sendMessage = useCallback(
    (text) => {
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
    },
    [userId]
  );

  // Host: Explicitly close room
  const closeRoom = useCallback(async () => {
    if (!isHost) return;
    try {
      stopLocalTracks();

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
  }, [roomId, userId, isHost, handleRoomClosed, stopLocalTracks]);

  // Host: Remove/Kick user
  const kickUser = useCallback(
    async (targetUserId) => {
      if (!isHost || targetUserId === userId) return;
      try {
        handlePeerLeft(targetUserId);

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
    },
    [roomId, userId, isHost, handlePeerLeft]
  );

  // Participant or Host explicitly leaves room
  const leaveRoom = useCallback(async () => {
    try {
      stopLocalTracks();

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
  }, [roomId, userId, stopLocalTracks]);

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
        setHostId(roomInfo.hostId || "");
        setHostConnected(roomInfo.hostConnected !== false);
        setParticipants(roomInfo.participants || []);
        isJoinedRef.current = true;
        setRoomStatus("active");

        // Seed existing peers so we don't announce historical joins
        (roomInfo.participants || []).forEach((p) => {
          if (p.id !== userId) {
            seenPeersRef.current.add(p.id);
          }
        });

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
          hostId: roomInfo.hostId || "",
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
          onPeerJoined: handlePeerJoined,
          onPeerLeft: handlePeerLeft,
          onRemoteStream: handleRemoteStream,
          onRemoteStreamRemoved: handleRemoteStreamRemoved,
          onPeerMediaState: handlePeerMediaState,
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

                // Detect join/leave diffs
                const activePeerIds = new Set(
                  pollData.participants.filter((p) => p.id !== userId).map((p) => p.id)
                );

                for (const pId of activePeerIds) {
                  if (!seenPeersRef.current.has(pId)) {
                    handlePeerJoined(pId);
                  }
                }

                for (const pId of Array.from(seenPeersRef.current)) {
                  if (!activePeerIds.has(pId)) {
                    handlePeerLeft(pId);
                  }
                }

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
      stopLocalTracks();
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
    handlePeerJoined,
    handlePeerLeft,
    handleRemoteStream,
    handleRemoteStreamRemoved,
    handlePeerMediaState,
    sendSignalApi,
    stopLocalTracks,
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
    hostId,
    hostConnected,
    connectedCount,
    // Phase 3: Media call exports
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
    // Room actions
    sendMessage,
    closeRoom,
    kickUser,
    leaveRoom,
  };
}
