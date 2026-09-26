/**
 * Comprehensive Automated Verification Script for HUSH Phase 2 Multi-User Room Features
 */

import { generateRoomId, isValidRoomId, formatRoomInput, generateUserId } from "../lib/room.js";
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  kickUser,
  closeRoom,
  sendSignal,
  pollSignals,
} from "../lib/signaling-store.js";
import { WebRTCMesh } from "../lib/webrtc.js";

// Mock RTCPeerConnection for unit testing WebRTC state machine in Node environment
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.signalingState = "stable";
    this.connectionState = "new";
    this.iceConnectionState = "new";
    this.localDescription = null;
    this.remoteDescription = null;
    this.setRemoteDescriptionCalls = 0;
    this.setLocalDescriptionCalls = 0;
    this.addedIceCandidates = [];
  }

  createDataChannel(label, options) {
    return {
      label,
      readyState: "open",
      send: (data) => {},
      close: () => {},
    };
  }

  async createOffer() {
    return { type: "offer", sdp: "mock-offer-sdp" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "mock-answer-sdp" };
  }

  async setLocalDescription(desc) {
    this.setLocalDescriptionCalls++;
    this.localDescription = desc;
    if (desc.type === "offer") {
      this.signalingState = "have-local-offer";
    } else if (desc.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(desc) {
    this.setRemoteDescriptionCalls++;
    if (desc.type === "answer" && this.signalingState === "stable") {
      const err = new Error(
        "Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': Failed to set remote answer SDP: Called in wrong state: stable"
      );
      err.name = "InvalidStateError";
      throw err;
    }

    this.remoteDescription = desc;
    if (desc.type === "offer") {
      this.signalingState = "have-remote-offer";
    } else if (desc.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async addIceCandidate(candidate) {
    this.addedIceCandidates.push(candidate);
  }

  close() {
    this.signalingState = "closed";
    this.connectionState = "closed";
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = function (desc) {
  return desc;
};
globalThis.RTCIceCandidate = function (candidate) {
  return candidate;
};

async function runTests() {
  console.log("=== Starting HUSH Phase 2 Multi-User Verification ===");
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // 1. Host creates room
  const hostId = generateUserId();
  const roomId = generateRoomId();
  assert(isValidRoomId(roomId), `Room ID format matches XXXX-XXXX: ${roomId}`);

  const createdRoom = createRoom(roomId, hostId);
  assert(createdRoom.status === "waiting", "Host creates room in WAITING state");
  assert(createdRoom.hostId === hostId, "Creator is assigned as HOST");
  assert(createdRoom.participants[hostId].role === "host", "Host role is 'host'");

  // 2. Multiple users join (Host, User 01, User 02, User 03, User 04)
  const user1 = generateUserId();
  const join1 = joinRoom(roomId, user1);
  assert(join1.ok === true, `User 01 (${user1}) joins room`);
  assert(join1.room.participants.length === 2, "Live connected count: 2");
  assert(join1.room.status === "active", "Room transitions to ACTIVE");

  const user2 = generateUserId();
  const join2 = joinRoom(roomId, user2);
  assert(join2.ok === true, `User 02 (${user2}) joins room`);
  assert(join2.room.participants.length === 3, "Live connected count: 3");

  const user3 = generateUserId();
  const join3 = joinRoom(roomId, user3);
  assert(join3.ok === true, `User 03 (${user3}) joins room`);
  assert(join3.room.participants.length === 4, "Live connected count: 4");

  const user4 = generateUserId();
  const join4 = joinRoom(roomId, user4);
  assert(join4.ok === true, `User 04 (${user4}) joins room`);
  assert(join4.room.participants.length === 5, "Live connected count: 5");

  // 3. Host Identification
  const currentRoom = getRoom(roomId);
  const hostParticipant = currentRoom.participants[hostId];
  assert(hostParticipant.role === "host", "Only room creator is HOST");
  assert(currentRoom.participants[user1].role === "participant", "User 01 role is participant");
  assert(currentRoom.participants[user2].role === "participant", "User 02 role is participant");

  // 4. User Join Notifications
  let joinNotifications = [];
  let leaveNotifications = [];

  const meshHost = new WebRTCMesh({
    roomId,
    myId: hostId,
    isHost: true,
    onPeerJoined: (peerId) => joinNotifications.push(`${peerId} joined the room`),
    onPeerLeft: (peerId) => leaveNotifications.push(`${peerId} left the room`),
    sendSignalApi: async () => ({ ok: true }),
  });

  // Simulate join signal arrival
  await meshHost.handleSignal({
    id: "sig_join_u1",
    roomId,
    from: "system",
    type: "peer-joined",
    payload: { peerId: user1 },
  });
  assert(
    joinNotifications.includes(`${user1} joined the room`),
    "Join notification generated: 'USER-XXXX joined the room'"
  );

  // 5. Group Messaging over DataChannels
  // Set up mock DataChannels
  const mockMessagesSent = [];
  meshHost.dataChannels.set(user1, {
    readyState: "open",
    send: (msg) => mockMessagesSent.push({ to: user1, msg }),
  });
  meshHost.dataChannels.set(user2, {
    readyState: "open",
    send: (msg) => mockMessagesSent.push({ to: user2, msg }),
  });
  meshHost.dataChannels.set(user3, {
    readyState: "open",
    send: (msg) => mockMessagesSent.push({ to: user3, msg }),
  });
  meshHost.dataChannels.set(user4, {
    readyState: "open",
    send: (msg) => mockMessagesSent.push({ to: user4, msg }),
  });

  const chatMsg = {
    id: "msg_1",
    senderId: hostId,
    text: "Hello everyone 👋",
    timestamp: Date.now(),
  };

  const sentCount = meshHost.broadcastChatMessage(chatMsg);
  assert(sentCount === 4, "Group message broadcast to all 4 connected peers");
  assert(mockMessagesSent.length === 4, "Each peer received message over WebRTC DataChannel");

  // 6. Host can remove users
  const kickRes = kickUser(roomId, hostId, user2);
  assert(kickRes.ok === true, "Host successfully removed User 02");
  assert(getRoom(roomId).participants[user2] === undefined, "User 02 removed from participants");
  assert(Object.keys(getRoom(roomId).participants).length === 4, "Live connected count decreased to 4");

  // User 02 receives kicked signal
  const user2Poll = pollSignals(roomId, user2);
  assert(user2Poll.removed === true, "Removed user informed of removal");

  // User leave notification
  await meshHost.handleSignal({
    id: "sig_left_u2",
    roomId,
    from: hostId,
    type: "peer-left",
    payload: { peerId: user2 },
  });
  assert(
    leaveNotifications.includes(`${user2} left the room`),
    "Leave notification generated: 'USER-XXXX left the room'"
  );

  // 7. Normal users cannot remove others
  const unauthorizedKick = kickUser(roomId, user1, user3);
  assert(unauthorizedKick.ok === false, "Normal user cannot remove another user");
  assert(unauthorizedKick.code === "UNAUTHORIZED", "Unauthorized error code returned");

  // 8. Normal user voluntary leave
  leaveRoom(roomId, user4);
  assert(getRoom(roomId).participants[user4] === undefined, "User 04 voluntarily left");
  assert(Object.keys(getRoom(roomId).participants).length === 3, "Live connected count updated to 3");

  // 9. Host closes room
  const closeRes = closeRoom(roomId, hostId);
  assert(closeRes.ok === true, "Host explicitly closed room");
  assert(getRoom(roomId).status === "closed", "Room status is CLOSED");

  console.log(`\n=== Phase 2 Verification Complete: ${passed}/${total} Passed ===`);
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
