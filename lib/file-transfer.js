/**
 * HUSH Phase 5: Ephemeral File & Image Transfer Protocols
 * Direct peer-to-peer WebRTC DataChannel chunking, transfer, and download helpers.
 * Never stores files in database, cloud, localStorage, or server.
 */

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB configurable limit
export const CHUNK_SIZE = 64 * 1024; // 64 KB per binary chunk
export const BUFFERED_AMOUNT_HIGH_THRESHOLD = 512 * 1024; // 512 KB pause threshold
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 64 * 1024; // 64 KB resume threshold

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Check if MIME type is an accepted image for inline preview
 */
export function isAcceptedImageType(mimeType) {
  if (!mimeType) return false;
  return ACCEPTED_IMAGE_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Human-readable file size formatter (e.g. 2.4 MB)
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Pack transfer metadata and binary chunk into a single ArrayBuffer packet:
 * [4 bytes idLen][idLen bytes transferId][4 bytes chunkIndex][N bytes chunk payload]
 */
export function packBinaryChunk(transferId, chunkIndex, chunkBuffer) {
  const idBytes = new TextEncoder().encode(transferId);
  const header = new ArrayBuffer(4 + idBytes.byteLength + 4);
  const view = new DataView(header);
  view.setUint32(0, idBytes.byteLength);
  new Uint8Array(header, 4, idBytes.byteLength).set(idBytes);
  view.setUint32(4 + idBytes.byteLength, chunkIndex);

  const packet = new Uint8Array(header.byteLength + chunkBuffer.byteLength);
  packet.set(new Uint8Array(header), 0);
  packet.set(new Uint8Array(chunkBuffer), header.byteLength);
  return packet.buffer;
}

/**
 * Unpack binary packet into transferId, chunkIndex, and chunk ArrayBuffer data
 */
export function unpackBinaryChunk(buffer) {
  const view = new DataView(buffer);
  const idLen = view.getUint32(0);
  const idBytes = new Uint8Array(buffer, 4, idLen);
  const transferId = new TextDecoder().decode(idBytes);
  const chunkIndex = view.getUint32(4 + idLen);
  const data = buffer.slice(4 + idLen + 4);
  return { transferId, chunkIndex, data };
}

/**
 * Trigger manual file download in browser and revoke temporary Blob URL
 */
export function triggerFileDownload(blob, fileName) {
  if (typeof window === "undefined" || !blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 1000);
}
