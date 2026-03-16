import { useState, useRef, useCallback } from 'react'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

const SUPPORTED_LANGUAGES = ['en-US', 'hi-IN', 'gu-IN', 'es-ES']

export interface UseVoiceResult {
  isRecording: boolean
  startRecording: (onInterim: (text: string) => void) => Promise<string | null>
  stopRecording: () => Promise<{ text: string; detectedLanguage: string } | null>
  cancelRecording: () => void
  error: string | null
}

export function useVoice(): UseVoiceResult {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null)
  const finalTextRef = useRef<string>('')
  const detectedLangRef = useRef<string>('en')

  const startRecording = useCallback(async (
    onInterim: (text: string) => void
  ): Promise<string | null> => {
    setError(null)
    finalTextRef.current = ''
    detectedLangRef.current = 'en'

    try {
      // Fetch short-lived token from backend (key never exposed to browser)
      const res = await fetch(`${API_BASE}/api/speech-token`)
      if (!res.ok) throw new Error('Could not fetch speech token')
      const { token, region } = await res.json()

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
      const autoDetect = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_LANGUAGES)
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()

      const recognizer = SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig)
      recognizerRef.current = recognizer

      // Interim results — update input box as user speaks
      recognizer.recognizing = (_s, e) => {
        if (e.result.text) onInterim(finalTextRef.current + e.result.text)
      }

      // Final results — append confirmed word(s)
      recognizer.recognized = (_s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text) {
          finalTextRef.current += (finalTextRef.current ? ' ' : '') + e.result.text
          const langResult = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(e.result)
          if (langResult.language) detectedLangRef.current = langResult.language.split('-')[0]
          onInterim(finalTextRef.current)
        }
      }

      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(resolve, reject)
      })

      setIsRecording(true)
      return null
    } catch (err: any) {
      const msg = err.message ?? 'Microphone access denied'
      setError(msg)
      return msg
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<{ text: string; detectedLanguage: string } | null> => {
    const recognizer = recognizerRef.current
    if (!recognizer) return null

    await new Promise<void>((resolve) => {
      recognizer.stopContinuousRecognitionAsync(resolve, resolve)
    })
    recognizer.close()
    recognizerRef.current = null
    setIsRecording(false)

    return { text: finalTextRef.current, detectedLanguage: detectedLangRef.current }
  }, [])

  const cancelRecording = useCallback(() => {
    const recognizer = recognizerRef.current
    if (!recognizer) return
    recognizer.stopContinuousRecognitionAsync(
      () => { recognizer.close(); recognizerRef.current = null },
      () => { recognizer.close(); recognizerRef.current = null }
    )
    setIsRecording(false)
  }, [])

  return { isRecording, startRecording, stopRecording, cancelRecording, error }
}
