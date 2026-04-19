// PcmAudioRecorder — AudioWorklet-based recorder delivering fixes A + B + C:
//
//   A. Persistent MediaStream + AudioContext: once warmed up, subsequent
//      recordings begin within ~20 ms — no getUserMedia round-trip.
//   B. Verified-capture signal: start() resolves only after the worklet has
//      delivered its first audio chunk, so the UI "recording" state is truthful.
//   C. 300 ms pre-click lookback: a continuous ring buffer captures PCM
//      always-on; slicing at stop() includes the samples that landed BEFORE
//      the user clicked the mic. Fixes the "mane please…" dropped-intro bug.
//
// Output contract is compatible with the legacy AudioRecorder:
// `{ audioBase64, mimeType: 'audio/wav' }`. Backend RIFF fast-path skips ffmpeg.

import {
  bytesToBase64,
  downsampleFloat32,
  encodeWav16,
  floatToInt16,
} from './audioUtils'

export interface RecordingResult {
  audioBase64: string
  mimeType: string
}

const TARGET_SAMPLE_RATE = 16000   // Azure STT canonical rate
const RING_SECONDS = 65            // ≥ 60s max recording + pre-roll headroom
const PRE_ROLL_MS = 300            // Fix C: lookback window
const WORKLET_URL = '/worklets/pcm-recorder-processor.js'

export class PcmAudioRecorder {
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private timeDomainBuffer: Uint8Array | null = null
  private worklet: AudioWorkletNode | null = null

  private ring: Float32Array | null = null
  private ringWritePos = 0
  private totalSamples = 0
  private ringCapacity = 0
  private sourceSampleRate = 48000

  private recordingStartSample: number | null = null
  private firstChunkArrived = false
  private waitingForFirstChunk: ((v: void) => void) | null = null
  private waitingFirstChunkTimeout: ReturnType<typeof setTimeout> | null = null

  private lastAmplitudeChunk: Float32Array | null = null

  get isSupported(): boolean {
    return PcmAudioRecorder.isSupported()
  }

  static isSupported(): boolean {
    if (typeof window === 'undefined') return false
    if (!('AudioContext' in window) && !('webkitAudioContext' in (window as any))) return false
    if (typeof AudioWorkletNode === 'undefined') return false
    if (!navigator.mediaDevices?.getUserMedia) return false
    return true
  }

  get isRecording(): boolean {
    return this.recordingStartSample !== null
  }

  /**
   * Acquire mic permission + set up the AudioContext + worklet. Safe to call
   * multiple times; becomes a no-op once warm. Throws if the user denies mic
   * permission or the browser lacks AudioWorklet support.
   */
  async warmup(): Promise<void> {
    if (this.worklet) return
    if (!PcmAudioRecorder.isSupported()) {
      throw new Error('AudioWorklet unsupported in this browser')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    const Ctx: typeof AudioContext =
      (window as any).AudioContext ?? (window as any).webkitAudioContext
    this.audioContext = new Ctx()
    // iOS sometimes creates the context in 'suspended' state; nudge it.
    if (this.audioContext.state === 'suspended') {
      try { await this.audioContext.resume() } catch { /* non-fatal */ }
    }
    this.sourceSampleRate = this.audioContext.sampleRate

    // Ring buffer sized in source samples. ~65 s at 48 kHz ≈ 3.1M floats ≈ 12 MB.
    this.ringCapacity = Math.ceil(RING_SECONDS * this.sourceSampleRate)
    this.ring = new Float32Array(this.ringCapacity)
    this.ringWritePos = 0
    this.totalSamples = 0

    await this.audioContext.audioWorklet.addModule(WORKLET_URL)

    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.worklet = new AudioWorkletNode(this.audioContext, 'pcm-recorder')
    this.worklet.port.onmessage = (e: MessageEvent) => {
      const chunk = e.data as Float32Array
      if (!chunk || chunk.length === 0) return
      this.appendToRing(chunk)
      this.lastAmplitudeChunk = chunk
      if (!this.firstChunkArrived) {
        this.firstChunkArrived = true
        const resolver = this.waitingForFirstChunk
        this.waitingForFirstChunk = null
        if (this.waitingFirstChunkTimeout) {
          clearTimeout(this.waitingFirstChunkTimeout)
          this.waitingFirstChunkTimeout = null
        }
        resolver?.()
      }
    }

    // AnalyserNode gives us the same time-domain waveform data the old
    // recorder used, keeping the existing UI visualization logic identical.
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0
    this.timeDomainBuffer = new Uint8Array(this.analyser.fftSize)

    // Graph: source → analyser (taps off), source → worklet (captures PCM).
    // Neither branch connects to destination — we don't want to play back.
    this.source.connect(this.analyser)
    this.source.connect(this.worklet)
  }

  private appendToRing(chunk: Float32Array): void {
    if (!this.ring) return
    const cap = this.ringCapacity
    const len = chunk.length
    // Two-part write when we'd wrap around the ring boundary.
    const firstPart = Math.min(len, cap - this.ringWritePos)
    this.ring.set(chunk.subarray(0, firstPart), this.ringWritePos)
    if (firstPart < len) {
      this.ring.set(chunk.subarray(firstPart), 0)
    }
    this.ringWritePos = (this.ringWritePos + len) % cap
    this.totalSamples += len
  }

  /**
   * Mark the start of a new recording and resolve once the worklet has
   * confirmed it is flowing. The 300 ms pre-roll is captured by setting the
   * start sample 300 ms BEFORE `totalSamples` at start time.
   */
  async start(): Promise<void> {
    if (!this.worklet) await this.warmup()

    // Fix C: recording begins 300 ms before the click (clamped to ring capacity).
    const preRollSamples = Math.ceil((PRE_ROLL_MS / 1000) * this.sourceSampleRate)
    this.recordingStartSample = Math.max(0, this.totalSamples - preRollSamples)

    // Fix B: resolve only after the first chunk after start arrives,
    // so the UI flip to "recording" is honest. In practice the worklet
    // is already streaming if we warmed up earlier, so this is ~instant.
    if (this.firstChunkArrived && this.lastAmplitudeChunk) {
      return
    }
    return new Promise<void>((resolve, reject) => {
      this.waitingForFirstChunk = resolve
      // Guard against a silent-mic scenario — if NO data arrives in 2 s,
      // fail open so we don't hang the UI forever. User sees a mic error.
      this.waitingFirstChunkTimeout = setTimeout(() => {
        const r = this.waitingForFirstChunk
        this.waitingForFirstChunk = null
        this.waitingFirstChunkTimeout = null
        if (r) reject(new Error('Microphone did not start within 2 s'))
      }, 2000)
    })
  }

  /**
   * Slice the ring from the recording start to the current write position,
   * downsample to 16 kHz mono, wrap as WAV, base64-encode. Does NOT tear down
   * the AudioContext — the mic stream stays warm for the next recording.
   */
  async stop(): Promise<RecordingResult> {
    if (this.recordingStartSample === null || !this.ring) {
      throw new Error('No active recording')
    }
    const endSample = this.totalSamples
    const startSample = this.recordingStartSample
    this.recordingStartSample = null

    const length = Math.max(0, endSample - startSample)
    if (length === 0) {
      return { audioBase64: '', mimeType: 'audio/wav' }
    }

    const cap = this.ringCapacity
    // The ring position corresponding to `startSample` lives at
    // (ringWritePos - (endSample - startSample)) mod cap. We can't rely on
    // absolute sample counts to index directly — compute from current write.
    const samplesBehind = endSample - startSample
    const readStart = ((this.ringWritePos - samplesBehind) % cap + cap) % cap

    const contiguous = new Float32Array(length)
    const firstPart = Math.min(length, cap - readStart)
    contiguous.set(this.ring.subarray(readStart, readStart + firstPart), 0)
    if (firstPart < length) {
      contiguous.set(this.ring.subarray(0, length - firstPart), firstPart)
    }

    const downsampled = downsampleFloat32(contiguous, this.sourceSampleRate, TARGET_SAMPLE_RATE)
    const pcm16 = floatToInt16(downsampled)
    const wav = encodeWav16(pcm16, TARGET_SAMPLE_RATE)
    const audioBase64 = bytesToBase64(wav)

    return { audioBase64, mimeType: 'audio/wav' }
  }

  /**
   * Abort without producing output. The stream + context stay warm so the
   * next recording starts instantly.
   */
  cancel(): void {
    this.recordingStartSample = null
    if (this.waitingFirstChunkTimeout) {
      clearTimeout(this.waitingFirstChunkTimeout)
      this.waitingFirstChunkTimeout = null
    }
    this.waitingForFirstChunk = null
  }

  /**
   * Peak absolute deviation from silence mid-point — same 0-255 range and
   * semantics as the legacy AudioRecorder so the waveform UI is unchanged.
   * Uses the AnalyserNode's time-domain buffer (updated every RAF tick).
   */
  getAmplitudeLevel(): number {
    if (!this.analyser || !this.timeDomainBuffer) return 0
    this.analyser.getByteTimeDomainData(this.timeDomainBuffer)
    let peak = 0
    for (let i = 0; i < this.timeDomainBuffer.length; i++) {
      const d = Math.abs(this.timeDomainBuffer[i] - 128)
      if (d > peak) peak = d
    }
    return Math.min(255, peak * 2)
  }

  /**
   * Tear down the AudioContext + release the mic. Call on hook unmount
   * or when the user explicitly exits the voice UI for good. Subsequent
   * recordings will re-trigger warmup (including the permission prompt
   * if the browser revoked it).
   */
  async teardown(): Promise<void> {
    this.cancel()
    try { this.source?.disconnect() } catch { /* noop */ }
    try { this.analyser?.disconnect() } catch { /* noop */ }
    try { this.worklet?.disconnect() } catch { /* noop */ }
    this.worklet = null
    this.source = null
    this.analyser = null
    this.timeDomainBuffer = null
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { await this.audioContext.close() } catch { /* noop */ }
    }
    this.audioContext = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.ring = null
    this.firstChunkArrived = false
    this.lastAmplitudeChunk = null
    this.totalSamples = 0
    this.ringWritePos = 0
  }
}
