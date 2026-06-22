import { collection, doc, getDocs, orderBy, query, limit, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { capture as phCapture } from '../lib/posthog'
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
import { register as registerCancellation, unregister as unregisterCancellation } from '../services/cancellationRegistry'
import { getTier as meterGetTier } from '../services/tokenMeter'
import { maybeRecommendProducts } from '../services/productRecommender'
import { generateFollowUpSuggestions } from '../services/followUpSuggestions'
import type { ProductResult } from '../services/products'
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
  APPEND_TO_NOTE_TOOL,
  CREATE_TIMELINE_EVENT_TOOL,
} from '../services/plannerTools'
import { chargeTokens, refundTokens } from '../services/tokenMeter'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ChatPayload, ChatResponse, HistoryMessage, Mode, ToolAction, UserPersonalization } from '../types'
import { buildPersonalizationSuffix } from '../utils/toneInjector'
import { determineTargetLanguage, buildLanguageInstruction } from '../pipeline/languageInstruction'
import { getCachedUserLanguage } from '../lib/userPrefsCache'

// Resolve the effective language for a chat request.
// Priority (same as the STT controller to keep behavior consistent):
//   1. explicit body.language (caller intent / voice-detected language)
//   2. user's saved preference in Firestore (via in-process cache)
//   3. undefined → downstream detectedLanguage takes over
async function resolveRequestLanguage(
  bodyLanguage: string | undefined,
  uid: string | null,
): Promise<string | undefined> {
  const body = bodyLanguage && bodyLanguage !== 'auto' ? bodyLanguage : undefined
  if (body) return body
  if (!uid) return undefined
  return getCachedUserLanguage(uid)
}
import {
  ChatAttachmentSchema,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type ChatAttachment,
} from '../types/chatAttachments'
import { injectAttachmentsIntoUserMessage } from '../utils/attachmentFormatter'

/**
 * Validate the raw attachments array from the request body. Returns a tuple of
 * [validAttachments, errorMessage]. errorMessage is non-null only when the
 * input is shape-invalid at the top level (e.g. not an array, over the cap).
 * Per-item failures are logged + dropped, NOT fatal — one bad attachment must
 * not tank the whole chat request.
 */
function parseAttachments(
  raw: unknown,
): { attachments: ChatAttachment[]; error: string | null } {
  if (raw === undefined || raw === null) return { attachments: [], error: null }
  if (!Array.isArray(raw)) {
    return { attachments: [], error: 'attachments must be an array' }
  }
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      attachments: [],
      error: `attachments exceeds max of ${MAX_ATTACHMENTS_PER_MESSAGE} per message`,
    }
  }
  const valid: ChatAttachment[] = []
  for (let i = 0; i < raw.length; i++) {
    const parsed = ChatAttachmentSchema.safeParse(raw[i])
    if (parsed.success) {
      valid.push(parsed.data)
    } else {
      console.warn('[chatController] dropping invalid attachment', {
        index: i,
        issues: parsed.error.issues.map(iss => ({ path: iss.path, message: iss.message })),
      })
    }
  }
  return { attachments: valid, error: null }
}




function logAttachmentsReceived(
  scope: 'chat' | 'chat:stream',
  attachments: ChatAttachment[],
  userId: string | null,
  threadId: string | undefined,
): void {
  if (attachments.length === 0) return
  console.log(`[${scope}] attachments received`, {
    count: attachments.length,
    kinds: attachments.map(a => a.kind),
    userId,
    threadId: threadId ?? null,
  })
}

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
const IMAGE_INTENT_RE = /\b(draw|render|visualize|illustrate|mood\s?board|(?:picture|image|photo)\s+(?:of|for)|(?:generate|create|make|design|produce)\b[^.?!\n]{0,40}?\b(?:image|picture|photo|mood\s?board|visual))\b/i

// Stricter gate used to *remove* IMAGE_TOOL from the LLM's toolset when the
// user clearly isn't asking for a visual. This is the authoritative check for
// "should the model even be able to call generate_image on this turn" —
// instruction-based gating in the prompt alone is not reliable.
// Matches explicit visual-output asks: "draw", "render", "visualize",
// "illustrate", "mood board", "picture/image/photo of|for X", "generate/create/
// make/design/produce ... image/picture/photo/visual", "show me a picture/
// image/photo". The short {0,40} window lets a pronoun or descriptor sit
// between the verb and the noun — "generate me image", "create us a beach
// picture", "make a modern wedding visual" — which a strict adjacency check
// would miss and (until fixed) was stripping the image tool in those cases.
// Stays non-greedy and sentence-local so it still does NOT match "show me
// ideas", "show me styles", "inspire me", "give me ideas", "suggest looks".
const WANTS_IMAGE_RE = /\b(draw|render|visualize|illustrate|mood\s?board|(?:picture|image|photo)\s+(?:of|for)|(?:generate|create|make|design|produce)\b[^.?!\n]{0,40}?\b(?:image|picture|photo|mood\s?board|visual)|show\s+me\s+(?:an?\s+|the\s+)?(?:picture|image|photo))\b/i

function userWantsImageOutput(userMessage: string): boolean {
  return WANTS_IMAGE_RE.test(userMessage || '')
}

// Hard gate for write-producing tools (notes, reminders, checklists, timeline
// events). When the user has NOT explicitly asked to save/remind/list/schedule
// anything, strip these tools so the LLM can't "be helpful" by quietly
// creating artifacts in assistant/stylist/knowledge modes. Planner mode is
// exempt because it's the mode explicitly for these actions.
// Matches: "save this", "note this", "remember this", "write it down",
// "add to my notes", "create a note", "checklist", "todo", "make a list",
// "remind me", "set a reminder", "schedule", "add to timeline / calendar",
// "book this", "add it to my planner".
const WRITE_INTENT_RE = /\b(save|saving|remember|note\s+(?:this|that|it|down)|write\s+(?:this|that|it)\s+down|add\s+to\s+(?:my\s+)?(?:notes?|planner|timeline|calendar|checklist|list)|create\s+(?:a\s+|an\s+)?(?:note|checklist|reminder|list|event|timeline)|make\s+(?:a\s+|an\s+)?(?:note|checklist|list|reminder|event)|checklist|to.?do\s+list|task\s+list|remind\s+me|reminder|notify\s+me|schedule|book\s+(?:this|that|it|an?\s+appointment)|mark\s+as\s+done|mark\s+it\s+done|tick\s+off)\b/i

const WRITE_TOOL_NAMES = new Set<string>([
  'create_note',
  'append_to_note',
  'create_checklist',
  'create_reminder',
  'create_timeline_event',
])

function userWantsWriteAction(userMessage: string): boolean {
  return WRITE_INTENT_RE.test(userMessage || '')
}

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

// When the client has a last-generated image URL, expose it to the LLM so
// references like "save this image to notes" / "add that picture" on a
// follow-up turn can thread the actual URL into create_note. Tool results
// from the prior turn are stripped from history, so without this the LLM
// would hallucinate a save it can't perform.


function buildLastImageContextSuffix(lastGeneratedImageUrl?: string | null): string {
  if (!lastGeneratedImageUrl || lastGeneratedImageUrl.startsWith('data:')) return ''
  return `\nCONTEXT — LAST GENERATED IMAGE: The most recently generated image in this conversation is at URL: ${lastGeneratedImageUrl}\nIf the user asks to save "this image" / "that image" / "the image" to a note, pass this exact URL in create_note's image_urls parameter. Do NOT invent a different URL.`
}

// Guests can only generate images — no checklist/note/reminder/timeline
// persistence. Without this instruction the LLM sees only generate_image in
// its toolset and, when the user affirms "yes save it" to a checklist
// suggestion, misroutes to image generation. Telling it the constraint
// upfront lets it respond with a sign-in prompt instead.
function buildGuestLimitationSuffix(isLoggedIn: boolean): string {
  if (isLoggedIn) return ''
  return `\nIMPORTANT — GUEST USER: This user is not signed in. You CANNOT save checklists, notes, reminders, or timeline events for them — those tools are not available. If the user asks to save/create any of these (or confirms "yes", "save it", "create it" in response to such a suggestion), DO NOT call generate_image. Instead, reply warmly in plain text that saving planner items requires signing in, invite them to sign in or create a free account to unlock saving, and offer to keep helping in the meantime. Image generation is the only artifact tool available to guests.`
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
        APPEND_TO_NOTE_TOOL,
        EDIT_CHECKLIST_ITEM_TOOL,
        MARK_AS_DONE_TOOL,
        GET_CHECKLIST_STATS_TOOL,
      ]
    case 'stylist':
    // case 'therapist': // disabled
    case 'knowledge':
      return [...base, CREATE_NOTE_TOOL, APPEND_TO_NOTE_TOOL]
    // case 'consultant': // disabled
    //   return [...base, CREATE_NOTE_TOOL, CREATE_REMINDER_TOOL]
    default:
      return [...base, CREATE_NOTE_TOOL, APPEND_TO_NOTE_TOOL]
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

async function buildSystemPrompt(
  mode: Mode,
  _userMessage: string,
  userRole?: string | null,
  personalization?: UserPersonalization,
  userProfile?: UserProfileContext | null,
  _threadId?: string,
): Promise<SystemPromptResult> {
  const userContext = buildUserContextSuffix(userProfile)

  if (mode === 'stylist') {
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
  callerUid: string | null,
  historyLimit = 10
): Promise<HistoryMessage[]> {
  if (!threadId && providedHistory && providedHistory.length > 0) {
    return providedHistory.slice(-historyLimit)
  }
  if (threadId) {
    // Ownership guard. The Admin SDK bypasses Firestore security rules, so
    // without this a caller could pass ANY threadId and have another user's
    // private conversation loaded into their LLM context. Verify the caller
    // owns the thread before reading its messages. Real isolation also needs
    // Firestore rules — see PRD-SECURITY-cross-user-access-control.md.
    const threadSnap = await getDoc(doc(db, 'chats', threadId))
    const ownerId = threadSnap.exists()
      ? (threadSnap.data()?.userId as string | undefined)
      : undefined
    if (!callerUid || ownerId !== callerUid) {
      console.warn('[getChatHistory] ownership check failed; ignoring threadId history', {
        threadId,
        ownerId: ownerId ?? null,
        callerUid,
      })
      return []
    }
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
    distinctId?: string
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
    base64Images = await editImageGptImage1(opts.imageBase64, finalPrompt, sourceSize, { negativePrompt, referenceImages: args.reference_images, signal: opts.signal, distinctId: opts.distinctId })
  } else if (imgAction === 'edit' && opts.lastGeneratedImageUrl) {
    try {
      console.log('[chatController] Iterative edit → fetching previous image from URL')
      const imgRes = await fetch(opts.lastGeneratedImageUrl, { signal: opts.signal })
      const imgBuf = Buffer.from(await imgRes.arrayBuffer())
      const sourceBase64 = imgBuf.toString('base64')
      const sourceSize = await detectImageAspectRatio(sourceBase64)
      console.log(`[chatController] Iterative edit | source=${sourceSize}, llm_wanted=${llmChosenSize}`)
      base64Images = await editImageGptImage1(sourceBase64, finalPrompt, sourceSize, { negativePrompt, signal: opts.signal, distinctId: opts.distinctId })
    } catch (fetchErr) {
      if ((fetchErr as Error).name === 'AbortError') throw fetchErr
      console.error('[chatController] Failed to fetch lastGeneratedImageUrl, falling back to generate:', fetchErr)
      base64Images = await generateImageGptImage1(finalPrompt, llmChosenSize, imgVariants as 1 | 2 | 3, { negativePrompt, onPartialImage: opts.onPartialImage, signal: opts.signal, distinctId: opts.distinctId })
    }
  } else {
    base64Images = await generateImageGptImage1(finalPrompt, llmChosenSize, imgVariants as 1 | 2 | 3, { negativePrompt, onPartialImage: opts.onPartialImage, signal: opts.signal, distinctId: opts.distinctId })
  }

  // Track which size was actually used for storage metadata
  const imgSize = llmChosenSize // Overridden above for edit paths via sourceSize

  const cancelledResult: ImageToolResult = {
    result: 'Image generation was cancelled.',
    action: { tool: 'generate_image', imagePrompt: finalPrompt },
    imageUrls: [],
    styleDescriptors: [],
  }

  // Early abort check: if the user stopped generation while Azure was
  // producing the image, skip post-processing + storage + token charge.
  if (opts.signal?.aborted) {
    console.log('[chatController] Client disconnected before post-process, skipping')
    return cancelledResult
  }

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

  // If client disconnected during generation or post-processing, skip storage
  // AND skip the token charge below. The earlier check catches the common case
  // (abort during the Azure fetch); this one catches abort during post-process.
  if (opts.signal?.aborted) {
    console.log('[chatController] Client disconnected, skipping image storage')
    return cancelledResult
  }

  // Store images (for logged-in users)
  let imageUrls: string[] = []
  if (opts.isLoggedIn && opts.uid) {
    let stored: Awaited<ReturnType<typeof storeMultipleImages>>
    try {
      stored = await storeMultipleImages(base64Images, opts.uid, {
        prompt: imgPrompt,
        enhancedPrompt: imgPrompt,
        mode: opts.mode,
        threadId: opts.threadId || null,
        aspectRatio: imgSize,
        type: imgAction === 'edit' ? 'edited' : 'generated',
        vibeId: buildVibeId(opts.vibeTitle),
        vibeDescriptors: opts.vibeDescriptors && opts.vibeDescriptors.length > 0 ? opts.vibeDescriptors : null,
      }, opts.signal)
    } catch (err) {
      if ((err as Error)?.name === 'CancelledError') {
        console.log('[chatController] Image storage cancelled mid-upload, skipping token charge')
        return cancelledResult
      }
      throw err
    }
    imageUrls = stored.map(s => s.url)
    // Final guard: do not bill tokens for an image the user never saw. An
    // abort between the successful storage return and this check is rare, but
    // costs the user tokens they shouldn't pay for if it happens.
    if (opts.signal?.aborted) {
      console.log('[chatController] Aborted after storage, skipping token charge')
      return cancelledResult
    }
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

  // Surface the URLs inside the tool result so a subsequent tool call on the
  // same turn (e.g. create_note with image_urls) can reference them. The
  // assistant receives the result string verbatim — it does not see the
  // `imageUrls` field on this object.
  //
  // IMPORTANT: For guest users imageUrls contains full data:image/png;base64,...
  // strings (1–3 MB each). Embedding them verbatim in the tool result that is
  // replayed in the second Azure call causes a context-length explosion
  // (~1.5M tokens). Use short placeholder tokens in the LLM-facing result
  // string — the actual base64 is already streamed to the frontend via SSE.
  const urlsForLLM = imageUrls.map((u, i) =>
    u.startsWith('data:') ? `[guest-image-${i + 1}]` : u
  )
  const urlsJson = JSON.stringify(urlsForLLM)
  return {
    result: `Image${imageUrls.length > 1 ? 's' : ''} generated successfully. ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''} created. image_urls=${urlsJson}`,
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

  // Parse attachments (non-fatal per-item; fatal only for top-level shape errors).
  const { attachments, error: attachmentsError } = parseAttachments((req.body as { attachments?: unknown }).attachments)
  if (attachmentsError) {
    res.status(400).json({ error: attachmentsError })
    return
  }

  const uid = req.user?.uid ?? null
  const isLoggedIn = uid !== null
  const phDistinctId = req.phDistinctId ?? req.user?.uid
  logAttachmentsReceived('chat', attachments, uid, threadId)

  // P0-1: hoisted refund tracking — see streaming handler for rationale.
  let chargedTokens = 0
  let chargedConsumedFrom: 'monthly' | 'extras' | 'both' | null = null

  try {
    // Resolve language BEFORE processInbound so the pref hints translation +
    // TTS language even when the client forgot to send `language` in the body.
    const resolvedLanguage = await resolveRequestLanguage(language, uid)
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, resolvedLanguage)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory, uid)

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

    const targetLanguage = determineTargetLanguage(resolvedLanguage, detectedLanguage)
    const { prompt: baseSystemPrompt, algoliaQueried } = await buildSystemPrompt(
      mode,
      englishText,
      userRole,
      userPersonalization,
      userProfile,
      threadId,
    )
    const systemPrompt =
      baseSystemPrompt +
      buildLanguageInstruction(targetLanguage) +
      buildVibeSystemSuffix(vibeTitle, vibeDescriptors) +
      buildForceImageSuffix(forceImageGeneration) +
      buildGuestLimitationSuffix(isLoggedIn) +
      buildLastImageContextSuffix(lastGeneratedImageUrl)

    // Conversation summarization: compress older messages when history is long
    let effectiveHistory = history
    if (history.length > 10) {
      try {
        const olderMessages = history.slice(0, history.length - 5)
        const recentMessages = history.slice(history.length - 5)
        const { getClient } = await import('../services/azureAI')
        const summary = await summarizeConversation(olderMessages, getClient(), targetLanguage)
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

    // Kick off product recommender in parallel with the LLM call so Algolia
    // latency overlaps with model inference instead of adding to it.
    const userTurnNumber = history.filter(m => m.role === 'user').length + 1
    const previousAssistantText = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') return history[i].content
      }
      return undefined
    })()
    const previousUserText = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') return history[i].content
      }
      return undefined
    })()
    const productsPromise = maybeRecommendProducts({
      userMessage: englishText,
      mode,
      requestedMode,
      turnNumber: userTurnNumber,
      threadId,
      previousAssistantText,
      previousUserText,
    })

    // Build tools array — per-mode curated tool set. IMAGE_TOOL is always in base.
    let tools: ChatCompletionTool[] = getToolsForMode(mode, isLoggedIn)
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

    // Hard gate: strip generate_image from the toolset when the user clearly
    // isn't asking for a visual. Prompt-level gating alone is unreliable —
    // GPT-4o will happily call the tool on "show me some ideas" even when
    // the prompt says not to. Keep it when: photo attached (vision edit),
    // Images Hub explicit force, or the message matches WANTS_IMAGE_RE.
    const imageAllowed = Boolean(visionData) || forceImageGeneration === true || userWantsImageOutput(englishText)
    if (!imageAllowed) {
      tools = tools.filter(t => !(t.type === 'function' && t.function.name === 'generate_image'))
    }

    // Hard gate: strip write tools (create_note / create_checklist / create_reminder
    // / create_timeline_event / append_to_note) unless the user is explicitly
    // in planner mode OR the message carries a clear save/remind/schedule verb.
    // Prevents "let me save this for you" hallucinations on styling queries.
    const writeToolsAllowed = requestedMode === 'planner' || mode === 'planner' || userWantsWriteAction(englishText)
    if (!writeToolsAllowed) {
      tools = tools.filter(t => !(t.type === 'function' && WRITE_TOOL_NAMES.has(t.function.name)))
    }

    // Prepend the structured attachments block to the user message so the LLM
    // receives note/checklist/timeline/file context as user-provided content
    // for this turn (not as a permanent system instruction).
    const userMessageForLLM = injectAttachmentsIntoUserMessage(englishText, attachments)

    // Gather image URLs from this turn's attachments for the note-tool safety
    // net (see ToolCallContext in plannerTools.ts). This array is mutated
    // below to also include URLs produced by generate_image calls in this
    // same turn — so a subsequent create_note / append_to_note can fall back
    // to them if the LLM forgets to echo them into image_urls.
    // Also seeded with lastGeneratedImageUrl so "add that image to my note"
    // works across turns (user referring to the previous turn's image).
    const turnImageUrls: string[] = (attachments ?? [])
      .filter((a) => a.kind === 'image')
      .map((a) => {
        const p = (a.payload ?? {}) as Record<string, unknown>
        const u = p['url']
        return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null
      })
      .filter((u): u is string => u !== null)
    if (
      typeof lastGeneratedImageUrl === 'string' &&
      /^https?:\/\//i.test(lastGeneratedImageUrl) &&
      !turnImageUrls.includes(lastGeneratedImageUrl)
    ) {
      turnImageUrls.push(lastGeneratedImageUrl)
    }

    const aiResult = await callAzureAI(effectiveHistory, userMessageForLLM, systemPrompt, tools, visionData, temperature)

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

    // Execute tool calls if any. Loop so the LLM can chain dependent calls
    // (e.g. generate_image → append_to_note with the resulting URL). See the
    // streaming handler for the equivalent multi-round loop and rationale.
    const collectedToolErrors: { tool: string; errorCode: string; message: string; userFacing?: string }[] = []

    if (aiResult.toolCalls.length > 0) {
      const MAX_TOOL_ROUNDS = 3
      const priorRounds: { toolCalls: typeof aiResult.toolCalls; toolResults: { id: string; result: string }[] }[] = []
      let pendingToolCalls = aiResult.toolCalls

      for (let round = 0; round < MAX_TOOL_ROUNDS && pendingToolCalls.length > 0; round++) {
        const orderedCalls = [...pendingToolCalls].sort((a, b) => {
          if (a.name === 'generate_image' && b.name !== 'generate_image') return -1
          if (b.name === 'generate_image' && a.name !== 'generate_image') return 1
          return 0
        })
        const toolResults: { id: string; result: string }[] = []
        let storageLimitHit = false

        for (const tc of orderedCalls) {
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
              distinctId: phDistinctId,
            })
            toolActions.push(imgResult.action)
            imageUrls = imgResult.imageUrls
            imageToolStyleMemory = imgResult.styleMemory
            toolResults.push({ id: tc.id, result: imgResult.result })
            for (const u of imgResult.imageUrls ?? []) {
              if (typeof u === 'string' && /^https?:\/\//i.test(u) && !turnImageUrls.includes(u)) {
                turnImageUrls.push(u)
              }
            }
            continue
          }

          if (!isLoggedIn) continue

          const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium, undefined, { turnImageUrls })
          toolActions.push(outcome.action)

          if (outcome.ok === false && outcome.errorCode) {
            collectedToolErrors.push({
              tool: tc.name,
              errorCode: outcome.errorCode,
              message: outcome.errorMessage ?? outcome.result,
              userFacing: outcome.userFacing,
            })
          }

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
            storageLimitHit = true
            break
          }

          toolResults.push({ id: tc.id, result: outcome.result })
        }

        if (storageLimitHit) return

        priorRounds.push({ toolCalls: orderedCalls, toolResults })
        pendingToolCalls = []

        const allowMoreTools = round < MAX_TOOL_ROUNDS - 1
        const nextResult = await callAzureAIWithToolResults(
          history,
          userMessageForLLM,
          systemPrompt,
          priorRounds,
          allowMoreTools ? tools : undefined,
          temperature,
        )

        finalAiText = nextResult.text
        if (nextResult.toolCalls.length > 0) {
          finalAiText = ''
          pendingToolCalls = nextResult.toolCalls
        }
      }
    }

    // responseLanguage = the language the AI actually responded in.
    // When targetLanguage is non-English the LLM was instructed to respond in
    // that language, so we trust it. Falls back to detectedLanguage (input lang).
    const responseLanguage = targetLanguage !== 'en' ? targetLanguage : detectedLanguage
    // TTS must use the language the AI wrote in, NOT the input-detection
    // result — otherwise a Gujarati response to English-detected input would
    // synthesize as English audio and sound wrong.
    const { text: finalText, audioUrl } = await processOutbound(finalAiText, responseLanguage)

    // Avoid double-rendering: if the LLM echoed an image URL as markdown AND
    // the same URL is in imageUrls, strip the markdown so the client only
    // renders it once (from imageUrls).
    let textForClient = finalText
    if (imageUrls.length > 0 && textForClient) {
      for (const u of imageUrls) {
        if (!u) continue
        const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        textForClient = textForClient.replace(new RegExp(`!\\[[^\\]]*\\]\\(${esc}\\)`, 'g'), '')
      }
      textForClient = textForClient.replace(/\n{3,}/g, '\n\n').trim()
    }

    // Await the recommender (kicked off in parallel with the LLM call) and
    // attach products + hasMore flag. Failure is non-fatal — absence of
    // products is a valid response.
    let recommendedProducts: ProductResult[] = []
    let productsHasMore = false
    try {
      const rec = await productsPromise
      if (rec && rec.products.length > 0) {
        recommendedProducts = rec.products
        productsHasMore = rec.hasMore
      }
    } catch (err) {
      console.warn('[chatController] product recommender failed (swallowed):', err)
    }

    const response: ChatResponse = {
      text: textForClient,
      audioUrl,
      imageUrl: imageUrls[0] ?? null,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      toolActions,
      mode,
      detectedLanguage,
      responseLanguage,
      styleMemory: imageToolStyleMemory,
      toolErrors: collectedToolErrors.length > 0 ? collectedToolErrors : undefined,
      products: recommendedProducts.length > 0 ? recommendedProducts : undefined,
      productsHasMore: recommendedProducts.length > 0 ? productsHasMore : undefined,
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

  // Explicit-cancel path: register with the in-memory registry so POST
  // /chat/cancel can abort this stream even when the proxy/LB in front of Node
  // swallows the client-side TCP abort and `req.on('close')` never fires. See
  // services/cancellationRegistry.ts.
  const clientRequestId = (req.body && typeof req.body === 'object'
    ? (req.body as { requestId?: unknown }).requestId
    : undefined)
  const requestId = typeof clientRequestId === 'string' && clientRequestId.length > 0
    ? clientRequestId
    : null
  if (requestId) {
    registerCancellation(requestId, streamAbort, req.user?.uid ?? null)
  }

  // P0-1: hoisted so the outer catch can refund if the stream throws after
  // we have already debited tokens.
  let chargedTokens = 0
  let chargedConsumedFrom: 'monthly' | 'extras' | 'both' | null = null

  // PostHog: measure stream latency. distinctId from authenticated uid (if any)
  // or the x-ph-distinct-id header set by posthogContext middleware.
  const phStart = Date.now()
  const phDistinctId = req.phDistinctId ?? req.user?.uid
  let phStreamStartCaptured = false

  try {
    const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization, imageBase64, imageMimeType, lastGeneratedImageUrl, styleMemory, forceImageGeneration, preferredAspectRatio, vibeTitle, vibeDescriptors } = req.body as ChatPayload

    if (!message && !audioBase64 && !imageBase64) {
      sse({ t: 'e', msg: 'message, audioBase64, or imageBase64 is required' })
      res.end(); return
    }

    // Parse attachments. Top-level shape errors are surfaced via the SSE
    // error channel (headers are already flushed — we can't send a 400).
    // Per-item validation failures are dropped + logged inside parseAttachments.
    const { attachments, error: attachmentsError } = parseAttachments((req.body as { attachments?: unknown }).attachments)
    if (attachmentsError) {
      sse({ t: 'e', msg: attachmentsError })
      res.end(); return
    }

    const uid = req.user?.uid ?? null
    const isLoggedIn = uid !== null
    logAttachmentsReceived('chat:stream', attachments, uid, threadId)

    // Same language-resolution priority as the non-stream handler.
    const resolvedLanguage = await resolveRequestLanguage(language, uid)
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, resolvedLanguage)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory, uid)

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

    const targetLanguage = determineTargetLanguage(resolvedLanguage, detectedLanguage)
    const { prompt: baseSystemPrompt, algoliaQueried } = await buildSystemPrompt(
      mode,
      englishText,
      userRole,
      userPersonalization,
      userProfile,
      threadId,
    )
    const systemPrompt =
      baseSystemPrompt +
      buildLanguageInstruction(targetLanguage) +
      buildVibeSystemSuffix(vibeTitle, vibeDescriptors) +
      buildForceImageSuffix(forceImageGeneration) +
      buildGuestLimitationSuffix(isLoggedIn) +
      buildLastImageContextSuffix(lastGeneratedImageUrl)

    // Conversation summarization: compress older messages when history is long
    let effectiveHistory = history
    if (history.length > 10) {
      try {
        const olderMessages = history.slice(0, history.length - 5)
        const recentMessages = history.slice(history.length - 5)
        const { getClient } = await import('../services/azureAI')
        const summary = await summarizeConversation(olderMessages, getClient(), targetLanguage)
        effectiveHistory = [
          { role: 'assistant' as const, content: `[Previous conversation summary]: ${summary}` },
          ...recentMessages,
        ]
      } catch (err) {
        console.error('[chatController:stream] summarization failed, using full history:', err)
      }
    }

    if (phDistinctId && !phStreamStartCaptured) {
      phCapture(phDistinctId, 'stream_started', { mode })
      phStreamStartCaptured = true
    }

    // Resolve mode-specific temperature
    const temperature = MODE_TEMPERATURES[mode] ?? 0.7

    // Kick off product recommender in parallel with the LLM stream so Algolia
    // latency is hidden behind the first-token latency. Gate is evaluated here;
    // Promise resolves to null when no products should be shown this turn.
    const userTurnNumber = history.filter(m => m.role === 'user').length + 1
    const previousAssistantText = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') return history[i].content
      }
      return undefined
    })()
    const previousUserText = (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') return history[i].content
      }
      return undefined
    })()
    const productsPromise = maybeRecommendProducts({
      userMessage: englishText,
      mode,
      requestedMode,
      turnNumber: userTurnNumber,
      threadId,
      previousAssistantText,
      previousUserText,
    })

    // Build tools array — per-mode curated tool set. IMAGE_TOOL is always in base.
    let tools: ChatCompletionTool[] = getToolsForMode(mode, isLoggedIn)
    // Guest users still get IMAGE_TOOL for image requests (mode-agnostic).
    if (!isLoggedIn && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.push(IMAGE_TOOL)
    }
    if (forceImageGeneration && !tools.some(t => t.type === 'function' && t.function.name === 'generate_image')) {
      tools.unshift(IMAGE_TOOL)
    }

    // Pass user-attached image as vision data so LLM can see it
    const visionData = (imageBase64 && imageMimeType) ? { base64: imageBase64, mimeType: imageMimeType } : undefined

    // Hard gate: strip generate_image from the toolset unless the user is
    // clearly asking for a visual. Prevents the LLM from turning replies like
    // "elegant, and show me some ideas also" into an image-generation call.
    const imageAllowed = Boolean(visionData) || forceImageGeneration === true || userWantsImageOutput(englishText)
    if (!imageAllowed) {
      tools = tools.filter(t => !(t.type === 'function' && t.function.name === 'generate_image'))
    }

    // Hard gate: strip write tools unless the user opted into planner mode
    // OR asked explicitly to save/remind/list/schedule. Stops assistant mode
    // from unilaterally creating notes / checklists / reminders on advisory
    // queries like "elegant, and show me some ideas".
    const writeToolsAllowed = requestedMode === 'planner' || mode === 'planner' || userWantsWriteAction(englishText)
    if (!writeToolsAllowed) {
      tools = tools.filter(t => !(t.type === 'function' && WRITE_TOOL_NAMES.has(t.function.name)))
    }
    // P0-3: actual vision image count (currently vision is single-image per turn).
    const visionImageCount = visionData ? 1 : 0

    // Inject the attachments block into the user message for both LLM passes.
    // englishText remains the raw user intent (used for mode detection, product
    // intent, forced-image heuristics) — we only augment what the LLM sees.
    const userMessageForLLM = injectAttachmentsIntoUserMessage(englishText, attachments)

    // Image URLs from this turn's attachments — used as a safety net in the
    // note-tool handlers (see ToolCallContext in plannerTools.ts). Mutable
    // so generate_image URLs produced later in this turn can be appended.
    // Also seeded with lastGeneratedImageUrl so the user can ask "add that
    // image to my note" in a turn after the image was generated.
    const turnImageUrls: string[] = (attachments ?? [])
      .filter((a) => a.kind === 'image')
      .map((a) => {
        const p = (a.payload ?? {}) as Record<string, unknown>
        const u = p['url']
        return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null
      })
      .filter((u): u is string => u !== null)
    if (
      typeof lastGeneratedImageUrl === 'string' &&
      /^https?:\/\//i.test(lastGeneratedImageUrl) &&
      !turnImageUrls.includes(lastGeneratedImageUrl)
    ) {
      turnImageUrls.push(lastGeneratedImageUrl)
    }

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

    for await (const event of streamCallAzureAI(effectiveHistory, userMessageForLLM, systemPrompt, tools, visionData, temperature)) {
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

    // ── Multi-round tool execution + streaming ───────────────────────────────
    // Some user intents require chained tool calls with data dependencies —
    // e.g. "generate this image AND save it to my timeline note" needs
    // generate_image (round 1) → append_to_note (round 2, using the URL from
    // round 1's result). The LLM cannot emit both in parallel because the
    // second call depends on the first call's output, so we loop:
    //   round → execute tool calls → next pass (with tools) → if more tool
    //   calls, repeat; else stream final text.
    // Capped at MAX_TOOL_ROUNDS to prevent runaway loops.
    if (firstPassToolCalls.length > 0) {
      // Reset text — when tools are called the first pass emits no readable content
      fullText = ''

      const MAX_TOOL_ROUNDS = 3
      const priorRounds: { toolCalls: typeof firstPassToolCalls; toolResults: { id: string; result: string }[] }[] = []
      let pendingToolCalls = firstPassToolCalls
      let storageLimitHit = false

      for (let round = 0; round < MAX_TOOL_ROUNDS && pendingToolCalls.length > 0; round++) {
        if (streamAbort.signal.aborted) break

        // Sort: run generate_image before any note tool so the URL is in
        // turnImageUrls before append_to_note / create_note executes.
        const orderedCalls = [...pendingToolCalls].sort((a, b) => {
          if (a.name === 'generate_image' && b.name !== 'generate_image') return -1
          if (b.name === 'generate_image' && a.name !== 'generate_image') return 1
          return 0
        })

        const toolResults: { id: string; result: string }[] = []

        for (const tc of orderedCalls) {
          if (streamAbort.signal.aborted) {
            console.info('[chatController:stream] Client disconnected, skipping remaining tool calls')
            break
          }
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
              distinctId: phDistinctId,
              onPartialImage: (partialB64: string) => {
                if (!streamAbort.signal.aborted) {
                  sse({ t: 'img', status: 'partial', data: `data:image/png;base64,${partialB64}` })
                }
              },
            })

            if (streamAbort.signal.aborted) {
              console.info('[chatController] Client disconnected during image generation, discarding results')
              if (!res.writableEnded) res.end()
              return
            }

            toolActions.push(imgResult.action)
            imageUrls = imgResult.imageUrls
            imageToolStyleMemory = imgResult.styleMemory
            toolResults.push({ id: tc.id, result: imgResult.result })
            for (const u of imgResult.imageUrls ?? []) {
              if (typeof u === 'string' && /^https?:\/\//i.test(u) && !turnImageUrls.includes(u)) {
                turnImageUrls.push(u)
              }
            }
            continue
          }

          // Planner tools (logged-in only)
          if (!isLoggedIn) continue

          const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium, undefined, { turnImageUrls })
          toolActions.push(outcome.action)

          if (outcome.result === 'STORAGE_LIMIT_REACHED') {
            const limitMsg = "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!"
            sse({ t: 'c', v: limitMsg })
            sse({ t: 'd', text: limitMsg, toolActions, mode, detectedLanguage, audioUrl: null, imageUrl: null, imageUrls: [] })
            res.end()
            storageLimitHit = true
            break
          }

          if (outcome.ok === false && outcome.errorCode) {
            sse({ t: 'tool_error', toolName: tc.name, errorCode: outcome.errorCode, message: outcome.userFacing ?? outcome.errorMessage ?? outcome.result })
          }

          toolResults.push({ id: tc.id, result: outcome.result })
        }

        if (storageLimitHit) return
        if (streamAbort.signal.aborted) {
          if (!res.writableEnded) res.end()
          return
        }

        priorRounds.push({ toolCalls: orderedCalls, toolResults })
        pendingToolCalls = []

        // Run the next pass. If this is the final allowed round, omit tools so
        // the LLM is forced to emit a textual reply instead of looping further.
        const allowMoreTools = round < MAX_TOOL_ROUNDS - 1
        let nextRoundToolCalls: typeof firstPassToolCalls = []

        for await (const event of streamCallAzureAIWithToolResults(
          effectiveHistory,
          userMessageForLLM,
          systemPrompt,
          priorRounds,
          allowMoreTools ? tools : undefined,
          temperature,
        )) {
          if (event.type === 'chunk') {
            sse({ t: 'c', v: event.text })
            fullText += event.text
          } else {
            nextRoundToolCalls = event.toolCalls
          }
        }

        if (nextRoundToolCalls.length > 0) {
          // The LLM wants another round — wipe the partial text it streamed
          // alongside the tool calls (typically an "I'll save this next" line
          // that becomes redundant once the save actually happens).
          fullText = ''
          pendingToolCalls = nextRoundToolCalls
        }
      }
    }

    // responseLanguage = the language the AI actually responded in.
    const responseLanguage = targetLanguage !== 'en' ? targetLanguage : detectedLanguage

    // Kick off follow-up suggestion generation NOW so it runs in parallel with
    // TTS + product recommendation below. Best-effort + timeout-bounded — it can
    // never block or break the stream. Emitted on the `d` event, never stored.
    const suggestionsPromise = generateFollowUpSuggestions({
      userMessage: message ?? '',
      assistantReply: fullText,
      language: responseLanguage,
      signal: streamAbort.signal,
    })

    // TTS after full text is ready — keyed on responseLanguage so the audio
    // matches the AI's output language (not the input-detection result).
    const { audioUrl } = await processOutbound(fullText, responseLanguage)

    // Strip ![](url) echoes for urls already returned in imageUrls so the
    // client doesn't render them twice.
    // Skip data: URIs — they are guest-user base64 blobs that can never appear
    // verbatim in the LLM's text output, and trying to build a RegExp from them
    // throws "Regular expression too large" in V8 (pattern too long).
    let textForClient = fullText
    if (imageUrls && imageUrls.length > 0 && textForClient) {
      for (const u of imageUrls) {
        if (!u || u.startsWith('data:')) continue
        const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        textForClient = textForClient.replace(new RegExp(`!\\[[^\\]]*\\]\\(${esc}\\)`, 'g'), '')
      }
      textForClient = textForClient.replace(/\n{3,}/g, '\n\n').trim()
    }

    // Await recommender (kicked off in parallel with the LLM stream) and emit
    // a products sidecar event so the frontend can render a card strip below
    // the message bubble. Failures are swallowed — products are non-essential.
    let recommendedProducts: ProductResult[] = []
    let productsHasMore = false
    try {
      const rec = await productsPromise
      if (rec && rec.products.length > 0) {
        recommendedProducts = rec.products
        productsHasMore = rec.hasMore
        sse({ t: 'p', products: rec.products, hasMore: rec.hasMore })
      }
    } catch (err) {
      console.warn('[chatController:stream] product recommender failed (swallowed):', err)
    }

    // Resolve follow-up suggestions (kicked off in parallel above). Best-effort.
    let suggestions: string[] = []
    try {
      suggestions = await suggestionsPromise
    } catch {
      suggestions = []
    }

    sse({ t: 'd', text: textForClient, toolActions, mode, detectedLanguage, responseLanguage, audioUrl, imageUrl: imageUrls[0] ?? null, imageUrls, styleMemory: imageToolStyleMemory, products: recommendedProducts, productsHasMore, suggestions })
    res.end()

    if (phDistinctId) {
      phCapture(phDistinctId, 'stream_completed', {
        mode,
        latency_ms: Date.now() - phStart,
        tokens_charged: chargedTokens,
        had_tool_actions: Array.isArray(toolActions) && toolActions.length > 0,
        had_image: imageUrls.length > 0,
      })
    }
  } catch (err: any) {
    // Client disconnected — nothing to write, just clean up silently
    if (err.name === 'AbortError' || streamAbort.signal.aborted) {
      console.info('[chatController:stream] Client disconnected, aborting in-progress work')
      if (!res.writableEnded) res.end()
      if (phDistinctId) {
        phCapture(phDistinctId, 'stream_errored', {
          error_code: 'client_disconnect',
          latency_ms: Date.now() - phStart,
        })
      }
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
    if (phDistinctId) {
      phCapture(phDistinctId, 'stream_errored', {
        error_code: err?.code ?? err?.name ?? 'unknown',
        latency_ms: Date.now() - phStart,
      })
    }
  } finally {
    if (requestId) unregisterCancellation(requestId)
  }
}
