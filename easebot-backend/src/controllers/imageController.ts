import { Request, Response } from 'express'
import { generateImageGptImage1, editImageGptImage1, analyzeImage, isImageRequest, isImageEditRequest } from '../services/imageGeneration'
import { chargeTokens, refundTokens } from '../services/tokenMeter'

export async function handleGenerateImage(req: Request, res: Response): Promise<void> {
  const { prompt, imageBase64, imageMimeType, preferredAspectRatio } = req.body as {
    prompt?: string
    imageBase64?: string
    imageMimeType?: string
    preferredAspectRatio?: string
  }

  const quality: 'standard' | 'hd' = preferredAspectRatio?.includes('1536') ? 'hd' : 'standard'
  const qc = req.quotaContext

  // P0-5: track the image debit so we can refund if any post-charge step
  // blows up (post-processing, storage, response serialization…).
  let reconcileCalled = false
  let chargedAmount = 0
  let chargedConsumedFrom: 'monthly' | 'extras' | 'both' | null = null

  const chargeImage = async (): Promise<boolean> => {
    if (!qc) return true
    reconcileCalled = true
    try {
      const result = await chargeTokens(qc.subject, { kind: 'image', quality, count: 1 })
      // Mark the ctx as reconciled so the middleware doesn't try to charge
      // again on response teardown.
      qc._reconciled = true
      if (result.allowed && result.tokensCharged > 0 && result.consumedFrom !== 'none') {
        chargedAmount = result.tokensCharged
        chargedConsumedFrom = result.consumedFrom
      } else if (!result.allowed) {
        console.warn('[imageController] image charge denied post-call', {
          uid: qc.subject.id,
          reason: result.reason,
        })
      }
      return true
    } catch (err) {
      console.error('[imageController] image charge threw', err)
      return false
    }
  }

  const phDistinctId = req.phDistinctId ?? req.user?.uid
  try {
    // Image-to-image: user sent an image + edit/generation intent
    if (imageBase64 && prompt?.trim() && (isImageRequest(prompt) || isImageEditRequest(prompt))) {
      const imageUrl = await editImageGptImage1(imageBase64, prompt.trim(), '1024x1024', { distinctId: phDistinctId })
      // WE-20260527-227: Treat both `null` (typed failure) AND an empty
      // array (legacy shape / future caller mistake) as failure. `[]` is
      // truthy in JS — guarding only `!imageUrl` would charge tokens for
      // a no-result.
      if (!imageUrl || imageUrl.length === 0) {
        if (qc) await qc.reconcile({ skip: true })
        res.status(502).json({ error: 'Image editing failed or refused', code: 'IMAGE_REFUSED' })
        return
      }
      // Azure call succeeded → enter the protected post-charge block.
      try {
        await chargeImage()
        res.status(200).json({ imageUrl })
      } catch (postErr) {
        console.error('[imageController] post-charge failure (edit)', postErr)
        if (reconcileCalled && chargedAmount > 0 && chargedConsumedFrom && qc) {
          try {
            await refundTokens(qc.subject, chargedAmount, chargedConsumedFrom, 'image')
          } catch (refundErr) {
            console.warn('[imageController] refund after post-charge failure failed', refundErr)
          }
        }
        if (!res.headersSent) {
          res.status(502).json({ error: 'Image post-processing failed' })
        }
      }
      return
    }

    // Image-to-text: user sent an image without edit/generation intent → counts as vision, not image gen
    if (imageBase64 && imageMimeType) {
      const text = await analyzeImage(imageBase64, imageMimeType, prompt || 'Describe this wedding-related image briefly.')
      if (qc) {
        // Estimate was for image but actual was vision — reconcile skip, then charge vision directly.
        await qc.reconcile({ skip: true })
        try {
          const visionResult = await chargeTokens(qc.subject, { kind: 'vision', imageCount: 1 })
          if (!visionResult.allowed) {
            console.warn('[tokenMeter] vision charge denied post-call', {
              uid: qc.subject.id,
              reason: visionResult.reason,
            })
          }
        } catch (visionErr) {
          console.warn('[imageController] vision charge failed (swallowed)', visionErr)
        }
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

    const imageUrl = await generateImageGptImage1(prompt.trim(), '1024x1024', 1, { distinctId: phDistinctId })
    // WE-20260527-227: Treat both `null` (typed failure) AND an empty
    // array (legacy shape / future caller mistake) as failure. `[]` is
    // truthy in JS — guarding only `!imageUrl` would charge tokens for
    // a no-result and respond 200 with `{"imageUrl": []}`.
    if (!imageUrl || imageUrl.length === 0) {
      if (qc) await qc.reconcile({ skip: true })
      res.status(502).json({ error: 'Image generation failed or refused', code: 'IMAGE_REFUSED' })
      return
    }
    // Azure call succeeded → enter the protected post-charge block.
    try {
      await chargeImage()
      res.status(200).json({ imageUrl })
    } catch (postErr) {
      console.error('[imageController] post-charge failure (generate)', postErr)
      if (reconcileCalled && chargedAmount > 0 && chargedConsumedFrom && qc) {
        try {
          await refundTokens(qc.subject, chargedAmount, chargedConsumedFrom, 'image')
        } catch (refundErr) {
          console.warn('[imageController] refund after post-charge failure failed', refundErr)
        }
      }
      if (!res.headersSent) {
        res.status(502).json({ error: 'Image post-processing failed' })
      }
    }
  } catch (err: any) {
    // Pre-charge path: the Azure call (or earlier) threw. Skip reconcile so
    // the user is not billed at all.
    if (qc && !qc._reconciled) {
      await qc.reconcile({ skip: true }).catch(() => {})
    }
    // If somehow we got here with a successful charge (unlikely — charges
    // only happen in the nested try above), refund defensively.
    if (reconcileCalled && chargedAmount > 0 && chargedConsumedFrom && qc) {
      try {
        await refundTokens(qc.subject, chargedAmount, chargedConsumedFrom, 'image')
      } catch (refundErr) {
        console.warn('[imageController] defensive refund failed', refundErr)
      }
    }
    console.error('[imageController]', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message ?? 'Internal server error' })
    }
  }
}
