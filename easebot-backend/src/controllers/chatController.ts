import { collection, doc, getDocs, orderBy, query, limit, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Request, Response } from 'express'
import { processInbound } from '../pipeline/inbound'
import { processOutbound } from '../pipeline/outbound'
import { callAzureAI, callAzureAIWithToolResults, streamCallAzureAI, streamCallAzureAIWithToolResults, MODE_TEMPERATURES } from '../services/azureAI'
import { summarizeConversation } from '../services/conversationSummarizer'
import sharp from 'sharp'
import { IMAGE_TOOL, generateImageGptImage1, editImageGptImage1, extractStyleDescriptors, type ImageSize } from '../services/imageGeneration'
import { expandWithPromptArchitect, type PromptArchitectOutput } from '../services/promptArchitect'
import { postProcessImage } from '../services/imagePostProcessor'
import { storeMultipleImages } from '../services/imageStorage'
import { getTier as meterGetTier } from '../services/tokenMeter'
import { getRelevantProductsViaAlgolia, formatProductsContext } from '../services/algoliaProducts'
import { detectMode } from '../modeRouter'
import { getPlannerPrompt } from '../prompts/planner'
import { getStylistPrompt } from '../prompts/stylist'
// import { getTherapistPrompt } from '../prompts/therapist' // disabled
import { getKnowledgePrompt } from '../prompts/knowledge'
// import { getConsultantPrompt } from '../prompts/consultant' // disabled
import { getAssistantPrompt } from '../prompts/assistant'
import {
  executeToolCall,
  CREATE_CHECKLIST_TOOL,
  EDIT_CHECKLIST_ITEM_TOOL,
  MARK_AS_DONE_TOOL,
  GET_CHECKLIST_STATS_TOOL,
  CREATE_REMINDER_TOOL,
  CREATE_NOTE_TOOL,
  CREATE_TIMELINE_EVENT_TOOL,
} from '../services/plannerTools'
import { chargeTokens, refundTokens } from '../services/tokenMeter'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ChatPayload, ChatResponse, HistoryMessage, Mode, ToolAction, UserPersonalization } from '../types'
import { buildPersonalizationSuffix } from '../utils/toneInjector'
import { determineTargetLanguage, buildLanguageInstruction } from '../pipeline/languageInstruction'

interface UserProfileContext {
  weddingDate?: string | null
  budget?: string | number | null
  stylePreferences?: string | null
}

// ── Force-image-generation heuristics ────────────────────────────────────────
// The chat LLM (Azure GPT-4o) sometimes refuses to call generate_image when the
// user attaches a personal photo, returning a canned "I can't generate images of
// specific individuals" message instead — even though our product is designed
// for this use case and the downstream image model (GPT-Image-1.5 via edit)
// handles it fine. When we detect that situation we synthesize a generate_image
// tool call ourselves and run the image pipeline regardless of what the chat
// LLM said.

// Keywords that clearly indicate the user wants an image output. Deliberately
// broad — we only use this check alongside the "user uploaded a photo" gate, so
// false positives are inert (no photo → no forced tool call).
const IMAGE_INTENT_RE = /\b(draw|render|generate\s+(?:an?\s+)?(?:image|picture|photo)|visualize|illustrate|mood\s?board|picture\s+of|image\s+of)\b/i

// Patterns in the chat LLM's text response that identify a refusal. When any of
// these match and the user attached a photo, we override the refusal.
const REFUSAL_RE =
  /(can['\u2019]?t\s+(?:generate|create|recreate|produce|make)|cannot\s+(?:generate|create|recreate|produce|make)|unable\s+to\s+(?:generate|create|recreate)|specific\s+individuals?|image[s]?\s+of\s+(?:a\s+)?real\s+(?:person|people)|recreate\s+(?:a|the)?\s*person|likeness|identifiable\s+(?:person|individual))/i

function shouldForceImageGeneration(params: {
  hasVisionData: boolean
  userMessage: string
  llmText: string
  alreadyToolCalled: boolean
}): boolean {
  if (!params.hasVisionData) return false
  if (params.alreadyToolCalled) return false
  // Case A: user message clearly asks for an image
  if (IMAGE_INTENT_RE.test(params.userMessage)) return true
  // Case B: LLM returned a refusal string
  if (REFUSAL_RE.test(params.llmText)) return true
  return false
}

// Build the synthesized tool-call payload used when we force image generation.
// The prompt is written as an edit instruction so the image service treats the
// attached photo as the reference and applies the user's requested change.
function buildForcedImageToolCall(
  userMessage: string,
): { id: string; name: string; args: Record<string, any> } {
  const trimmed = (userMessage || '').trim()
  const editInstruction = trimmed.length > 0
    ? `Wedding visualization edit: ${trimmed}. Apply the user's requested change to the attached photo as an outfit/scene transformation. Modern editorial wedding photography style, elegant styling, soft golden-hour lighting.`
    : 'Wedding visualization edit: transform the attached photo into a polished wedding scene with elegant attire, soft golden-hour lighting, and modern editorial wedding photography style.'
  return {
    id: `forced_img_${Date.now()}`,
    name: 'generate_image',
    args: {
      prompt: editInstruction,
      action: 'edit',
    },
  }
}

// ── Vibe Mode helpers ────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildVibeId(vibeTitle?: string | null): string | null {
  if (!vibeTitle) return null
  const slug = slugify(vibeTitle)
  return slug ? `vibe-${slug}` : null
}

function buildVibeSystemSuffix(vibeTitle?: string, vibeDescriptors?: string[]): string {
  if (!vibeTitle || !vibeDescriptors || vibeDescriptors.length === 0) return ''
  return `\nThe user has locked in a wedding vibe: '${vibeTitle}'. Style descriptors: ${vibeDescriptors.join(', ')}. ALL images generated in this turn MUST reflect this vibe — weave the descriptors into the visual output.`
}

function buildForceImageSuffix(force?: boolean): string {
  if (!force) return ''
  return `\nIMPORTANT: The user is in the Images Hub — call the generate_image tool for this turn to produce an image that satisfies their request.`
}

// Per-mode tool binding. IMAGE_TOOL is always available for logged-in users.
// Guest users get no tools. Each mode gets a curated artifact tool set.
function getToolsForMode(mode: string, isLoggedIn: boolean): ChatCompletionTool[] {
  if (!isLoggedIn) return []
  const base: ChatCompletionTool[] = [IMAGE_TOOL]
  switch (mode) {
    case 'planner':
    case 'assistant':
      return [
        ...base,
        CREATE_CHECKLIST_TOOL,
        CREATE_REMINDER_TOOL,
        CREATE_TIMELINE_EVENT_TOOL,
        CREATE_NOTE_TOOL,
        EDIT_CHECKLIST_ITEM_TOOL,
        MARK_AS_DONE_TOOL,
        GET_CHECKLIST_STATS_TOOL,
      ]
    case 'stylist':
    // case 'therapist': // disabled
    case 'knowledge':
      return [...base, CREATE_NOTE_TOOL]
    // case 'consultant': // disabled
    //   return [...base, CREATE_NOTE_TOOL, CREATE_REMINDER_TOOL]
    default:
      return [...base, CREATE_NOTE_TOOL]
  }
}

function buildUserContextSuffix(profile?: UserProfileContext | null): string {
  if (!profile) return ''
  const parts: string[] = []
  if (profile.weddingDate) {
    parts.push(`The user's wedding is on ${profile.weddingDate}.`)
  }
  if (profile.budget) {
    parts.push(`The user's budget is ${profile.budget}.`)
  }
  if (profile.stylePreferences) {
    parts.push(`The user's style preferences: ${profile.stylePreferences}.`)
  }
  return parts.length > 0 ? '\n' + parts.join(' ') : ''
}

function buildGroundingContext(mode: Mode, userProfile: UserProfileContext | null): string {
  const parts: string[] = []

  if (userProfile?.weddingDate) {
    const month = new Date(userProfile.weddingDate).getMonth()
    if (month >= 11 || month <= 1) parts.push('Winter wedding: warm golden lighting, rich velvet/brocade textures, deep jewel tones, evergreen accents, candlelit ambiance')
    else if (month >= 2 && month <= 4) parts.push('Spring wedding: soft natural light, pastel florals, light fabrics, cherry blossom/lavender accents, garden feel')
    else if (month >= 5 && month <= 7) parts.push('Summer wedding: bright golden-hour light, airy fabrics, tropical florals, vibrant colors')
    else parts.push('Autumn wedding: warm amber light, rustic textures, burgundy/burnt orange palette, harvest florals')
  }

  if (userProfile?.budget) {
    const budget = Number(userProfile.budget)
    if (budget > 50000) parts.push('Luxury tier: designer labels, premium fabrics, crystal/diamond accents, editorial quality')
    else if (budget > 20000) parts.push('Mid-range: quality fabrics, tasteful details, elegant but not ostentatious')
    else parts.push('Budget-conscious: creative styling, DIY-friendly aesthetics, meaningful over expensive')
  }

  if (userProfile?.stylePreferences) {
    parts.push(`User style: ${userProfile.stylePreferences}`)
  }

  return parts.join('. ')
}

/**
 * Result of `buildSystemPrompt`: the composed prompt plus a flag indicating
 * whether an algolia query was executed. The caller uses this flag to charge
 * algolia via the normal post-Azure reconcile path (P0-2).
 */
interface SystemPromptResult {
  prompt: string
  algoliaQueried: boolean
}

// Detect if the user is explicitly asking for product/shopping recommendations.
// General inspiration, idea, or advice requests should NOT trigger product injection.
const PRODUCT_INTENT_RE = /\b(show me products?|recommend\s+(?:a |some )?products?|product\s+(?:ideas?|suggestions?|recommendations?)|shop(?:ping)?|buy|purchase|where (?:can i|to) (?:buy|get|find)|suggest\s+(?:a |some )?(?:bags?|clutch|purse|lehenga|dress|gown|saree|ring|jewelry|necklace|earring|outfit|sherwani|kurta))\b/i

function hasProductIntent(userMessage: string): boolean {
  return PRODUCT_INTENT_RE.test(userMessage)
}

async function buildSystemPrompt(
  mode: Mode,
  userMessage: string,
  userRole?: string | null,
  personalization?: UserPersonalization,
  userProfile?: UserProfileContext | null,
): Promise<SystemPromptResult> {
  const userContext = buildUserContextSuffix(userProfile)

  if (mode === 'stylist') {
    // Only fetch products when user explicitly asks for product recommendations.
    // General "give me ideas" or "inspire me" messages should get creative
    // styling advice, not a product catalogue listing.
    if (hasProductIntent(userMessage)) {
      try {
        const products = await getRelevantProductsViaAlgolia(userMessage)
        const context = formatProductsContext(products)
        return {
          prompt: getStylistPrompt(context) + buildPersonalizationSuffix(personalization) + userContext,
          algoliaQueried: true,
        }
      } catch {
        return {
          prompt: getStylistPrompt() + buildPersonalizationSuffix(personalization) + userContext,
          algoliaQueried: false,
        }
      }
    }
    return {
      prompt: getStylistPrompt() + buildPersonalizationSuffix(personalization) + userContext,
      algoliaQueried: false,
    }
  }
  switch (mode) {
    case 'planner':
      return {
        prompt: getPlannerPrompt(userRole) + buildPersonalizationSuffix(personalization) + userContext,
        algoliaQueried: false,
      }
    // case 'therapist': disabled
    case 'knowledge':
      return {
        prompt: getKnowledgePrompt() + buildPersonalizationSuffix(personalization) + userContext,
        algoliaQueried: false,
      }
    // case 'consultant': disabled
    default:
      return {
        prompt: getAssistantPrompt() + buildPersonalizationSuffix(personalization) + userContext,
        algoliaQueried: false,
      }
  }
}

async function getChatHistory(
  threadId: string | undefined,
  providedHistory: HistoryMessage[] | undefined,
  historyLimit = 10
): Promise<HistoryMessage[]> {
  if (!threadId && providedHistory && providedHistory.length > 0) {
    return providedHistory.slice(-historyLimit)
  }
  if (threadId) {
    const q = query(
      collection(db, 'chats', threadId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(historyLimit)
    )
    const snap = await getDocs(q)
    return snap.docs
      .reverse()
      .map(d => ({ role: d.data().role as 'user' | 'assistant', content: d.data().content as string }))
  }
  return []
}

// ── Image tool call handler ─────────────────────────────────────────────────────

interface ImageToolResult {
  result: string
  action: ToolAction
  imageUrls: string[]
  styleDescriptors: string[]
  styleMemory?: import('../types').StyleMemory
}

/**
 * Detect the aspect ratio of a source image and return the closest supported size.
 * This ensures edits preserve the original image's orientation and proportions.
 */
async function detectImageAspectRatio(imageBase64: string): Promise<ImageSize> {
  try {
    const buffer = Buffer.from(imageBase64, 'base64')
    const metadata = await sharp(buffer).metadata()
    const w = metadata.width ?? 1024
    const h = metadata.height ?? 1024
    const ratio = w / h

    // ratio > 1.15 → landscape, ratio < 0.85 → portrait, else square
    if (ratio > 1.15) return '1536x1024'      // landscape
    if (ratio < 0.85) return '1024x1536'       // portrait
    return '1024x1024'                          // square
  } catch (err) {
    console.warn('[chatController] Could not detect image aspect ratio, defaulting to 1024x1024:', err)
    return '1024x1024'
  }
}

async function handleImageToolCall(
  args: Record<string, any>,
  opts: {
    uid: string | null
    isLoggedIn: boolean
    isPremium: boolean
    imageBase64?: string
    lastGeneratedImageUrl?: string
    mode: Mode
    threadId?: string
    styleMemory?: import('../types').StyleMemory
    userProfile?: UserProfileContext | null
    onPartialImage?: (b64: string) => void
    preferredAspectRatio?: ImageSize
    vibeTitle?: string
    vibeDescriptors?: string[]
    signal?: AbortSignal
  }
): Promise<ImageToolResult> {
  const imgPrompt = args.prompt as string
  const imgAction = (args.action as string) ?? 'generate'
  // The user's preferredAspectRatio (from the Images Hub) is authoritative;
  // override the LLM-chosen size before invoking the image API.
  if (opts.preferredAspectRatio) {
    args.aspect_ratio = opts.preferredAspectRatio
  }
  const llmChosenSize = (args.aspect_ratio as ImageSize) ?? '1024x1024'
  const imgVariants = 1 // Always generate exactly 1 image

  // ── Stage 2+3: Prompt Architect (Thinking Mode + Domain Grounding) ──────
  const groundingContext = buildGroundingContext(opts.mode, opts.userProfile ?? null)
  let architectOutput: PromptArchitectOutput | null = null

  try {
    architectOutput = await expandWithPromptArchitect({
      userIntent: imgPrompt,
      action: imgAction as 'generate' | 'edit',
      mode: opts.mode,
      aspectRatio: llmChosenSize,
      styleHistory: opts.styleMemory?.descriptors ?? [],
      referenceImageBase64: opts.imageBase64,
      referenceImageMime: 'image/png',
      userProfile: opts.userProfile ?? undefined,
      groundingContext,
      vibeDescriptors: opts.vibeDescriptors,
    })
    console.log(`[chatController] Prompt Architect expanded: ${architectOutput.expandedPrompt.length} chars, quality=${architectOutput.qualityTier}`)
  } catch (err) {
    console.error('[chatController] Prompt Architect failed, using raw prompt:', err)
  }

  // Use expanded prompt if available, otherwise raw
  const finalPrompt = architectOutput?.expandedPrompt ?? imgPrompt
  const negativePrompt = architectOutput?.negativePrompt

  // Token-meter will enforce at charge time via tokenMeter; no pre-check here.
  // Legacy imageQuota removed in Sprint 2.

  let base64Images: string[] = []

  if (opts.imageBase64) {
    const sourceSize = await detectImageAspectRatio(opts.imageBase64)
    console.log(`[chatController] User attached image → edit mode | source=${sourceSize}, llm_wanted=${llmChosenSize}`)
    base64Images = await editImageGptImage1(opts.imageBase64, finalPrompt, sourceSize, { negativePrompt, referenceImages: args.reference_images, signal: opts.signal })
  } else if (imgAction === 'edit' && opts.lastGeneratedImageUrl) {
    try {
      console.log('[chatController] Iterative edit → fetching previous image from URL')
      const imgRes = await fetch(opts.lastGeneratedImageUrl, { signal: opts.signal })
      const imgBuf = Buffer.from(await imgRes.arrayBuffer())
      const sourceBase64 = imgBuf.toString('base64')
      const sourceSize = await detectImageAspectRatio(sourceBase64)
      console.log(`[chatController] Iterative edit | source=${sourceSize}, llm_wanted=${llmChosenSize}`)
      base64Images = await editImageGptImage1(sourceBase64, finalPrompt, sourceSize, { negativePrompt, signal: opts.signal })
    } catch (fetchErr) {
      if ((fetchErr as Error).name === 'AbortError') throw fetchErr
      console.error('[chatController] Failed to fetch lastGeneratedImageUrl, falling back to generate:', fetchErr)
      base64Images = await generateImageGptImage1(finalPrompt, llmChosenSize, imgVariants as 1 | 2 | 3, { negativePrompt, onPartialImage: opts.onPartialImage, signal: opts.signal })
    }
  } else {
    base64Images = await generateImageGptImage1(finalPrompt, llmChosenSize, imgVariants as 1 | 2 | 3, { negativePrompt, onPartialImage: opts.onPartialImage, signal: opts.signal })
  }

  // Track which size was actually used for storage metadata
  const imgSize = llmChosenSize // Overridden above for edit paths via sourceSize

  // ── Stage 6: Post-Processing ──────────────────────────────────────────────
  if (base64Images.length > 0) {
    base64Images = await Promise.all(
      base64Images.map(b64 => postProcessImage(b64, {
        upscale: opts.isPremium,
        outputFormat: 'png',
      }))
    )
  }

  if (base64Images.length === 0) {
    return {
      result: 'Image generation failed. The service may be temporarily unavailable.',
      action: { tool: 'generate_image', imagePrompt: finalPrompt },
      imageUrls: [],
      styleDescriptors: [],
    }
  }

  // If client disconnected during generation, skip storage
  if (opts.signal?.aborted) {
    console.log('[chatController] Client disconnected, skipping image storage')
    return {
      result: 'Image generation was cancelled.',
      action: { tool: 'generate_image', imagePrompt: finalPrompt },
      imageUrls: [],
      styleDescriptors: [],
    }
  }

  // Store images (for logged-in users)
  let imageUrls: string[] = []
  if (opts.isLoggedIn && opts.uid) {
    const stored = await storeMultipleImages(base64Images, opts.uid, {
      prompt: imgPrompt,
      enhancedPrompt: imgPrompt,
      mode: opts.mode,
      threadId: opts.threadId || null,
      aspectRatio: imgSize,
      type: imgAction === 'edit' ? 'edited' : 'generated',
      vibeId: buildVibeId(opts.vibeTitle),
      vibeDescriptors: opts.vibeDescriptors && opts.vibeDescriptors.length > 0 ? opts.vibeDescriptors : null,
    })
    imageUrls = stored.map(s => s.url)
    try {
      const tier = await meterGetTier(opts.uid)
      await chargeTokens(
        { kind: 'user', id: opts.uid, tier },
        { kind: 'image', quality: 'standard', count: base64Images.length },
      )
    } catch (err) {
      console.error('[chatController] image token charge failed', err)
    }
  } else {
    // Guest users: return data URIs (no storage)
    imageUrls = base64Images.map(b64 => `data:image/png;base64,${b64}`)
  }

  // Extract style descriptors for consistency
  const styleDescriptors = extractStyleDescriptors(finalPrompt)
  const architectDescriptors = architectOutput?.styleDescriptors ?? []
  const mergedDescriptors = [...new Set([...styleDescriptors, ...architectDescriptors])].slice(0, 20)

  // Build updated style memory
  const updatedStyleMemory: import('../types').StyleMemory = {
    descriptors: [...new Set([...(opts.styleMemory?.descriptors ?? []), ...mergedDescriptors])].slice(0, 20),
    colorPalette: opts.styleMemory?.colorPalette ?? [],
    aestheticRegister: opts.styleMemory?.aestheticRegister ?? '',
    culturalContext: opts.styleMemory?.culturalContext ?? '',
    lastGeneratedImageUrl: imageUrls[0] ?? null,
  }

  return {
    result: `Image${imageUrls.length > 1 ? 's' : ''} generated successfully. ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''} created.`,
    action: {
      tool: 'generate_image',
      imagePrompt: finalPrompt,
      imageAction: imgAction as any,
      imageAspectRatio: imgSize,
      imageVariants: imageUrls.length,
    },
    imageUrls,
    styleDescriptors: mergedDescriptors,
    styleMemory: updatedStyleMemory,
  }
}

// ── Non-streaming chat handler ──────────────────────────────────────────────────

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization, imageBase64, imageMimeType, lastGeneratedImageUrl, styleMemory, forceImageGeneration, preferredAspectRatio, vibeTitle, vibeDescriptors } = req.body as ChatPayload

  if (!message && !audioBase64 && !imageBase64) {
    res.status(400).json({ error: 'message, audioBase64, or imageBase64 is required' })
    return
  }

  const uid = req.user?.uid ?? null
  const isLoggedIn = uid !== null

  // P0-1: hoisted refund tracking — see streaming handler for rationale.
  let chargedTokens = 0
  let chargedConsumedFrom: 'monthly' | 'extras' | 'both' | null = null

  try {
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, language)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory)

    // Fetch user profile for premium status, role, and context
    let isPremium = false
    let userRole: string | null = null
    let userProfile: UserProfileContext | null = null
    if (isLoggedIn) {
      const profileSnap = await getDoc(doc(db, 'users', uid))
      if (profileSnap.exists()) {
        const data = profileSnap.data()
        isPremium = data.isPremium ?? false
        userRole = data.role ?? null
        userProfile = {
          weddingDate: data.weddingDate ?? null,
          budget: data.budget ?? null,
          stylePreferences: data.stylePreferences ?? null,
        }
      }
    }

    const targetLanguage = determineTargetLanguage(language, detectedLanguage)
    const { prompt: baseSystemPrompt, algoliaQueried } = await buildSystemPrompt(
      mode,
      englishText,
      userRole,
      userPersonalization,
      userProfile,
    )
    const systemPrompt =
      baseSystemPrompt +
      buildLanguageInstruction(targetLanguage) +
      buildVibeSystemSuffix(vibeTitle, vibeDescriptors) +
      buildForceImageSuffix(forceImageGeneration)

    // Conversation summarization: compress older messages when history is long
    let effectiveHistory = history
    if (history.length > 10) {
      try {
        const olderMessages = history.slice(0, history.length - 5)
        const recentMessages = history.slice(history.length - 5)
        const { getClient } = await import('../services/azureAI')
        const summary = await summarizeConversation(olderMessages, getClient())
        effectiveHistory = [
          { role: 'assistant' as const, content: `[Previous conversation summary]: ${summary}` },
          ...recentMessages,
        ]
      } catch (err) {
        console.error('[chatController] summarization failed, using full history:', err)
        // Fall back to full history on error
      }
    }

    // Resolve mode-specific temperature
    const temperature = MODE_TEMPERATURES[mode] ?? 0.7

    // Build tools array — per-mode curated tool set. IMAGE_TOOL is always in base.
    const tools: ChatCompletionTool[] = getToolsForMode(mode, isLoggedIn)
    // Guest users still get IMAGE_TOOL for image requests (mode-agnostic).
    if (!isLoggedIn && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.push(IMAGE_TOOL)
    }
    if (forceImageGeneration && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.unshift(IMAGE_TOOL)
    }

    // Pass user-attached image as vision data so LLM can see it
    const visionData = (imageBase64 && imageMimeType) ? { base64: imageBase64, mimeType: imageMimeType } : undefined
    // P0-3: count actual vision image parts so we charge what we sent.
    const visionImageCount = visionData ? 1 : 0

    const aiResult = await callAzureAI(effectiveHistory, englishText, systemPrompt, tools, visionData, temperature)

    // Post-call reconciliation. We charge directly (instead of via the
    // quotaCtx.reconcile closure) so we can observe the ChargeResult and
    // capture tokensCharged / consumedFrom — needed by P0-1 refund on catch.
    console.log(`[chatController] usage — isLoggedIn=${isLoggedIn} uid=${uid} usage=`, aiResult.usage)
    if (req.quotaContext) {
      const ctx = req.quotaContext
      if (!ctx._reconciled) {
        ctx._reconciled = true
        try {
          const chatResult = await chargeTokens(ctx.subject, {
            kind: 'chat',
            promptTokens: aiResult.usage?.promptTokens ?? 0,
            completionTokens: aiResult.usage?.completionTokens ?? 0,
          })
          if (chatResult.allowed && chatResult.tokensCharged > 0 && chatResult.consumedFrom !== 'none') {
            chargedTokens += chatResult.tokensCharged
            chargedConsumedFrom = chatResult.consumedFrom
            try {
              if (!res.headersSent) {
                res.setHeader('X-Easebot-Tokens-Charged', String(chatResult.tokensCharged))
                res.setHeader('X-Easebot-Remaining-Monthly', String(chatResult.remainingMonthly))
                res.setHeader('X-Easebot-Remaining-Daily', String(chatResult.remainingDaily))
              }
            } catch {
              // headers already sent — fine.
            }
          } else if (!chatResult.allowed) {
            console.warn('[chatController] chat reconcile denied post-call', {
              uid,
              reason: chatResult.reason,
            })
          }
        } catch (err) {
          console.error('[chatController] reconcile failed', err)
        }
      }

      // P0-2: charge algolia here (not inside buildSystemPrompt) so the
      // pessimistic estimate gate remains authoritative.
      if (algoliaQueried) {
        try {
          const algoliaResult = await chargeTokens(ctx.subject, {
            kind: 'algolia',
            queries: 1,
          })
          if (algoliaResult.allowed && algoliaResult.tokensCharged > 0 && algoliaResult.consumedFrom !== 'none') {
            chargedTokens += algoliaResult.tokensCharged
            if (chargedConsumedFrom && chargedConsumedFrom !== algoliaResult.consumedFrom) {
              chargedConsumedFrom = 'both'
            } else {
              chargedConsumedFrom = algoliaResult.consumedFrom
            }
          } else if (!algoliaResult.allowed) {
            console.warn('[tokenMeter] algolia charge denied post-call', {
              uid,
              reason: algoliaResult.reason,
            })
          }
        } catch (err) {
          console.warn('[chatController] algolia charge threw (swallowed)', err)
        }
      }

      // P0-3: await the vision charge and log its outcome instead of
      // fire-and-forgetting. The HTTP response is not yet sent here, but we
      // still accept that a denial post-call is logged rather than surfaced.
      if (visionData && visionImageCount > 0) {
        try {
          const visionResult = await chargeTokens(ctx.subject, {
            kind: 'vision',
            imageCount: visionImageCount,
          })
          if (visionResult.allowed && visionResult.tokensCharged > 0 && visionResult.consumedFrom !== 'none') {
            chargedTokens += visionResult.tokensCharged
            if (chargedConsumedFrom && chargedConsumedFrom !== visionResult.consumedFrom) {
              chargedConsumedFrom = 'both'
            } else {
              chargedConsumedFrom = visionResult.consumedFrom
            }
          } else if (!visionResult.allowed) {
            console.warn('[tokenMeter] vision charge denied post-call', {
              uid,
              reason: visionResult.reason,
              imageCount: visionImageCount,
            })
          }
        } catch (err) {
          console.warn('[chatController] vision charge threw (swallowed)', err)
        }
      }
    }

    const toolActions: ToolAction[] = []
    let finalAiText = aiResult.text
    let imageUrls: string[] = []
    let imageToolStyleMemory: import('../types').StyleMemory | undefined

    // Images Hub: if the caller explicitly forced image generation and the LLM
    // didn't call the tool, synthesize a generate_image tool call.
    if (forceImageGeneration && aiResult.toolCalls.length === 0) {
      aiResult.toolCalls.push({
        id: `forced_img_${Date.now()}`,
        name: 'generate_image',
        args: {
          prompt: englishText,
          action: imageBase64 ? 'edit' : 'generate',
          aspect_ratio: preferredAspectRatio ?? '1024x1024',
        },
      })
      finalAiText = ''
    }

    // Execute tool calls if any
    if (aiResult.toolCalls.length > 0) {
      const toolResults: { id: string; result: string }[] = []

      for (const tc of aiResult.toolCalls) {
        // Handle generate_image inline (needs image-specific context)
        if (tc.name === 'generate_image') {
          const imgResult = await handleImageToolCall(tc.args, {
            uid,
            isLoggedIn,
            isPremium,
            imageBase64,
            lastGeneratedImageUrl,
            mode,
            threadId,
            userProfile,
            styleMemory: styleMemory ?? undefined,
            preferredAspectRatio,
            vibeTitle,
            vibeDescriptors,
          })
          toolActions.push(imgResult.action)
          imageUrls = imgResult.imageUrls
          imageToolStyleMemory = imgResult.styleMemory
          toolResults.push({ id: tc.id, result: imgResult.result })
          continue
        }

        // Planner tools (logged-in only)
        if (!isLoggedIn) continue

        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)

        if (outcome.result === 'STORAGE_LIMIT_REACHED') {
          const { text: limitText, audioUrl } = await processOutbound(
            "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!",
            detectedLanguage
          )
          res.status(200).json({
            text: limitText,
            audioUrl,
            imageUrl: null,
            imageUrls: undefined,
            toolActions,
            mode,
            detectedLanguage,
          } as ChatResponse)
          return
        }

        toolResults.push({ id: tc.id, result: outcome.result })
      }

      // Second LLM call to get user-facing reply with tool results injected
      if (toolResults.length > 0) {
        finalAiText = await callAzureAIWithToolResults(
          history, englishText, systemPrompt, aiResult.toolCalls, toolResults
        )
      }
    }

    const { text: finalText, audioUrl } = await processOutbound(finalAiText, detectedLanguage)

    // responseLanguage = the language the AI actually responded in.
    // When targetLanguage is non-English the LLM was instructed to respond in
    // that language, so we trust it. Falls back to detectedLanguage (input lang).
    const responseLanguage = targetLanguage !== 'en' ? targetLanguage : detectedLanguage

    const response: ChatResponse = {
      text: finalText,
      audioUrl,
      imageUrl: imageUrls[0] ?? null,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      toolActions,
      mode,
      detectedLanguage,
      responseLanguage,
      styleMemory: imageToolStyleMemory,
    }
    res.status(200).json(response)
  } catch (err: any) {
    console.error('[chatController]', err)
    // P0-1: if reconcile already debited before the failure, refund.
    if (chargedTokens > 0 && chargedConsumedFrom && req.quotaContext?.subject) {
      try {
        await refundTokens(
          req.quotaContext.subject,
          chargedTokens,
          chargedConsumedFrom,
          'chat',
        )
      } catch (refundErr) {
        console.warn('[chatController] refund on handler error failed (swallowed)', {
          uid: req.quotaContext.subject.id,
          chargedTokens,
          chargedConsumedFrom,
          err: refundErr instanceof Error ? refundErr.message : String(refundErr),
        })
      }
    }
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}

// ── Streaming chat handler (SSE) ──────────────────────────────────────────────
export async function handleChatStream(req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sse = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Abort controller for cancelling in-progress work (image generation, etc.)
  // when the client disconnects or stops generation.
  const streamAbort = new AbortController()
  req.on('close', () => { streamAbort.abort() })

  // P0-1: hoisted so the outer catch can refund if the stream throws after
  // we have already debited tokens.
  let chargedTokens = 0
  let chargedConsumedFrom: 'monthly' | 'extras' | 'both' | null = null

  try {
    const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization, imageBase64, imageMimeType, lastGeneratedImageUrl, styleMemory, forceImageGeneration, preferredAspectRatio, vibeTitle, vibeDescriptors } = req.body as ChatPayload

    if (!message && !audioBase64 && !imageBase64) {
      sse({ t: 'e', msg: 'message, audioBase64, or imageBase64 is required' })
      res.end(); return
    }

    const uid = req.user?.uid ?? null
    const isLoggedIn = uid !== null

    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, language)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory)

    let isPremium = false
    let userRole: string | null = null
    let userProfile: UserProfileContext | null = null
    if (isLoggedIn) {
      const profileSnap = await getDoc(doc(db, 'users', uid))
      if (profileSnap.exists()) {
        const data = profileSnap.data()
        isPremium = data.isPremium ?? false
        userRole = data.role ?? null
        userProfile = {
          weddingDate: data.weddingDate ?? null,
          budget: data.budget ?? null,
          stylePreferences: data.stylePreferences ?? null,
        }
      }
    }

    const targetLanguage = determineTargetLanguage(language, detectedLanguage)
    const { prompt: baseSystemPrompt, algoliaQueried } = await buildSystemPrompt(
      mode,
      englishText,
      userRole,
      userPersonalization,
      userProfile,
    )
    const systemPrompt =
      baseSystemPrompt +
      buildLanguageInstruction(targetLanguage) +
      buildVibeSystemSuffix(vibeTitle, vibeDescriptors) +
      buildForceImageSuffix(forceImageGeneration)

    // Conversation summarization: compress older messages when history is long
    let effectiveHistory = history
    if (history.length > 10) {
      try {
        const olderMessages = history.slice(0, history.length - 5)
        const recentMessages = history.slice(history.length - 5)
        const { getClient } = await import('../services/azureAI')
        const summary = await summarizeConversation(olderMessages, getClient())
        effectiveHistory = [
          { role: 'assistant' as const, content: `[Previous conversation summary]: ${summary}` },
          ...recentMessages,
        ]
      } catch (err) {
        console.error('[chatController:stream] summarization failed, using full history:', err)
      }
    }

    // Resolve mode-specific temperature
    const temperature = MODE_TEMPERATURES[mode] ?? 0.7

    // Build tools array — per-mode curated tool set. IMAGE_TOOL is always in base.
    const tools: ChatCompletionTool[] = getToolsForMode(mode, isLoggedIn)
    // Guest users still get IMAGE_TOOL for image requests (mode-agnostic).
    if (!isLoggedIn && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.push(IMAGE_TOOL)
    }
    if (forceImageGeneration && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.unshift(IMAGE_TOOL)
    }

    // Pass user-attached image as vision data so LLM can see it
    const visionData = (imageBase64 && imageMimeType) ? { base64: imageBase64, mimeType: imageMimeType } : undefined
    // P0-3: actual vision image count (currently vision is single-image per turn).
    const visionImageCount = visionData ? 1 : 0

    const toolActions: ToolAction[] = []
    let imageUrls: string[] = []
    let imageToolStyleMemory: import('../types').StyleMemory | undefined
    let fullText = ''

    // P0-1: `chargedTokens` and `chargedConsumedFrom` are hoisted above the
    // try block so the outer catch can refund them. Updated only on a
    // successful charge (allowed === true).

    // ── Stream first LLM call ────────────────────────────────────────────────
    let firstPassToolCalls: { id: string; name: string; args: Record<string, any> }[] = []
    let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

    for await (const event of streamCallAzureAI(effectiveHistory, englishText, systemPrompt, tools, visionData, temperature)) {
      if (event.type === 'chunk') {
        sse({ t: 'c', v: event.text })
        fullText += event.text
      } else {
        firstPassToolCalls = event.toolCalls
        streamUsage = event.usage
      }
    }

    console.log(`[chatController:stream] usage — isLoggedIn=${isLoggedIn} uid=${uid} usage=`, streamUsage)
    if (req.quotaContext) {
      // P0-1: charge chat directly (not via the reconcile closure) so we can
      // observe the ChargeResult and capture tokensCharged / consumedFrom for
      // a later refund if the stream blows up after this point.
      const ctx = req.quotaContext
      if (!ctx._reconciled) {
        ctx._reconciled = true
        try {
          const chatResult = await chargeTokens(ctx.subject, {
            kind: 'chat',
            promptTokens: streamUsage?.promptTokens ?? 0,
            completionTokens: streamUsage?.completionTokens ?? 0,
          })
          if (chatResult.allowed && chatResult.tokensCharged > 0 && chatResult.consumedFrom !== 'none') {
            chargedTokens += chatResult.tokensCharged
            chargedConsumedFrom = chatResult.consumedFrom
            try {
              if (!res.headersSent) {
                res.setHeader('X-Easebot-Tokens-Charged', String(chatResult.tokensCharged))
                res.setHeader('X-Easebot-Remaining-Monthly', String(chatResult.remainingMonthly))
                res.setHeader('X-Easebot-Remaining-Daily', String(chatResult.remainingDaily))
              }
            } catch {
              // headers already sent mid-stream is expected; ignore.
            }
          } else if (!chatResult.allowed) {
            console.warn('[chatController:stream] chat reconcile denied post-call', {
              uid,
              reason: chatResult.reason,
            })
          }
        } catch (err) {
          console.error('[chatController:stream] reconcile failed', err)
        }
      }

      // P0-2: algolia charge moved out of buildSystemPrompt; charge it here
      // alongside the chat reconcile. Estimate already reserved room.
      if (algoliaQueried) {
        try {
          const algoliaResult = await chargeTokens(req.quotaContext.subject, {
            kind: 'algolia',
            queries: 1,
          })
          if (algoliaResult.allowed && algoliaResult.tokensCharged > 0 && algoliaResult.consumedFrom !== 'none') {
            chargedTokens += algoliaResult.tokensCharged
            // If we already captured a consumedFrom, promote to 'both' when
            // the dimensions differ. This is conservative: the refund helper
            // handles 'both' safely.
            if (chargedConsumedFrom && chargedConsumedFrom !== algoliaResult.consumedFrom) {
              chargedConsumedFrom = 'both'
            } else {
              chargedConsumedFrom = algoliaResult.consumedFrom
            }
          } else if (!algoliaResult.allowed) {
            console.warn('[tokenMeter] algolia charge denied post-call', {
              uid,
              reason: algoliaResult.reason,
            })
          }
        } catch (err) {
          console.warn('[chatController:stream] algolia charge threw (swallowed)', err)
        }
      }

      // P0-3: await vision charge and log outcome. Use the real image count.
      if (visionData && visionImageCount > 0) {
        try {
          const visionResult = await chargeTokens(req.quotaContext.subject, {
            kind: 'vision',
            imageCount: visionImageCount,
          })
          if (visionResult.allowed && visionResult.tokensCharged > 0 && visionResult.consumedFrom !== 'none') {
            chargedTokens += visionResult.tokensCharged
            if (chargedConsumedFrom && chargedConsumedFrom !== visionResult.consumedFrom) {
              chargedConsumedFrom = 'both'
            } else {
              chargedConsumedFrom = visionResult.consumedFrom
            }
          } else if (!visionResult.allowed) {
            console.warn('[tokenMeter] vision charge denied post-call', {
              uid,
              reason: visionResult.reason,
              imageCount: visionImageCount,
            })
          }
        } catch (err) {
          console.warn('[chatController:stream] vision charge threw (swallowed)', err)
        }
      }
    }

    // ── Force-image-generation fallback ──────────────────────────────────────
    // If the user attached a photo and asked for a wedding visualization, but
    // the chat LLM refused (or just skipped the tool call and answered with
    // plain text), override its decision and invoke generate_image ourselves.
    // This is a product-level policy: uploaded-photo + image-intent ⇒ edit.
    // Explicit forceImageGeneration from the Images Hub: if the LLM did not
    // call generate_image on its own, synthesize a tool call so the user's
    // intent always produces an image.
    const explicitForce = forceImageGeneration === true && firstPassToolCalls.length === 0
    const forceImageGen = explicitForce || shouldForceImageGeneration({
      hasVisionData: !!visionData,
      userMessage: englishText,
      llmText: fullText,
      alreadyToolCalled: firstPassToolCalls.length > 0,
    })
    if (forceImageGen) {
      console.log('[chatController:stream] forcing image generation — user attached photo + image intent detected, overriding LLM refusal/skip')
      // Wipe the refusal/skip text from fullText. The final `d` event is
      // authoritative for the frontend (useChat.ts replaces streamedText with
      // finalMeta.text on `d`), so the user will briefly see any partial
      // refusal during streaming and then it will be replaced with this
      // status line + the second-pass text describing the image.
      fullText = ''
      if (explicitForce && !visionData) {
        // Images Hub: user explicitly asked for generation, no reference photo
        firstPassToolCalls = [{
          id: `forced_img_${Date.now()}`,
          name: 'generate_image',
          args: {
            prompt: englishText,
            action: 'generate',
            aspect_ratio: preferredAspectRatio ?? '1024x1024',
          },
        }]
      } else {
        firstPassToolCalls = [buildForcedImageToolCall(englishText)]
      }
    }

    // ── Execute tool calls and stream second pass ────────────────────────────
    if (firstPassToolCalls.length > 0) {
      // Reset text — when tools are called the first pass emits no readable content
      fullText = ''
      const toolResults: { id: string; result: string }[] = []

      for (const tc of firstPassToolCalls) {
        // Handle generate_image inline (needs image-specific context)
        if (tc.name === 'generate_image') {
          // Signal frontend immediately so it can show the skeleton
          sse({ t: 'img', status: 'generating' })

          const imgResult = await handleImageToolCall(tc.args, {
            uid,
            isLoggedIn,
            isPremium,
            imageBase64,
            lastGeneratedImageUrl,
            mode,
            threadId,
            userProfile,
            styleMemory: styleMemory ?? undefined,
            preferredAspectRatio,
            vibeTitle,
            vibeDescriptors,
            signal: streamAbort.signal,
            onPartialImage: (partialB64: string) => {
              if (!streamAbort.signal.aborted) {
                sse({ t: 'img', status: 'partial', data: `data:image/png;base64,${partialB64}` })
              }
            },
          })

          // If client disconnected while image was generating, discard results
          if (streamAbort.signal.aborted) {
            console.info('[chatController] Client disconnected during image generation, discarding results')
            if (!res.writableEnded) res.end()
            return
          }

          toolActions.push(imgResult.action)
          imageUrls = imgResult.imageUrls
          imageToolStyleMemory = imgResult.styleMemory
          toolResults.push({ id: tc.id, result: imgResult.result })
          continue
        }

        // Planner tools (logged-in only)
        if (!isLoggedIn) continue

        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)

        if (outcome.result === 'STORAGE_LIMIT_REACHED') {
          const limitMsg = "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!"
          sse({ t: 'c', v: limitMsg })
          sse({ t: 'd', text: limitMsg, toolActions, mode, detectedLanguage, audioUrl: null, imageUrl: null, imageUrls: [] })
          res.end(); return
        }

        toolResults.push({ id: tc.id, result: outcome.result })
      }

      // Second pass: stream LLM response with tool results
      if (toolResults.length > 0) {
        for await (const chunk of streamCallAzureAIWithToolResults(history, englishText, systemPrompt, firstPassToolCalls, toolResults)) {
          sse({ t: 'c', v: chunk })
          fullText += chunk
        }
      }
    }

    // TTS after full text is ready
    const { audioUrl } = await processOutbound(fullText, detectedLanguage)

    // responseLanguage = the language the AI actually responded in.
    const responseLanguage = targetLanguage !== 'en' ? targetLanguage : detectedLanguage

    sse({ t: 'd', text: fullText, toolActions, mode, detectedLanguage, responseLanguage, audioUrl, imageUrl: imageUrls[0] ?? null, imageUrls, styleMemory: imageToolStyleMemory })
    res.end()
  } catch (err: any) {
    // Client disconnected — nothing to write, just clean up silently
    if (err.name === 'AbortError' || streamAbort.signal.aborted) {
      console.info('[chatController:stream] Client disconnected, aborting in-progress work')
      if (!res.writableEnded) res.end()
      return
    }

    console.error('[chatController:stream]', err)
    // P0-1: if we already debited the user before the stream threw, refund
    // the debit. We capture tokensCharged + consumedFrom on each successful
    // charge above; any error reaching this catch means the turn did not
    // deliver to the user in full.
    if (chargedTokens > 0 && chargedConsumedFrom && req.quotaContext?.subject) {
      try {
        await refundTokens(
          req.quotaContext.subject,
          chargedTokens,
          chargedConsumedFrom,
          'chat',
        )
      } catch (refundErr) {
        console.warn('[chatController:stream] refund on stream error failed (swallowed)', {
          uid: req.quotaContext.subject.id,
          chargedTokens,
          chargedConsumedFrom,
          err: refundErr instanceof Error ? refundErr.message : String(refundErr),
        })
      }
    }
    if (!res.writableEnded) {
      sse({ t: 'e', msg: err.message ?? 'Internal server error' })
      res.end()
    }
  }
}
