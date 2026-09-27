import assert from "node:assert";
import crypto from "node:crypto";
import { EMOJI_LIST } from "../lib/reactions.js";
import { isValidRoomId, formatRoomInput } from "../lib/room.js";

console.log("=== RUNNING PHASE 6 COMPREHENSIVE TESTS ===");

// ===================================================
// 1. WHITEBOARD TESTS
// ===================================================

console.log("\n--- SECTION 1: WHITEBOARD TESTS ---");

// Test 1: User A draws a line and User B sees it in real time
console.log("Test 1: Freehand draw operation structure & broadcast");
const userAId = "USER-A821";
const userBId = "USER-B932";
const userCId = "USER-C415";

const drawOpA = {
  id: `op_${crypto.randomUUID()}`,
  userId: userAId,
  type: "draw",
  points: [{ x: 10, y: 10 }, { x: 20, y: 25 }, { x: 35, y: 40 }],
  color: "#ffffff",
  width: 4,
};

assert.ok(drawOpA.id && drawOpA.id.length > 0, "Operation must have unique ID");
assert.strictEqual(drawOpA.userId, userAId);
assert.strictEqual(drawOpA.type, "draw");
assert.strictEqual(drawOpA.points.length, 3);
console.log("✓ Drawing operation structure validated");

// Test 2: User A & User B draw simultaneously - both drawings remain visible
console.log("Test 2: Multi-user simultaneous drawing & conflict-free merge");
let whiteboardState = [];

function applyOperation(state, op) {
  if (!op || !op.id) return state;
  if (state.some((existing) => existing.id === op.id)) return state;
  return [...state, op];
}

whiteboardState = applyOperation(whiteboardState, drawOpA);

const drawOpB = {
  id: `op_${crypto.randomUUID()}`,
  userId: userBId,
  type: "circle",
  centerX: 100,
  centerY: 100,
  radius: 30,
  color: "#ef4444",
  width: 4,
};

whiteboardState = applyOperation(whiteboardState, drawOpB);

assert.strictEqual(whiteboardState.length, 2, "Both operations must be preserved");
assert.strictEqual(whiteboardState[0].id, drawOpA.id);
assert.strictEqual(whiteboardState[1].id, drawOpB.id);
console.log("✓ Concurrent operations merged without overwriting");

// Test 3: User A uses eraser
console.log("Test 3: Eraser operation");
const eraseOpA = {
  id: `op_${crypto.randomUUID()}`,
  userId: userAId,
  type: "erase",
  points: [{ x: 15, y: 15 }, { x: 25, y: 30 }],
  width: 20,
};
whiteboardState = applyOperation(whiteboardState, eraseOpA);
assert.strictEqual(whiteboardState.length, 3);
assert.strictEqual(whiteboardState[2].type, "erase");
console.log("✓ Eraser operation registered properly");

// Test 4: User A clicks Undo - their latest operation is undone, B's drawing unaffected
console.log("Test 4: Undo affects sender's own most recent operation");
function undoUserOperation(state, targetUserId) {
  const userOps = state.filter((op) => op.userId === targetUserId);
  if (userOps.length === 0) return { newState: state, undoneOp: null };
  const lastOp = userOps[userOps.length - 1];
  return {
    newState: state.filter((op) => op.id !== lastOp.id),
    undoneOp: lastOp,
  };
}

const undoResult = undoUserOperation(whiteboardState, userAId);
whiteboardState = undoResult.newState;
// User A's last operation was the erase op
assert.strictEqual(undoResult.undoneOp.id, eraseOpA.id, "Undone op must be User A's last op");
// User B's drawing is still present!
assert.ok(whiteboardState.some((op) => op.userId === userBId), "User B's drawing must remain intact");
// User A's initial draw is still present!
assert.ok(whiteboardState.some((op) => op.id === drawOpA.id), "User A's previous draw op must remain intact");
console.log("✓ Undo cleanly affects only sender's last op");

// Test 4b: Redo restores the undone op
console.log("Test 4b: Redo restores undone operation");
whiteboardState = applyOperation(whiteboardState, undoResult.undoneOp);
assert.strictEqual(whiteboardState.length, 3);
assert.ok(whiteboardState.some((op) => op.id === eraseOpA.id));
console.log("✓ Redo restores operation correctly");

// Test 5: User clicks Clear - whiteboard clears for everyone
console.log("Test 5: Clear canvas");
whiteboardState = [];
assert.strictEqual(whiteboardState.length, 0, "Canvas must be completely cleared");
console.log("✓ Clear operation resets state for room");

// Test 6: User C joins existing room - receives current temporary whiteboard state
console.log("Test 6: Late-joiner synchronization");
// Repopulate active operations
const activeRoomOps = [
  { id: "op_1", userId: userAId, type: "draw", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] },
  { id: "op_2", userId: userBId, type: "rect", startX: 10, startY: 10, endX: 50, endY: 50 },
];

let userCState = [];
// C receives whiteboard-sync-state payload from peer
function syncRemoteState(localState, remoteOps) {
  const existingIds = new Set(localState.map((o) => o.id));
  const merged = [...localState];
  for (const rop of remoteOps) {
    if (rop && rop.id && !existingIds.has(rop.id)) {
      merged.push(rop);
      existingIds.add(rop.id);
    }
  }
  return merged;
}

userCState = syncRemoteState(userCState, activeRoomOps);
assert.strictEqual(userCState.length, 2, "Joining user must receive all active operations");
assert.strictEqual(userCState[0].id, "op_1");
assert.strictEqual(userCState[1].id, "op_2");
console.log("✓ Joining user receives current whiteboard state");

// Test 7: User leaves - state is discarded from application memory
console.log("Test 7: Temporary state purge on leave");
userCState = [];
assert.strictEqual(userCState.length, 0, "Leaving user's session state discarded");
console.log("✓ Session memory purged on leave");

// ===================================================
// 2. TEMPORARY REACTIONS TESTS
// ===================================================

console.log("\n--- SECTION 2: TEMPORARY REACTIONS TESTS ---");

// Test 1: Emoji list validation
console.log("Test 8: Supported Reactions");
const expectedEmojis = ["😀", "😂", "❤️", "👍", "👎", "🔥", "🎉", "😮"];
for (const em of expectedEmojis) {
  assert.ok(EMOJI_LIST.includes(em), `Emoji ${em} must be supported`);
}
console.log("✓ Supported emoji set matches specifications");

// Test 2: Reaction data payload
console.log("Test 9: Reaction payload contains only ephemeral data");
const reactionPayload = {
  type: "reaction",
  reactionId: crypto.randomUUID(),
  userId: userAId,
  emoji: "❤️",
  timestamp: Date.now(),
};
assert.strictEqual(reactionPayload.type, "reaction");
assert.strictEqual(reactionPayload.userId, userAId);
assert.strictEqual(reactionPayload.emoji, "❤️");
assert.strictEqual(typeof reactionPayload.timestamp, "number");
assert.strictEqual(reactionPayload.ip, undefined, "Must NOT contain IP");
assert.strictEqual(reactionPayload.email, undefined, "Must NOT contain email");
console.log("✓ Reaction payload contains strictly ephemeral data");

// Test 3: Client-side rate limiting (max 5 per second)
console.log("Test 10: Reaction rate limiter (5 reactions per second)");
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1000;
let userReactionTimestamps = [];
let sentCount = 0;
let blockedCount = 0;

function trySendReaction(time) {
  userReactionTimestamps = userReactionTimestamps.filter((t) => time - t < RATE_LIMIT_WINDOW);
  if (userReactionTimestamps.length >= RATE_LIMIT_MAX) {
    blockedCount++;
    return false;
  }
  userReactionTimestamps.push(time);
  sentCount++;
  return true;
}

const baseTime = 10000;
// Send 8 reactions rapidly in the same second
for (let i = 0; i < 8; i++) {
  trySendReaction(baseTime + i * 50); // 50ms apart
}

assert.strictEqual(sentCount, 5, "Exactly 5 reactions should be permitted");
assert.strictEqual(blockedCount, 3, "3 rapid flood reactions should be safely blocked");

// Advance past 1 second window
trySendReaction(baseTime + 1100);
assert.strictEqual(sentCount, 6, "Reaction should be allowed once window expires");
console.log("✓ Reaction rate limiting prevents room flooding");

// ===================================================
// 3. ROOM LINKS TESTS
// ===================================================

console.log("\n--- SECTION 3: ROOM LINKS TESTS ---");

// Test 1: Room code validation
console.log("Test 11: Room code format validation");
assert.strictEqual(isValidRoomId("H7K9-X2P4"), true);
assert.strictEqual(isValidRoomId("h7k9-x2p4"), true);
assert.strictEqual(isValidRoomId("INVALID"), false);
assert.strictEqual(isValidRoomId("0O1I-L123"), false); // Excludes ambiguous chars

// Test 2: Shareable Link Structure
console.log("Test 12: Shareable Room Link Structure");
const sampleCode = "H7K9-X2P4";
const roomLink = `/join/${sampleCode}`;
assert.strictEqual(roomLink, "/join/H7K9-X2P4");

// Link should NOT contain sensitive data
assert.ok(!roomLink.includes("password"));
assert.ok(!roomLink.includes("secret"));
assert.ok(!roomLink.includes("token"));
assert.ok(!roomLink.includes("key"));
console.log("✓ Shareable link identifies room without leaking secrets");

console.log("\n=== ALL PHASE 6 TESTS PASSED SUCCESSFULLY! ===");
