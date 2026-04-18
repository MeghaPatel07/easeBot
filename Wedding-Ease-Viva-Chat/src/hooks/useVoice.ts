import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '@/services/audioRecorder'
import { transcribeAudio } from '@/services/functionsService'

/**
 * ChatGPT-style record-then-transcribe voice hook.
 *
 * Flow:
 *   idle → (tap mic) → requesting → recording → (tap stop / auto-stop)
 *     → transcribing → idle (text available in result)
 *
 * Unlike the previous live-streaming implementation, we do NOT surface interim
 * text to the UI. The textarea stays untouched during recording; only after
 * transcription completes do we return the final transcript in one shot.
 *
 * Implementation: MediaRecorder → webm/ogg blob → POST /api/transcribe
 * (which wraps Azure STT server-side). Keeps client simple and consistent
 * with mobile browsers where the Azure SDK mic pipeline can be flaky.
 */

/** Maximum recording duration in seconds before auto-stop */
const MAX_RECORDING_DURATION = 60

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing'

export interface UseVoiceResult {
  voiceState: VoiceState
  /** Kept for back-compat with existing ChatInput prop contract. */
  isRecording: boolean
  /** Always empty now — no live interim text. Kept so callers don't break. */
  interimText: string
  recordingDuration: number
  error: string | null
  /** Begin recording. Returns error message string on failure, else null. */
  startRecording: () => Promise<string | null>
  /** Stop + transcribe. Resolves with final text + detected language. */
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  /** Abort recording without transcribing. */
  cancelRecording: () => void
  clearError: () => void
}

export function useVoice(): UseVoiceResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => Promise<{ text: string; detectedLanguage: string } | null>>()
  const cancelledRef = useRef<boolean>(false)

  /** Clear both the second-ticker and the max-duration cutoff. */
  const clearTimers = useCallback(() => {
    if (durationIntervalRef.current !== null) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (maxDurationTimeoutRef.current !== null) {
      clearTimeout(maxDurationTimeoutRef.current)
      maxDurationTimeoutRef.current = null
    }
  }, [])

  /** Start the 1-Hz duration counter and the 60-second auto-stop timeout. */
  const startTimers = useCallback(() => {
    setRecordingDuration(0)
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1)
    }, 1000)
    maxDurationTimeoutRef.current = setTimeout(() => {
      stopRecordingRef.current?.()
    }, MAX_RECORDING_DURATION * 1000)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const startRecording = useCallback(async (): Promise<string | null> => {
    if (voiceState !== 'idle') return null
    setError(null)
    setRecordingDuration(0)
    cancelledRef.current = false
    setVoiceState('requesting')

    try {
      const recorder = new AudioRecorder()
      await recorder.start()
      recorderRef.current = recorder
      setVoiceState('recording')
      startTimers()
      return null
    } catch (err: any) {
      const msg = err?.message ?? 'Microphone access denied'
      setError(msg)
      setVoiceState('idle')
      recorderRef.current = null
      return msg
    }
  }, [voiceState, startTimers])

  const stopRecording = useCallback(async (): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recorder = recorderRef.current
    if (!recorder || (voiceState !== 'recording' && voiceState !== 'requesting')) {
      return null
    }

    clearTimers()
    // Snapshot duration BEFORE we flip state + stop (UI shows transcribing spinner).
    const capturedDuration = recordingDuration
    setVoiceState('transcribing')

    try {
      const { audioBase64 } = await recorder.stop()
      recorderRef.current = null

      if (cancelledRef.current) {
        setVoiceState('idle')
        setRecordingDuration(0)
        return null
      }

      // Guard: extremely short recordings almost always produce empty transcripts.
      if (!audioBase64 || audioBase64.length < 500) {
        setVoiceState('idle')
        setRecordingDuration(0)
        return { text: '', detectedLanguage: 'en' }
      }

      const result = await transcribeAudio(audioBase64)
      setVoiceState('idle')
      setRecordingDuration(0)
      return {
        text: result.text ?? '',
        detectedLanguage: result.detectedLanguage ?? 'en',
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Could not transcribe'
      setError(msg)
      setVoiceState('idle')
      setRecordingDuration(0)
      recorderRef.current = null
      // Surface to the UI via toast in the caller; return null so callers skip fill.
      return null
    }
    // Duration state is read inside this callback — intentional, we want the
    // latest value each stop. React's setState closure semantics handle that
    // via the dep in the reducer above.

  }, [voiceState, clearTimers, recordingDuration])

  // Keep stopRecordingRef in sync so the auto-stop timeout fires the newest version.
  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  const cancelRecording = useCallback(() => {
    clearTimers()
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder) {
      try { recorder.cancel() } catch { /* noop */ }
      recorderRef.current = null
    }
    setRecordingDuration(0)
    setVoiceState('idle')
  }, [clearTimers])

  // Clean up timers + any in-flight recorder on unmount.
  useEffect(() => {
    return () => {
      clearTimers()
      try { recorderRef.current?.cancel() } catch { /* noop */ }
      recorderRef.current = null
    }
  }, [clearTimers])

  return {
    voiceState,
    isRecording: voiceState === 'recording',
    interimText: '',
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  }
}
