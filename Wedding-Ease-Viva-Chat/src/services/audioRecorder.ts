// Web Audio API wrapper for microphone recording.
// Records audio via getUserMedia and returns base64-encoded audio blob.

export interface RecordingResult {
  audioBase64: string
  mimeType: string
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private timeDomainBuffer: Uint8Array | null = null

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg'

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start()

    try {
      const Ctx: typeof AudioContext =
        (window as any).AudioContext ?? (window as any).webkitAudioContext
      if (Ctx) {
        this.audioContext = new Ctx()
        this.source = this.audioContext.createMediaStreamSource(this.stream)
        this.analyser = this.audioContext.createAnalyser()
        this.analyser.fftSize = 1024
        this.analyser.smoothingTimeConstant = 0
        this.source.connect(this.analyser)
        // Intentionally do NOT connect analyser.connect(destination) — would feedback mic into speakers.
        this.timeDomainBuffer = new Uint8Array(this.analyser.fftSize)
      }
    } catch {
      this.audioContext = null
      this.analyser = null
      this.source = null
      this.timeDomainBuffer = null
    }
  }

  // Peak absolute deviation from the silence mid-point (128) in the current
  // time-domain sample window. Returns 0–255. Used to build a rolling
  // waveform history in the UI (ChatGPT-style thin bars over time).
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

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'))
        return
      }

      const mimeType = this.mediaRecorder.mimeType

      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: mimeType })
          const arrayBuffer = await blob.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          // Convert to base64 in chunks to avoid call stack overflow on large buffers
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const audioBase64 = btoa(binary)
          this.cleanup()
          resolve({ audioBase64, mimeType })
        } catch (err) {
          reject(err)
        }
      }

      this.mediaRecorder.stop()
    })
  }

  cancel(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = null  // prevent resolving the stop() promise
      this.mediaRecorder.stop()
    }
    this.cleanup()
  }

  private cleanup(): void {
    try { this.source?.disconnect() } catch { /* noop */ }
    try { this.analyser?.disconnect() } catch { /* noop */ }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => { /* noop */ })
    }
    this.source = null
    this.analyser = null
    this.audioContext = null
    this.timeDomainBuffer = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.mediaRecorder = null
    this.chunks = []
  }
}
