/**
 * Utilities for Room IDs, User IDs, and validation.
 */

// Custom alphabet avoiding ambiguous characters (0, O, 1, I, L)
const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates an unpredictable room code in the format XXXX-XXXX (e.g. H7K9-X2P4)
 */
export function generateRoomId() {
  const getRandomChar = () => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint8Array(1);
      crypto.getRandomValues(arr);
      return ROOM_CODE_ALPHABET[arr[0] % ROOM_CODE_ALPHABET.length];
    }
    return ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  };

  const part1 = Array.from({ length: 4 }, getRandomChar).join("");
  const part2 = Array.from({ length: 4 }, getRandomChar).join("");
  return `${part1}-${part2}`;
}

/**
 * Validates room code format (XXXX-XXXX)
 */
export function isValidRoomId(code) {
  if (!code || typeof code !== "string") return false;
  const clean = code.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(clean);
}

/**
 * Cleans and standardizes room code input (e.g. automatically adds hyphen)
 */
export function formatRoomInput(input) {
  if (!input) return "";
  const cleaned = input.toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, "");
  if (cleaned.length <= 4) {
    return cleaned;
  }
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

/**
 * Generates a temporary User ID (e.g. USER-7F42)
 * Purely for identifying participants in the current room.
 */
export function generateUserId() {
  const hexChars = "0123456789ABCDEF";
  const getRandomHex = () => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint8Array(1);
      crypto.getRandomValues(arr);
      return hexChars[arr[0] % hexChars.length];
    }
    return hexChars[Math.floor(Math.random() * hexChars.length)];
  };

  const suffix = Array.from({ length: 4 }, getRandomHex).join("");
  return `USER-${suffix}`;
}
