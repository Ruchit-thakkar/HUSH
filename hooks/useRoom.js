"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WebRTCMesh } from "@/lib/webrtc";
import { saveRoomMetadata, updateRoomMetadataStatus } from "@/lib/storage";
import {
  getOptimalAudioConstraints,
  AudioProcessor,
  logAudioDiagnostics,
} from "@/lib/audio";
import { MAX_FILE_SIZE, isAcceptedImageType } from "@/lib/file-transfer";

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

  // ==========================================
  // PHASE 4: SCREEN SHARING STATE
  // ==========================================
  const [screenStream, setScreenStreamState] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharerId, setScreenSharerId] = useState(null);
  const [screenShareError, setScreenShareError] = useState(null);

  const meshRef = useRef(null);
  const pollTimerRef = useRef(null);
  const isJoinedRef = useRef(false);
  const seenPeersRef = useRef(new Set());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const rawStreamRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const receiverTransfersRef = useRef(new Map()); // transferId -> { fileName, fileSize, mimeType, chunks, receivedBytes }
  const createdBlobUrlsRef = useRef(new Set());

  // Keep localStreamRef synced
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Keep screenStreamRef synced
  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  // Handle audio/video hardware device changes (Bluetooth headset, mic unplug, etc.)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = async () => {
      console.log("[HUSH:MEDIA] Hardware device change detected");
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === "ended") {
        setMediaError("Microphone disconnected or changed.");
        setIsAudioEnabled(false);
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

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

      // If the leaving peer was sharing screen, reset screen share state
      setScreenSharerId((prev) => (prev === peerId ? null : prev));
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
    setScreenSharerId((prev) => (prev === peerId ? null : prev));
  }, []);

  // Phase 3: Remote peer media state (mic/cam toggles)
  const handlePeerMediaState = useCallback((peerId, state) => {
    setPeerMediaStates((prev) => {
      const updated = new Map(prev);
      updated.set(peerId, state);
      return updated;
    });
  }, []);

  // Phase 4: Screen share state change from remote peer
  const handleScreenShareChange = useCallback(
    ({ isSharing, sharerId }) => {
      if (isSharing) {
        setScreenSharerId(sharerId);
        setIsScreenSharing(sharerId === userId);
      } else {
        // Crucial fix: Clear screenSharerId so remote receiver's screen-share view disappears immediately
        setScreenSharerId((prev) => {
          if (!sharerId || prev === sharerId) {
            return null;
          }
          return null;
        });

        if (!sharerId || sharerId === userId) {
          setIsScreenSharing(false);
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => {
              try {
                t.onended = null;
                t.stop();
              } catch {}
            });
            setScreenStreamState(null);
            screenStreamRef.current = null;
          }
        }
      }
    },
    [userId]
  );

  // Stop screen sharing action
  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.onended = null;
          track.stop();
        } catch {}
      });
      setScreenStreamState(null);
      screenStreamRef.current = null;
    }

    setIsScreenSharing(false);
    setScreenSharerId(null);
    setScreenShareError(null);

    if (meshRef.current) {
      await meshRef.current.stopScreenShare();
    }
  }, []);

  // Clean stop of all local media and screen tracks
  const stopLocalTracks = useCallback(() => {
    stopScreenShare();

    if (audioProcessorRef.current) {
      audioProcessorRef.current.cleanup();
      audioProcessorRef.current = null;
    }

    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      rawStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      setLocalStreamState(null);
      localStreamRef.current = null;
    }

    createdBlobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    createdBlobUrlsRef.current.clear();
    receiverTransfersRef.current.clear();

    cameraStreamRef.current = null;

    if (meshRef.current) {
      meshRef.current.stopLocalStream();
    }
    setInCall(false);
    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
    setMediaError(null);
  }, [stopScreenShare]);

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
        const audioConstraints = audio ? getOptimalAudioConstraints() : false;
        const videoConstraints = video
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
          : false;

        const constraints = {
          audio: audioConstraints,
          video: videoConstraints,
        };

        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        rawStreamRef.current = rawStream;

        const rawAudioTrack = rawStream.getAudioTracks()[0];
        const rawVideoTrack = rawStream.getVideoTracks()[0];

        if (rawAudioTrack) {
          rawAudioTrack.enabled = audio;
          logAudioDiagnostics(rawAudioTrack, "Microphone (Raw)");

          // Handle device disconnection / unplug
          rawAudioTrack.onended = () => {
            console.warn("[HUSH:AUDIO] Microphone device disconnected");
            setMediaError("Microphone disconnected.");
            setIsAudioEnabled(false);
          };
        }

        if (rawVideoTrack) {
          rawVideoTrack.enabled = video;
        }

        // Process audio through conservative dynamics compressor & normalizer
        let processedAudioTrack = rawAudioTrack;
        if (rawAudioTrack) {
          if (!audioProcessorRef.current) {
            audioProcessorRef.current = new AudioProcessor();
          }
          const processedStream = audioProcessorRef.current.processMicrophoneStream(rawStream);
          const pTrack = processedStream?.getAudioTracks()[0];
          if (pTrack) {
            pTrack.enabled = audio;
            processedAudioTrack = pTrack;
            logAudioDiagnostics(pTrack, "Microphone (Processed)");
          }
        }

        // Combine tracks into single local MediaStream
        const tracksToAttach = [];
        if (processedAudioTrack) tracksToAttach.push(processedAudioTrack);
        if (rawVideoTrack) tracksToAttach.push(rawVideoTrack);

        const combinedStream = new MediaStream(tracksToAttach);

        setLocalStreamState(combinedStream);
        localStreamRef.current = combinedStream;
        cameraStreamRef.current = combinedStream;
        setIsAudioEnabled(audio);
        setIsVideoEnabled(video);
        setInCall(true);
        setMediaError(null);
        setPendingMediaType(null);

        // Attach to WebRTC Mesh
        if (meshRef.current) {
          meshRef.current.setLocalStream(combinedStream);
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
        const rawAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: getOptimalAudioConstraints(),
        });
        const rawTrack = rawAudioStream.getAudioTracks()[0];
        if (rawTrack) {
          rawTrack.enabled = true;
          logAudioDiagnostics(rawTrack, "Microphone Acquired (Raw)");

          rawTrack.onended = () => {
            console.warn("[HUSH:AUDIO] Microphone device disconnected");
            setMediaError("Microphone disconnected.");
            setIsAudioEnabled(false);
          };

          if (!audioProcessorRef.current) {
            audioProcessorRef.current = new AudioProcessor();
          }
          const processedStream = audioProcessorRef.current.processMicrophoneStream(rawAudioStream);
          const newTrack = processedStream?.getAudioTracks()[0] || rawTrack;
          newTrack.enabled = true;
          logAudioDiagnostics(newTrack, "Microphone Acquired (Processed)");

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
      const rawAudio = rawStreamRef.current?.getAudioTracks()[0];
      if (rawAudio) {
        rawAudio.enabled = nextState;
      }
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
          cameraStreamRef.current = localStreamRef.current;

          // Only attach to sender if NOT currently sharing screen
          if (meshRef.current && !isScreenSharing) {
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

      // Only toggle on WebRTC sender if NOT currently sharing screen
      if (meshRef.current && !isScreenSharing) {
        meshRef.current.toggleTrack("video", nextState);
        meshRef.current.broadcastMediaState({ isVideoEnabled: nextState });
      }
    }
  }, [inCall, isAudioEnabled, isVideoEnabled, isScreenSharing, startCall]);

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
  // PHASE 4: SCREEN SHARING ACTIONS
  // ==========================================

  /**
   * Start screen sharing via getDisplayMedia
   */
  const startScreenShare = useCallback(async () => {
    // Phase 4 rule: only one screen sharer at a time
    if (screenSharerId && screenSharerId !== userId) {
      setScreenShareError("Someone is already sharing their screen.");
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError("Screen sharing isn't supported in this browser.");
      return;
    }

    setScreenShareError(null);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        setScreenShareError("Unable to acquire screen video track.");
        return;
      }

      // Preserve existing camera stream reference
      if (localStreamRef.current) {
        cameraStreamRef.current = localStreamRef.current;
      }

      setScreenStreamState(stream);
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      setScreenSharerId(userId);
      setInCall(true);
      setScreenShareError(null);

      if (meshRef.current) {
        await meshRef.current.setScreenStream(stream);
      }

      // Detect browser native "Stop sharing" bar
      screenTrack.onended = () => {
        console.log("[HUSH:MEDIA] Screen track onended detected via browser control");
        stopScreenShare();
      };
    } catch (err) {
      console.warn("[HUSH:MEDIA] getDisplayMedia error:", err);
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        setScreenShareError("Screen sharing cancelled.");
      } else if (err.name === "NotSupportedError") {
        setScreenShareError("Screen sharing isn't supported in this browser.");
      } else {
        setScreenShareError("Unable to start screen sharing.");
      }
    }
  }, [screenSharerId, userId, stopScreenShare]);

  /**
   * Retry screen share after error
   */
  const retryScreenShare = useCallback(() => {
    setScreenShareError(null);
    startScreenShare();
  }, [startScreenShare]);

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

      createdBlobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      createdBlobUrlsRef.current.clear();
      receiverTransfersRef.current.clear();

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
          onScreenShareChange: handleScreenShareChange,
          // Phase 5: File & Image transfer callbacks
          onFileTransferStart: (payload) => {
            const { transferId, fileName, fileSize, mimeType, totalChunks, senderId } = payload;
            receiverTransfersRef.current.set(transferId, {
              transferId,
              fileName,
              fileSize,
              mimeType,
              totalChunks,
              senderId,
              chunks: [],
              receivedBytes: 0,
            });

            const isImage = isAcceptedImageType(mimeType);
            const incomingMsg = {
              id: `msg_${transferId}`,
              transferId,
              senderId,
              type: isImage ? "image" : "file",
              fileName,
              fileSize,
              mimeType,
              blobUrl: null,
              blob: null,
              status: "transferring",
              progress: 0,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, incomingMsg]);
          },
          onFileChunk: ({ transferId, chunkIndex, data }) => {
            const transfer = receiverTransfersRef.current.get(transferId);
            if (!transfer) return;

            transfer.chunks[chunkIndex] = data;
            transfer.receivedBytes += data.byteLength;

            const progress = Math.min(
              99,
              Math.round((transfer.receivedBytes / Math.max(1, transfer.fileSize)) * 100)
            );

            setMessages((prev) =>
              prev.map((m) =>
                m.transferId === transferId ? { ...m, progress } : m
              )
            );
          },
          onFileTransferEnd: ({ transferId }) => {
            const transfer = receiverTransfersRef.current.get(transferId);
            if (!transfer) return;

            const blob = new Blob(transfer.chunks, { type: transfer.mimeType });
            let blobUrl = null;
            if (isAcceptedImageType(transfer.mimeType)) {
              blobUrl = URL.createObjectURL(blob);
              createdBlobUrlsRef.current.add(blobUrl);
            }

            receiverTransfersRef.current.delete(transferId);

            setMessages((prev) =>
              prev.map((m) =>
                m.transferId === transferId
                  ? {
                      ...m,
                      status: "complete",
                      progress: 100,
                      blob,
                      blobUrl,
                    }
                  : m
              )
            );
          },
          onFileTransferCancel: ({ transferId, reason }) => {
            receiverTransfersRef.current.delete(transferId);
            setMessages((prev) =>
              prev.map((m) =>
                m.transferId === transferId
                  ? {
                      ...m,
                      status: "cancelled",
                      error: reason || "Transfer cancelled.",
                    }
                  : m
              )
            );
          },
          onFileTransferFailed: (peerId, reason) => {
            const toDelete = [];
            for (const [tId, t] of receiverTransfersRef.current.entries()) {
              if (t.senderId === peerId) {
                toDelete.push(tId);
              }
            }
            toDelete.forEach((tId) => {
              receiverTransfersRef.current.delete(tId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.transferId === tId
                    ? {
                        ...m,
                        status: "failed",
                        error: reason || "Transfer failed because the connection was lost.",
                      }
                    : m
                )
              );
            });
          },
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
    handleScreenShareChange,
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
    // Phase 4: Screen Sharing exports
    screenStream,
    isScreenSharing,
    screenSharerId,
    screenShareError,
    startScreenShare,
    stopScreenShare,
    retryScreenShare,
    // Room actions
    sendMessage,
    closeRoom,
    kickUser,
    leaveRoom,
    // Phase 5: File & Image transfer actions
    sendFile: async (file) => {
      if (!file || !userId) return { ok: false, error: "No file selected." };

      if (file.size > MAX_FILE_SIZE) {
        return {
          ok: false,
          error: "File is too large. Maximum file size is 100 MB.",
        };
      }

      const transferId = `trans_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isImage = isAcceptedImageType(file.type);
      let localBlobUrl = null;
      if (isImage) {
        localBlobUrl = URL.createObjectURL(file);
        createdBlobUrlsRef.current.add(localBlobUrl);
      }

      const messageObj = {
        id: `msg_${transferId}`,
        transferId,
        senderId: userId,
        type: isImage ? "image" : "file",
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        blobUrl: localBlobUrl,
        blob: file,
        status: "transferring",
        progress: 0,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, messageObj]);

      if (meshRef.current) {
        meshRef.current
          .sendFile({
            transferId,
            file,
            onProgress: (progress) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.transferId === transferId
                    ? {
                        ...m,
                        progress,
                        status: progress >= 100 ? "complete" : "transferring",
                      }
                    : m
                )
              );
            },
          })
          .then((res) => {
            if (res && !res.ok) {
              if (res.cancelled) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.transferId === transferId
                      ? { ...m, status: "cancelled", error: "Transfer cancelled." }
                      : m
                  )
                );
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.transferId === transferId
                      ? {
                          ...m,
                          status: "failed",
                          error: res.error || "Transfer failed because the connection was lost.",
                        }
                      : m
                  )
                );
              }
            }
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.transferId === transferId
                  ? {
                      ...m,
                      status: "failed",
                      error: "Transfer failed because the connection was lost.",
                    }
                  : m
              )
            );
          });
      }

      return { ok: true, transferId };
    },
    cancelFileTransfer: (transferId) => {
      if (meshRef.current) {
        meshRef.current.cancelFileTransfer(transferId);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.transferId === transferId
            ? { ...m, status: "cancelled", error: "Transfer cancelled." }
            : m
        )
      );
    },
  };
}
