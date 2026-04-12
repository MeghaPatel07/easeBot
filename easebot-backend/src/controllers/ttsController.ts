import { Request, Response } from 'express'
import { generateSpeech } from '../services/azureTTS'

export async function handleTTS(req: Request, res: Response): Promise<void> {
  const { text, voiceName, language } = req.body as { text: string; voiceName?: string; language?: string }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  // Strip markdown for cleaner speech — same logic as frontend
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

  // Cap at 5000 chars (Azure TTS single-request limit is ~10 min of audio; 5k chars is a safe ceiling)
  const capped = plainText.slice(0, 5000)

  try {
    const wavBuffer = await generateSpeech({ text: capped, voiceName, language })
    res.set('Content-Type', 'audio/wav')
    res.set('Content-Length', String(wavBuffer.length))
    res.set('Cache-Control', 'no-store')
    res.send(wavBuffer)
  } catch (err: any) {
    console.error('[ttsController]', err.message)
    res.status(500).json({ error: err.message ?? 'TTS generation failed' })
  }
}
