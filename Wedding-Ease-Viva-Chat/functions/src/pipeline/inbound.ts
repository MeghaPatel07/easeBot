import { transcribeAudio } from '../services/stt'
import { detectLanguage, translateText } from '../services/translation'

export interface InboundResult {
  englishText: string
  detectedLanguage: string   // BCP-47 base code e.g. 'en', 'hi', 'gu'
}

const sttEnabled  = () => process.env.ENABLE_SPEECH_TRANSLATION === 'true'
const fullPipelineEnabled = sttEnabled  // alias for readability

export async function processInbound(
  message: string,
  audioBase64?: string,
  hintLanguage?: string
): Promise<InboundResult> {
  let rawText = message
  let detectedLanguage = hintLanguage ?? 'en'

  // ── Step 1: STT (only when ENABLE_SPEECH_TRANSLATION=true) ───────────────
  if (sttEnabled() && audioBase64) {
    try {
      const sttResult = await transcribeAudio(audioBase64)
      rawText = sttResult.text
      detectedLanguage = sttResult.detectedLanguageCode.split('-')[0]
    } catch (err) {
      console.warn('[inbound] STT failed, using typed text:', err)
    }
  }

  // ── Step 2: Language detection for text input (ALWAYS — graceful fallback) ─
  // Runs regardless of ENABLE_SPEECH_TRANSLATION so the system prompt can tell
  // GPT-4o which language to respond in, even without a translation pipeline.
  if (!audioBase64 && !hintLanguage) {
    try {
      detectedLanguage = await detectLanguage(rawText)
    } catch {
      // Azure Translator not configured — system prompt language rule handles it
      detectedLanguage = 'en'
    }
  }

  // ── Step 3: Translate to English (only when full pipeline is enabled) ──────
  let englishText = rawText
  if (fullPipelineEnabled() && detectedLanguage !== 'en') {
    try {
      englishText = await translateText(rawText, 'en')
    } catch (err) {
      console.warn('[inbound] Translation to English failed, using raw text:', err)
    }
  }

  return { englishText, detectedLanguage }
}
