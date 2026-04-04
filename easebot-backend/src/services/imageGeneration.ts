/**
 * Image services using Azure OpenAI gpt-image-1 (text-to-image, image-to-image)
 * and gpt-4o vision (image-to-text / analysis).
 *
 * V2: LLM-based intent detection via IMAGE_TOOL, configurable sizes,
 * multi-variant generation, style consistency, vision detail toggle.
 *
 * Env vars:
 *   AZURE_GPT_IMAGE_DEPLOYMENT  – deployment name (default: "gpt-image-1")
 *   AZURE_GPT_IMAGE_API_VERSION – API version     (default: "2025-04-01-preview")
 *   AZURE_OPENAI_ENDPOINT       – shared endpoint
 *   AZURE_OPENAI_API_KEY        – shared key
 *   AZURE_DEPLOYMENT_NAME       – gpt-4o deployment (used for vision / image-to-text)
 */

import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import sharp from 'sharp'
import type { HistoryMessage } from '../types'

// ── Constants ───────────────────────────────────────────────────────────────────

/** Maximum image size in bytes (500 KB) */
const MAX_IMAGE_BYTES = 500 * 1024

/** Output format from API — png gives best quality for sharp to then compress */
const IMAGE_FORMAT = 'png'

// ── Types ───────────────────────────────────────────────────────────────────────

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

export type ImageClassification = 'text-to-image' | 'image-to-text' | 'image-to-image' | 'text-only'

// ── LLM Tool Definition (R1) ───────────────────────────────────────────────────

export const IMAGE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Generate or edit a wedding-related image when the user wants a visual. Only call this when the user explicitly or clearly implicitly requests an image, photo, visualization, or design. Do NOT call for non-visual requests like guest lists, timelines, or budgets.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'For "generate": write a detailed image prompt with colors, styles, attire, decor, cultural context (max 2 sentences). For "edit": state ONLY the single targeted change — e.g. "change the sherwani color to red" or "replace the flowers with roses". Be minimal and specific. Do NOT describe the rest of the image. Do NOT add style instructions. Just the one change.',
        },
        action: {
          type: 'string',
          enum: ['generate', 'edit'],
          description: '"generate" for creating new images from scratch. "edit" when the user attached an image or wants to modify a previously generated image — use edit to preserve the original and only change what was asked.',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1024x1024', '1024x1536', '1536x1024'],
          description:
            'Image dimensions. Use portrait (1024x1536) for attire/people, landscape (1536x1024) for venues/decor, square (1024x1024) for general.',
        },
        variants: {
          type: 'integer',
          enum: [1, 2, 3],
          description:
            'Number of image variants to generate. Use 2-3 only when user asks for options or choices. Default 1.',
        },
      },
      required: ['prompt', 'action'],
    },
  },
}

// ── Wedding-scoped image prompts ─────────────────────────────────────────────

/** System prompt for image-to-text analysis (gpt-4o vision) */
const IMAGE_ANALYSIS_SYSTEM = `You are Viva, a wedding and cultural celebration visual expert.
Analyze images strictly in a wedding, bridal, or cultural ceremony context.
Identify: attire (lehenga, sherwani, gown, tuxedo), décor, floral arrangements, venue style, color palettes, jewelry, mehndi, table settings, cultural elements (mandap, chuppah, altar, sangeet stage).
Be concise — max 3-4 sentences. Skip unrelated details.`

/** Wraps a user prompt with wedding context for NEW image generation (R9: style context) */
export function buildImageGenPrompt(userPrompt: string, styleContext?: string[]): string {
  const styleStr = styleContext?.length
    ? `Maintain consistent visual style: ${styleContext.join(', ')}. `
    : ''
  return `Wedding/cultural celebration context. ${styleStr}${userPrompt}. Style: elegant, photorealistic, wedding-appropriate.`
}

/** Builds a surgical edit prompt that preserves everything except the specific change */
export function buildImageEditPrompt(userPrompt: string): string {
  return [
    `You are an expert photo editor. Make ONE precise surgical edit to this image.`,
    ``,
    `THE EDIT: ${userPrompt}`,
    ``,
    `CRITICAL RULES — you MUST follow ALL of these:`,
    `- Change ONLY the specific element mentioned above — nothing else`,
    `- Keep the EXACT same person(s), face(s), body pose, hand position, expression`,
    `- Keep the EXACT same background, architecture, lighting, shadows, depth of field`,
    `- Keep ALL other clothing items unchanged (shawl, dupatta, turban, jewelry, shoes, accessories)`,
    `- Keep the EXACT same camera angle, framing, and composition`,
    `- Keep the EXACT same color grading, warmth, and photo style`,
    `- Do NOT add, remove, or move any element that wasn't mentioned`,
    `- The result should look like the same photo with only the requested change applied`,
    `- Match the texture and pattern style of the original garment when changing color`,
  ].join('\n')
}

// ── Style Extraction (R9) ───────────────────────────────────────────────────────

/** Extract style descriptors from an image prompt for cross-generation consistency */
export function extractStyleDescriptors(prompt: string): string[] {
  const descriptors: string[] = []

  const colorMatch = prompt.match(
    /\b(red|gold|ivory|white|pink|blue|green|purple|maroon|silver|rose|burgundy|champagne|blush|emerald|navy|coral|peach|lavender|teal|cream|beige|copper|bronze|turquoise|magenta|saffron|orange)\b/gi
  )
  if (colorMatch) {
    descriptors.push(`${[...new Set(colorMatch.map(c => c.toLowerCase()))].join(', ')} palette`)
  }

  const styleMatch = prompt.match(
    /\b(photorealistic|minimalist|traditional|modern|vintage|bohemian|rustic|glamorous|romantic|elegant|royal|luxurious|classic|contemporary|art\s*deco|whimsical)\b/gi
  )
  if (styleMatch) {
    descriptors.push(...[...new Set(styleMatch.map(s => s.toLowerCase()))])
  }

  const cultureMatch = prompt.match(
    /\b(Indian|South Indian|North Indian|Rajasthani|Bengali|Punjabi|Gujarati|Marathi|Tamil|Telugu|Kerala|Western|Christian|Jewish|Muslim|Hindu|Sikh|Japanese|Chinese|Korean|Mediterranean|Tuscan)\b/gi
  )
  if (cultureMatch) {
    descriptors.push(...[...new Set(cultureMatch.map(c => c.toLowerCase()))])
  }

  return descriptors
}

// ── Legacy Intent Detection (deprecated — kept for imageController compat) ───

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
const IMAGE_GEN_RE =
  /\b(generate|create|show|draw|design|visualize|render)\b.{0,60}\b(images?|pictures?|photos?|visuals?|illustrations?|mockups?|renders?|sketches?)\b/i

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
const IMAGE_EDIT_RE =
  /\b(make|change|modify|edit|replace|swap|turn|convert|transform|add|remove|put|wear|dress|style|recolor|repaint|redo)\b/i

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function isImageRequest(message: string): boolean {
  return IMAGE_GEN_RE.test(message)
}

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function isImageEditRequest(message: string): boolean {
  return IMAGE_EDIT_RE.test(message)
}

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function classifyImageRequest(text: string, hasImage: boolean): ImageClassification {
  if (hasImage && (isImageRequest(text) || isImageEditRequest(text))) return 'image-to-image'
  if (hasImage) return 'image-to-text'
  if (isImageRequest(text)) return 'text-to-image'
  return 'text-only'
}

/** @deprecated Replaced by LLM writing the prompt directly via IMAGE_TOOL */
export async function buildContextAwareImagePrompt(
  _history: HistoryMessage[],
  currentMessage: string
): Promise<string> {
  return currentMessage
}

// ── Image Size Enforcement (sharp) ──────────────────────────────────────────

/**
 * Compress a base64 image to fit under MAX_IMAGE_BYTES using sharp.
 * Uses JPEG with progressive quality reduction until it fits.
 * Returns a base64 string (no data URI prefix).
 */
async function compressImage(b64: string): Promise<string> {
  const inputBuffer = Buffer.from(b64, 'base64')
  const sizeBytes = inputBuffer.length

  if (sizeBytes <= MAX_IMAGE_BYTES) return b64

  try {
    // Start at quality 75 and reduce until under limit
    for (const quality of [75, 60, 45, 35, 25]) {
      const compressed = await sharp(inputBuffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (compressed.length <= MAX_IMAGE_BYTES) {
        console.log(`[imageGeneration] Compressed ${Math.round(sizeBytes / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (quality=${quality})`)
        return compressed.toString('base64')
      }
    }

    // Last resort: resize down + lowest quality
    const resized = await sharp(inputBuffer)
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 20, mozjpeg: true })
      .toBuffer()

    console.log(`[imageGeneration] Compressed+resized ${Math.round(sizeBytes / 1024)}KB → ${Math.round(resized.length / 1024)}KB`)
    return resized.toString('base64')
  } catch (err) {
    console.error('[imageGeneration] sharp compression failed:', err)
    return b64
  }
}

// ── Text-to-Image (gpt-image-1 generations) ──────────────────────────────────

/**
 * Generate images using gpt-image-1.
 * Returns an array of raw base64 strings (no data URI prefix).
 */
export async function generateImageGptImage1(
  prompt: string,
  size: ImageSize = '1024x1024',
  count: 1 | 2 | 3 = 1
): Promise<string[]> {
  const endpoint = (process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_GPT_IMAGE_DEPLOYMENT ?? 'gpt-image-1'
  const apiVersion = process.env.AZURE_GPT_IMAGE_API_VERSION ?? '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('[imageGeneration] Azure credentials not set — skipping')
    return []
  }

  try {
    const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${apiVersion}`
    const weddingPrompt = buildImageGenPrompt(prompt)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        prompt: weddingPrompt,
        n: count,
        size,
        output_format: IMAGE_FORMAT,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[imageGeneration] gpt-image-1 error ${res.status}: ${body}`)
      return []
    }

    const data = await res.json()
    const rawImages: string[] = (data?.data ?? [])
      .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
      .filter(Boolean)

    if (rawImages.length === 0) {
      console.warn('[imageGeneration] No images in response:', JSON.stringify(Object.keys(data?.data?.[0] ?? {})))
      return []
    }

    // Compress all images to fit under MAX_IMAGE_BYTES
    const images = await Promise.all(rawImages.map(b64 => compressImage(b64)))
    return images
  } catch (err) {
    console.error('[imageGeneration] generateImageGptImage1 error:', err)
    return []
  }
}

// ── Image-to-Image (gpt-image-1 edits) ──────────────────────────────────────

/**
 * Edit an image using gpt-image-1.
 * Returns an array of raw base64 strings (no data URI prefix).
 */
export async function editImageGptImage1(
  imageBase64: string,
  prompt: string,
  size: ImageSize = '1024x1024'
): Promise<string[]> {
  const endpoint = (process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_GPT_IMAGE_DEPLOYMENT ?? 'gpt-image-1'
  const apiVersion = process.env.AZURE_GPT_IMAGE_API_VERSION ?? '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('[imageGeneration] Azure credentials not set — skipping')
    return []
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64')
    const blob = new Blob([imageBuffer], { type: 'image/png' })
    const editPrompt = buildImageEditPrompt(prompt)

    const formData = new FormData()
    formData.append('image', blob, 'image.png')
    formData.append('prompt', editPrompt)
    formData.append('n', '1')
    formData.append('size', size)
    formData.append('output_format', IMAGE_FORMAT)

    const url = `${endpoint}/openai/deployments/${deployment}/images/edits?api-version=${apiVersion}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': apiKey },
      body: formData,
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[imageGeneration] gpt-image-1 edit error ${res.status}: ${body}`)
      return await fallbackImageToImage(imageBase64, prompt)
    }

    const data = await res.json()
    const rawImages: string[] = (data?.data ?? [])
      .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
      .filter(Boolean)

    if (rawImages.length === 0) {
      console.warn('[imageGeneration] No images in edit response')
      return await fallbackImageToImage(imageBase64, prompt)
    }

    const images = await Promise.all(rawImages.map(b64 => compressImage(b64)))
    return images
  } catch (err) {
    console.error('[imageGeneration] editImageGptImage1 error:', err)
    return await fallbackImageToImage(imageBase64, prompt)
  }
}

/**
 * Fallback for image-to-image when the edits API is unavailable:
 * 1. Describe the image using gpt-4o vision
 * 2. Generate a new image using the description + user prompt
 */
async function fallbackImageToImage(imageBase64: string, prompt: string): Promise<string[]> {
  try {
    const description = await analyzeImage(
      imageBase64,
      'image/png',
      'Describe this image in EXTREME detail for recreation: exact person appearance (face, skin tone, hair, expression), exact clothing items and their colors/patterns/textures (each piece separately — sherwani, shawl, turban, jewelry, etc.), exact body pose and hand position, exact background architecture/setting, exact lighting direction and color temperature, exact camera angle and depth of field. Miss nothing.',
      'high'
    )
    const combinedPrompt = `Recreate this EXACT photo pixel-for-pixel: "${description}". Then make ONLY this one surgical change: ${prompt}. Everything else must remain absolutely identical — same person, same pose, same background, same lighting, same other clothing items. The edit should be invisible except for the specific change requested.`
    return await generateImageGptImage1(combinedPrompt)
  } catch (err) {
    console.error('[imageGeneration] fallback image-to-image error:', err)
    return []
  }
}

// ── Image-to-Text (gpt-4o vision) ───────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt?: string,
  detail: 'low' | 'high' | 'auto' = 'auto'
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_DEPLOYMENT_NAME

  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI environment variables not configured')
  }

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion: '2024-08-01-preview',
  })

  const userPrompt = prompt?.trim() || 'Describe this wedding-related image briefly.'

  const completion = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: IMAGE_ANALYSIS_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail },
          },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.5,
  })

  return completion.choices[0]?.message?.content ?? 'Unable to analyze the image.'
}

// ── Legacy export (kept for backward compat) ─────────────────────────────────
export const generateImage = generateImageGptImage1
