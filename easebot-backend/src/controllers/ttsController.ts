import { Request, Response } from 'express'
import { generateSpeech } from '../services/azureTTS'
import { detectLanguage, translateText } from '../services/translation'

export async function handleTTS(req: Request, res: Response): Promise<void> {
  const { text, voiceName, language } = req.body as { text: string; voiceName?: string; language?: string }
  const qc = req.quotaContext

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    if (qc) await qc.reconcile({ skip: true })
    res.status(400).json({ error: 'text is required' })
    return
  }

  // Strip markdown for cleaner speech
  const plainText = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_~`>|[\]()]/g, '')
    .replace(/^\s*[-•]\s+/gm, ', ')
    .replace(/^\s*\d+\.\s+/gm, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // ── Multilingual TTS pipeline ─────────────────────────────────────────────
  // The `language` field is the *response language* — the language the AI
  // actually replied in. The text may already be in that language (when the
  // LLM was instructed to respond in it). We detect the actual language of
  // the text to avoid redundant or destructive double-translation.
  //
  // Pipeline:
  //   1. Detect the actual language of the text
  //   2. If text is already in the target language → skip translation
  //   3. If text is NOT in the target language → translate
  //   4. Pick the correct locale-matched Azure voice
  //   5. Synthesize with SSML xml:lang set correctly
  const targetLang = language?.split('-')[0] ?? 'en'
  let ttsText = plainText
  let ttsLang = targetLang   // language we'll pass to Azure TTS for voice selection

  if (targetLang !== 'en' && targetLang !== 'auto') {
    // Detect the actual language of the text to avoid double-translation
    const actualLang = await detectLanguage(plainText.slice(0, 500))
    console.log(`[ttsController] targetLang=${targetLang}, actualLang=${actualLang}`)

    if (actualLang === targetLang) {
      // Text is already in the target language — skip translation entirely
      console.log(`[ttsController] Text already in ${targetLang}, skipping translation`)
    } else {
      // Text is in a different language (e.g. English) — translate to target
      try {
        ttsText = await translateText(plainText, targetLang)
        console.log(`[ttsController] Translated ${actualLang}→${targetLang}: ${plainText.length}→${ttsText.length} chars`)
      } catch (err) {
        console.warn('[ttsController] Translation failed, falling back to original text:', err)
        // Fall through with original text; update ttsLang to match actual text language
        ttsLang = actualLang
      }
    }
  }

  // Cap at 5000 chars (Azure TTS single-request limit is ~10 min of audio; 5k chars is a safe ceiling)
  const capped = ttsText.slice(0, 5000)

  try {
    const wavBuffer = await generateSpeech({ text: capped, voiceName, language: ttsLang })
    if (qc) await qc.reconcile({ kind: 'tts', characters: capped.length })
    res.set('Content-Type', 'audio/wav')
    res.set('Content-Length', String(wavBuffer.length))
    res.set('Cache-Control', 'no-store')
    res.send(wavBuffer)
  } catch (err: any) {
    if (qc) await qc.reconcile({ skip: true }).catch(() => {})
    console.error('[ttsController]', err.message)
    res.status(500).json({ error: err.message ?? 'TTS generation failed' })
  }
}
