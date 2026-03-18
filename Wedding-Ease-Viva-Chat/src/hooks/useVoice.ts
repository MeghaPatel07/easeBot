import { useState, useRef, useCallback } from 'react'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export type VoiceState = 'idle' | 'recording' | 'transcribing'

export interface UseVoiceResult {
  voiceState: VoiceState
  isRecording: boolean
  interimText: string                  // live text shown as user speaks
  startRecording: () => Promise<string | null>
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  cancelRecording: () => void
  error: string | null
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

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null)
  const finalTextRef = useRef<string>('')
  const resolveStopRef = useRef<((result: { text: string; detectedLanguage: string } | null) => void) | null>(null)
  const detectedLangRef = useRef<string>('en-US')

  const startRecording = useCallback(async (): Promise<string | null> => {
    if (voiceState !== 'idle') return null
    setError(null)
    setInterimText('')
    finalTextRef.current = ''
    detectedLangRef.current = 'en-US'

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
      return null
    } catch (err: any) {
      const msg = err.message ?? 'Microphone access denied'
      setError(msg)
      return msg
    }
  }, [voiceState])

  const stopRecording = useCallback((): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recognizer = recognizerRef.current
    if (!recognizer || voiceState !== 'recording') {
      return Promise.resolve(null)
    }

    setVoiceState('transcribing')

    return new Promise((resolve) => {
      resolveStopRef.current = (result) => {
        setVoiceState('idle')
        setInterimText('')
        resolve(result)
      }

      recognizer.stopContinuousRecognitionAsync(
        () => {},
        (err) => {
          setError(`Stop error: ${err}`)
          setVoiceState('idle')
          setInterimText('')
          resolve({ text: finalTextRef.current, detectedLanguage: detectedLangRef.current })
        }
      )
    })
  }, [voiceState])

  const cancelRecording = useCallback(() => {
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
    setVoiceState('idle')
  }, [])

  function cleanup() {
    try { recognizerRef.current?.close() } catch {}
    recognizerRef.current = null
  }

  return {
    voiceState,
    isRecording: voiceState === 'recording',
    interimText,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  }
}
