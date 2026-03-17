import { useState, useRef, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export type VoiceState = 'idle' | 'recording' | 'transcribing'

export interface UseVoiceResult {
  voiceState: VoiceState
  isRecording: boolean
  startRecording: () => Promise<string | null>
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  cancelRecording: () => void
  error: string | null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function useVoice(): UseVoiceResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async (): Promise<string | null> => {
    if (voiceState !== 'idle') return null
    setError(null)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(100) // collect chunks every 100ms
      setVoiceState('recording')
      return null
    } catch (err: any) {
      const msg = err.message ?? 'Microphone access denied'
      setError(msg)
      return msg
    }
  }, [voiceState])

  const stopRecording = useCallback(async (): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || voiceState !== 'recording') return null

    setVoiceState('transcribing')

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        // Stop all mic tracks
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        mediaRecorderRef.current = null

        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          chunksRef.current = []

          const audioBase64 = await blobToBase64(blob)

          const res = await fetch(`${API_BASE}/api/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64 }),
          })

          if (!res.ok) throw new Error('Transcription failed')
          const data = await res.json() as { text: string; detectedLanguage: string }
          setVoiceState('idle')
          resolve(data)
        } catch (err: any) {
          setError(err.message ?? 'Transcription failed')
          setVoiceState('idle')
          resolve(null)
        }
      }

      recorder.stop()
    })
  }, [voiceState])

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      try { recorder.stop() } catch {}
      mediaRecorderRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    chunksRef.current = []
    setVoiceState('idle')
  }, [])

  return {
    voiceState,
    isRecording: voiceState === 'recording',
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  }
}
