import { translateText } from '../services/translation'

export interface OutboundResult {
  text: string
  audioUrl: null
}

const speechEnabled = () => process.env.ENABLE_SPEECH_TRANSLATION === 'true'

export async function processOutbound(
  englishText: string,
  targetLanguage: string
): Promise<OutboundResult> {
  // ── Toggle OFF: return English text as-is ────────────────────────────────
  if (!speechEnabled()) {
    return { text: englishText, audioUrl: null }
  }

  // ── Toggle ON: translate back to user's original language ─────────────────
  let finalText = englishText
  if (targetLanguage !== 'en') {
    try {
      finalText = await translateText(englishText, targetLanguage)
    } catch (err) {
      console.warn('[outbound] Translation failed, returning English text:', err)
    }
  }

  return { text: finalText, audioUrl: null }
}
