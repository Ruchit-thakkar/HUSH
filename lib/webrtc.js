/**
 * WebRTC DataChannel & MediaStream Mesh Manager
 *
 * Implements:
 * 1. Text Chat DataChannel (Phase 1 & Phase 2).
 * 2. MediaStream Tracks for Video & Voice Call (Phase 3).
 * 3. Perfect Negotiation state machine for collision-free offer/answer renegotiation.
 * 4. Protection against setRemoteDescription(answer) in stable state.
 * 5. Signal deduplication using unique signal IDs.
 * 6. Exactly one RTCPeerConnection per remote peer.
 * 7. Buffering of ICE candidates until remoteDescription is set.
 * 8. Zero media recording or persistence - memory-only streams.
 */

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
    this.sendSignalApi = sendSignalApi;

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
      };
    };

    // Phase 3: Automatic renegotiation when media tracks change
    pc.onnegotiationneeded = async () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | onnegotiationneeded`);
      await this.negotiate(peerId);
    };

    // Attach existing local media tracks if active
    if (this.localStream) {
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
    };

    dc.onclose = () => {
      if (this.isDestroyed) return;
      console.log(`[HUSH:WEBRTC] ${peerId} | DataChannel is CLOSED`);
      this.updatePeerState(peerId, "disconnected");
      this.dataChannels.delete(peerId);
    };

    dc.onerror = (err) => {
      console.warn(`[HUSH:WEBRTC] ${peerId} | DataChannel error:`, err);
    };

    dc.onmessage = (event) => {
      if (this.isDestroyed) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "chat" && payload.message) {
          this.onMessage?.(payload.message);
        } else if (payload.type === "media-state") {
          const sender = payload.senderId || peerId;
          this.peerMediaStates.set(sender, payload.state);
          this.onPeerMediaState?.(sender, payload.state);
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
        if (this.localStream) {
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
    if (!stream) return;

    for (const [peerId, pc] of this.peers.entries()) {
      for (const track of stream.getTracks()) {
        const senders = pc.getSenders();
        const existingSender = senders.find(
          (s) => s.track && s.track.kind === track.kind
        );
        if (existingSender) {
          existingSender.replaceTrack(track).catch((err) => {
            console.warn(`[HUSH:WEBRTC] replaceTrack error for ${peerId}:`, err);
          });
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
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
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

    this.peerMediaStates.delete(peerId);
    this.makingOffers.delete(peerId);
    this.iceQueues.delete(peerId);
    this.peerStates.delete(peerId);
    this.onPeerStateChange?.(new Map(this.peerStates));
  }

  destroy() {
    this.isDestroyed = true;
    this.stopLocalStream();

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
