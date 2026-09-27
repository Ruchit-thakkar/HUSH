/**
 * WebRTC DataChannel & MediaStream Mesh Manager
 *
 * Implements:
 * 1. Text Chat DataChannel (Phase 1 & Phase 2).
 * 2. MediaStream Tracks for Video & Voice Call (Phase 3).
 * 3. Screen Sharing via DisplayMedia & Track Replacement (Phase 4).
 * 4. Perfect Negotiation state machine for collision-free offer/answer renegotiation.
 * 5. Protection against setRemoteDescription(answer) in stable state.
 * 6. Signal deduplication using unique signal IDs.
 * 7. Exactly one RTCPeerConnection per remote peer.
 * 8. Buffering of ICE candidates until remoteDescription is set.
 * 9. Zero media/screen recording or persistence - memory-only streams.
 */

import {
  packBinaryChunk,
  unpackBinaryChunk,
  CHUNK_SIZE,
  BUFFERED_AMOUNT_HIGH_THRESHOLD,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
} from "./file-transfer.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export class WebRTCMesh {
  constructor({
    roomId,
    myId,
    hostId = "",
    isHost = false,
    onMessage,
    onPeerStateChange,
    onRoomClosed,
    onUserKicked,
    onHostDisconnected,
    onPeerJoined,
    onPeerLeft,
    onRemoteStream,
    onRemoteStreamRemoved,
    onPeerMediaState,
    onScreenShareChange,
    onFileTransferStart,
    onFileChunk,
    onFileTransferEnd,
    onFileTransferCancel,
    onFileTransferFailed,
    sendSignalApi,
  }) {
    this.roomId = roomId;
    this.myId = myId;
    this.hostId = hostId;
    this.isHost = isHost;
    this.onMessage = onMessage;
    this.onPeerStateChange = onPeerStateChange;
    this.onRoomClosed = onRoomClosed;
    this.onUserKicked = onUserKicked;
    this.onHostDisconnected = onHostDisconnected;
    this.onPeerJoined = onPeerJoined;
    this.onPeerLeft = onPeerLeft;
    this.onRemoteStream = onRemoteStream;
    this.onRemoteStreamRemoved = onRemoteStreamRemoved;
    this.onPeerMediaState = onPeerMediaState;
    this.onScreenShareChange = onScreenShareChange;
    this.onFileTransferStart = onFileTransferStart;
    this.onFileChunk = onFileChunk;
    this.onFileTransferEnd = onFileTransferEnd;
    this.onFileTransferCancel = onFileTransferCancel;
    this.onFileTransferFailed = onFileTransferFailed;
    this.sendSignalApi = sendSignalApi;

    // Phase 5: Active outgoing file transfer states (transferId -> { isCancelled })
    this.activeOutgoingTransfers = new Map();

    // Unique session ID for this browser instance
    this.sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Set of processed signal IDs to prevent duplicate processing
    this.processedSignals = new Set();

    // peerId -> RTCPeerConnection (Strictly ONE per peer)
    this.peers = new Map();
    // peerId -> RTCDataChannel
    this.dataChannels = new Map();
    // peerId -> Array of queued ICE candidates
    this.iceQueues = new Map();
    // peerId -> 'connecting' | 'connected' | 'disconnected' | 'failed'
    this.peerStates = new Map();

    // Phase 3: Media state
    this.localStream = null;
    // peerId -> MediaStream
    this.remoteStreams = new Map();
    // peerId -> { isAudioEnabled, isVideoEnabled, inCall }
    this.peerMediaStates = new Map();
    // peerId -> boolean (Perfect negotiation guard)
    this.makingOffers = new Map();

    this.currentMediaState = {
      isAudioEnabled: false,
      isVideoEnabled: false,
      inCall: false,
    };

    // Phase 4: Screen Sharing state
    this.cameraStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
    this.screenSharerId = null;

    this.isDestroyed = false;
  }

  generateSignalId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Deterministic tiebreaker for Perfect Negotiation:
   * Exactly one peer is polite and one is impolite for every peer pair.
   * Host is always impolite. Non-host is polite to host.
   * Between two non-hosts, lower ID is polite.
   */
  isPolite(peerId) {
    if (this.isHost) return false;
    if (this.hostId && peerId === this.hostId) return true;
    return this.myId < peerId;
  }

  /**
   * Determine whether this peer initiates connection to target peer initially.
   * Host initiates to participants. In multi-peer, deterministic tiebreaker.
   */
  shouldInitiate(peerId) {
    if (this.isHost) return true;
    if (this.hostId && peerId === this.hostId) return false;
    return this.myId > peerId;
  }

  /**
   * Sync participants list received from server
   */
  syncParticipants(participants) {
    if (this.isDestroyed) return;

    const currentPeerIds = new Set(
      participants.filter((p) => p.id !== this.myId).map((p) => p.id)
    );

    // Close peers that are no longer in the room
    for (const peerId of Array.from(this.peers.keys())) {
      if (!currentPeerIds.has(peerId)) {
        this.closePeer(peerId);
      }
    }

    // Connect to newly discovered peers
    for (const peerId of currentPeerIds) {
      if (!this.peers.has(peerId) && this.shouldInitiate(peerId)) {
        this.initiateConnection(peerId);
      }
    }
  }

  /**
   * Host / Initiator creates RTCPeerConnection, DataChannel, and sends Offer
   */
  async initiateConnection(peerId) {
    if (this.isDestroyed) return;

    let pc = this.peers.get(peerId);
    if (pc) {
      if (pc.signalingState !== "stable" || this.dataChannels.has(peerId)) {
        console.log(
          `[HUSH:WEBRTC] ${peerId} | Connection already in progress or established (${pc.signalingState}). Skipping offer.`
        );
        return;
      }
    } else {
      pc = this.createPeerConnection(peerId);
      this.peers.set(peerId, pc);
    }

    this.updatePeerState(peerId, "connecting");

    // Create DataChannel only once on the initiator side
    if (!this.dataChannels.has(peerId)) {
      console.log(`[HUSH:WEBRTC] ${peerId} | Creating DataChannel "hush-chat"`);
      const dc = pc.createDataChannel("hush-chat", { ordered: true });
      this.setupDataChannel(peerId, dc);
    }

    // Perform initial negotiation
    await this.negotiate(peerId);
  }

  /**
   * Perfect Negotiation offer creation
   */
  async negotiate(peerId) {
    if (this.isDestroyed) return;
    const pc = this.peers.get(peerId);
    if (!pc) return;

    if (this.makingOffers.get(peerId) || pc.signalingState !== "stable") {
      console.log(
        `[HUSH:WEBRTC] ${peerId} | Skipping negotiation: makingOffer=${this.makingOffers.get(
          peerId
        )}, signalingState=${pc.signalingState}`
      );
      return;
    }

    this.makingOffers.set(peerId, true);
    try {
      console.log(`[HUSH:WEBRTC] ${peerId} | Creating OFFER`);
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") {
        console.warn(
          `[HUSH:WEBRTC] ${peerId} | Signaling state changed to ${pc.signalingState} during createOffer, aborting`
        );
        return;
      }
      console.log(`[HUSH:WEBRTC] ${peerId} | Setting LOCAL OFFER`);
      await pc.setLocalDescription(offer);

      console.log(`[HUSH:WEBRTC] ${peerId} | Sending OFFER`);
      await this.sendSignalApi({
        signalId: this.generateSignalId(),
        fromPeerId: this.myId,
        toPeerId: peerId,
        sessionId: this.sessionId,
        type: "offer",
        payload: pc.localDescription,
      });
    } catch (err) {
      console.error(`[HUSH:WEBRTC] ${peerId} | Negotiation error:`, err);
      this.updatePeerState(peerId, "failed");
    } finally {
      this.makingOffers.set(peerId, false);
    }
  }

  /**
   * Creates an RTCPeerConnection and binds ICE, track, and state handlers
   */
  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    if (!this.iceQueues.has(peerId)) {
      this.iceQueues.set(peerId, []);
    }
    this.makingOffers.set(peerId, false);

    pc.onicecandidate = (event) => {
      if (event.candidate && !this.isDestroyed) {
        this.sendSignalApi({
          signalId: this.generateSignalId(),
          fromPeerId: this.myId,
          toPeerId: peerId,
          sessionId: this.sessionId,
          type: "ice-candidate",
          payload: event.candidate,
        }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.isDestroyed) return;
      const state = pc.connectionState;
      console.log(`[HUSH:WEBRTC] ${peerId} | connectionState: ${state}`);
      if (state === "connected") {
        this.updatePeerState(peerId, "connected");
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        this.updatePeerState(peerId, state);
      }
    };

    pc.onsignalingstatechange = () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | signalingState: ${pc.signalingState}`);
    };

    pc.oniceconnectionstatechange = () => {
      if (this.isDestroyed) return;
      const state = pc.iceConnectionState;
      console.log(`[HUSH:WEBRTC] ${peerId} | iceConnectionState: ${state}`);
      if (state === "failed") {
        this.updatePeerState(peerId, "failed");
      }
    };

    // Phase 3: Media track reception
    pc.ontrack = (event) => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | ontrack:`, event.track.kind);

      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(peerId, remoteStream);
      }

      // Avoid duplicate tracks of the same kind
      const existingTracks = remoteStream
        .getTracks()
        .filter((t) => t.kind === event.track.kind);
      existingTracks.forEach((t) => remoteStream.removeTrack(t));

      remoteStream.addTrack(event.track);

      this.onRemoteStream?.(peerId, remoteStream);

      event.track.onended = () => {
        console.log(`[HUSH:WEBRTC] ${peerId} | track ${event.track.kind} ended`);
        if (remoteStream) {
          remoteStream.removeTrack(event.track);
          if (remoteStream.getTracks().length === 0) {
            this.remoteStreams.delete(peerId);
            this.onRemoteStreamRemoved?.(peerId);
          } else {
            this.onRemoteStream?.(peerId, remoteStream);
          }
        }

        // Section 4: If remote screen share video track ended, reset screen sharing state immediately
        if (this.screenSharerId === peerId && event.track.kind === "video") {
          this.screenSharerId = null;
          this.onScreenShareChange?.({
            isSharing: false,
            sharerId: null,
          });
        }
      };
    };

    // Phase 3: Automatic renegotiation when media tracks change
    pc.onnegotiationneeded = async () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | onnegotiationneeded`);
      await this.negotiate(peerId);
    };

    // Attach existing local media or screen tracks if active
    if (this.isScreenSharing && this.screenStream) {
      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (screenTrack) {
        try {
          pc.addTrack(screenTrack, this.screenStream);
        } catch {}
      }
      if (this.localStream) {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
          try {
            pc.addTrack(audioTrack, this.localStream);
          } catch {}
        }
      }
    } else if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try {
          pc.addTrack(track, this.localStream);
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Failed to add existing track to new peer ${peerId}:`, err);
        }
      }
    }

    return pc;
  }

  /**
   * Sets up event listeners on an established or incoming DataChannel
   */
  setupDataChannel(peerId, dc) {
    this.dataChannels.set(peerId, dc);
    dc.binaryType = "arraybuffer";

    dc.onopen = () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | DataChannel is OPEN (Ready to send/receive messages)`);
      this.updatePeerState(peerId, "connected");

      // Inform newly opened peer of our current media state
      if (this.currentMediaState.inCall) {
        try {
          dc.send(
            JSON.stringify({
              type: "media-state",
              senderId: this.myId,
              state: this.currentMediaState,
            })
          );
        } catch {}
      }

      // Inform newly opened peer of our screen sharing state if sharing
      if (this.isScreenSharing) {
        try {
          dc.send(
            JSON.stringify({
              type: "screen-share-started",
              userId: this.myId,
              sharerId: this.myId,
              isSharing: true,
            })
          );
          dc.send(
            JSON.stringify({
              type: "screen-share-state",
              isSharing: true,
              sharerId: this.myId,
            })
          );
        } catch {}
      }
    };

    dc.onclose = () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | DataChannel is CLOSED`);
      this.updatePeerState(peerId, "disconnected");
      this.dataChannels.delete(peerId);
      this.onFileTransferFailed?.(peerId, "Transfer failed because the connection was lost.");
    };

    dc.onerror = (err) => {
      console.warn(`[HUSH:WEBRTC] ${peerId} | DataChannel error:`, err);
    };

    dc.onmessage = (event) => {
      if (this.isDestroyed) return;

      // Phase 5: Handle binary ArrayBuffer file chunk
      if (event.data instanceof ArrayBuffer) {
        try {
          const chunk = unpackBinaryChunk(event.data);
          this.onFileChunk?.(chunk, peerId);
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Error unpacking binary chunk from ${peerId}:`, err);
        }
        return;
      }

      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "chat" && payload.message) {
          this.onMessage?.(payload.message);
        } else if (payload.type === "file-start") {
          this.onFileTransferStart?.(payload);
        } else if (payload.type === "file-end") {
          this.onFileTransferEnd?.(payload);
        } else if (payload.type === "file-cancel") {
          this.onFileTransferCancel?.(payload);
        } else if (payload.type === "media-state") {
          const sender = payload.senderId || peerId;
          this.peerMediaStates.set(sender, payload.state);
          this.onPeerMediaState?.(sender, payload.state);
        } else if (payload.type === "screen-share-started") {
          const sharer = payload.userId || payload.sharerId || peerId;
          this.screenSharerId = sharer;
          this.onScreenShareChange?.({
            isSharing: true,
            sharerId: sharer,
          });
        } else if (payload.type === "screen-share-stopped") {
          const sharer = payload.userId || payload.sharerId || peerId;
          if (!this.screenSharerId || this.screenSharerId === sharer) {
            this.screenSharerId = null;
            this.onScreenShareChange?.({
              isSharing: false,
              sharerId: null,
            });
          }
        } else if (payload.type === "screen-share-state") {
          if (payload.isSharing) {
            const sharer = payload.sharerId || payload.userId || peerId;
            this.screenSharerId = sharer;
            this.onScreenShareChange?.({
              isSharing: true,
              sharerId: sharer,
            });
          } else {
            this.screenSharerId = null;
            this.onScreenShareChange?.({
              isSharing: false,
              sharerId: null,
            });
          }
        } else if (payload.type === "room-closed") {
          this.onRoomClosed?.(payload.reason);
        } else if (payload.type === "user-kicked") {
          if (payload.targetId === this.myId) {
            this.onUserKicked?.(payload.reason);
          }
        }
      } catch (err) {
        console.error("[HUSH:WEBRTC] Error parsing DataChannel message:", err);
      }
    };
  }

  /**
   * Process incoming signaling message with Perfect Negotiation & state guards
   */
  async handleSignal(signal) {
    if (this.isDestroyed || !signal || !signal.type) return;

    // Filter signals for other rooms
    if (signal.roomId && signal.roomId !== this.roomId) {
      return;
    }

    // Filter duplicate signals using unique message ID
    if (signal.id) {
      if (this.processedSignals.has(signal.id)) {
        console.log(`[HUSH:WEBRTC] Ignoring duplicate signal: ${signal.id} (${signal.type})`);
        return;
      }
      this.processedSignals.add(signal.id);
      if (this.processedSignals.size > 1000) {
        const [oldest] = this.processedSignals;
        this.processedSignals.delete(oldest);
      }
    }

    const { from, type, payload } = signal;

    if (type === "room-closed") {
      this.onRoomClosed?.(payload?.reason || "This room has been closed by the host.");
      return;
    }

    if (type === "user-kicked") {
      this.onUserKicked?.(payload?.reason || "You have been removed from this room.");
      return;
    }

    if (type === "host-disconnected") {
      this.onHostDisconnected?.(payload?.hostId);
      return;
    }

    if (type === "peer-joined") {
      this.onPeerJoined?.(payload?.peerId);
      if (this.shouldInitiate(payload.peerId)) {
        this.initiateConnection(payload.peerId);
      }
      return;
    }

    if (type === "peer-left") {
      this.onPeerLeft?.(payload?.peerId);
      this.closePeer(payload?.peerId);
      return;
    }

    // 1. Handling incoming SDP offer (Perfect Negotiation)
    if (type === "offer") {
      console.log(`[HUSH:WEBRTC] ${from} | Receiving OFFER`);
      let pc = this.peers.get(from);
      if (!pc) {
        pc = this.createPeerConnection(from);
        this.peers.set(from, pc);
      }

      const isPolite = this.isPolite(from);
      const isMakingOffer = !!this.makingOffers.get(from);
      const offerCollision = isMakingOffer || pc.signalingState !== "stable";

      if (offerCollision) {
        if (!isPolite) {
          console.warn(`[HUSH:WEBRTC] ${from} | Impolite peer ignoring colliding offer`);
          return;
        }
        console.log(`[HUSH:WEBRTC] ${from} | Polite peer rolling back colliding offer`);
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch (rbErr) {
          console.warn(`[HUSH:WEBRTC] Rollback error:`, rbErr);
        }
      }

      this.updatePeerState(from, "connecting");

      // Listen for incoming DataChannel if not already attached
      pc.ondatachannel = (event) => {
        console.log(`[HUSH:WEBRTC] ${from} | DataChannel received via ondatachannel`);
        this.setupDataChannel(from, event.channel);
      };

      try {
        console.log(`[HUSH:WEBRTC] ${from} | Setting REMOTE OFFER`);
        await pc.setRemoteDescription(new RTCSessionDescription(payload));

        // Flush any buffered ICE candidates
        const queuedCandidates = this.iceQueues.get(from) || [];
        this.iceQueues.set(from, []);
        for (const candidate of queuedCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn(`[HUSH:WEBRTC] Error applying queued ICE candidate:`, err);
          }
        }

        // Attach local tracks before creating answer if not already attached
        if (this.isScreenSharing) {
          const screenTrack = this.screenStream?.getVideoTracks()[0];
          if (screenTrack) {
            const senders = pc.getSenders();
            const hasVideo = senders.some((s) => s.track && s.track.kind === "video");
            if (!hasVideo) {
              try {
                pc.addTrack(screenTrack, this.screenStream);
              } catch {}
            }
          }
          const audioTrack = this.localStream?.getAudioTracks()[0];
          if (audioTrack) {
            const senders = pc.getSenders();
            const hasAudio = senders.some((s) => s.track && s.track.kind === "audio");
            if (!hasAudio) {
              try {
                pc.addTrack(audioTrack, this.localStream);
              } catch {}
            }
          }
        } else if (this.localStream) {
          for (const track of this.localStream.getTracks()) {
            const senders = pc.getSenders();
            const hasSender = senders.some((s) => s.track && s.track.kind === track.kind);
            if (!hasSender) {
              try {
                pc.addTrack(track, this.localStream);
              } catch {}
            }
          }
        }

        console.log(`[HUSH:WEBRTC] ${from} | Creating ANSWER`);
        const answer = await pc.createAnswer();

        console.log(`[HUSH:WEBRTC] ${from} | Setting LOCAL ANSWER`);
        await pc.setLocalDescription(answer);

        console.log(`[HUSH:WEBRTC] ${from} | Sending ANSWER`);
        await this.sendSignalApi({
          signalId: this.generateSignalId(),
          fromPeerId: this.myId,
          toPeerId: from,
          sessionId: this.sessionId,
          type: "answer",
          payload: pc.localDescription,
        });
      } catch (err) {
        console.error(`[HUSH:WEBRTC] Error handling offer from ${from}:`, err);
        this.updatePeerState(from, "failed");
      }
      return;
    }

    // 2. Handling incoming SDP answer (Host / Offerer)
    if (type === "answer") {
      console.log(`[HUSH:WEBRTC] ${from} | Receiving ANSWER`);
      const pc = this.peers.get(from);
      if (!pc) {
        console.warn(`[HUSH:WEBRTC] Received answer for nonexistent peer: ${from}`);
        return;
      }

      console.log(`[HUSH:WEBRTC] ${from} | Current signalingState: ${pc.signalingState}`);

      // CRITICAL: Protect against setRemoteDescription(answer) in stable state
      if (pc.signalingState !== "have-local-offer") {
        console.warn(
          `[HUSH:WEBRTC] Ignoring stale answer because signalingState is ${pc.signalingState}`
        );
        return;
      }

      try {
        console.log(`[HUSH:WEBRTC] ${from} | Setting REMOTE ANSWER`);
        await pc.setRemoteDescription(new RTCSessionDescription(payload));

        // Flush buffered ICE candidates
        const queuedCandidates = this.iceQueues.get(from) || [];
        this.iceQueues.set(from, []);
        for (const candidate of queuedCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn(`[HUSH:WEBRTC] Error applying queued ICE candidate:`, err);
          }
        }
      } catch (err) {
        console.error(`[HUSH:WEBRTC] Error setting remote answer for ${from}:`, err);
        this.updatePeerState(from, "failed");
      }
      return;
    }

    // 3. Handling incoming ICE candidate
    if (type === "ice-candidate") {
      const pc = this.peers.get(from);
      if (!pc) {
        if (!this.iceQueues.has(from)) {
          this.iceQueues.set(from, []);
        }
        this.iceQueues.get(from).push(payload);
        return;
      }

      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload));
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Error adding ICE candidate from ${from}:`, err);
        }
      } else {
        if (!this.iceQueues.has(from)) {
          this.iceQueues.set(from, []);
        }
        this.iceQueues.get(from).push(payload);
      }
    }
  }

  // ==========================================
  // PHASE 3: MEDIA STREAM & CALL METHODS
  // ==========================================

  /**
   * Set or update local media stream and attach tracks to all peer connections
   */
  setLocalStream(stream) {
    this.localStream = stream;
    this.cameraStream = stream;
    if (!stream) return;

    // If currently screen sharing, do not override the screen track on senders!
    if (this.isScreenSharing) {
      // Only attach audio tracks if needed
      for (const [peerId, pc] of this.peers.entries()) {
        for (const track of stream.getAudioTracks()) {
          const senders = pc.getSenders();
          const existingSender = senders.find(
            (s) => s.track && s.track.kind === "audio"
          );
          if (existingSender) {
            if (existingSender.track !== track) {
              existingSender.replaceTrack(track).catch(() => {});
            }
          } else {
            try {
              pc.addTrack(track, stream);
            } catch {}
          }
        }
      }
      return;
    }

    for (const [peerId, pc] of this.peers.entries()) {
      for (const track of stream.getTracks()) {
        const senders = pc.getSenders();
        const existingSender = senders.find(
          (s) => s.track && s.track.kind === track.kind
        );
        if (existingSender) {
          if (existingSender.track !== track) {
            existingSender.replaceTrack(track).catch((err) => {
              console.warn(`[HUSH:WEBRTC] replaceTrack error for ${peerId}:`, err);
            });
          }
        } else {
          try {
            pc.addTrack(track, stream);
          } catch (err) {
            console.warn(`[HUSH:WEBRTC] addTrack error for ${peerId}:`, err);
          }
        }
      }
    }
  }

  /**
   * Add a new single track to the active stream and existing peers
   */
  addLocalTrack(track) {
    if (!this.localStream) {
      this.localStream = new MediaStream([track]);
      this.cameraStream = this.localStream;
    } else {
      // Remove any existing track of the same kind
      const existing = this.localStream.getTracks().filter((t) => t.kind === track.kind);
      existing.forEach((t) => {
        try {
          t.stop();
        } catch {}
        this.localStream.removeTrack(t);
      });
      this.localStream.addTrack(track);
      this.cameraStream = this.localStream;
    }

    // If screen sharing and adding video, keep screen share active on sender
    if (this.isScreenSharing && track.kind === "video") {
      return;
    }

    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      const existingSender = senders.find((s) => s.track && s.track.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track).catch(() => {});
      } else {
        try {
          pc.addTrack(track, this.localStream);
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] addTrack error for ${peerId}:`, err);
        }
      }
    }
  }

  /**
   * Toggle track enabled state without destroying connections
   */
  toggleTrack(kind, enabled) {
    if (!this.localStream) return false;
    const track = this.localStream.getTracks().find((t) => t.kind === kind);
    if (track) {
      track.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Stop all local media tracks and release camera / microphone hardware
   */
  stopLocalStream() {
    this.stopScreenShare();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
      this.cameraStream = null;
    }

    // Reset sender tracks to null so peer stops receiving
    for (const [, pc] of this.peers.entries()) {
      for (const sender of pc.getSenders()) {
        if (sender.track) {
          try {
            sender.replaceTrack(null);
          } catch {}
        }
      }
    }

    this.currentMediaState = {
      isAudioEnabled: false,
      isVideoEnabled: false,
      inCall: false,
    };
    this.broadcastMediaState(this.currentMediaState);
  }

  /**
   * Broadcast current audio/video/call state to all connected peers
   */
  broadcastMediaState(mediaState) {
    this.currentMediaState = { ...this.currentMediaState, ...mediaState };
    const payload = JSON.stringify({
      type: "media-state",
      senderId: this.myId,
      state: this.currentMediaState,
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
        } catch {}
      }
    }
  }

  // ==========================================
  // PHASE 4: SCREEN SHARING METHODS
  // ==========================================

  /**
   * Start screen sharing: replace camera track on video sender with screenTrack
   */
  async setScreenStream(screenStream) {
    this.screenStream = screenStream;
    this.isScreenSharing = true;
    this.screenSharerId = this.myId;

    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) return;

    // Retain camera stream reference if present
    if (this.localStream) {
      this.cameraStream = this.localStream;
    }

    // Replace video track on each peer's video sender
    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      const videoSender = senders.find(
        (s) => s.track?.kind === "video" || (s.track === null && !s.dtmf)
      );

      if (videoSender) {
        try {
          await videoSender.replaceTrack(screenTrack);
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Error replacing track with screen for ${peerId}:`, err);
        }
      } else {
        try {
          pc.addTrack(screenTrack, screenStream);
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Error adding screen track for ${peerId}:`, err);
        }
      }
    }

    // Auto-detect browser native "Stop sharing" button
    screenTrack.onended = () => {
      console.log("[HUSH:WEBRTC] Screen share ended via browser native control");
      this.stopScreenShare();
    };

    // Broadcast screen share state to all peers
    this.broadcastScreenShareState({
      isSharing: true,
      sharerId: this.myId,
    });

    this.onScreenShareChange?.({
      isSharing: true,
      sharerId: this.myId,
    });
  }

  /**
   * Stop screen sharing: restore camera track or reset sender track to null
   */
  async stopScreenShare() {
    if (!this.isScreenSharing && !this.screenStream) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        try {
          track.onended = null;
          track.stop();
        } catch {}
      });
      this.screenStream = null;
    }

    this.isScreenSharing = false;
    if (this.screenSharerId === this.myId) {
      this.screenSharerId = null;
    }

    // Restore camera track only if camera was enabled and live (Test 4 requirement)
    const cameraTrack =
      this.cameraStream?.getVideoTracks()[0] ||
      this.localStream?.getVideoTracks()[0];
    const wasCameraActive =
      Boolean(this.currentMediaState?.isVideoEnabled) &&
      cameraTrack &&
      cameraTrack.readyState === "live";

    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      const videoSender = senders.find(
        (s) => s.track?.kind === "video" || s.track === null
      );

      if (videoSender) {
        try {
          if (wasCameraActive) {
            await videoSender.replaceTrack(cameraTrack);
          } else {
            await videoSender.replaceTrack(null);
          }
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Error restoring camera track for ${peerId}:`, err);
        }
      }
    }

    // Broadcast screen share stopped
    this.broadcastScreenShareState({
      isSharing: false,
      sharerId: null,
    });

    this.onScreenShareChange?.({
      isSharing: false,
      sharerId: null,
    });
  }

  /**
   * Broadcast screen share state over DataChannels
   */
  broadcastScreenShareState({ isSharing, sharerId }) {
    const statePayload = JSON.stringify({
      type: "screen-share-state",
      isSharing,
      sharerId,
      userId: sharerId,
    });

    const specificPayload = JSON.stringify({
      type: isSharing ? "screen-share-started" : "screen-share-stopped",
      userId: sharerId || this.myId,
      sharerId: sharerId || this.myId,
      isSharing,
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(statePayload);
          dc.send(specificPayload);
        } catch {}
      }
    }
  }

  // ==========================================
  // CHAT & CONTROL BROADCASTS
  // ==========================================

  /**
   * Broadcast message over open DataChannels (Chat messages only)
   */
  broadcastChatMessage(message) {
    if (this.isDestroyed) return 0;
    const payload = JSON.stringify({
      type: "chat",
      message,
    });

    let sent = 0;
    for (const [peerId, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
          sent++;
        } catch (err) {
          console.warn(`[HUSH:WEBRTC] Failed to send chat message to ${peerId}:`, err);
        }
      }
    }
    return sent;
  }

  // ==========================================
  // PHASE 5: EPHEMERAL FILE & IMAGE TRANSFER METHODS
  // ==========================================

  /**
   * Stream a file to all connected peers in 64KB binary chunks with backpressure
   */
  async sendFile({ transferId, file, onProgress }) {
    if (this.isDestroyed || !file) {
      return { ok: false, error: "Transfer failed because the connection was lost." };
    }

    const openChannels = Array.from(this.dataChannels.values()).filter(
      (dc) => dc.readyState === "open"
    );
    if (openChannels.length === 0) {
      return { ok: false, error: "Transfer failed because the connection was lost." };
    }

    this.activeOutgoingTransfers.set(transferId, { isCancelled: false });
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    // 1. Broadcast file-start metadata
    const startPayload = JSON.stringify({
      type: "file-start",
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      totalChunks,
      senderId: this.myId,
    });

    for (const dc of openChannels) {
      try {
        dc.send(startPayload);
      } catch (err) {
        console.warn("[HUSH:FILE] Error broadcasting file-start:", err);
      }
    }

    // 2. Stream binary chunks directly through DataChannel
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const state = this.activeOutgoingTransfers.get(transferId);
      if (!state || state.isCancelled) {
        console.log(`[HUSH:FILE] Transfer ${transferId} cancelled by sender`);
        this.broadcastFileCancel(transferId);
        this.activeOutgoingTransfers.delete(transferId);
        return { ok: false, cancelled: true };
      }

      const activeChannels = Array.from(this.dataChannels.values()).filter(
        (dc) => dc.readyState === "open"
      );
      if (activeChannels.length === 0) {
        this.activeOutgoingTransfers.delete(transferId);
        return { ok: false, error: "Transfer failed because the connection was lost." };
      }

      // Check backpressure across all open DataChannels
      for (const dc of activeChannels) {
        if (dc.bufferedAmount > BUFFERED_AMOUNT_HIGH_THRESHOLD) {
          await this.waitForBufferLow(dc);
        }
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const slice = file.slice(start, end);
      const arrayBuffer = await slice.arrayBuffer();

      const packet = packBinaryChunk(transferId, chunkIndex, arrayBuffer);

      for (const dc of activeChannels) {
        try {
          dc.send(packet);
        } catch (err) {
          console.warn("[HUSH:FILE] Error sending binary chunk:", err);
        }
      }

      const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      onProgress?.(progress);
    }

    // 3. Broadcast file-end
    const endPayload = JSON.stringify({
      type: "file-end",
      transferId,
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(endPayload);
        } catch {}
      }
    }

    this.activeOutgoingTransfers.delete(transferId);
    return { ok: true };
  }

  /**
   * Wait for DataChannel bufferedAmount to drop below safe threshold
   */
  waitForBufferLow(dc) {
    return new Promise((resolve) => {
      if (!dc || dc.readyState !== "open" || dc.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
        return resolve();
      }
      const handler = () => {
        try {
          dc.removeEventListener("bufferedamountlow", handler);
        } catch {}
        resolve();
      };
      try {
        dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
        dc.addEventListener("bufferedamountlow", handler);
      } catch {}
      setTimeout(() => {
        try {
          dc.removeEventListener("bufferedamountlow", handler);
        } catch {}
        resolve();
      }, 50);
    });
  }

  /**
   * Cancel an active outgoing file transfer
   */
  cancelFileTransfer(transferId) {
    const state = this.activeOutgoingTransfers.get(transferId);
    if (state) {
      state.isCancelled = true;
    }
    this.broadcastFileCancel(transferId);
    this.activeOutgoingTransfers.delete(transferId);
  }

  broadcastFileCancel(transferId) {
    const payload = JSON.stringify({
      type: "file-cancel",
      transferId,
      reason: "Transfer cancelled by sender.",
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
        } catch {}
      }
    }
  }

  /**
   * Broadcast room-closed control message
   */
  broadcastRoomClosed(reason) {
    const payload = JSON.stringify({
      type: "room-closed",
      reason: reason || "This room has been closed by the host.",
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
        } catch {}
      }
    }
  }

  /**
   * Broadcast kick message
   */
  broadcastUserKicked(targetId) {
    const payload = JSON.stringify({
      type: "user-kicked",
      targetId,
      reason: "You have been removed from this room.",
    });

    for (const [, dc] of this.dataChannels.entries()) {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
        } catch {}
      }
    }
  }

  updatePeerState(peerId, state) {
    this.peerStates.set(peerId, state);
    this.onPeerStateChange?.(new Map(this.peerStates));
  }

  closePeer(peerId) {
    this.onFileTransferFailed?.(peerId, "Transfer failed because the connection was lost.");

    const dc = this.dataChannels.get(peerId);
    if (dc) {
      try {
        dc.close();
      } catch {}
      this.dataChannels.delete(peerId);
    }

    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peers.delete(peerId);
    }

    const remoteStream = this.remoteStreams.get(peerId);
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.remoteStreams.delete(peerId);
      this.onRemoteStreamRemoved?.(peerId);
    }

    if (this.screenSharerId === peerId) {
      this.screenSharerId = null;
      this.onScreenShareChange?.({
        isSharing: false,
        sharerId: null,
      });
    }

    this.peerMediaStates.delete(peerId);
    this.makingOffers.delete(peerId);
    this.iceQueues.delete(peerId);
    this.peerStates.delete(peerId);
    this.onPeerStateChange?.(new Map(this.peerStates));
  }

  destroy() {
    this.isDestroyed = true;
    this.stopLocalStream();

    for (const [tId] of this.activeOutgoingTransfers.entries()) {
      this.cancelFileTransfer(tId);
    }
    this.activeOutgoingTransfers.clear();

    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }

    for (const [, stream] of this.remoteStreams.entries()) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    }

    this.peers.clear();
    this.dataChannels.clear();
    this.iceQueues.clear();
    this.peerStates.clear();
    this.processedSignals.clear();
    this.remoteStreams.clear();
    this.peerMediaStates.clear();
    this.makingOffers.clear();
  }
}
