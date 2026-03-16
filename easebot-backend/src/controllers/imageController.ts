import { Request, Response } from 'express'
import { generateImage } from '../services/imageGeneration'

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
  const { prompt } = req.body as { prompt?: string }

  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

  try {
    const imageUrl = await generateImage(prompt.trim())
    if (!imageUrl) {
      res.status(502).json({ error: 'Image generation failed or service unavailable' })
      return
    }
    res.status(200).json({ imageUrl })
  } catch (err: any) {
    console.error('[imageController]', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
