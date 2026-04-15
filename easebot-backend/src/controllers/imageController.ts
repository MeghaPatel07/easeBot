import { Request, Response } from 'express'
import { generateImageGptImage1, editImageGptImage1, analyzeImage, isImageRequest, isImageEditRequest } from '../services/imageGeneration'
import { chargeTokens } from '../services/tokenMeter'

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
  const { prompt, imageBase64, imageMimeType, preferredAspectRatio } = req.body as {
    prompt?: string
    imageBase64?: string
    imageMimeType?: string
    preferredAspectRatio?: string
  }

  const quality: 'standard' | 'hd' = preferredAspectRatio?.includes('1536') ? 'hd' : 'standard'
  const qc = req.quotaContext

  try {
    // Image-to-image: user sent an image + edit/generation intent
    if (imageBase64 && prompt?.trim() && (isImageRequest(prompt) || isImageEditRequest(prompt))) {
      const imageUrl = await editImageGptImage1(imageBase64, prompt.trim())
      if (!imageUrl) {
        if (qc) await qc.reconcile({ skip: true })
        res.status(502).json({ error: 'Image editing failed or service unavailable' })
        return
      }
      if (qc) await qc.reconcile({ kind: 'image', quality, count: 1 })
      res.status(200).json({ imageUrl })
      return
    }

    // Image-to-text: user sent an image without edit/generation intent → counts as vision, not image gen
    if (imageBase64 && imageMimeType) {
      const text = await analyzeImage(imageBase64, imageMimeType, prompt || 'Describe this wedding-related image briefly.')
      if (qc) {
        // Estimate was for image but actual was vision — reconcile skip, then charge vision directly.
        await qc.reconcile({ skip: true })
        chargeTokens(qc.subject, { kind: 'vision', imageCount: 1 }).catch((err) =>
          console.error('[imageController] vision charge failed', err),
        )
      }
      res.status(200).json({ text })
      return
    }

    // Text-to-image: no image attached, just a prompt
    if (!prompt?.trim()) {
      if (qc) await qc.reconcile({ skip: true })
      res.status(400).json({ error: 'prompt is required' })
      return
    }

    const imageUrl = await generateImageGptImage1(prompt.trim())
    if (!imageUrl) {
      if (qc) await qc.reconcile({ skip: true })
      res.status(502).json({ error: 'Image generation failed or service unavailable' })
      return
    }
    if (qc) await qc.reconcile({ kind: 'image', quality, count: 1 })
    res.status(200).json({ imageUrl })
  } catch (err: any) {
    if (qc) await qc.reconcile({ skip: true }).catch(() => {})
    console.error('[imageController]', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
