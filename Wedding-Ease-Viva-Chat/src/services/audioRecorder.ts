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
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.mediaRecorder = null
    this.chunks = []
  }
}
