import { Request, Response } from 'express'
import { generateImageGptImage1, editImageGptImage1, analyzeImage, isImageRequest, isImageEditRequest } from '../services/imageGeneration'

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
  const { prompt, imageBase64, imageMimeType } = req.body as {
    prompt?: string
    imageBase64?: string
    imageMimeType?: string
  }

  try {
    // Image-to-image: user sent an image + edit/generation intent
    if (imageBase64 && prompt?.trim() && (isImageRequest(prompt) || isImageEditRequest(prompt))) {
      const imageUrl = await editImageGptImage1(imageBase64, prompt.trim())
      if (!imageUrl) {
        res.status(502).json({ error: 'Image editing failed or service unavailable' })
        return
      }
      res.status(200).json({ imageUrl })
      return
    }

    // Image-to-text: user sent an image without edit/generation intent
    if (imageBase64 && imageMimeType) {
      const text = await analyzeImage(imageBase64, imageMimeType, prompt || 'Describe this wedding-related image briefly.')
      res.status(200).json({ text })
      return
    }

    // Text-to-image: no image attached, just a prompt
    if (!prompt?.trim()) {
      res.status(400).json({ error: 'prompt is required' })
      return
    }

    const imageUrl = await generateImageGptImage1(prompt.trim())
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
