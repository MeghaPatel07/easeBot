import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface STTResult {
  text: string
  detectedLanguageCode: string  // BCP-47 e.g. 'en-US', 'hi-IN', 'gu-IN'
}

// Languages TheWeddingBot supports for auto-detection
const SUPPORTED_LANGUAGES = [
  'en-US', 'en-GB',
  'hi-IN',   // Hindi
  'gu-IN',   // Gujarati
  'es-ES',   // Spanish
  'fr-FR',   // French
  'ar-SA',   // Arabic
  'pt-BR',   // Portuguese
  'de-DE',   // German
  'zh-CN',   // Chinese (Simplified)
]

function getConfig() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not configured')
  return { key, region }
}

export async function transcribeAudio(audioBase64: string): Promise<STTResult> {
  const { key, region } = getConfig()

  // Write base64 audio to a temp WAV/WebM file
  const buffer = Buffer.from(audioBase64, 'base64')
  const tmpPath = path.join(os.tmpdir(), `viva-audio-${Date.now()}.wav`)
  fs.writeFileSync(tmpPath, buffer)

  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)

    // Continuous Language Identification — auto-detects spoken language
    const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_LANGUAGES)
    const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(tmpPath))

    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig)

    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close()
        try { fs.unlinkSync(tmpPath) } catch {}

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const langResult = sdk.AutoDetectSourceLanguageResult.fromResult(result)
          const detectedLanguageCode = langResult.language ?? 'en-US'
          resolve({ text: result.text, detectedLanguageCode })
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          reject(new Error('Speech could not be recognized'))
        } else {
          const details = sdk.CancellationDetails.fromResult(result)
          reject(new Error(`STT cancelled: ${details.errorDetails}`))
        }
      },
      (err) => {
        recognizer.close()
        try { fs.unlinkSync(tmpPath) } catch {}
        reject(new Error(`STT error: ${err}`))
      }
    )
  })
}
