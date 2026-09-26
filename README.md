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
