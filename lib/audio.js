/**
 * Audio Pipeline & Constraints Configuration for HUSH Voice Calls
 * Provides:
 * - Safe feature-detected browser audio constraints (echo cancellation, noise suppression, AGC)
 * - Conservative Web Audio dynamics compression (peak control, level normalization, anti-clipping)
 * - Track lifecycle management & audio diagnostics
 */

export function getOptimalAudioConstraints() {
  const desired = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
  };

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getSupportedConstraints
  ) {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }

  try {
    const supported = navigator.mediaDevices.getSupportedConstraints();
    const constraints = {};

    for (const [key, val] of Object.entries(desired)) {
      if (supported[key]) {
        constraints[key] = val;
      }
    }

    // Ensure critical defaults are always present unless explicitly unsupported
    if (constraints.echoCancellation === undefined) constraints.echoCancellation = true;
    if (constraints.noiseSuppression === undefined) constraints.noiseSuppression = true;
    if (constraints.autoGainControl === undefined) constraints.autoGainControl = true;

    return constraints;
  } catch (err) {
    console.warn("[HUSH:AUDIO] Failed querying supported audio constraints:", err);
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }
}

/**
 * Conservative Web Audio dynamics compressor & normalizer
 * Pipeline: Microphone -> MediaStream -> AudioContext -> MediaStreamAudioSourceNode -> DynamicsCompressorNode -> GainNode -> MediaStreamDestination -> WebRTC track
 */
export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.compressorNode = null;
    this.gainNode = null;
    this.destinationNode = null;
    this.processedStream = null;
    this.processedTrack = null;
    this.rawTrack = null;
  }

  processMicrophoneStream(rawStream) {
    if (!rawStream) return rawStream;
    const rawTrack = rawStream.getAudioTracks()[0];
    if (!rawTrack) return rawStream;

    this.rawTrack = rawTrack;

    if (typeof window === "undefined") {
      return rawStream;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.log("[HUSH:AUDIO] Web Audio API not available, using raw audio track");
      return rawStream;
    }

    try {
      this.audioContext = new AudioContextClass({ latencyHint: "interactive" });

      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(new MediaStream([rawTrack]));

      // Conservative DynamicsCompressor:
      // Controls sudden loud peaks and prevents clipping while leaving normal speech natural
      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-20, this.audioContext.currentTime); // -20 dB threshold
      this.compressorNode.knee.setValueAtTime(10, this.audioContext.currentTime);        // 10 dB soft transition
      this.compressorNode.ratio.setValueAtTime(3.5, this.audioContext.currentTime);      // 3.5:1 gentle ratio
      this.compressorNode.attack.setValueAtTime(0.005, this.audioContext.currentTime);  // 5ms fast attack
      this.compressorNode.release.setValueAtTime(0.12, this.audioContext.currentTime);  // 120ms smooth release

      // Normalization gain node - strictly unity 1.0 (no extreme amplification)
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);

      this.destinationNode = this.audioContext.createMediaStreamDestination();

      this.sourceNode.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      this.gainNode.connect(this.destinationNode);

      this.processedStream = this.destinationNode.stream;
      this.processedTrack = this.processedStream.getAudioTracks()[0];

      if (this.processedTrack) {
        this.processedTrack.enabled = rawTrack.enabled;
      }

      return this.processedStream;
    } catch (err) {
      console.warn("[HUSH:AUDIO] Failed to initialize AudioContext pipeline, falling back to raw track:", err);
      return rawStream;
    }
  }

  cleanup() {
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.compressorNode) {
        this.compressorNode.disconnect();
        this.compressorNode = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.processedTrack) {
        try {
          this.processedTrack.stop();
        } catch {}
        this.processedTrack = null;
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
    } catch (err) {
      console.warn("[HUSH:AUDIO] Cleanup error:", err);
    }
  }
}

/**
 * Diagnostic logger for audio quality and constraint verification
 */
export function logAudioDiagnostics(track, label = "Microphone") {
  if (!track || track.kind !== "audio") return;
  try {
    const settings = track.getSettings ? track.getSettings() : {};
    const constraints = track.getConstraints ? track.getConstraints() : {};
    console.log(`[HUSH:AUDIO:DIAGNOSTICS] ${label}:`, {
      id: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
      constraints,
    });
  } catch {}
}
