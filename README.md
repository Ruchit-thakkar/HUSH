# HUSH

> **Say it. Don't save it.**

Private conversations. Nothing to keep.

HUSH is a modern, privacy-first ephemeral chat web application built with **Next.js (App Router)**, **Tailwind CSS**, and **WebRTC DataChannels** for peer-to-peer real-time communication.

---

## Core Privacy Architecture

- **Zero Database**: No MongoDB, Firebase, Supabase, PostgreSQL, or Redis.
- **No Chat Persistence**: Chat messages exist exclusively in active application memory during the active session.
- **Encrypted Peer-to-Peer Transport**: WebRTC DataChannels transmit messages directly between participants with built-in DTLS/SCTP encryption.
- **Ephemeral Session Identity**: Random temporary participant IDs (e.g. `USER-7F42`). No accounts, phone numbers, or emails.
- **Unpredictable Room Codes**: Random 8-character codes (e.g. `H7K9-X2P4`) excluding ambiguous characters (`0`, `O`, `1`, `I`, `L`).
- **Room History strictly means Metadata**: Only room codes and timestamps are saved locally in the browser's `localStorage` for convenience. Chat messages are **never** stored.
- **Instant Dissolution**: Leaving the room or host closing the room wipes all active session messages permanently.

---

## Phase 1 Features

1. **Minimal Premium Landing Page**
   - Direct privacy guarantees: *"Private conversations. Nothing to keep."*
   - Immediate actions: `[ Create Room ]` and `[ Join Room ]`.

2. **Create Room**
   - Instant random code generation (`XXXX-XXXX`).
   - One-click copy and shareable link.
   - Creator is assigned the `HOST` role.

3. **Join Room**
   - Auto-formatting room code input.
   - Real-time room status validation (`Room not found`, `This room has been closed`, `Room is full`).

4. **Multi-User Real-time Chat**
   - WebRTC DataChannel mesh for connected participants.
   - Clearly separated message bubbles (My messages vs other participants).
   - Prominent connected participant counter.
   - Auto-scrolling message stream.
   - Keyboard `Enter` to send.

5. **Host Controls**
   - View participant list (`USER-XXXX` badges).
   - Remove/kick disruptive participants.
   - Close room for all participants with confirmation modal.
   - Displays *"Room Closed. All messages from this session have been discarded."*

6. **Participant Leave Room**
   - Disconnects WebRTC peer connections.
   - Clears message memory state immediately.
   - Returns to Home.

7. **Room History (Metadata Only)**
   - Displays past visited rooms with created date and status.
   - `[ Clear Room History ]` button.

8. **Settings & Themes**
   - Dark Mode (Near-black `#09090b`, dark cards, subtle borders).
   - Light Mode (Clean neutral `#fbfbfb` / white palette).
   - Temporary User ID display and regeneration.
   - Privacy architecture disclosure.

---

## Phase 3 & 4: Voice, Video & Screen Sharing

- **🎙️ Voice Call**: Studio-grade WebRTC audio with dynamic compression, high-pass filtering, and native echo cancellation.
- **📹 Video Call**: Local preview, remote peer video grid, and responsive camera toggle.
- **🖥️ Screen Sharing**: 1080p 30fps screen share with track replacement and browser capture controls.

---

## Phase 5: Temporary Image Sharing & File Transfer

- **📸 In-Memory Image Previews**: Direct inline rendering for JPEG, PNG, WebP, and GIF images.
- **📁 Universal File Transfers**: Seamless peer-to-peer binary transfer for documents (PDF, TXT, DOCX), archives (ZIP), and binaries.
- **⚡ WebRTC DataChannel Chunking**: Files streamed in 64 KB binary `ArrayBuffer` packets with active backpressure (`bufferedamountlow`) management.
- **🛡️ 100 MB Configurable Limit**: Instant client-side validation prevents oversized file transfers.
- **🚫 Zero Server Storage**: No databases, cloud buckets, or server uploads. Files exist strictly in volatile browser memory.
- **🧹 Automatic Session Garbage Collection**: Chunk buffers and `blob:` URLs revoked immediately upon download, cancellation, disconnect, or room close.

---

## Phase 6: Whiteboard, Reactions & Room Links

- **📝 Collaborative Whiteboard**: Real-time multi-user drawing canvas with freehand pen, eraser, shapes (line, rectangle, circle), text, per-user undo/redo, and room-wide clear. Synchronized purely via lightweight WebRTC DataChannel events.
- **😀 Temporary Reactions**: Floating emoji reactions (`😀`, `😂`, `❤️`, `👍`, `👎`, `🔥`, `🎉`, `😮`) with upward floating animations that auto-expire in 3 seconds. Client-side rate limited to 5 reactions/second.
- **🔗 Shareable Room Links**: Instant room link generation (`/join/XXXX-XXXX`) and invitation page. Clicking **Copy Room Link** copies the direct URL with confirmation toast.
- **🚫 Zero Persistence**: Whiteboard operations and reactions are strictly discarded upon leaving or closing the room. Room History preserves only room metadata.

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm 9+

### Installation & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Or build and run production server
npm run build
npm start
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
