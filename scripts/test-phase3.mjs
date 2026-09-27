/**
 * Automated Verification Script for HUSH Phase 3 Video & Voice Call Features
 */

import { WebRTCMesh } from "../lib/webrtc.js";

// Mock MediaStreamTrack
class MockMediaStreamTrack {
  constructor(kind) {
    this.kind = kind; // 'audio' | 'video'
    this.enabled = true;
    this.id = `track_${kind}_${Math.random().toString(36).slice(2, 8)}`;
    this.readyState = "live";
  }

  stop() {
    this.readyState = "ended";
    if (this.onended) this.onended();
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

// Mock RTCRtpSender
class MockRTCRtpSender {
  constructor(track) {
    this.track = track;
  }

  async replaceTrack(newTrack) {
    this.track = newTrack;
  }
}

// Mock RTCPeerConnection for MediaStream testing
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

async function runPhase3Tests() {
  console.log("=== Starting HUSH Phase 3 Video & Voice Call Verification ===");
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

  // TEST 1: Create WebRTCMesh instance with media callbacks
  let remoteStreamReceived = null;
  let peerMediaStateReceived = null;

  const meshA = new WebRTCMesh({
    roomId: "CALL-TEST",
    myId: "USER-HOST",
    isHost: true,
    sendSignalApi: async () => ({ ok: true }),
    onRemoteStream: (peerId, stream) => {
      remoteStreamReceived = { peerId, stream };
    },
    onPeerMediaState: (peerId, state) => {
      peerMediaStateReceived = { peerId, state };
    },
  });

  assert(meshA.isHost === true, "Host initialized in WebRTCMesh");
  assert(meshA.isPolite("USER-PART") === false, "Host is impolite peer in Perfect Negotiation");

  const meshB = new WebRTCMesh({
    roomId: "CALL-TEST",
    myId: "USER-PART",
    hostId: "USER-HOST",
    isHost: false,
    sendSignalApi: async () => ({ ok: true }),
  });

  assert(meshB.isPolite("USER-HOST") === true, "Participant is polite peer to host");

  // TEST 2: Local MediaStream initialization (Camera ON + Mic ON)
  const audioTrack = new MockMediaStreamTrack("audio");
  const videoTrack = new MockMediaStreamTrack("video");
  const localStream = new MockMediaStream([audioTrack, videoTrack]);

  meshA.setLocalStream(localStream);
  assert(meshA.localStream === localStream, "Local media stream set on WebRTCMesh");
  assert(meshA.localStream.getAudioTracks().length === 1, "Audio track attached to local stream");
  assert(meshA.localStream.getVideoTracks().length === 1, "Video track attached to local stream");

  // TEST 3: Add peer and verify tracks are attached
  meshA.initiateConnection("USER-PART");
  const pcA = meshA.peers.get("USER-PART");
  assert(pcA !== undefined, "Peer connection created for remote participant");
  assert(pcA.getSenders().length === 2, "Both audio and video tracks added to RTCPeerConnection");

  // TEST 4: Camera Off (Microphone remains active)
  meshA.toggleTrack("video", false);
  assert(videoTrack.enabled === false, "Camera off sets videoTrack.enabled = false");
  assert(audioTrack.enabled === true, "Microphone remains active when camera is off");

  // TEST 5: Camera Back On
  meshA.toggleTrack("video", true);
  assert(videoTrack.enabled === true, "Camera on sets videoTrack.enabled = true");

  // TEST 6: Microphone Mute (Video remains active)
  meshA.toggleTrack("audio", false);
  assert(audioTrack.enabled === false, "Mic mute sets audioTrack.enabled = false");
  assert(videoTrack.enabled === true, "Video remains active when mic is muted");

  // TEST 7: Microphone Unmute
  meshA.toggleTrack("audio", true);
  assert(audioTrack.enabled === true, "Mic unmute sets audioTrack.enabled = true");

  // TEST 8: Media state broadcast
  meshA.broadcastMediaState({ isAudioEnabled: true, isVideoEnabled: false, inCall: true });
  assert(meshA.currentMediaState.inCall === true, "Media state tracks inCall status");
  assert(meshA.currentMediaState.isVideoEnabled === false, "Media state tracks video status");
  assert(meshA.currentMediaState.isAudioEnabled === true, "Media state tracks audio status");

  // TEST 9: Remote track reception via ontrack
  const remoteVideoTrack = new MockMediaStreamTrack("video");
  pcA.ontrack({ track: remoteVideoTrack, streams: [] });
  assert(remoteStreamReceived !== null, "onRemoteStream callback fired on remote track reception");
  assert(
    remoteStreamReceived.stream.getVideoTracks().length === 1,
    "Remote stream contains received video track"
  );

  // TEST 10: Media cleanup on call end / stopLocalStream
  meshA.stopLocalStream();
  assert(meshA.localStream === null, "Local stream cleared on stopLocalStream");
  assert(audioTrack.readyState === "ended", "Local audio track stopped and released");
  assert(videoTrack.readyState === "ended", "Local video track stopped and released");
  assert(meshA.currentMediaState.inCall === false, "Media state resets inCall to false");

  // TEST 11: WebRTCMesh destroy cleans up all resources
  meshA.destroy();
  assert(meshA.isDestroyed === true, "WebRTCMesh destroyed");
  assert(meshA.peers.size === 0, "All peer connections closed and removed");
  assert(meshA.remoteStreams.size === 0, "All remote streams cleared");

  console.log(`\n=== Phase 3 Verification Complete: ${passed}/${total} Passed ===`);
}

runPhase3Tests();
