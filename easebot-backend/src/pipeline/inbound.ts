import { transcribeAudio } from '../services/stt'
import { detectLanguage, translateText } from '../services/translation'

export interface InboundResult {
  englishText: string
  detectedLanguage: string   // BCP-47 base code e.g. 'en', 'hi', 'gu'
}

const speechEnabled = () => process.env.ENABLE_SPEECH_TRANSLATION === 'true'

export async function processInbound(
  message: string,
  audioBase64?: string,
  hintLanguage?: string
): Promise<InboundResult> {
  // ── Toggle OFF: skip STT & translation entirely ───────────────────────────
  if (!speechEnabled()) {
    return { englishText: message, detectedLanguage: 'en' }
  }

  // ── Toggle ON: full Azure STT + Language Detection + Translation ──────────
  let rawText = message
  let detectedLanguage = hintLanguage ?? 'en'

  // Step 1 — Azure AI Speech with Continuous Language ID (audio input)
  if (audioBase64) {
    try {
      const sttResult = await transcribeAudio(audioBase64)
      rawText = sttResult.text
      detectedLanguage = sttResult.detectedLanguageCode.split('-')[0]
    } catch (err) {
      console.warn('[inbound] STT failed, falling back to typed text:', err)
    }
  }

  // Step 2 — Detect language for typed text
  if (!audioBase64 && !hintLanguage) {
    try {
      detectedLanguage = await detectLanguage(rawText)
    } catch (err) {
      console.warn('[inbound] Language detection failed, defaulting to en:', err)
    }
  }

  // Step 3 — Translate to English via Azure Translator
  let englishText = rawText
  if (detectedLanguage !== 'en') {
    try {
      englishText = await translateText(rawText, 'en')
    } catch (err) {
      console.warn('[inbound] Translation to English failed, using raw text:', err)
    }
  }

  return { englishText, detectedLanguage }
}
