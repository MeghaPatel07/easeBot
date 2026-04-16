import * as admin from 'firebase-admin'
import { Request, Response } from 'express'
import { generateImage } from '../services/imageGeneration'
import { chargeTokens } from '../services/tokenMeter'
import { resolveTier, getLimits } from '../config/tierConfig'

const db = admin.firestore()

// PRICING_PRD §3.2: GPT-Image-1.5 standard = 16,000 Easebot Tokens
const IMAGE_TOKEN_COST = 16_000

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
  const { prompt } = req.body as { prompt?: string }

  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

  const uid = req.user?.uid

  try {
    // Determine watermark based on user tier
    let needsWatermark = true // default for guests
    if (uid) {
      const profileSnap = await db.collection('users').doc(uid).get()
      const tier = resolveTier(profileSnap.exists ? profileSnap.data() as any : null)
      needsWatermark = getLimits(tier).imageWatermark
    }

    const imageUrl = await generateImage(prompt.trim(), needsWatermark)
    if (!imageUrl) {
      res.status(502).json({ error: 'Image generation failed or service unavailable' })
      return
    }

    // Charge token meter for successful image generation
    if (uid) {
      chargeTokens(uid, IMAGE_TOKEN_COST).catch(err =>
        console.error('[imageController] token meter charge failed:', err)
      )
    }

    res.status(200).json({ imageUrl })
  } catch (err: any) {
    console.error('[imageController] error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
