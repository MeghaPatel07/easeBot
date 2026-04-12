/**
 * Azure Speech TTS Service
 * Uses Azure Cognitive Services Speech SDK to synthesize speech and return a WAV Buffer.
 * Output format Riff24Khz16BitMonoPcm yields a fully-formed WAV file (RIFF header included).
 */
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

export interface TTSOptions {
  text: string
  /** Legacy Gemini voice name (e.g. 'Kore', 'Charon'); mapped to an Azure neural voice. */
  voiceName?: string
  /** BCP-47 short code e.g. 'hi', 'gu'. When non-English, picks a locale-matched Azure voice. */
  language?: string
}

// Map the legacy Gemini voice names used by the frontend to Azure Neural voices.
// Selections mirror the preset personalities in voicePresets.ts.
const GEMINI_TO_AZURE_VOICE: Record<string, string> = {
  Kore: 'en-US-AriaNeural',        // Aria – warm & nurturing
  Charon: 'en-US-GuyNeural',       // Echo – deep & confident
  Aoede: 'en-GB-SoniaNeural',      // Nova – bright & energetic
  Fenrir: 'en-GB-RyanNeural',      // Vale – calm & thoughtful
  Leda: 'en-US-AvaNeural',         // Luna – soft & dreamy
  Puck: 'en-US-BrianNeural',       // Sol  – friendly & clear
}

// Preset gender — lets us pick a sensibly-gendered voice when we switch locales.
const VOICE_GENDER: Record<string, 'female' | 'male'> = {
  Kore: 'female', Aoede: 'female', Leda: 'female',
  Charon: 'male', Fenrir: 'male', Puck: 'male',
}

// Locale-specific Azure Neural voices used when the detected language is non-English.
const LANG_VOICE_MAP: Record<string, { female: string; male: string }> = {
  hi: { female: 'hi-IN-SwaraNeural',     male: 'hi-IN-MadhurNeural' },
  gu: { female: 'gu-IN-DhwaniNeural',    male: 'gu-IN-NiranjanNeural' },
  es: { female: 'es-ES-ElviraNeural',    male: 'es-ES-AlvaroNeural' },
  fr: { female: 'fr-FR-DeniseNeural',    male: 'fr-FR-HenriNeural' },
  ar: { female: 'ar-SA-ZariyahNeural',   male: 'ar-SA-HamedNeural' },
  pt: { female: 'pt-BR-FranciscaNeural', male: 'pt-BR-AntonioNeural' },
  de: { female: 'de-DE-KatjaNeural',     male: 'de-DE-ConradNeural' },
  zh: { female: 'zh-CN-XiaoxiaoNeural',  male: 'zh-CN-YunxiNeural' },
  ja: { female: 'ja-JP-NanamiNeural',    male: 'ja-JP-KeitaNeural' },
  ko: { female: 'ko-KR-SunHiNeural',     male: 'ko-KR-InJoonNeural' },
  ru: { female: 'ru-RU-SvetlanaNeural',  male: 'ru-RU-DmitryNeural' },
  it: { female: 'it-IT-ElsaNeural',      male: 'it-IT-DiegoNeural' },
}

function resolveAzureVoice(voiceName: string, language?: string): string {
  // If the frontend already sent a fully-qualified Azure voice name (contains 'Neural'), honour it.
  if (/Neural$/.test(voiceName)) return voiceName

  const englishVoice = GEMINI_TO_AZURE_VOICE[voiceName] ?? 'en-US-AriaNeural'

  if (language && language !== 'en' && language !== 'auto') {
    const gender = VOICE_GENDER[voiceName] ?? 'female'
    const langVoices = LANG_VOICE_MAP[language]
    if (langVoices) return langVoices[gender]
  }

  return englishVoice
}

export async function generateSpeech(options: TTSOptions): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set')

  const { text, voiceName = 'Kore', language } = options
  const azureVoice = resolveAzureVoice(voiceName, language)

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
  speechConfig.speechSynthesisVoiceName = azureVoice
  // Riff24Khz16BitMonoPcm returns a fully-formed WAV (RIFF header + PCM data).
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm

  // Passing `null` as the audioConfig suppresses default speaker output on Node.js;
  // the synthesized bytes come back via result.audioData.
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null as any)

  return new Promise<Buffer>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        try {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(Buffer.from(result.audioData))
          } else {
            const details = sdk.CancellationDetails.fromResult(result as any)
            reject(new Error(`Azure TTS cancelled: ${details.errorDetails || details.reason}`))
          }
        } finally {
          synthesizer.close()
        }
      },
      (err) => {
        synthesizer.close()
        reject(new Error(`Azure TTS error: ${err}`))
      }
    )
  })
}
