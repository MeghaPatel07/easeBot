import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioRecorder } from '@/services/audioRecorder'
import { PcmAudioRecorder } from '@/services/pcmAudioRecorder'
import { transcribeAudio } from '@/services/functionsService'
import { track } from '@/lib/analytics'

// Common shape so useVoice can hold either implementation behind one ref.
interface VoiceRecorder {
  isRecording: boolean
  start(): Promise<void>
  stop(): Promise<{ audioBase64: string; mimeType: string }>
  cancel(): void
  getAmplitudeLevel(): number
}

// Pick PcmAudioRecorder when the browser supports AudioWorklet — it delivers
// the persistent-stream (A), verified-capture (B), and 300ms lookback (C)
// improvements. Older browsers (notably Safari <14.1) fall back to the
// legacy MediaRecorder-based AudioRecorder so voice still works.
function makeRecorder(): VoiceRecorder {
  if (PcmAudioRecorder.isSupported()) return new PcmAudioRecorder()
  return new AudioRecorder()
}

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
  /** Live frequency-bin amplitudes (0-255) while recording; empty otherwise. */
  amplitudes: number[]
  /** Begin recording. Returns error message string on failure, else null. */
  startRecording: () => Promise<string | null>
  /** Stop + transcribe. Resolves with final text + detected language. */
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  /** Abort recording + any in-flight transcription without throwing. */
  cancelRecording: () => void
  clearError: () => void
}

// Rolling time-domain waveform history length. Each entry is one amplitude
// sample from one RAF tick; the UI renders them as thin bars from left (oldest)
// to right (newest), matching ChatGPT's recording visualizer. Sized to match
// the renderer's bar count so the ChatInput can slice directly with no
// sub/oversampling math.
const WAVEFORM_HISTORY_SIZE = 64
const EMPTY_WAVEFORM: number[] = new Array(WAVEFORM_HISTORY_SIZE).fill(0)

export function useVoice(): UseVoiceResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [amplitudes, setAmplitudes] = useState<number[]>(EMPTY_WAVEFORM)
  const amplitudesRef = useRef<number[]>(EMPTY_WAVEFORM)

  // Recorder is created lazily on first use and kept alive across recordings
  // (Fix A — persistent stream). Only torn down on explicit cancel-teardown
  // or hook unmount. Subsequent recordings reuse the warmed mic + context.
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => Promise<{ text: string; detectedLanguage: string } | null>>()
  const cancelledRef = useRef<boolean>(false)
  const rafRef = useRef<number | null>(null)
  const abortCtrlRef = useRef<AbortController | null>(null)

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

  const stopAmplitudeLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    amplitudesRef.current = EMPTY_WAVEFORM
    setAmplitudes(EMPTY_WAVEFORM)
  }, [])

  const startAmplitudeLoop = useCallback(() => {
    amplitudesRef.current = EMPTY_WAVEFORM
    setAmplitudes(EMPTY_WAVEFORM)
    const tick = () => {
      const rec = recorderRef.current
      if (!rec) return
      const level = rec.getAmplitudeLevel()
      // Shift window left, append newest sample on the right — oldest data scrolls off.
      const prev = amplitudesRef.current
      const next = prev.length === WAVEFORM_HISTORY_SIZE
        ? [...prev.slice(1), level]
        : [...prev, level].slice(-WAVEFORM_HISTORY_SIZE)
      amplitudesRef.current = next
      setAmplitudes(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
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
      // Reuse the existing recorder across recordings so the mic stream stays
      // warm. First call does getUserMedia + AudioContext + worklet setup;
      // subsequent calls start capturing within ~20 ms.
      if (!recorderRef.current) {
        recorderRef.current = makeRecorder()
      }
      // Await resolves only after the first audio chunk is flowing (Fix B),
      // so the state transition below is truthful — by the time the UI
      // shows "recording", audio is provably being captured.
      await recorderRef.current.start()
      setVoiceState('recording')
      startTimers()
      startAmplitudeLoop()
      return null
    } catch (err: any) {
      const msg = err?.message ?? 'Microphone access denied'
      setError(msg)
      setVoiceState('idle')
      const name: string = err?.name ?? ''
      if (
        name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        name === 'PermissionDeniedError' ||
        /permission|denied|not allowed/i.test(msg)
      ) {
        track('voice_permission_denied', { error: (name || msg).slice(0, 64) })
      }
      try { recorderRef.current?.cancel() } catch { /* noop */ }
      recorderRef.current = null
      return msg
    }
  }, [voiceState, startTimers, startAmplitudeLoop])

  const stopRecording = useCallback(async (): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recorder = recorderRef.current
    if (!recorder || (voiceState !== 'recording' && voiceState !== 'requesting')) {
      return null
    }

    clearTimers()
    stopAmplitudeLoop()
    // Snapshot duration BEFORE we flip state + stop (UI shows transcribing spinner).
    const capturedDuration = recordingDuration
    setVoiceState('transcribing')

    try {
      const { audioBase64 } = await recorder.stop()
      // Keep the recorder alive across recordings (Fix A). We only drop the
      // ref on explicit teardown (cancelRecording + unmount) or on error.

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

      const controller = new AbortController()
      abortCtrlRef.current = controller
      // Language bias is resolved server-side from the authenticated user's
      // profile (`users/{uid}.preferences.language`). We don't send a hint
      // here so the DB is the single source of truth for saved preference.
      const result = await transcribeAudio(audioBase64, controller.signal)
      abortCtrlRef.current = null
      setVoiceState('idle')
      setRecordingDuration(0)
      return {
        text: result.text ?? '',
        detectedLanguage: result.detectedLanguage ?? 'en',
      }
    } catch (err: any) {
      abortCtrlRef.current = null
      // User-initiated aborts should not surface as errors.
      if (err?.name === 'AbortError' || cancelledRef.current) {
        setVoiceState('idle')
        setRecordingDuration(0)
        // Preserve the warmed recorder on aborts; only drop on real errors.
        return null
      }
      const msg = err?.message ?? 'Could not transcribe'
      const errorCode: string | undefined =
        (typeof err?.code === 'string' && err.code) ||
        (typeof err?.name === 'string' && err.name) ||
        (typeof err?.status === 'number' && String(err.status)) ||
        undefined
      track('transcription_failed', {
        ...(errorCode ? { error_code: errorCode.slice(0, 64) } : {}),
        duration_s: capturedDuration,
      })
      setError(msg)
      setVoiceState('idle')
      setRecordingDuration(0)
      // Something genuinely went wrong — tear down and let the next recording
      // re-acquire the mic cleanly.
      try { recorderRef.current?.cancel() } catch { /* noop */ }
      recorderRef.current = null
      // Surface to the UI via toast in the caller; return null so callers skip fill.
      return null
    }
    // Duration state is read inside this callback — intentional, we want the
    // latest value each stop. React's setState closure semantics handle that
    // via the dep in the reducer above.

  }, [voiceState, clearTimers, recordingDuration, stopAmplitudeLoop])

  // Keep stopRecordingRef in sync so the auto-stop timeout fires the newest version.
  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  const cancelRecording = useCallback(() => {
    clearTimers()
    stopAmplitudeLoop()
    cancelledRef.current = true
    // Cancel does NOT tear down the recorder — keeps mic warm so the next
    // tap reacts instantly. Full teardown runs on unmount.
    try { recorderRef.current?.cancel() } catch { /* noop */ }
    // Abort any in-flight transcribe POST so the network layer tears down cleanly.
    if (abortCtrlRef.current) {
      try { abortCtrlRef.current.abort() } catch { /* noop */ }
      abortCtrlRef.current = null
    }
    setRecordingDuration(0)
    setVoiceState('idle')
  }, [clearTimers, stopAmplitudeLoop])

  // Clean up timers + fully release the mic on unmount.
  useEffect(() => {
    return () => {
      clearTimers()
      stopAmplitudeLoop()
      const rec = recorderRef.current
      recorderRef.current = null
      if (rec) {
        // Legacy AudioRecorder has cancel() (stops the stream); PcmAudioRecorder
        // has an async teardown() that also closes the AudioContext. Prefer
        // teardown when present — leaving the context open across SPA
        // navigations is a real memory leak on long sessions.
        const maybeTeardown = (rec as unknown as { teardown?: () => Promise<void> }).teardown
        if (typeof maybeTeardown === 'function') {
          maybeTeardown.call(rec).catch(() => { /* noop on unmount */ })
        } else {
          try { rec.cancel() } catch { /* noop */ }
        }
      }
      if (abortCtrlRef.current) {
        try { abortCtrlRef.current.abort() } catch { /* noop */ }
        abortCtrlRef.current = null
      }
    }
  }, [clearTimers, stopAmplitudeLoop])

  return {
    voiceState,
    isRecording: voiceState === 'recording',
    interimText: '',
    recordingDuration,
    error,
    amplitudes,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  }
}
