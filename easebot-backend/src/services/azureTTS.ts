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

// Map short language code → BCP-47 locale used in SSML xml:lang
const LANG_LOCALE_MAP: Record<string, string> = {
  hi: 'hi-IN', gu: 'gu-IN', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA',
  pt: 'pt-BR', de: 'de-DE', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
  ru: 'ru-RU', it: 'it-IT', en: 'en-US',
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

/** Escape text for safe embedding in SSML */
function escapeSSML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Escape a value for safe embedding inside an SSML XML attribute (e.g. the
 * `name` attribute of <voice>). The ttsController already validates voiceName
 * against a strict allowlist (see schemas/tts.ts) so this should be a no-op
 * in practice, but we escape here too as defense in depth — if a future
 * caller ever bypasses the controller (e.g. another route reusing
 * generateSpeech directly), the SSML parser must not be tricked into
 * interpreting the value as additional XML.
 */
function escapeSSMLAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function generateSpeech(options: TTSOptions): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is not set')

  const { text, voiceName = 'Kore', language } = options
  const azureVoice = resolveAzureVoice(voiceName, language)

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region)
  // Riff24Khz16BitMonoPcm returns a fully-formed WAV (RIFF header + PCM data).
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm

  // Passing `null` as the audioConfig suppresses default speaker output on Node.js;
  // the synthesized bytes come back via result.audioData.
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null as any)

  // Use SSML to set the voice and xml:lang explicitly. This ensures Azure
  // TTS uses the correct language model for multilingual/non-English text
  // rather than trying to force-fit the text through an English phoneme set.
  const locale = LANG_LOCALE_MAP[language ?? 'en'] ?? LANG_LOCALE_MAP['en']
  // WE-20260528-002: defense in depth — even though the controller's Zod
  // schema rejects voiceName values that aren't on the allowlist, we still
  // escape every interpolated attribute so a future caller (or refactor)
  // cannot reintroduce the SSML injection bug.
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeSSMLAttr(locale)}">
  <voice name="${escapeSSMLAttr(azureVoice)}">
    ${escapeSSML(text)}
  </voice>
</speak>`

  return new Promise<Buffer>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
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
