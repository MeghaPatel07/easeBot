import { Request, Response } from 'express'
import { transcribeAudio as sttTranscribe } from '../services/stt'

export async function handleTranscribe(req: Request, res: Response): Promise<void> {
  const { audioBase64, durationSeconds } = req.body as { audioBase64?: string; durationSeconds?: number }
  const qc = req.quotaContext
  if (!audioBase64) {
    if (qc) await qc.reconcile({ skip: true })
    res.status(400).json({ error: 'audioBase64 is required' })
    return
  }
  try {
    const result = await sttTranscribe(audioBase64)
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
