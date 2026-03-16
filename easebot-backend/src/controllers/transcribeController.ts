import { Request, Response } from 'express'
import { transcribeAudio as sttTranscribe } from '../services/stt'

export async function handleTranscribe(req: Request, res: Response): Promise<void> {
  const { audioBase64 } = req.body
  if (!audioBase64) { res.status(400).json({ error: 'audioBase64 is required' }); return }
  try {
    const result = await sttTranscribe(audioBase64)
    res.status(200).json({ text: result.text, detectedLanguage: result.detectedLanguageCode.split('-')[0] })
  } catch (err: any) {
    console.error('[transcribeController]', err)
    res.status(500).json({ error: err.message ?? 'Transcription failed' })
  }
}
