/**
 * WebRTC DataChannel Mesh Manager
 *
 * Implements a strict offer/answer state machine with:
 * 1. Protection against setRemoteDescription(answer) in stable state.
 * 2. Signal deduplication using unique signal IDs.
 * 3. Exactly one RTCPeerConnection per remote peer.
 * 4. Buffering of ICE candidates until remoteDescription is set.
 * 5. DataChannel state validation before sending messages.
 * 6. Structured logging with [HUSH:WEBRTC].
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
    isHost = false,
    onMessage,
    onPeerStateChange,
    onRoomClosed,
    onUserKicked,
    onHostDisconnected,
    sendSignalApi,
  }) {
    this.roomId = roomId;
    this.myId = myId;
    this.isHost = isHost;
    this.onMessage = onMessage;
    this.onPeerStateChange = onPeerStateChange;
    this.onRoomClosed = onRoomClosed;
    this.onUserKicked = onUserKicked;
    this.onHostDisconnected = onHostDisconnected;
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

    this.isDestroyed = false;
  }

  generateSignalId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Determine whether this peer initiates connection to target peer
   * Rule: Host initiates to participants. In multi-peer, deterministic tiebreaker.
   */
  shouldInitiate(peerId) {
    if (this.isHost) return true;
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

    try {
      // Create DataChannel only once on the initiator side
      if (!this.dataChannels.has(peerId)) {
        console.log(`[HUSH:WEBRTC] ${peerId} | Creating DataChannel "hush-chat"`);
        const dc = pc.createDataChannel("hush-chat", { ordered: true });
        this.setupDataChannel(peerId, dc);
      }

      console.log(`[HUSH:WEBRTC] ${peerId} | Creating OFFER`);
      const offer = await pc.createOffer();

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
      console.error(`[HUSH:WEBRTC] Failed to initiate connection with ${peerId}:`, err);
      this.updatePeerState(peerId, "failed");
    }
  }

  /**
   * Creates an RTCPeerConnection and binds ICE candidate & state change handlers
   */
  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    if (!this.iceQueues.has(peerId)) {
      this.iceQueues.set(peerId, []);
    }

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
   * Process incoming signaling message with deduplication & state guards
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
      if (this.shouldInitiate(payload.peerId)) {
        this.initiateConnection(payload.peerId);
      }
      return;
    }

    // 1. Handling incoming SDP offer (Guest / Offeree)
    if (type === "offer") {
      console.log(`[HUSH:WEBRTC] ${from} | Receiving OFFER`);
      let pc = this.peers.get(from);

      if (pc) {
        // Guard against duplicate offers in stable or have-remote-offer state
        if (pc.signalingState === "stable") {
          console.warn(`[HUSH:WEBRTC] Ignoring duplicate/stale offer from ${from} because signalingState is stable`);
          return;
        }
        if (pc.signalingState === "have-remote-offer") {
          console.warn(`[HUSH:WEBRTC] Already processing offer for ${from}, ignoring duplicate`);
          return;
        }
        if (pc.signalingState === "have-local-offer") {
          // Glare handling: polite peer rolls back local offer
          const isPolite = !this.isHost && this.myId < from;
          if (!isPolite) {
            console.warn(`[HUSH:WEBRTC] Glare detected from ${from}. Impolite peer ignores colliding offer.`);
            return;
          }
          console.log(`[HUSH:WEBRTC] Glare detected from ${from}. Polite peer rolls back local offer.`);
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {}
        }
      } else {
        pc = this.createPeerConnection(from);
        this.peers.set(from, pc);
      }

      this.updatePeerState(from, "connecting");

      // Listen for incoming DataChannel
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

      // CRITICAL: Protect setRemoteDescription(answer)
      // Never call setRemoteDescription(answer) in stable state!
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

    this.iceQueues.delete(peerId);
    this.peerStates.delete(peerId);
    this.onPeerStateChange?.(new Map(this.peerStates));
  }

  destroy() {
    this.isDestroyed = true;
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
    this.peers.clear();
    this.dataChannels.clear();
    this.iceQueues.clear();
    this.peerStates.clear();
    this.processedSignals.clear();
  }
}
