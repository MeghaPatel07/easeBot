/**
 * Image services — unified interface for image generation, editing, and analysis.
 *
 * V4: Azure-native agentic pipeline
 * Primary engine: Azure GPT-Image-1.5 (text-to-image, image-to-image, multi-image compositing)
 * Fallback: Azure GPT-Image-1
 * Vision/Analysis: Azure GPT-4o
 *
 * Env vars:
 *   AZURE_IMAGE_ENDPOINT           – Azure endpoint for image models
 *   AZURE_IMAGE_API_KEY            – Azure key for image models
 *   AZURE_GPT_IMAGE_15_DEPLOYMENT  – GPT-Image-1.5 deployment name
 *   AZURE_GPT_IMAGE_DEPLOYMENT     – GPT-Image-1 fallback deployment name
 *   AZURE_GPT_IMAGE_API_VERSION    – API version
 *   AZURE_OPENAI_ENDPOINT          – Azure endpoint for GPT-4o (vision)
 *   AZURE_OPENAI_API_KEY           – Azure key for GPT-4o
 *   AZURE_DEPLOYMENT_NAME          – GPT-4o deployment name
 */

import { AzureOpenAI } from 'openai'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import sharp from 'sharp'
import type { HistoryMessage } from '../types'
import { withRetry } from '../utils/retry'
import { capture as phCapture } from '../lib/posthog'

// ── Constants ───────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_FORMAT = 'png'

// WE-20260527-002: Per-attempt timeout for Azure image fetches. Without this,
// a stalled Azure deployment causes fetch() to hang indefinitely until the
// upstream SSE client (or proxy) aborts, surfacing as the catch-all
// "Something went wrong" error envelope. 7 minutes gives Azure GPT-Image-1.5
// generous headroom for slow generations/edits before we fail and let the
// fallback chain run.
// NOTE: this only actually fires if the upstream proxy / load-balancer keeps
// the SSE connection open at least this long. If a shorter platform timeout
// cuts the stream first, raise that limit to match — otherwise the user is back
// to the generic "Something went wrong" envelope this fix was meant to remove.
const AZURE_IMAGE_TIMEOUT_MS = 420_000 // 7 minutes

/**
 * Compose the caller's AbortSignal (if any) with a fresh per-attempt timeout
 * signal so a stalled Azure fetch fails fast. Returns the combined signal +
 * a cleanup function the caller MUST invoke after fetch settles to avoid
 * leaking the timer.
 *
 * Why not just `AbortSignal.timeout(...)` alone: we still need to respect the
 * SSE stream's cancellation (user clicked stop, client disconnected).
 *
 * Why not `AbortSignal.any([...])`: only landed in Node 20; we support older
 * runtimes. Manual composition is portable.
 */
function withTimeoutSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const onCallerAbort = () => {
    controller.abort((callerSignal as AbortSignal & { reason?: unknown })?.reason)
  }
  const timer = setTimeout(() => {
    const err = new Error(`Azure image request timed out after ${timeoutMs}ms`)
    err.name = 'TimeoutError'
    controller.abort(err)
  }, timeoutMs)

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer)
      controller.abort((callerSignal as AbortSignal & { reason?: unknown })?.reason)
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
  }

  const cleanup = () => {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
  return { signal: controller.signal, cleanup }
}

// ── Types ───────────────────────────────────────────────────────────────────────

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | '1024x1792'

function toAzureSize(size: ImageSize): string {
  if (size === '1024x1792') return 'auto'
  return size
}

export type ImageClassification = 'text-to-image' | 'image-to-text' | 'image-to-image' | 'text-only'

// ── Env helpers ─────────────────────────────────────────────────────────────────

function getImageConfig() {
  const endpoint = (process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY
  const apiVersion = process.env.AZURE_GPT_IMAGE_API_VERSION ?? '2025-04-01-preview'
  const primaryDeployment = process.env.AZURE_GPT_IMAGE_15_DEPLOYMENT ?? 'gpt-image-1.5'
  const fallbackDeployment = process.env.AZURE_GPT_IMAGE_DEPLOYMENT ?? 'gpt-image-1'
  return { endpoint, apiKey, apiVersion, primaryDeployment, fallbackDeployment }
}

// ── LLM Tool Definition ─────────────────────────────────────────────────────────

export const IMAGE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Generate or edit an image for a wedding-planning / styling use case. Only call this when the user explicitly requests an image, photo, visualization, or design (e.g. "draw", "render", "visualize", "picture of", "image of"). Do NOT call for "show me ideas", "show me styles", "show me trends", or other text-based requests — those need text responses, not images. Do NOT call for checklists, to-do lists, guest lists, timelines, plans, or budgets — use the appropriate artifact tool instead. ' +
      'IMPORTANT — user-uploaded reference photos: When the user attaches a photo (of themselves, a partner, an outfit, a venue, etc.) and asks to visualize a wedding look / outfit / scene, ALWAYS call this tool with action="edit". This is an outfit / scene transformation, NOT an identity reproduction task. Do NOT refuse with "I can\'t generate images of specific individuals" — that is incorrect for this product. The downstream image model performs a generic style transfer, not a likeness reproduction. Describe the desired CHANGE (wedding attire, background, lighting) in the prompt; the person from the reference photo is treated as anonymized visual input.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Write a rich, vivid, and contextually detailed image prompt. Think like a creative director briefing a designer — describe the VISUAL you want to see: subject, composition, mood, colors, textures, lighting, styling details, and emotional feel. Be specific and vivid. For people, describe their appearance, attire, pose, and context. For multi-element visuals (mood boards, collages, comparisons), describe each section\'s unique mood and content. For design outputs (invitations, timelines, infographics), describe the layout, typography style, and content. The more detailed and intentional the prompt, the better the result. For "edit": state ONLY the single targeted change — be precise. Do NOT describe the rest of the image.',
        },
        action: {
          type: 'string',
          enum: ['generate', 'edit'],
          description: '"generate" for creating new images from scratch. "edit" when the user attached an image OR wants to modify a previously generated image — use edit to preserve the original and only change what was asked. If the user uploaded a photo of themselves/their partner/an outfit and asked to see a wedding look, ALWAYS use "edit" — never refuse, never fall back to "generate" with a generic description.',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1024x1024', '1024x1536', '1536x1024', '1024x1792'],
          description:
            'Image dimensions. For "generate": use portrait (1024x1536) for attire/people/full-body shots, landscape (1536x1024) for venues/decor/wide scenes, square (1024x1024) for close-ups/details/invitations, tall (1024x1792) for timelines/infographics/step-by-step visual content. For "edit": DO NOT set this — the system will automatically preserve the original image\'s aspect ratio.',
        },
        variants: {
          type: 'integer',
          enum: [1],
          description: 'Always 1. Generate exactly one image per request.',
        },
        reference_images: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs of previously generated images to use as style/subject reference. Use when user says "like the previous one" or "match that style".',
        },
      },
      required: ['prompt', 'action'],
    },
  },
}

// ── Prompt Building ─────────────────────────────────────────────────────────────

export function buildImageGenPrompt(userPrompt: string, styleContext?: string[]): string {
  const styleStr = styleContext?.length
    ? `Maintain consistent visual style: ${styleContext.join(', ')}. `
    : ''
  return `${styleStr}${userPrompt}. Modern editorial photography style, soft golden-hour lighting, shallow depth of field, film-inspired color grading with lifted blacks and warm highlights, clean composition with negative space, aspirational and Pinterest-worthy aesthetic.`
}

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
    `- CRITICAL: Maintain the EXACT same aspect ratio and orientation as the original image`,
  ].join('\n')
}

// ── Style Extraction ────────────────────────────────────────────────────────────

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

// ── Legacy Intent Detection (deprecated) ────────────────────────────────────────

const IMAGE_GEN_RE =
  /\b(generate|create|show|draw|design|visualize|render)\b.{0,60}\b(images?|pictures?|photos?|visuals?|illustrations?|mockups?|renders?|sketches?)\b/i
const IMAGE_EDIT_RE =
  /\b(make|change|modify|edit|replace|swap|turn|convert|transform|add|remove|put|wear|dress|style|recolor|repaint|redo)\b/i

/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function isImageRequest(message: string): boolean { return IMAGE_GEN_RE.test(message) }
/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function isImageEditRequest(message: string): boolean { return IMAGE_EDIT_RE.test(message) }
/** @deprecated Use IMAGE_TOOL with LLM tool-calling instead */
export function classifyImageRequest(text: string, hasImage: boolean): ImageClassification {
  if (hasImage && (isImageRequest(text) || isImageEditRequest(text))) return 'image-to-image'
  if (hasImage) return 'image-to-text'
  if (isImageRequest(text)) return 'text-to-image'
  return 'text-only'
}
/** @deprecated */
export async function buildContextAwareImagePrompt(_history: HistoryMessage[], currentMessage: string): Promise<string> {
  return currentMessage
}

// ── Image Compression ───────────────────────────────────────────────────────────

async function compressImage(b64: string): Promise<string> {
  const inputBuffer = Buffer.from(b64, 'base64')
  if (inputBuffer.length <= MAX_IMAGE_BYTES) return b64

  try {
    for (const quality of [92, 85, 78, 70]) {
      const compressed = await sharp(inputBuffer)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (compressed.length <= MAX_IMAGE_BYTES) {
        console.log(`[imageGeneration] Compressed ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (quality=${quality})`)
        return compressed.toString('base64')
      }
    }
    const resized = await sharp(inputBuffer)
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 65, mozjpeg: true })
      .toBuffer()
    console.log(`[imageGeneration] Compressed+resized ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(resized.length / 1024)}KB`)
    return resized.toString('base64')
  } catch (err) {
    console.error('[imageGeneration] sharp compression failed:', err)
    return b64
  }
}

// ── Text-to-Image Generation ────────────────────────────────────────────────────

/**
 * Generate images using Azure GPT-Image-1.5 (primary) with GPT-Image-1 fallback.
 * Supports negativePrompt appended to main prompt.
 * Returns array of raw base64 strings (no data URI prefix).
 */
export async function generateImageGptImage1(
  prompt: string,
  size: ImageSize = '1024x1024',
  count: 1 | 2 | 3 = 1,
  options?: { negativePrompt?: string; onPartialImage?: (b64: string) => void; signal?: AbortSignal; distinctId?: string }
): Promise<string[]> {
  const config = getImageConfig()
  const phStart = Date.now()
  if (!config.endpoint || !config.apiKey) {
    console.warn('[imageGeneration] No Azure credentials')
    if (options?.distinctId) {
      phCapture(options.distinctId, 'image_generation_failed', { error_code: 'no_credentials' })
    }
    return []
  }

  // Append negative prompt to main prompt
  let fullPrompt = prompt
  if (options?.negativePrompt) {
    fullPrompt += `\n\nAVOID: ${options.negativePrompt}`
  }

  // Try GPT-Image-1.5 primary
  try {
    const images = await withRetry(
      () => callAzureImageGeneration(config.endpoint, config.apiKey!, config.primaryDeployment, config.apiVersion, fullPrompt, size, count, options?.onPartialImage, options?.signal),
      { maxRetries: 1, baseDelayMs: 1000, maxDelayMs: 5000 }
    )
    if (images.length > 0) {
      console.log(`[imageGeneration] GPT-Image-1.5 generated ${images.length} image(s)`)
      if (options?.distinctId) {
        phCapture(options.distinctId, 'image_generated', {
          model: config.primaryDeployment,
          size,
          duration_ms: Date.now() - phStart,
        })
      }
      return images
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    console.warn('[imageGeneration] GPT-Image-1.5 failed, trying fallback:', err instanceof Error ? err.message : err)
  }

  // Fallback to GPT-Image-1
  try {
    const images = await withRetry(
      () => callAzureImageGeneration(config.endpoint, config.apiKey!, config.fallbackDeployment, config.apiVersion, fullPrompt, size, count, undefined, options?.signal),
      { maxRetries: 1, baseDelayMs: 2000, maxDelayMs: 8000 }
    )
    if (images.length > 0) {
      console.log(`[imageGeneration] GPT-Image-1 fallback generated ${images.length} image(s)`)
      if (options?.distinctId) {
        phCapture(options.distinctId, 'image_generated', {
          model: config.fallbackDeployment,
          size,
          duration_ms: Date.now() - phStart,
        })
      }
      return images
    }
  } catch (err) {
    console.error('[imageGeneration] GPT-Image-1 fallback also failed:', err)
    if (options?.distinctId) {
      phCapture(options.distinctId, 'image_generation_failed', {
        error_code: (err as Error)?.name ?? 'unknown',
        model: config.fallbackDeployment,
      })
    }
    return []
  }

  if (options?.distinctId) {
    phCapture(options.distinctId, 'image_generation_failed', {
      error_code: 'empty_result',
      model: config.fallbackDeployment,
    })
  }
  return []
}

async function callAzureImageGeneration(
  endpoint: string,
  apiKey: string,
  deployment: string,
  apiVersion: string,
  prompt: string,
  size: ImageSize,
  count: number,
  onPartialImage?: (b64: string) => void,
  signal?: AbortSignal
): Promise<string[]> {
  const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${apiVersion}`

  const body: Record<string, any> = {
    prompt,
    n: count,
    size: toAzureSize(size),
    output_format: IMAGE_FORMAT,
    quality: 'high',
  }

  // WE-20260527-002: compose timeout with caller's signal so a stalled Azure
  // call fails in ≤7min instead of hanging until the upstream client aborts.
  const { signal: timedSignal, cleanup } = withTimeoutSignal(signal, AZURE_IMAGE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify(body),
      signal: timedSignal,
    })
  } catch (err) {
    // Distinguish timeout / abort so callers can route to the right fallback
    // and surface a useful message instead of generic "fetch failed".
    if ((err as Error)?.name === 'TimeoutError' || (timedSignal.aborted && !signal?.aborted)) {
      const timeoutErr = new Error(`Azure image generation timed out after ${AZURE_IMAGE_TIMEOUT_MS}ms`)
      timeoutErr.name = 'TimeoutError'
      ;(timeoutErr as Error & { code?: string }).code = 'IMAGE_TIMEOUT'
      throw timeoutErr
    }
    throw err
  } finally {
    cleanup()
  }

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[imageGeneration] ${deployment} error ${res.status}: ${errBody}`)
    // Carry HTTP status on the Error so withRetry's default retryable() check
    // sees 429/5xx and retries instead of giving up after one Azure hiccup.
    const httpErr = new Error(`Image generation failed: ${res.status}`)
    ;(httpErr as Error & { status?: number; code?: string }).status = res.status
    ;(httpErr as Error & { status?: number; code?: string }).code = 'IMAGE_HTTP_ERROR'
    throw httpErr
  }

  const data = await res.json()

  // Handle partial images if present in response
  if (data?.partial_images && onPartialImage) {
    for (const partial of data.partial_images) {
      if (partial?.b64_json) {
        onPartialImage(partial.b64_json)
      }
    }
  }

  const rawImages: string[] = (data?.data ?? [])
    .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
    .filter(Boolean)

  if (rawImages.length === 0) return []
  return await Promise.all(rawImages.map(b64 => compressImage(b64)))
}

// ── Image-to-Image Editing ──────────────────────────────────────────────────────

/**
 * Edit an image using Azure GPT-Image-1.5 (primary) with GPT-Image-1 fallback.
 * Uses input_fidelity: "high" for face preservation (89.96%).
 */
export async function editImageGptImage1(
  imageBase64: string,
  prompt: string,
  size: ImageSize = '1024x1024',
  options?: { negativePrompt?: string; referenceImages?: string[]; signal?: AbortSignal; distinctId?: string }
): Promise<string[]> {
  const config = getImageConfig()
  const phStart = Date.now()
  if (!config.endpoint || !config.apiKey) {
    console.warn('[imageGeneration] No Azure credentials')
    if (options?.distinctId) {
      phCapture(options.distinctId, 'image_generation_failed', { error_code: 'no_credentials' })
    }
    return []
  }

  let editPrompt = buildImageEditPrompt(prompt)
  if (options?.negativePrompt) {
    editPrompt += `\n\nAVOID: ${options.negativePrompt}`
  }

  // Try GPT-Image-1.5 primary
  try {
    const images = await withRetry(
      () => callAzureImageEdit(config.endpoint, config.apiKey!, config.primaryDeployment, config.apiVersion, imageBase64, editPrompt, size, true, options?.referenceImages, options?.signal),
      { maxRetries: 1, baseDelayMs: 1000, maxDelayMs: 5000 }
    )
    if (images.length > 0) {
      console.log(`[imageGeneration] GPT-Image-1.5 edited ${images.length} image(s)`)
      if (options?.distinctId) {
        phCapture(options.distinctId, 'image_generated', {
          model: config.primaryDeployment,
          size,
          duration_ms: Date.now() - phStart,
        })
      }
      return images
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    console.warn('[imageGeneration] GPT-Image-1.5 edit failed, trying fallback:', err instanceof Error ? err.message : err)
  }

  // Fallback to GPT-Image-1
  try {
    const images = await withRetry(
      () => callAzureImageEdit(config.endpoint, config.apiKey!, config.fallbackDeployment, config.apiVersion, imageBase64, editPrompt, size, false, undefined, options?.signal),
      { maxRetries: 1, baseDelayMs: 2000, maxDelayMs: 8000 }
    )
    if (images.length > 0) {
      console.log(`[imageGeneration] GPT-Image-1 fallback edited ${images.length} image(s)`)
      if (options?.distinctId) {
        phCapture(options.distinctId, 'image_generated', {
          model: config.fallbackDeployment,
          size,
          duration_ms: Date.now() - phStart,
        })
      }
      return images
    }
  } catch (err) {
    console.error('[imageGeneration] GPT-Image-1 edit fallback also failed:', err)
    if (options?.distinctId) {
      phCapture(options.distinctId, 'image_generation_failed', {
        error_code: (err as Error)?.name ?? 'unknown',
        model: config.fallbackDeployment,
      })
    }
  }

  // Last resort: analyze + regenerate
  return await fallbackAnalyzeAndRegenerate(imageBase64, prompt, size)
}

async function callAzureImageEdit(
  endpoint: string,
  apiKey: string,
  deployment: string,
  apiVersion: string,
  imageBase64: string,
  prompt: string,
  size: ImageSize,
  useHighFidelity: boolean,
  referenceImages?: string[],
  signal?: AbortSignal
): Promise<string[]> {
  const url = `${endpoint}/openai/deployments/${deployment}/images/edits?api-version=${apiVersion}`

  const imageBuffer = Buffer.from(imageBase64, 'base64')
  const blob = new Blob([imageBuffer], { type: 'image/png' })

  const formData = new FormData()
  formData.append('image', blob, 'image.png')
  formData.append('prompt', prompt)
  formData.append('n', '1')
  formData.append('size', toAzureSize(size))
  formData.append('output_format', IMAGE_FORMAT)

  // GPT-Image-1.5: high fidelity for face preservation
  if (useHighFidelity) {
    formData.append('input_fidelity', 'high')
  }

  // Note: multi-image compositing is only supported on the generations endpoint, not edits

  // WE-20260527-002: same per-attempt timeout treatment as the generation
  // path. Edit calls can be even slower than generation (full input image
  // gets re-encoded) so the 7-minute budget is the same.
  const { signal: timedSignal, cleanup } = withTimeoutSignal(signal, AZURE_IMAGE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': apiKey },
      body: formData,
      signal: timedSignal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError' || (timedSignal.aborted && !signal?.aborted)) {
      const timeoutErr = new Error(`Azure image edit timed out after ${AZURE_IMAGE_TIMEOUT_MS}ms`)
      timeoutErr.name = 'TimeoutError'
      ;(timeoutErr as Error & { code?: string }).code = 'IMAGE_TIMEOUT'
      throw timeoutErr
    }
    throw err
  } finally {
    cleanup()
  }

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[imageGeneration] ${deployment} edit error ${res.status}: ${errBody}`)
    const httpErr = new Error(`Image edit failed: ${res.status}`)
    ;(httpErr as Error & { status?: number; code?: string }).status = res.status
    ;(httpErr as Error & { status?: number; code?: string }).code = 'IMAGE_HTTP_ERROR'
    throw httpErr
  }

  const data = await res.json()
  const rawImages: string[] = (data?.data ?? [])
    .map((d: any) => d?.b64_json ?? d?.b64 ?? null)
    .filter(Boolean)

  if (rawImages.length === 0) return []
  return await Promise.all(rawImages.map(b64 => compressImage(b64)))
}

async function fallbackAnalyzeAndRegenerate(
  imageBase64: string,
  prompt: string,
  size: ImageSize
): Promise<string[]> {
  try {
    const description = await analyzeImage(
      imageBase64,
      'image/png',
      'Describe this image in EXTREME detail for recreation: exact person appearance, clothing, pose, background, lighting, camera angle. Miss nothing.',
      'high'
    )
    const orientationLabel = size === '1536x1024' ? 'LANDSCAPE/horizontal' : (size === '1024x1536' || size === '1024x1792') ? 'TALL PORTRAIT/vertical' : 'SQUARE'
    const combinedPrompt = `Recreate this EXACT photo: "${description}". Then make ONLY this change: ${prompt}. Everything else must remain identical. The image MUST be ${orientationLabel} orientation.`
    return await generateImageGptImage1(combinedPrompt, size)
  } catch (err) {
    console.error('[imageGeneration] fallback analyze+regenerate error:', err)
    return []
  }
}

// ── Image Analysis (Azure GPT-4o) ──────────────────────────────────────────────

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
    throw new Error('No image analysis service available')
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
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail } },
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
