/**
 * Image services — unified interface for image generation, editing, and analysis.
 *
 * V3: Switched from Azure gpt-image-1 to Gemini native image generation
 * for superior quality, better prompt understanding, and native image editing.
 *
 * Primary engine: Gemini 2.0 Flash (native text-to-image & image-to-image)
 * Fallback: Azure gpt-image-1 (if Gemini unavailable)
 * Vision/Analysis: Gemini (primary) → Azure gpt-4o (fallback)
 *
 * Env vars:
 *   GEMINI_API_KEY               – Google AI Studio API key (primary)
 *   GEMINI_IMAGE_MODEL           – model ID (default: "gemini-2.0-flash-exp")
 *   AZURE_GPT_IMAGE_DEPLOYMENT   – Azure fallback deployment
 *   AZURE_GPT_IMAGE_API_VERSION  – Azure fallback API version
 *   AZURE_OPENAI_ENDPOINT        – Azure endpoint (fallback)
 *   AZURE_OPENAI_API_KEY         – Azure key (fallback)
 *   AZURE_DEPLOYMENT_NAME        – gpt-4o deployment for vision fallback
 */

import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import sharp from 'sharp'
import type { HistoryMessage } from '../types'
import {
  generateImageGemini,
  editImageGemini,
  analyzeImageGemini,
} from './geminiImageGeneration'

// ── Constants ───────────────────────────────────────────────────────────────────

/** Maximum image size in bytes (500 KB) */
const MAX_IMAGE_BYTES = 500 * 1024

/** Output format from Azure API */
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
      'Generate or edit a wedding/celebration image for any family member, any race, culture, or tradition. Only call this when the user explicitly or clearly implicitly requests an image, photo, visualization, or design. Do NOT call for non-visual requests like guest lists, timelines, or budgets.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Write a rich, detailed image prompt. For "generate": identify the person\'s ROLE (bride, groom, father, mother, bridesmaid, etc.) and CULTURE/ETHNICITY, then include attire, colors, fabrics, textures, cultural elements, setting (max 3 sentences). Be vivid and specific — describe what you SEE. For "edit": state ONLY the single targeted change — e.g. "change the sherwani color to deep royal blue". Be precise. Do NOT describe the rest of the image.',
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
            'Image dimensions. Use portrait (1024x1536) for attire/people/full-body shots, landscape (1536x1024) for venues/decor/wide scenes, square (1024x1024) for close-ups/details/invitations.',
        },
        variants: {
          type: 'integer',
          enum: [1],
          description:
            'Always 1. Generate exactly one image per request.',
        },
      },
      required: ['prompt', 'action'],
    },
  },
}

// ── Prompt Building ─────────────────────────────────────────────────────────────

/** Wraps a user prompt with wedding context for NEW image generation */
export function buildImageGenPrompt(userPrompt: string, styleContext?: string[]): string {
  const styleStr = styleContext?.length
    ? `Maintain consistent visual style: ${styleContext.join(', ')}. `
    : ''
  return `Wedding/celebration context for any culture, tradition, or family role. ${styleStr}${userPrompt}. Photorealistic, professionally lit, sharp details, accurate true-to-life colors, natural skin tones across all ethnicities, elegant composition.`
}

/** Builds a surgical edit prompt that preserves everything except the specific change */
export function buildImageEditPrompt(userPrompt: string): string {
  return [
    `Make ONE precise surgical edit to this image.`,
    ``,
    `THE EDIT: ${userPrompt}`,
    ``,
    `RULES:`,
    `- Change ONLY the specific element mentioned above`,
    `- Keep EXACT same person(s), face, pose, expression`,
    `- Keep EXACT same background, lighting, shadows, camera angle`,
    `- Keep ALL other clothing/accessories unchanged`,
    `- Match textures and patterns when changing colors`,
    `- Result should look like the same photo with only the requested change`,
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
    /\b(Indian|South Indian|North Indian|Rajasthani|Bengali|Punjabi|Gujarati|Marathi|Tamil|Telugu|Kerala|Western|Christian|Jewish|Muslim|Hindu|Sikh|Japanese|Chinese|Korean|Mediterranean|Tuscan|African|Nigerian|Ghanaian|Ethiopian|Latin|Mexican|Brazilian|Caribbean|Arab|Persian|Thai|Vietnamese|Filipino|Polynesian|Indigenous|Pakistani|Bangladeshi|Sri Lankan|Nepali)\b/gi
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

// ── Image Compression (shared) ──────────────────────────────────────────────

/**
 * Compress a base64 image to fit under MAX_IMAGE_BYTES using sharp.
 */
async function compressImage(b64: string): Promise<string> {
  const inputBuffer = Buffer.from(b64, 'base64')

  if (inputBuffer.length <= MAX_IMAGE_BYTES) return b64

  try {
    for (const quality of [75, 60, 45, 35, 25]) {
      const compressed = await sharp(inputBuffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (compressed.length <= MAX_IMAGE_BYTES) {
        console.log(`[imageGeneration] Compressed ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (quality=${quality})`)
        return compressed.toString('base64')
      }
    }

    const resized = await sharp(inputBuffer)
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 20, mozjpeg: true })
      .toBuffer()

    console.log(`[imageGeneration] Compressed+resized ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(resized.length / 1024)}KB`)
    return resized.toString('base64')
  } catch (err) {
    console.error('[imageGeneration] sharp compression failed:', err)
    return b64
  }
}

// ── Text-to-Image (Gemini primary, Azure fallback) ──────────────────────────

/**
 * Generate images using Gemini native image generation.
 * Falls back to Azure gpt-image-1 if Gemini is unavailable.
 * Returns an array of raw base64 strings (no data URI prefix).
 */
export async function generateImageGptImage1(
  prompt: string,
  size: ImageSize = '1024x1024',
  count: 1 | 2 | 3 = 1
): Promise<string[]> {
  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    console.log('[imageGeneration] Using Gemini for text-to-image generation')
    const images = await generateImageGemini(prompt, size, count)
    if (images.length > 0) return images
    console.warn('[imageGeneration] Gemini returned no images, falling back to Azure')
  }

  // Azure fallback
  return await generateImageAzureFallback(prompt, size, count)
}

/**
 * Azure gpt-image-1 fallback for text-to-image.
 */
async function generateImageAzureFallback(
  prompt: string,
  size: ImageSize = '1024x1024',
  count: 1 | 2 | 3 = 1
): Promise<string[]> {
  const endpoint = (process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_GPT_IMAGE_DEPLOYMENT ?? 'gpt-image-1'
  const apiVersion = process.env.AZURE_GPT_IMAGE_API_VERSION ?? '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('[imageGeneration] No Azure credentials — cannot fallback')
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
      console.error(`[imageGeneration] Azure fallback error ${res.status}: ${body}`)
      return []
    }

    const data = await res.json()
    const rawImages: string[] = (data?.data ?? [])
      .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
      .filter(Boolean)

    if (rawImages.length === 0) return []

    return await Promise.all(rawImages.map(b64 => compressImage(b64)))
  } catch (err) {
    console.error('[imageGeneration] Azure fallback error:', err)
    return []
  }
}

// ── Image-to-Image (Gemini primary, Azure fallback) ──────────────────────────

/**
 * Edit an image using Gemini native image editing.
 * Falls back to Azure gpt-image-1 edits if Gemini is unavailable.
 * Returns an array of raw base64 strings (no data URI prefix).
 */
export async function editImageGptImage1(
  imageBase64: string,
  prompt: string,
  size: ImageSize = '1024x1024'
): Promise<string[]> {
  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    console.log('[imageGeneration] Using Gemini for image-to-image editing')
    const images = await editImageGemini(imageBase64, prompt, size)
    if (images.length > 0) return images
    console.warn('[imageGeneration] Gemini edit returned no images, falling back to Azure')
  }

  // Azure fallback
  return await editImageAzureFallback(imageBase64, prompt, size)
}

/**
 * Azure gpt-image-1 fallback for image editing.
 */
async function editImageAzureFallback(
  imageBase64: string,
  prompt: string,
  size: ImageSize = '1024x1024'
): Promise<string[]> {
  const endpoint = (process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_GPT_IMAGE_DEPLOYMENT ?? 'gpt-image-1'
  const apiVersion = process.env.AZURE_GPT_IMAGE_API_VERSION ?? '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('[imageGeneration] No Azure credentials for fallback')
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
      console.error(`[imageGeneration] Azure edit fallback error ${res.status}: ${body}`)
      return await azureFallbackImageToImage(imageBase64, prompt)
    }

    const data = await res.json()
    const rawImages: string[] = (data?.data ?? [])
      .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
      .filter(Boolean)

    if (rawImages.length === 0) {
      return await azureFallbackImageToImage(imageBase64, prompt)
    }

    return await Promise.all(rawImages.map(b64 => compressImage(b64)))
  } catch (err) {
    console.error('[imageGeneration] Azure edit fallback error:', err)
    return await azureFallbackImageToImage(imageBase64, prompt)
  }
}

/**
 * Last-resort fallback: analyze image with vision, then regenerate.
 */
async function azureFallbackImageToImage(imageBase64: string, prompt: string): Promise<string[]> {
  try {
    const description = await analyzeImage(
      imageBase64,
      'image/png',
      'Describe this image in EXTREME detail for recreation: exact person appearance, clothing, pose, background, lighting, camera angle. Miss nothing.',
      'high'
    )
    const combinedPrompt = `Recreate this EXACT photo: "${description}". Then make ONLY this change: ${prompt}. Everything else must remain identical.`
    return await generateImageGptImage1(combinedPrompt)
  } catch (err) {
    console.error('[imageGeneration] azure fallback image-to-image error:', err)
    return []
  }
}

// ── Image-to-Text / Analysis (Gemini primary, Azure fallback) ───────────────

/**
 * Analyze an image using Gemini vision (primary) or Azure gpt-4o (fallback).
 */
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt?: string,
  detail: 'low' | 'high' | 'auto' = 'auto'
): Promise<string> {
  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      return await analyzeImageGemini(imageBase64, mimeType, prompt)
    } catch (err) {
      console.warn('[imageGeneration] Gemini analysis failed, falling back to Azure:', err)
    }
  }

  // Azure fallback
  return await analyzeImageAzure(imageBase64, mimeType, prompt, detail)
}

/**
 * Azure gpt-4o vision fallback for image analysis.
 */
async function analyzeImageAzure(
  imageBase64: string,
  mimeType: string,
  prompt?: string,
  detail: 'low' | 'high' | 'auto' = 'auto'
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_DEPLOYMENT_NAME

  if (!endpoint || !apiKey || !deployment) {
    throw new Error('No image analysis service available (both Gemini and Azure unavailable)')
  }

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    deployment,
    apiVersion: '2024-08-01-preview',
  })

  const IMAGE_ANALYSIS_SYSTEM = `You are Viva, a wedding and cultural celebration visual expert.
Analyze images strictly in a wedding, bridal, or cultural ceremony context.
Identify: attire (lehenga, sherwani, gown, tuxedo), décor, floral arrangements, venue style, color palettes, jewelry, mehndi, table settings, cultural elements (mandap, chuppah, altar, sangeet stage).
Be concise — max 3-4 sentences. Skip unrelated details.`

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

// ── Legacy export ───────────────────────────────────────────────────────────────
export const generateImage = generateImageGptImage1
