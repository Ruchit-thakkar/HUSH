/**
 * Next.js In-Memory Signaling Store
 *
 * CRITICAL PRIVACY & ARCHITECTURE COMPLIANCE:
 * - Temporary in-memory state ONLY for WebRTC signaling.
 * - Stores ONLY WebRTC connection metadata (offers, answers, ICE candidates) and room presence.
 * - NEVER stores or accepts chat messages.
 * - Each signal has a unique ID to prevent duplicate processing.
 * - Room lifecycle: CREATE -> WAITING -> ACTIVE -> CLOSED.
 * - Only explicit host action ("Close Room") marks status as CLOSED.
 */

if (!globalThis.__HUSH_SIGNALING__) {
  globalThis.__HUSH_SIGNALING__ = {
    rooms: new Map(), // roomId -> Room
  };
}

const store = globalThis.__HUSH_SIGNALING__;

const MAX_PARTICIPANTS_PER_ROOM = 8;
const PEER_TIMEOUT_MS = 30000; // 30s without poll = peer marked disconnected
const SIGNAL_TTL_MS = 45000; // 45s signal buffer
const CLOSED_ROOM_RETENTION_MS = 120000; // retain closed state for 2m
const EMPTY_ROOM_TTL_MS = 600000; // 10 minutes grace period for empty rooms

function generateSignalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Periodically cleanup expired signals and stale peers
 */
function cleanupRoom(room) {
  const now = Date.now();

  // Purge expired signals
  for (const [peerId, queue] of Object.entries(room.signals)) {
    room.signals[peerId] = queue.filter((sig) => now - sig.timestamp < SIGNAL_TTL_MS);
  }

  // Check peer heartbeats
  for (const [peerId, participant] of Object.entries(room.participants)) {
    if (now - participant.lastSeen > PEER_TIMEOUT_MS) {
      const isHost = peerId === room.hostId;
      delete room.participants[peerId];
      delete room.signals[peerId];

      if (isHost) {
        room.hostConnected = false;
        broadcastSignal(room.id, "system", "host-disconnected", { hostId: peerId }, peerId);
      } else {
        broadcastSignal(room.id, "system", "peer-left", { peerId, reason: "timeout" }, peerId);
      }
    }
  }

  // Update room status based on remaining participants
  const remainingCount = Object.keys(room.participants).length;
  if (room.status !== "closed") {
    if (remainingCount >= 2) {
      room.status = "active";
    } else {
      room.status = "waiting";
    }
  }
}

/**
 * Helper to queue a signal to a specific peer
 */
function queueSignal(room, fromPeerId, toPeerId, type, payload, signalId = null, sessionId = null) {
  if (!room.signals[toPeerId]) {
    room.signals[toPeerId] = [];
  }

  const id = signalId || generateSignalId();

  room.signals[toPeerId].push({
    id,
    roomId: room.id,
    from: fromPeerId,
    to: toPeerId,
    sessionId: sessionId || null,
    type,
    payload,
    timestamp: Date.now(),
  });
}

/**
 * Helper to broadcast a signal to all peers except excludePeerId
 */
export function broadcastSignal(roomId, fromPeerId, type, payload, excludePeerId = null, sessionId = null) {
  const room = store.rooms.get(roomId);
  if (!room) return;

  for (const peerId of Object.keys(room.participants)) {
    if (peerId !== excludePeerId && peerId !== fromPeerId) {
      queueSignal(room, fromPeerId, peerId, type, payload, generateSignalId(), sessionId);
    }
  }
}

/**
 * Create a new room with WAITING status
 */
export function createRoom(roomId, hostId) {
  const now = Date.now();

  const room = {
    id: roomId,
    hostId,
    status: "waiting", // CREATE -> WAITING -> ACTIVE -> CLOSED
    createdAt: now,
    closedAt: null,
    hostConnected: true,
    emptySince: null,
    participants: {
      [hostId]: {
        id: hostId,
        role: "host",
        joinedAt: now,
        lastSeen: now,
      },
    },
    signals: {
      [hostId]: [],
    },
  };

  store.rooms.set(roomId, room);
  return room;
}

/**
 * Get room by ID (with cleanup check)
 */
export function getRoom(roomId) {
  const room = store.rooms.get(roomId);
  if (!room) return null;

  cleanupRoom(room);

  // If closed and retention expired, purge
  if (room.status === "closed" && room.closedAt && Date.now() - room.closedAt > CLOSED_ROOM_RETENTION_MS) {
    store.rooms.delete(roomId);
    return null;
  }

  // If empty for more than 10 minutes, purge
  const participantCount = Object.keys(room.participants).length;
  if (participantCount === 0) {
    if (!room.emptySince) {
      room.emptySince = Date.now();
    } else if (Date.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
      store.rooms.delete(roomId);
      return null;
    }
  } else {
    room.emptySince = null;
  }

  return room;
}

/**
 * Join an existing room
 */
export function joinRoom(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." };
  }

  if (room.status === "closed") {
    return { ok: false, code: "ROOM_CLOSED", error: "This room has been closed." };
  }

  const currentCount = Object.keys(room.participants).length;
  const isExisting = Boolean(room.participants[userId]);

  if (!isExisting && currentCount >= MAX_PARTICIPANTS_PER_ROOM) {
    return { ok: false, code: "ROOM_FULL", error: "Room is full." };
  }

  const now = Date.now();
  const isHost = room.hostId === userId;

  if (isHost) {
    room.hostConnected = true;
  }

  room.participants[userId] = {
    id: userId,
    role: isHost ? "host" : "participant",
    joinedAt: isExisting ? room.participants[userId].joinedAt : now,
    lastSeen: now,
  };

  if (!room.signals[userId]) {
    room.signals[userId] = [];
  }

  // Room becomes active when at least 2 participants are present
  const totalParticipants = Object.keys(room.participants).length;
  if (totalParticipants >= 2) {
    room.status = "active";
  }

  // Notify other participants of peer arrival
  if (!isExisting) {
    broadcastSignal(
      roomId,
      userId,
      "peer-joined",
      {
        peerId: userId,
        role: isHost ? "host" : "participant",
      },
      userId
    );
  }

  return {
    ok: true,
    room: {
      id: room.id,
      hostId: room.hostId,
      status: room.status,
      hostConnected: room.hostConnected !== false,
      createdAt: room.createdAt,
      participants: Object.values(room.participants),
    },
  };
}

/**
 * Participant leaves a room
 */
export function leaveRoom(roomId, userId) {
  const room = store.rooms.get(roomId);
  if (!room) return { ok: true };

  const isHost = room.hostId === userId;

  if (room.participants[userId]) {
    delete room.participants[userId];
    delete room.signals[userId];
  }

  if (isHost) {
    room.hostConnected = false;
    broadcastSignal(roomId, userId, "host-disconnected", { hostId: userId });
  } else {
    broadcastSignal(roomId, userId, "peer-left", { peerId: userId });
  }

  const remaining = Object.keys(room.participants).length;
  if (remaining === 0) {
    room.emptySince = Date.now();
  } else if (remaining < 2 && room.status !== "closed") {
    room.status = "waiting";
  }

  return { ok: true };
}

/**
 * Host kicks a user
 */
export function kickUser(roomId, hostId, targetUserId) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." };
  if (room.hostId !== hostId) return { ok: false, code: "UNAUTHORIZED", error: "Only host can remove participants." };
  if (targetUserId === hostId) return { ok: false, code: "INVALID", error: "Host cannot remove themselves." };

  if (room.participants[targetUserId]) {
    delete room.participants[targetUserId];

    queueSignal(room, hostId, targetUserId, "user-kicked", {
      reason: "You have been removed from this room.",
    });

    broadcastSignal(roomId, hostId, "peer-left", { peerId: targetUserId, reason: "removed" }, targetUserId);

    const remaining = Object.keys(room.participants).length;
    if (remaining < 2 && room.status !== "closed") {
      room.status = "waiting";
    }
  }

  return { ok: true };
}

/**
 * Host explicitly closes the room
 */
export function closeRoom(roomId, hostId) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." };
  if (room.hostId !== hostId) return { ok: false, code: "UNAUTHORIZED", error: "Only host can close the room." };

  room.status = "closed";
  room.closedAt = Date.now();

  broadcastSignal(roomId, hostId, "room-closed", {
    reason: "This room has been closed by the host.",
  });

  return { ok: true };
}

/**
 * Send a WebRTC signaling message (offer, answer, ice-candidate, ping)
 */
export function sendSignal(roomId, fromPeerId, toPeerId, type, payload, signalId = null, sessionId = null) {
  const validTypes = ["offer", "answer", "ice-candidate", "ping"];
  if (!validTypes.includes(type)) {
    return { ok: false, error: "Invalid signal type. Chat messages must NOT use signaling." };
  }

  const room = getRoom(roomId);
  if (!room) return { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." };
  if (room.status === "closed") return { ok: false, code: "ROOM_CLOSED", error: "Room is closed." };

  if (!room.participants[fromPeerId]) {
    return { ok: false, error: "Sender not in room." };
  }

  room.participants[fromPeerId].lastSeen = Date.now();

  if (toPeerId === "all") {
    broadcastSignal(roomId, fromPeerId, type, payload, fromPeerId, sessionId);
  } else {
    if (!room.participants[toPeerId]) {
      return { ok: false, error: "Recipient peer not found." };
    }
    queueSignal(room, fromPeerId, toPeerId, type, payload, signalId, sessionId);
  }

  return { ok: true };
}

/**
 * Poll for pending signals and presence updates
 */
export function pollSignals(roomId, peerId) {
  const room = getRoom(roomId);
  if (!room) {
    return { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." };
  }

  if (room.status === "closed") {
    return {
      ok: true,
      closed: true,
      error: "This room has been closed by the host.",
      signals: [
        {
          id: generateSignalId(),
          roomId: room.id,
          type: "room-closed",
          payload: { reason: "This room has been closed by the host." },
        },
      ],
      participants: [],
    };
  }

  // If participant was removed / kicked
  if (!room.participants[peerId]) {
    const pendingSignals = room.signals[peerId] || [];
    delete room.signals[peerId];
    const kickedSignal = pendingSignals.find((s) => s.type === "user-kicked");

    return {
      ok: true,
      removed: Boolean(kickedSignal),
      error: kickedSignal?.payload?.reason || "Participant not in room.",
      signals: pendingSignals,
      participants: Object.values(room.participants),
      hostConnected: room.hostConnected !== false,
      status: room.status,
    };
  }

  // Update heartbeat
  room.participants[peerId].lastSeen = Date.now();
  if (peerId === room.hostId) {
    room.hostConnected = true;
  }

  // Consume queued signals
  const signals = room.signals[peerId] || [];
  room.signals[peerId] = [];

  return {
    ok: true,
    closed: false,
    status: room.status,
    hostConnected: room.hostConnected !== false,
    signals,
    participants: Object.values(room.participants),
  };
}
