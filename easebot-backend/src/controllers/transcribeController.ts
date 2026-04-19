import { Request, Response } from 'express'
import { transcribeAudio as sttTranscribe } from '../services/stt'
import { getCachedUserLanguage } from '../lib/userPrefsCache'

// Resolve the authenticated user's saved language preference. Read-through
// via in-process LRU (5-min TTL) backed by Firestore. Supports the new
// preferences.language field and the legacy preferredLanguage. Returns
// undefined for anonymous users or when the value resolves to 'auto'/empty.
async function resolveUserPreferredLanguage(
  uid: string | undefined | null,
): Promise<string | undefined> {
  if (!uid) return undefined
  return getCachedUserLanguage(uid)
}

export async function handleTranscribe(req: Request, res: Response): Promise<void> {
  const { audioBase64, durationSeconds, language } = req.body as {
    audioBase64?: string
    durationSeconds?: number
    language?: string
  }
  const qc = req.quotaContext
  if (!audioBase64) {
    if (qc) await qc.reconcile({ skip: true })
    res.status(400).json({ error: 'audioBase64 is required' })
    return
  }
  try {
    // Priority for STT language bias:
    //   1. user is speaking that language — Azure auto-detect listens to audio
    //   2. DB-saved preference (resolved from Authorization bearer token → req.user.uid)
    //   3. explicit body override (caller intent, e.g. testing)
    //   4. undefined → legacy 4-language auto-detect
    // (1) is achieved inside sttTranscribe: when we pass a non-English preferred,
    // Azure auto-detects between [preferred, en-US] based on the actual audio.
    const bodyLang = language && language !== 'auto' ? language : undefined
    const dbLang = await resolveUserPreferredLanguage(req.user?.uid)
    const resolvedPreferred = bodyLang ?? dbLang

    const result = await sttTranscribe(audioBase64, resolvedPreferred)
    // Pessimistic fallback: if caller didn't declare duration, approximate from text length.
    const seconds = Number.isFinite(durationSeconds) && (durationSeconds as number) > 0
      ? Math.min(60, Number(durationSeconds))
      : Math.max(1, Math.ceil((result.text?.length ?? 0) / 15))
    if (qc) await qc.reconcile({ kind: 'stt', seconds })
    res.status(200).json({ text: result.text, detectedLanguage: result.detectedLanguageCode.split('-')[0] })
  } catch (err: any) {
    if (qc) await qc.reconcile({ skip: true }).catch(() => {})
    console.error('[transcribeController]', err)
    res.status(500).json({ error: err.message ?? 'Transcription failed' })
  }
}
