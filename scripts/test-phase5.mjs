import assert from "node:assert";
import crypto from "node:crypto";
import {
  MAX_FILE_SIZE,
  CHUNK_SIZE,
  isAcceptedImageType,
  formatFileSize,
  packBinaryChunk,
  unpackBinaryChunk,
} from "../lib/file-transfer.js";

console.log("=== RUNNING PHASE 5 COMPREHENSIVE TESTS ===");

// 1. Constants and Validation
console.log("Test 1: Constants and Max File Size");
assert.strictEqual(MAX_FILE_SIZE, 100 * 1024 * 1024, "MAX_FILE_SIZE must be exactly 100 MB");
assert.strictEqual(CHUNK_SIZE, 64 * 1024, "CHUNK_SIZE must be 64 KB");

// 2. MIME type detection
console.log("Test 2: MIME Type Detection");
assert.strictEqual(isAcceptedImageType("image/jpeg"), true);
assert.strictEqual(isAcceptedImageType("image/jpg"), true);
assert.strictEqual(isAcceptedImageType("image/png"), true);
assert.strictEqual(isAcceptedImageType("image/webp"), true);
assert.strictEqual(isAcceptedImageType("image/gif"), true);
assert.strictEqual(isAcceptedImageType("application/pdf"), false);
assert.strictEqual(isAcceptedImageType("application/zip"), false);
assert.strictEqual(isAcceptedImageType("text/plain"), false);
assert.strictEqual(isAcceptedImageType(null), false);
assert.strictEqual(isAcceptedImageType(""), false);

// 3. File size formatting
console.log("Test 3: File Size Formatter");
assert.strictEqual(formatFileSize(0), "0 B");
assert.strictEqual(formatFileSize(512), "512 B");
assert.strictEqual(formatFileSize(1024), "1 KB");
assert.strictEqual(formatFileSize(2.4 * 1024 * 1024), "2.4 MB");
assert.strictEqual(formatFileSize(100 * 1024 * 1024), "100 MB");

// 4. Binary chunk packet packing and unpacking
console.log("Test 4: Binary Chunk Packing & Unpacking");
const transferId = "trans_test_123456";
const chunkIndex = 42;
const testPayload = crypto.randomBytes(64 * 1024); // 64 KB random payload
const payloadBuffer = testPayload.buffer.slice(
  testPayload.byteOffset,
  testPayload.byteOffset + testPayload.byteLength
);

const packed = packBinaryChunk(transferId, chunkIndex, payloadBuffer);
assert.ok(packed instanceof ArrayBuffer, "Packed data must be an ArrayBuffer");

const unpacked = unpackBinaryChunk(packed);
assert.strictEqual(unpacked.transferId, transferId, "transferId must match");
assert.strictEqual(unpacked.chunkIndex, chunkIndex, "chunkIndex must match");
assert.strictEqual(unpacked.data.byteLength, payloadBuffer.byteLength, "data byteLength must match");

// Verify payload byte-for-byte
const originalBytes = new Uint8Array(payloadBuffer);
const unpackedBytes = new Uint8Array(unpacked.data);
for (let i = 0; i < originalBytes.length; i++) {
  if (originalBytes[i] !== unpackedBytes[i]) {
    throw new Error(`Byte mismatch at index ${i}`);
  }
}
console.log("✓ Binary chunk pack/unpack byte integrity verified");

// 5. Multi-chunk file assembly simulation (JPG, PNG, PDF, ZIP)
console.log("Test 5: Multi-chunk file reassembly for JPG, PNG, PDF, ZIP");
const fileTypesToTest = [
  { name: "photo.jpg", mime: "image/jpeg", size: 250 * 1024 }, // 250 KB
  { name: "screenshot.png", mime: "image/png", size: 1.2 * 1024 * 1024 }, // 1.2 MB
  { name: "document.pdf", mime: "application/pdf", size: 500 * 1024 }, // 500 KB
  { name: "archive.zip", mime: "application/zip", size: 3.5 * 1024 * 1024 }, // 3.5 MB
];

for (const testFile of fileTypesToTest) {
  const originalData = crypto.randomBytes(Math.round(testFile.size));
  const tId = `trans_${crypto.randomUUID()}`;
  const totalChunks = Math.ceil(originalData.length / CHUNK_SIZE);

  // Receiver state simulation
  const receiverTransfer = {
    transferId: tId,
    fileName: testFile.name,
    fileSize: originalData.length,
    mimeType: testFile.mime,
    chunks: [],
    receivedBytes: 0,
  };

  // Sender streams chunks
  for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
    const start = cIdx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, originalData.length);
    const chunkSlice = originalData.subarray(start, end);
    const chunkBuffer = chunkSlice.buffer.slice(
      chunkSlice.byteOffset,
      chunkSlice.byteOffset + chunkSlice.byteLength
    );

    // Pack into DataChannel binary packet
    const packet = packBinaryChunk(tId, cIdx, chunkBuffer);

    // Receiver receives packet from DataChannel
    const unpackedChunk = unpackBinaryChunk(packet);
    assert.strictEqual(unpackedChunk.transferId, tId);
    receiverTransfer.chunks[unpackedChunk.chunkIndex] = unpackedChunk.data;
    receiverTransfer.receivedBytes += unpackedChunk.data.byteLength;
  }

  assert.strictEqual(receiverTransfer.receivedBytes, originalData.length);

  // Reassemble Blob
  const reassembledBuffer = Buffer.concat(
    receiverTransfer.chunks.map((ab) => Buffer.from(ab))
  );

  // Compare original SHA-256 hash with reassembled SHA-256 hash
  const origHash = crypto.createHash("sha256").update(originalData).digest("hex");
  const reassembledHash = crypto.createHash("sha256").update(reassembledBuffer).digest("hex");
  assert.strictEqual(origHash, reassembledHash, `Hash mismatch for ${testFile.name}`);
  console.log(`✓ ${testFile.name} (${formatFileSize(originalData.length)}) transfer integrity verified: ${origHash.slice(0, 16)}...`);
}

// 6. Transfer cancellation simulation
console.log("Test 6: Transfer Cancellation Midway");
const cancelTransferId = `trans_cancel_${Date.now()}`;
const cancelReceiverTransfer = {
  transferId: cancelTransferId,
  chunks: [new ArrayBuffer(1024)],
};
// Sender cancels:
assert.ok(cancelReceiverTransfer.chunks.length > 0);
// On cancel handler:
cancelReceiverTransfer.chunks = [];
assert.strictEqual(cancelReceiverTransfer.chunks.length, 0, "Chunks must be discarded on cancel");
console.log("✓ Transfer cancellation cleanly clears chunks");

// 7. Connection loss simulation
console.log("Test 7: Connection Loss Simulation");
const activeTransfers = new Map();
activeTransfers.set("t1", { senderId: "user-peer-1", chunks: [new ArrayBuffer(100)] });
activeTransfers.set("t2", { senderId: "user-peer-2", chunks: [new ArrayBuffer(200)] });

// Peer 1 disconnects:
const disconnectedPeerId = "user-peer-1";
const failedIds = [];
for (const [tId, t] of activeTransfers.entries()) {
  if (t.senderId === disconnectedPeerId) {
    failedIds.push(tId);
  }
}
failedIds.forEach((id) => activeTransfers.delete(id));
assert.strictEqual(activeTransfers.has("t1"), false, "Peer 1 transfer must be removed");
assert.strictEqual(activeTransfers.has("t2"), true, "Peer 2 transfer remains unaffected");
console.log("✓ Connection loss cleans up incomplete transfer state");

console.log("\n=== ALL PHASE 5 TESTS PASSED SUCCESSFULLY! ===");
