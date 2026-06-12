import { Request, Response } from 'express'
import { transcribeAudio as sttTranscribe } from '../services/stt'
import { getCachedUserLanguage } from '../lib/userPrefsCache'
import { capture as phCapture } from '../lib/posthog'

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
    // I-4: "no speech recognized" is a soft, retryable outcome — the user spoke
    // but Azure couldn't make out words. Return 200 with empty text + a reason
    // so the client shows a gentle "didn't catch that" prompt instead of a hard
    // error, and don't bill it (reconcile already skipped above).
    if (err?.code === 'no_speech') {
      res.status(200).json({ text: '', detectedLanguage: 'en', reason: 'no_speech' })
      return
    }
    console.error('[transcribeController]', err)
    const phDistinctId = req.phDistinctId ?? req.user?.uid
    if (phDistinctId) {
      const durSec = Number.isFinite(durationSeconds) && (durationSeconds as number) > 0
        ? Number(durationSeconds)
        : undefined
      phCapture(phDistinctId, 'transcription_failed', {
        error_code: err?.code ?? err?.name ?? 'unknown',
        duration_s: durSec,
      })
    }
    // BUG-BE-20260525-011: ffmpeg failures leaked absolute Windows paths
    // (C:\Users\..\AppData\Local\Temp\viva-input-<ts>.webm) and raw stderr
    // verbatim through err.message. Map known audio-decode failure shapes
    // to a sanitized 400; everything else gets a generic 500 with no
    // err.message echoed to the client. Server-side log is unchanged.
    const rawMsg = typeof err?.message === 'string' ? err.message : ''
    const isAudioDecodeFailure =
      rawMsg.includes('ffmpeg') ||
      rawMsg.includes('Audio conversion failed') ||
      rawMsg.includes('Error opening input file') ||
      rawMsg.includes('Invalid data found when processing input')
    if (isAudioDecodeFailure) {
      res.status(400).json({
        error: 'audio_decode_failed',
        message: 'Could not decode audio. Send a valid webm, ogg, wav, or m4a payload.',
      })
      return
    }
    res.status(500).json({ error: 'Transcription failed' })
  }
}
