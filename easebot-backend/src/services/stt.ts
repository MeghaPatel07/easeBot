import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

// Point fluent-ffmpeg to the bundled static binary
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)

export interface STTResult {
  text: string
  detectedLanguageCode: string  // BCP-47 e.g. 'en-US', 'hi-IN', 'gu-IN'
}

// Azure DetectAudioAtStart mode supports max 4 languages
const SUPPORTED_LANGUAGES = [
  'en-US',
  'hi-IN',   // Hindi
  'gu-IN',   // Gujarati
  'es-ES',   // Spanish
]

function getConfig() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not configured')
  return { key, region }
}

// Convert any audio format (WebM, OGG, etc.) to WAV PCM 16-bit 16kHz mono
function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Audio conversion failed: ${err.message}`)))
      .save(outputPath)
  })
}

export async function transcribeAudio(audioBase64: string): Promise<STTResult> {
  const { key, region } = getConfig()

  const buffer = Buffer.from(audioBase64, 'base64')
  const ts = Date.now()
  const inputPath = path.join(os.tmpdir(), `viva-input-${ts}.webm`)
  const wavPath = path.join(os.tmpdir(), `viva-audio-${ts}.wav`)

  fs.writeFileSync(inputPath, buffer)

  try {
    // Convert browser audio (WebM/Opus) → WAV PCM (required by Azure STT SDK)
    await convertToWav(inputPath, wavPath)
  } finally {
    try { fs.unlinkSync(inputPath) } catch {}
  }

  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)

    const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_LANGUAGES)
    const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath))

    const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, autoDetect, audioConfig)

    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close()
        try { fs.unlinkSync(wavPath) } catch {}

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
        try { fs.unlinkSync(wavPath) } catch {}
        reject(new Error(`STT error: ${err}`))
      }
    )
  })
}
