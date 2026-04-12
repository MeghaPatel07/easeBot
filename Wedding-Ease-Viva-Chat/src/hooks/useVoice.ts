import { useState, useRef, useCallback, useEffect } from 'react'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

/** Maximum recording duration in seconds before auto-stop */
const MAX_RECORDING_DURATION = 60

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing'

export interface UseVoiceResult {
  voiceState: VoiceState
  isRecording: boolean
  interimText: string
  recordingDuration: number
  error: string | null
  startRecording: () => Promise<string | null>
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  cancelRecording: () => void
  clearError: () => void
}

async function fetchSpeechToken(): Promise<{ token: string; region: string }> {
  const res = await fetch(`${API_BASE}/api/speech-token`)
  if (!res.ok) throw new Error('Failed to fetch speech token')
  return res.json()
}

export function useVoice(): UseVoiceResult {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null)
  const finalTextRef = useRef<string>('')
  const resolveStopRef = useRef<((result: { text: string; detectedLanguage: string } | null) => void) | null>(null)
  const detectedLangRef = useRef<string>('en-US')
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => Promise<{ text: string; detectedLanguage: string } | null>>()

  /** Clear all timers related to recording duration */
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

  /** Start the duration counter and auto-stop timeout */
  const startTimers = useCallback(() => {
    setRecordingDuration(0)

    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1)
    }, 1000)

    maxDurationTimeoutRef.current = setTimeout(() => {
      // Auto-stop after max duration
      stopRecordingRef.current?.()
    }, MAX_RECORDING_DURATION * 1000)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const startRecording = useCallback(async (): Promise<string | null> => {
    if (voiceState !== 'idle') return null
    setError(null)
    setInterimText('')
    setRecordingDuration(0)
    finalTextRef.current = ''
    detectedLangRef.current = 'en-US'

    setVoiceState('requesting')

    try {
      const { token, region } = await fetchSpeechToken()

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
      speechConfig.speechRecognitionLanguage = 'en-US'

      // Auto-detect language (up to 4)
      const autoDetect = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages([
        'en-US', 'hi-IN', 'gu-IN', 'es-ES',
      ])

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig)
      recognizerRef.current = recognizer

      // Interim results — shown live in the input box
      recognizer.recognizing = (_s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
          setInterimText(finalTextRef.current + e.result.text)
        }
      }

      // Final result for a phrase — append to accumulated text
      recognizer.recognized = (_s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
          finalTextRef.current += (finalTextRef.current ? ' ' : '') + e.result.text
          setInterimText(finalTextRef.current)

          // Capture detected language from first recognized phrase
          const langResult = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(e.result)
          if (langResult.language) detectedLangRef.current = langResult.language
        }
      }

      recognizer.canceled = (_s, e) => {
        if (e.reason === SpeechSDK.CancellationReason.Error) {
          setError(`Speech error: ${e.errorDetails}`)
        }
        cleanup()
        resolveStopRef.current?.({ text: finalTextRef.current, detectedLanguage: detectedLangRef.current })
        resolveStopRef.current = null
      }

      recognizer.sessionStopped = () => {
        cleanup()
        resolveStopRef.current?.({ text: finalTextRef.current, detectedLanguage: detectedLangRef.current })
        resolveStopRef.current = null
      }

      await new Promise<void>((res, rej) =>
        recognizer.startContinuousRecognitionAsync(res, rej)
      )

      setVoiceState('recording')
      startTimers()
      return null
    } catch (err: any) {
      const msg = err.message ?? 'Microphone access denied'
      setError(msg)
      setVoiceState('idle')
      return msg
    }
  }, [voiceState, startTimers])

  const stopRecording = useCallback((): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recognizer = recognizerRef.current
    if (!recognizer || (voiceState !== 'recording' && voiceState !== 'requesting')) {
      return Promise.resolve(null)
    }

    clearTimers()
    setVoiceState('transcribing')

    return new Promise((resolve) => {
      resolveStopRef.current = (result) => {
        setVoiceState('idle')
        setInterimText('')
        setRecordingDuration(0)
        resolve(result)
      }

      recognizer.stopContinuousRecognitionAsync(
        () => {},
        (err) => {
          setError(`Stop error: ${err}`)
          setVoiceState('idle')
          setInterimText('')
          setRecordingDuration(0)
          resolve({ text: finalTextRef.current, detectedLanguage: detectedLangRef.current })
        }
      )
    })
  }, [voiceState, clearTimers])

  // Keep stopRecordingRef in sync so the auto-stop timeout can call the latest version
  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  const cancelRecording = useCallback(() => {
    clearTimers()
    const recognizer = recognizerRef.current
    if (recognizer) {
      resolveStopRef.current = null
      recognizer.stopContinuousRecognitionAsync(
        () => { recognizer.close(); recognizerRef.current = null },
        () => { try { recognizer.close() } catch {} recognizerRef.current = null }
      )
    }
    finalTextRef.current = ''
    setInterimText('')
    setRecordingDuration(0)
    setVoiceState('idle')
  }, [clearTimers])

  function cleanup() {
    clearTimers()
    try { recognizerRef.current?.close() } catch {}
    recognizerRef.current = null
  }

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  return {
    voiceState,
    isRecording: voiceState === 'recording',
    interimText,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  }
}
