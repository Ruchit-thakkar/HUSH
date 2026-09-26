/**
 * Comprehensive Automated Verification Script for HUSH WebRTC State Machine & Signaling Fixes
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
      send: () => {},
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
  console.log("=== Starting HUSH WebRTC State Machine & Connection Verification ===");
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

  // 1. Room ID & User ID Generation
  const roomId = generateRoomId();
  assert(isValidRoomId(roomId), `Room ID format matches XXXX-XXXX: ${roomId}`);
  assert(!/[0O1IL]/.test(roomId), `Room ID excludes ambiguous characters: ${roomId}`);
  assert(formatRoomInput("h7k9x2p4") === "H7K9-X2P4", "Room input formatting works");
  assert(/^USER-[0-9A-F]{4}$/.test(generateUserId()), "User ID matches USER-XXXX format");

  // 2. Pre-Creation & Discovery (Fix for "Room not found")
  const hostId = generateUserId();
  const testRoomId = generateRoomId();

  const createdRoom = createRoom(testRoomId, hostId);
  assert(createdRoom.status === "waiting", "Room created in WAITING state");

  const roomDiscovery = getRoom(testRoomId);
  assert(roomDiscovery !== null, "Browser B successfully discovers active waiting room");

  // 3. Joining Room & Lifecycle Transition (WAITING -> ACTIVE)
  const user2 = generateUserId();
  const joinResult2 = joinRoom(testRoomId, user2);
  assert(joinResult2.ok === true, "Browser B successfully joins room");
  assert(joinResult2.room.status === "active", "Room transitions to ACTIVE upon second participant");

  // 4. Multi-User (Browser C joins)
  const user3 = generateUserId();
  const joinResult3 = joinRoom(testRoomId, user3);
  assert(joinResult3.ok === true, "Browser C successfully joins room");
  assert(joinResult3.room.participants.length === 3, "Connected count is 3");

  // 5. WebRTC State Machine Unit Tests:
  let dispatchedSignals = [];
  const mockSendSignal = async (sig) => {
    dispatchedSignals.push(sig);
    return { ok: true };
  };

  const mesh = new WebRTCMesh({
    roomId: testRoomId,
    myId: hostId,
    isHost: true,
    sendSignalApi: mockSendSignal,
  });

  // Test 5A: Host initiates connection (Creating Offer)
  await mesh.initiateConnection(user2);
  const hostPc = mesh.peers.get(user2);
  assert(hostPc !== undefined, "Host created peer connection for user2");
  assert(hostPc.signalingState === "have-local-offer", "Host signaling state is 'have-local-offer'");
  assert(dispatchedSignals.some((s) => s.type === "offer"), "Host dispatched offer signal");

  // Test 5B: Valid Answer in 'have-local-offer'
  const validAnswerSignal = {
    id: "sig_answer_1",
    roomId: testRoomId,
    from: user2,
    to: hostId,
    type: "answer",
    payload: { type: "answer", sdp: "valid-answer-sdp" },
  };

  await mesh.handleSignal(validAnswerSignal);
  assert(hostPc.signalingState === "stable", "Host signaling state transitioned to 'stable' after valid answer");
  assert(hostPc.setRemoteDescriptionCalls === 1, "setRemoteDescription called once for valid answer");

  // Test 5C: Duplicate Answer Protection (Fix for InvalidStateError)
  // An answer arriving when signalingState is ALREADY 'stable'
  const duplicateAnswerSignal = {
    id: "sig_answer_2", // Different ID, but connection is already stable
    roomId: testRoomId,
    from: user2,
    to: hostId,
    type: "answer",
    payload: { type: "answer", sdp: "stale-answer-sdp" },
  };

  // Must NOT throw InvalidStateError and must NOT call setRemoteDescription
  let threwInvalidState = false;
  try {
    await mesh.handleSignal(duplicateAnswerSignal);
  } catch {
    threwInvalidState = true;
  }
  assert(!threwInvalidState, "No uncaught exception on stale answer");
  assert(
    hostPc.setRemoteDescriptionCalls === 1,
    "Protected setRemoteDescription: Duplicate answer in 'stable' state was safely ignored"
  );

  // Test 5D: Signal Deduplication by ID
  // Exact same signal ID arriving again
  await mesh.handleSignal(validAnswerSignal);
  assert(hostPc.setRemoteDescriptionCalls === 1, "Signal deduplication ignored already-processed signal ID");

  // Test 5E: Duplicate Offer Protection
  // An offer arriving for a peer connection that is already established and stable
  const duplicateOfferSignal = {
    id: "sig_offer_dup",
    roomId: testRoomId,
    from: user2,
    to: hostId,
    type: "offer",
    payload: { type: "offer", sdp: "dup-offer" },
  };

  await mesh.handleSignal(duplicateOfferSignal);
  assert(
    hostPc.signalingState === "stable",
    "Duplicate offer ignored on already stable connection without destroying state"
  );

  // Test 5F: ICE Candidate buffering before remote description
  const guestMesh = new WebRTCMesh({
    roomId: testRoomId,
    myId: user2,
    isHost: false,
    sendSignalApi: mockSendSignal,
  });

  // ICE candidate arrives BEFORE offer
  const earlyIceSignal = {
    id: "sig_ice_early",
    roomId: testRoomId,
    from: hostId,
    to: user2,
    type: "ice-candidate",
    payload: { candidate: "candidate:123" },
  };

  await guestMesh.handleSignal(earlyIceSignal);
  const guestQueue = guestMesh.iceQueues.get(hostId);
  assert(guestQueue && guestQueue.length === 1, "Early ICE candidate was buffered in queue");

  // Offer arrives -> sets remote description and flushes queue
  const hostOfferSignal = {
    id: "sig_offer_1",
    roomId: testRoomId,
    from: hostId,
    to: user2,
    type: "offer",
    payload: { type: "offer", sdp: "host-offer-sdp" },
  };

  await guestMesh.handleSignal(hostOfferSignal);
  const guestPc = guestMesh.peers.get(hostId);
  assert(guestPc.addedIceCandidates.length === 1, "Buffered ICE candidate was flushed after remote description was set");

  // 6. Security Rule: Reject chat messages over signaling
  const chatAttempt = sendSignal(testRoomId, hostId, user2, "chat", { text: "private message" });
  assert(chatAttempt.ok === false, "Security Rule: Chat messages rejected by signaling layer");

  // 7. Participant Leave & Reconnect Safety
  leaveRoom(testRoomId, user3);
  const roomAfterLeave = getRoom(testRoomId);
  assert(roomAfterLeave.status === "active", "Participant leave does NOT mark room as closed");

  leaveRoom(testRoomId, hostId);
  const roomAfterHostDisconnect = getRoom(testRoomId);
  assert(roomAfterHostDisconnect.status !== "closed", "Host disconnect/refresh does NOT mark room as closed");

  const hostReconnect = joinRoom(testRoomId, hostId);
  assert(hostReconnect.ok === true, "Host can cleanly reconnect without 'Room Closed' error");

  // 8. Host Explicit Room Closure
  const closeResult = closeRoom(testRoomId, hostId);
  assert(closeResult.ok === true, "Host explicitly closed room");
  const roomAfterClose = getRoom(testRoomId);
  assert(roomAfterClose.status === "closed", "Room status is strictly CLOSED");

  // 9. Error Differentiation
  const lateJoin = joinRoom(testRoomId, generateUserId());
  assert(lateJoin.code === "ROOM_CLOSED", "Late join returns ROOM_CLOSED error");

  const fakeJoin = joinRoom("ZZZZ-9999", generateUserId());
  assert(fakeJoin.code === "ROOM_NOT_FOUND", "Nonexistent room returns ROOM_NOT_FOUND");

  console.log(`\n=== Verification Complete: ${passed}/${total} Passed ===`);
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
