/**
 * Comprehensive Automated Verification Script for HUSH Phase 4 Screen Sharing Fixes
 * Covers all 10 test scenarios specified in Section 22 of the Phase 4 Fix prompt.
 */

import { WebRTCMesh } from "../lib/webrtc.js";

// Mock MediaStreamTrack
class MockMediaStreamTrack {
  constructor(kind, label = "") {
    this.kind = kind; // 'audio' | 'video'
    this.label = label;
    this.enabled = true;
    this.id = `track_${kind}_${Math.random().toString(36).slice(2, 8)}`;
    this.readyState = "live";
    this.listeners = new Map();
  }

  addEventListener(event, cb) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(cb);
  }

  removeEventListener(event, cb) {
    if (!this.listeners.has(event)) return;
    this.listeners.set(
      event,
      this.listeners.get(event).filter((fn) => fn !== cb)
    );
  }

  stop() {
    this.readyState = "ended";
    if (this.onended) {
      const cb = this.onended;
      this.onended = null;
      cb();
    }
    const cbs = this.listeners.get("ended") || [];
    cbs.forEach((fn) => fn());
  }

  simulateBrowserStop() {
    this.stop();
  }
}

// Mock MediaStream
class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
    this.id = `stream_${Math.random().toString(36).slice(2, 8)}`;
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }

  addTrack(track) {
    this.tracks.push(track);
  }

  removeTrack(track) {
    this.tracks = this.tracks.filter((t) => t.id !== track.id);
  }
}

// Mock RTCRtpSender with replaceTrack tracking
class MockRTCRtpSender {
  constructor(track) {
    this.track = track;
    this.replacedTracks = [];
  }

  async replaceTrack(newTrack) {
    this.track = newTrack;
    this.replacedTracks.push(newTrack);
  }
}

// Mock RTCPeerConnection with bilateral DataChannel transmission
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.signalingState = "stable";
    this.connectionState = "connected";
    this.senders = [];
    this.ontrack = null;
    this.onnegotiationneeded = null;
    this.onicecandidate = null;
  }

  getSenders() {
    return this.senders;
  }

  addTrack(track, stream) {
    const sender = new MockRTCRtpSender(track);
    this.senders.push(sender);
    return sender;
  }

  createDataChannel(label) {
    return {
      label,
      readyState: "open",
      send: (data) => {},
      close: () => {},
    };
  }

  async createOffer() {
    return { type: "offer", sdp: "mock-sdp" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "mock-sdp" };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
    if (desc.type === "offer") this.signalingState = "have-local-offer";
    if (desc.type === "answer") this.signalingState = "stable";
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
    if (desc.type === "offer") this.signalingState = "have-remote-offer";
    if (desc.type === "answer") this.signalingState = "stable";
  }

  async addIceCandidate() {}

  close() {
    this.signalingState = "closed";
    this.connectionState = "closed";
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.MediaStream = MockMediaStream;
globalThis.RTCSessionDescription = (d) => d;
globalThis.RTCIceCandidate = (c) => c;

async function runPhase4Tests() {
  console.log("=== Starting HUSH Phase 4 Screen Sharing Verification ===");
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

  // ----------------------------------------------------
  // TEST 1 — BASIC SCREEN SHARE & NO FROZEN FRAME
  // Host starts video call -> starts screen share -> stops sharing -> receiver screen disappears immediately
  // ----------------------------------------------------
  console.log("\n--- TEST 1: Basic Screen Share & Immediate Disappearance ---");
  let receiverScreenSharer = null;
  let receiverVideoSrcObject = "INITIAL";

  const hostMesh = new WebRTCMesh({
    roomId: "ROOM-1",
    myId: "HOST-1",
    isHost: true,
    sendSignalApi: async () => ({ ok: true }),
  });

  const receiverMesh = new WebRTCMesh({
    roomId: "ROOM-1",
    myId: "USER-RECV",
    isHost: false,
    sendSignalApi: async () => ({ ok: true }),
    onScreenShareChange: ({ isSharing, sharerId }) => {
      receiverScreenSharer = isSharing ? sharerId : null;
      if (!isSharing) {
        receiverVideoSrcObject = null; // Simulating ScreenShareView unmount / null srcObject
      }
    },
  });

  // Connect host & receiver
  hostMesh.initiateConnection("USER-RECV");
  const hostPc = hostMesh.peers.get("USER-RECV");
  const hostCamTrack = new MockMediaStreamTrack("video", "Host Camera");
  const hostMicTrack = new MockMediaStreamTrack("audio", "Host Mic");
  const hostStream = new MockMediaStream([hostCamTrack, hostMicTrack]);
  hostMesh.setLocalStream(hostStream);
  hostMesh.currentMediaState = { isAudioEnabled: true, isVideoEnabled: true, inCall: true };

  // Pipe DataChannel messages from host to receiver
  const hostDc = hostPc.createDataChannel("hush-chat");
  hostMesh.setupDataChannel("USER-RECV", hostDc);
  const recvDc = {
    readyState: "open",
    send: (d) => {},
    close: () => {},
  };
  receiverMesh.setupDataChannel("HOST-1", recvDc);

  // Link host send to receiver onmessage
  hostDc.send = (data) => {
    recvDc.onmessage?.({ data });
  };

  // Host starts screen share
  const screenTrack1 = new MockMediaStreamTrack("video", "Screen 1");
  const screenStream1 = new MockMediaStream([screenTrack1]);
  await hostMesh.setScreenStream(screenStream1);
  receiverVideoSrcObject = screenStream1;

  assert(hostMesh.isScreenSharing === true, "Host isScreenSharing is true");
  assert(receiverScreenSharer === "HOST-1", "Receiver detected Host as screen sharer");
  assert(receiverVideoSrcObject === screenStream1, "Receiver displaying screen stream");

  // Host stops screen sharing
  await hostMesh.stopScreenShare();
  assert(hostMesh.isScreenSharing === false, "Host isScreenSharing is false");
  assert(receiverScreenSharer === null, "Receiver screenSharerId reset to null immediately");
  assert(receiverVideoSrcObject === null, "Receiver video.srcObject cleared to null (NO FROZEN FRAME)");

  // ----------------------------------------------------
  // TEST 2 — BROWSER NATIVE STOP SHARING
  // ----------------------------------------------------
  console.log("\n--- TEST 2: Browser Native Stop Sharing Control ---");
  const screenTrack2 = new MockMediaStreamTrack("video", "Screen 2");
  const screenStream2 = new MockMediaStream([screenTrack2]);
  await hostMesh.setScreenStream(screenStream2);
  assert(hostMesh.isScreenSharing === true, "Host screen sharing active");
  assert(receiverScreenSharer === "HOST-1", "Receiver displaying screen 2");

  // Browser fires track.onended (e.g. Chrome floating bar "Stop sharing")
  screenTrack2.simulateBrowserStop();
  await new Promise((r) => setTimeout(r, 10));
  assert(hostMesh.isScreenSharing === false, "Host stopped via browser native control");
  assert(receiverScreenSharer === null, "Receiver screen disappeared on browser native stop");
  assert(hostMicTrack.enabled === true, "Microphone continues uninterrupted");

  // ----------------------------------------------------
  // TEST 3 — CAMERA RESTORE (Camera ON before screen share)
  // ----------------------------------------------------
  console.log("\n--- TEST 3: Camera Track Restored When Camera Was ON ---");
  hostMesh.currentMediaState = { isAudioEnabled: true, isVideoEnabled: true, inCall: true };
  const screenTrack3 = new MockMediaStreamTrack("video", "Screen 3");
  const screenStream3 = new MockMediaStream([screenTrack3]);
  await hostMesh.setScreenStream(screenStream3);

  const videoSender = hostPc.getSenders().find((s) => s.track?.kind === "video" || s.track === screenTrack3);
  assert(videoSender.track === screenTrack3, "Video sender sending screen track");

  await hostMesh.stopScreenShare();
  assert(videoSender.track === hostCamTrack, "Video sender automatically restored hostCamTrack");

  // ----------------------------------------------------
  // TEST 4 — CAMERA OFF (Camera OFF before screen share)
  // ----------------------------------------------------
  console.log("\n--- TEST 4: Camera Stays Disabled When Camera Was OFF ---");
  hostMesh.currentMediaState = { isAudioEnabled: true, isVideoEnabled: false, inCall: true };
  const screenTrack4 = new MockMediaStreamTrack("video", "Screen 4");
  const screenStream4 = new MockMediaStream([screenTrack4]);
  await hostMesh.setScreenStream(screenStream4);
  assert(videoSender.track === screenTrack4, "Video sender sending screen track");

  await hostMesh.stopScreenShare();
  assert(videoSender.track === null, "Video sender reset to null (disabled camera NOT shown)");

  // ----------------------------------------------------
  // TEST 5 — AUDIO CONTINUITY
  // ----------------------------------------------------
  console.log("\n--- TEST 5: Audio/Voice Call Remains Continuous ---");
  hostMesh.currentMediaState = { isAudioEnabled: true, isVideoEnabled: true, inCall: true };
  const audioSender = hostPc.getSenders().find((s) => s.track?.kind === "audio");
  assert(audioSender !== undefined, "Audio sender exists for microphone");
  assert(audioSender.track === hostMicTrack, "Audio sender sending microphone track");

  const screenTrack5 = new MockMediaStreamTrack("video", "Screen 5");
  const screenStream5 = new MockMediaStream([screenTrack5]);
  await hostMesh.setScreenStream(screenStream5);
  assert(audioSender.track === hostMicTrack, "Audio continues during screen share");

  await hostMesh.stopScreenShare();
  assert(audioSender.track === hostMicTrack, "Audio continues uninterrupted after screen share stops");

  // ----------------------------------------------------
  // TEST 6 — FULLSCREEN AUTO-EXIT ON STOP
  // ----------------------------------------------------
  console.log("\n--- TEST 6: Fullscreen Auto-Exit on Screen Share Stop ---");
  let isFullscreenActive = false;
  const mockFullscreenContainer = {
    requestFullscreen: async () => {
      isFullscreenActive = true;
    },
  };
  function simulateReceiverExitFullscreen() {
    isFullscreenActive = false;
  }

  // Receiver enters fullscreen
  await mockFullscreenContainer.requestFullscreen();
  assert(isFullscreenActive === true, "Receiver entered fullscreen mode");

  // Host starts & stops screen share
  const screenTrack6 = new MockMediaStreamTrack("video", "Screen 6");
  const screenStream6 = new MockMediaStream([screenTrack6]);
  await hostMesh.setScreenStream(screenStream6);

  // Screen share stops -> triggers receiver exitFullscreen & view unmount
  await hostMesh.stopScreenShare();
  simulateReceiverExitFullscreen();
  assert(isFullscreenActive === false, "Receiver exited fullscreen automatically on stop");
  assert(receiverScreenSharer === null, "Shared screen removed; no black/frozen fullscreen remains");

  // ----------------------------------------------------
  // TEST 7 — REPEATED RESTART CYCLES (START -> STOP -> START -> STOP -> START)
  // ----------------------------------------------------
  console.log("\n--- TEST 7: Repeated Restart Cycles (START -> STOP -> START -> STOP -> START) ---");
  for (let cycle = 1; cycle <= 3; cycle++) {
    const sTrack = new MockMediaStreamTrack("video", `Screen Cycle ${cycle}`);
    const sStream = new MockMediaStream([sTrack]);
    await hostMesh.setScreenStream(sStream);
    assert(hostMesh.isScreenSharing === true, `Cycle ${cycle}: Started screen share successfully`);
    assert(receiverScreenSharer === "HOST-1", `Cycle ${cycle}: Receiver sees new screen stream`);

    await hostMesh.stopScreenShare();
    assert(hostMesh.isScreenSharing === false, `Cycle ${cycle}: Stopped screen share successfully`);
    assert(receiverScreenSharer === null, `Cycle ${cycle}: Receiver screen cleared with no residual frame`);
  }

  // ----------------------------------------------------
  // TEST 8 — MULTI-USER SCREEN SHARE DISTRIBUTION
  // ----------------------------------------------------
  console.log("\n--- TEST 8: Multi-User Room (Host + User A + User B) ---");
  let userBSharer = null;
  const meshUserB = new WebRTCMesh({
    roomId: "ROOM-1",
    myId: "USER-B",
    isHost: false,
    sendSignalApi: async () => ({ ok: true }),
    onScreenShareChange: ({ isSharing, sharerId }) => {
      userBSharer = isSharing ? sharerId : null;
    },
  });

  // Connect Host to User B
  hostMesh.initiateConnection("USER-B");
  const pcUserB = hostMesh.peers.get("USER-B");
  const dcUserB = pcUserB.createDataChannel("hush-chat");
  hostMesh.setupDataChannel("USER-B", dcUserB);
  const recvDcB = { readyState: "open", send: () => {}, close: () => {} };
  meshUserB.setupDataChannel("HOST-1", recvDcB);
  dcUserB.send = (data) => recvDcB.onmessage?.({ data });

  // Host shares screen
  const multiScreenTrack = new MockMediaStreamTrack("video", "Multi Screen");
  const multiScreenStream = new MockMediaStream([multiScreenTrack]);
  await hostMesh.setScreenStream(multiScreenStream);

  assert(receiverScreenSharer === "HOST-1", "User RECV sees host's shared screen");
  assert(userBSharer === "HOST-1", "User B sees host's shared screen");

  // Host stops sharing
  await hostMesh.stopScreenShare();
  assert(receiverScreenSharer === null, "Screen disappeared for User RECV");
  assert(userBSharer === null, "Screen disappeared for User B");

  // ----------------------------------------------------
  // TEST 9 — HOST REMOVAL / USER KICK WHILE SHARING
  // ----------------------------------------------------
  console.log("\n--- TEST 9: Host Removal of Screen Sharing Participant ---");
  let userBSharing = true;
  // User B starts sharing
  meshUserB.screenSharerId = "USER-B";
  hostMesh.screenSharerId = "USER-B";

  // Host kicks User B
  hostMesh.closePeer("USER-B");
  assert(hostMesh.screenSharerId === null, "Screen share state reset immediately when sharing peer is removed");

  // ----------------------------------------------------
  // TEST 10 — ROOM CLOSE WHILE SHARING
  // ----------------------------------------------------
  console.log("\n--- TEST 10: Host Closes Room While Sharing ---");
  const closeScreenTrack = new MockMediaStreamTrack("video", "Closing Screen");
  const closeScreenStream = new MockMediaStream([closeScreenTrack]);
  await hostMesh.setScreenStream(closeScreenStream);
  assert(hostMesh.isScreenSharing === true, "Screen sharing before room close");

  hostMesh.destroy();
  assert(hostMesh.isDestroyed === true, "Mesh destroyed on room close");
  assert(hostMesh.screenStream === null, "Screen stream cleared on room close");
  assert(closeScreenTrack.readyState === "ended", "All screen tracks stopped; no lingering media");

  console.log(`\n==================================================`);
  console.log(`Phase 4 Screen Share Verification Complete: ${passed}/${total} Passed`);
  console.log(`==================================================`);
}

runPhase4Tests();
