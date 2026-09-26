/**
 * Safe local storage manager strictly for:
 * 1. Theme preferences
 * 2. Room metadata history (NO chat messages or content whatsoever)
 */

const ROOM_HISTORY_KEY = "hush_room_history";
const THEME_KEY = "hush_theme";

/**
 * Get room metadata history (strictly metadata: code, timestamps, status, role)
 * NEVER contains messages.
 */
export function getRoomHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ROOM_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Ensure no unexpected fields exist
      return parsed.map((item) => ({
        roomCode: item.roomCode || "",
        role: item.role === "HOST" ? "HOST" : "PARTICIPANT",
        createdAt: item.createdAt || new Date().toISOString(),
        closedAt: item.closedAt || null,
        status: item.status || "Left",
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Adds or updates a room metadata entry in localStorage
 */
export function saveRoomMetadata({ roomCode, role = "PARTICIPANT", status = "Active" }) {
  if (typeof window === "undefined" || !roomCode) return;
  try {
    const history = getRoomHistory();
    const existingIndex = history.findIndex((item) => item.roomCode === roomCode);
    const now = new Date().toISOString();

    const entry = {
      roomCode,
      role: role.toUpperCase() === "HOST" ? "HOST" : "PARTICIPANT",
      createdAt: existingIndex >= 0 ? history[existingIndex].createdAt : now,
      closedAt: status === "Closed" || status === "Left" ? now : null,
      status,
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...history];
      updated[existingIndex] = { ...updated[existingIndex], ...entry };
    } else {
      updated = [entry, ...history].slice(0, 50); // limit to last 50 room records
    }

    localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save room metadata:", err);
  }
}

/**
 * Updates status of a room (e.g. "Closed" or "Left")
 */
export function updateRoomMetadataStatus(roomCode, status) {
  if (typeof window === "undefined" || !roomCode) return;
  try {
    const history = getRoomHistory();
    const updated = history.map((item) => {
      if (item.roomCode === roomCode) {
        return {
          ...item,
          status,
          closedAt: new Date().toISOString(),
        };
      }
      return item;
    });
    localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to update room metadata:", err);
  }
}

/**
 * Clears room metadata history
 */
export function clearRoomHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ROOM_HISTORY_KEY);
  } catch (err) {
    console.error("Failed to clear room history:", err);
  }
}

/**
 * Get saved theme preference ('dark' | 'light' | null)
 */
export function getStoredTheme() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/**
 * Set saved theme preference
 */
export function setStoredTheme(theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.error("Failed to store theme preference:", err);
  }
}
