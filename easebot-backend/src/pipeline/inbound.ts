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

  // If text contains a non-Latin script (Gujarati, Devanagari, Arabic, Tamil, CJK, etc.)
  // force translation even when language detection failed and defaulted to 'en'.
  // Narrow ranges exclude accented Latin and emojis to avoid false positives.
  const hasNonLatinScript = /[\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0FFF\u3000-\u9FFF\uAC00-\uD7AF]/.test(rawText)
  const shouldTranslate = detectedLanguage !== 'en' || hasNonLatinScript

  // Step 3 — Translate to English via Azure Translator
  let englishText = rawText
  if (shouldTranslate) {
    try {
      englishText = await translateText(rawText, 'en')
      // If detection had defaulted to 'en' but script is non-Latin, update language
      if (hasNonLatinScript && detectedLanguage === 'en') {
        detectedLanguage = 'hi' // best-effort fallback; outbound TTS uses this
      }
    } catch (err) {
      console.warn('[inbound] Translation to English failed, using raw text:', err)
    }
  }

  return { englishText, detectedLanguage }
}
