import { Request, Response } from 'express'
import { generateSpeech } from '../services/azureTTS'
import { capture as phCapture } from '../lib/posthog'
import { TTSRequestSchema } from '../schemas/tts'

// Detect non-Latin scripts and map to language codes.
// This is the safety net: even if the frontend sends language='en' for Hindi text,
// we pick the correct Azure voice based on the actual script in the text.
const SCRIPT_PATTERNS: [RegExp, string][] = [
  [/[\u0A80-\u0AFF]/, 'gu'],   // Gujarati script
  [/[\u0900-\u097F]/, 'hi'],   // Devanagari (Hindi)
  [/[\u0600-\u06FF]/, 'ar'],   // Arabic script
  [/[\u0B80-\u0BFF]/, 'ta'],   // Tamil (fallback to hi for TTS)
  [/[\u3000-\u9FFF]/, 'zh'],   // CJK (Chinese)
  [/[\uAC00-\uD7AF]/, 'ko'],   // Korean Hangul
  [/[\u3040-\u309F\u30A0-\u30FF]/, 'ja'], // Japanese Hiragana/Katakana
  [/[\u0400-\u04FF]/, 'ru'],   // Cyrillic (Russian)
]

function detectScriptLanguage(text: string): string | null {
  for (const [pattern, lang] of SCRIPT_PATTERNS) {
    if (pattern.test(text)) return lang
  }
  return null
}

export async function handleTTS(req: Request, res: Response): Promise<void> {
  // WE-20260528-002: validate body shape + voiceName against a strict
  // allowlist BEFORE doing anything with it. Previously `voiceName` was read
  // straight off req.body and interpolated into SSML, which let an attacker
  // break out of the <voice name="..."> attribute and inject arbitrary SSML.
  const parsed = TTSRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.errors,
    })
    return
  }
  const { text, voiceName, language } = parsed.data

  // Strip markdown for cleaner speech
  const plainText = text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
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

  // Cap at 5000 chars
  const capped = plainText.slice(0, 5000)

  // Resolve language: trust the frontend value, but override if text script
  // clearly doesn't match (e.g. language='en' but text is Devanagari).
  let ttsLang = language?.split('-')[0] ?? 'en'
  if (ttsLang === 'en' || ttsLang === 'auto') {
    const scriptLang = detectScriptLanguage(capped)
    if (scriptLang) {
      console.log(`[ttsController] Script override: ${ttsLang} → ${scriptLang}`)
      ttsLang = scriptLang
    }
  }

  try {
    const wavBuffer = await generateSpeech({ text: capped, voiceName, language: ttsLang })
    res.set('Content-Type', 'audio/wav')
    res.set('Content-Length', String(wavBuffer.length))
    res.set('Cache-Control', 'no-store')
    res.send(wavBuffer)
  } catch (err: any) {
    // WE-20260528-002 (mirrors WE-20260527-353 pattern): the previous handler
    // echoed err.message back to the client, which leaked Azure SDK internals
    // (websocket error codes, internal SSML parser node names, vendor URLs).
    // Keep the diagnostic in the server log; return a generic 500.
    console.error('[ttsController]', err?.message ?? err)
    const phDistinctId = req.phDistinctId ?? req.user?.uid
    if (phDistinctId) {
      phCapture(phDistinctId, 'tts_failed', {
        provider: 'azure',
        error_code: err?.code ?? err?.name ?? 'unknown',
      })
    }
    res.status(500).json({ error: 'TTS generation failed' })
  }
}
