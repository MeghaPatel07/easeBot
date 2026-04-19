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
      const sttResult = await transcribeAudio(audioBase64, hintLanguage)
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
      // If detection had defaulted to 'en' but script is non-Latin, pick the
      // most likely language from the script range. Previously this blanket-
      // fell-back to 'hi', which meant Gujarati input got a Hindi response.
      if (hasNonLatinScript && detectedLanguage === 'en') {
        detectedLanguage = detectLanguageFromScript(rawText)
      }
    } catch (err) {
      console.warn('[inbound] Translation to English failed, using raw text:', err)
    }
  }

  return { englishText, detectedLanguage }
}

// Script-range heuristic fallback for when Azure Text Language Detection
// returns 'en' or fails, but the script itself is unmistakable.
// Ranges are chosen to be disjoint so a single char vote is reliable;
// we prefer Gujarati over Devanagari over Bengali where ambiguity might
// arise (it doesn't — Unicode blocks are disjoint).
// Order matters: first match wins, so list the most specific / highest-
// priority languages first.
export function detectLanguageFromScript(text: string): string {
  // Gujarati            U+0A80–U+0AFF
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu'
  // Devanagari (Hindi)  U+0900–U+097F
  if (/[\u0900-\u097F]/.test(text)) return 'hi'
  // Bengali             U+0980–U+09FF
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'
  // Gurmukhi (Punjabi)  U+0A00–U+0A7F
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'
  // Tamil               U+0B80–U+0BFF
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'
  // Telugu              U+0C00–U+0C7F
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'
  // Kannada             U+0C80–U+0CFF
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'
  // Malayalam           U+0D00–U+0D7F
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'
  // Arabic              U+0600–U+06FF
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  // Thai                U+0E00–U+0E7F
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th'
  // CJK (Chinese default, Japanese/Korean need separate signals)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
  if (/[\u3000-\u9FFF]/.test(text)) return 'zh'
  // Nothing matched — keep previous blanket fallback for parity
  return 'hi'
}
