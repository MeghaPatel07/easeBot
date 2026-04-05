import { collection, doc, getDocs, orderBy, query, limit, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Request, Response } from 'express'
import { processInbound } from '../pipeline/inbound'
import { processOutbound } from '../pipeline/outbound'
import { callAzureAI, callAzureAIWithToolResults, streamCallAzureAI, streamCallAzureAIWithToolResults } from '../services/azureAI'
import { IMAGE_TOOL, generateImageGptImage1, editImageGptImage1, extractStyleDescriptors, type ImageSize } from '../services/imageGeneration'
import { storeMultipleImages } from '../services/imageStorage'
import { checkImageQuota, incrementImageUsage } from '../services/imageQuota'
import { getRelevantProductsViaAlgolia, formatProductsContext } from '../services/algoliaProducts'
import { detectMode } from '../modeRouter'
import { getPlannerPrompt } from '../prompts/planner'
import { getStylistPrompt } from '../prompts/stylist'
import { getTherapistPrompt } from '../prompts/therapist'
import { getKnowledgePrompt } from '../prompts/knowledge'
import { getConsultantPrompt } from '../prompts/consultant'
import { getAssistantPrompt } from '../prompts/assistant'
import { PLANNER_TOOLS, executeToolCall } from '../services/plannerTools'
import { incrementUserUsage } from '../services/usageService'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ChatPayload, ChatResponse, CalendarEvent, HistoryMessage, Mode, ToolAction, UserPersonalization } from '../types'
import { buildPersonalizationSuffix } from '../utils/toneInjector'
import { determineTargetLanguage, buildLanguageInstruction } from '../pipeline/languageInstruction'

async function buildSystemPrompt(
  mode: Mode,
  userMessage: string,
  userRole?: string | null,
  personalization?: UserPersonalization
): Promise<string> {
  if (mode === 'stylist') {
    try {
      const products = await getRelevantProductsViaAlgolia(userMessage)
      const context = formatProductsContext(products)
      return getStylistPrompt(context) + buildPersonalizationSuffix(personalization)
    } catch {
      return getStylistPrompt() + buildPersonalizationSuffix(personalization)
    }
  }
  switch (mode) {
    case 'planner':    return getPlannerPrompt(userRole) + buildPersonalizationSuffix(personalization)
    case 'therapist':  return getTherapistPrompt() + buildPersonalizationSuffix(personalization)
    case 'knowledge':  return getKnowledgePrompt() + buildPersonalizationSuffix(personalization)
    case 'consultant': return getConsultantPrompt() + buildPersonalizationSuffix(personalization)
    default:           return getAssistantPrompt() + buildPersonalizationSuffix(personalization)
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
  }
): Promise<ImageToolResult> {
  const imgPrompt = args.prompt as string
  const imgAction = (args.action as string) ?? 'generate'
  const imgSize = (args.aspect_ratio as ImageSize) ?? '1024x1024'
  const imgVariants = 1 // Always generate exactly 1 image

  // Check quota for logged-in users
  if (opts.isLoggedIn && opts.uid) {
    const quota = await checkImageQuota(opts.uid, opts.isPremium)
    if (!quota.allowed) {
      return {
        result: `Image generation quota exceeded. You've used ${quota.dailyUsed}/${quota.dailyLimit} images today. Try again after ${quota.resetAt}.`,
        action: { tool: 'generate_image', imagePrompt: imgPrompt, imageAction: imgAction as any },
        imageUrls: [],
        styleDescriptors: [],
      }
    }
  }

  let base64Images: string[] = []

  // If user attached an image, ALWAYS use edit (regardless of what the LLM chose)
  if (opts.imageBase64) {
    console.log('[chatController] User attached image → using editImageGptImage1')
    base64Images = await editImageGptImage1(opts.imageBase64, imgPrompt, imgSize)
  } else if (imgAction === 'edit' && opts.lastGeneratedImageUrl) {
    // Iterative editing: fetch the previously generated image from storage and edit it
    try {
      console.log('[chatController] Iterative edit → fetching previous image from URL')
      const imgRes = await fetch(opts.lastGeneratedImageUrl)
      const imgBuf = Buffer.from(await imgRes.arrayBuffer())
      base64Images = await editImageGptImage1(imgBuf.toString('base64'), imgPrompt, imgSize)
    } catch (fetchErr) {
      console.error('[chatController] Failed to fetch lastGeneratedImageUrl, falling back to generate:', fetchErr)
      base64Images = await generateImageGptImage1(imgPrompt, imgSize, imgVariants as 1 | 2 | 3)
    }
  } else {
    base64Images = await generateImageGptImage1(imgPrompt, imgSize, imgVariants as 1 | 2 | 3)
  }

  if (base64Images.length === 0) {
    return {
      result: 'Image generation failed. The service may be temporarily unavailable.',
      action: { tool: 'generate_image', imagePrompt: imgPrompt },
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
    })
    imageUrls = stored.map(s => s.url)
    await incrementImageUsage(opts.uid, base64Images.length)
  } else {
    // Guest users: return data URIs (no storage)
    imageUrls = base64Images.map(b64 => `data:image/png;base64,${b64}`)
  }

  // Extract style descriptors for consistency
  const styleDescriptors = extractStyleDescriptors(imgPrompt)

  return {
    result: `Image${imageUrls.length > 1 ? 's' : ''} generated successfully. ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''} created.`,
    action: {
      tool: 'generate_image',
      imagePrompt: imgPrompt,
      imageAction: imgAction as any,
      imageAspectRatio: imgSize,
      imageVariants: imageUrls.length,
    },
    imageUrls,
    styleDescriptors,
  }
}

// ── Non-streaming chat handler ──────────────────────────────────────────────────

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization, imageBase64, imageMimeType, lastGeneratedImageUrl } = req.body as ChatPayload

  if (!message && !audioBase64 && !imageBase64) {
    res.status(400).json({ error: 'message, audioBase64, or imageBase64 is required' })
    return
  }

  const uid = req.user?.uid ?? null
  const isLoggedIn = uid !== null

  try {
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, language)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory)

    // Fetch user profile for premium status and role
    let isPremium = false
    let userRole: string | null = null
    if (isLoggedIn) {
      const profileSnap = await getDoc(doc(db, 'users', uid))
      if (profileSnap.exists()) {
        isPremium = profileSnap.data().isPremium ?? false
        userRole = profileSnap.data().role ?? null
      }
    }

    const targetLanguage = determineTargetLanguage(language, detectedLanguage)
    const systemPrompt = await buildSystemPrompt(mode, englishText, userRole, userPersonalization)
      + buildLanguageInstruction(targetLanguage)

    // Build tools array — always include IMAGE_TOOL + PLANNER_TOOLS for logged-in users
    const tools: ChatCompletionTool[] = [IMAGE_TOOL]
    if (isLoggedIn) {
      tools.push(...PLANNER_TOOLS)
    }

    // Pass user-attached image as vision data so LLM can see it
    const visionData = (imageBase64 && imageMimeType) ? { base64: imageBase64, mimeType: imageMimeType } : undefined

    const aiResult = await callAzureAI(history, englishText, systemPrompt, tools, visionData)

    // Store token usage for logged-in users
    console.log(`[chatController] usage — isLoggedIn=${isLoggedIn} uid=${uid} usage=`, aiResult.usage)
    if (isLoggedIn && uid && aiResult.usage) {
      incrementUserUsage(uid, aiResult.usage).catch(err =>
        console.error('[chatController] usage write failed', err)
      )
    } else {
      console.warn(`[chatController] skipping usage write — isLoggedIn=${isLoggedIn} uid=${uid} hasUsage=${!!aiResult.usage}`)
    }

    const toolActions: ToolAction[] = []
    let finalAiText = aiResult.text
    let calendarEvent: CalendarEvent | null = null
    let imageUrls: string[] = []

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
          })
          toolActions.push(imgResult.action)
          imageUrls = imgResult.imageUrls
          toolResults.push({ id: tc.id, result: imgResult.result })
          continue
        }

        // Planner tools (logged-in only)
        if (!isLoggedIn) continue

        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)

        // save_reminder tool provides the calendarEvent directly
        if (outcome.calendarEvent) {
          calendarEvent = outcome.calendarEvent
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
            calendarEvent: null,
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

    // Fallback: parse legacy CALENDAR_EVENT text block (non-tool path or old responses)
    let cleanedText = finalAiText
    if (!calendarEvent) {
      const calendarMatch = finalAiText.match(/CALENDAR_EVENT:(\{[\s\S]*?\})\s*$/)
      if (calendarMatch) {
        try { calendarEvent = JSON.parse(calendarMatch[1]) as CalendarEvent } catch { /* ignore */ }
        cleanedText = finalAiText.replace(/\s*CALENDAR_EVENT:\{[\s\S]*?\}\s*$/, '').trimEnd()
      }
    }

    const { text: finalText, audioUrl } = await processOutbound(cleanedText, detectedLanguage)

    const response: ChatResponse = {
      text: finalText,
      audioUrl,
      imageUrl: imageUrls[0] ?? null,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      calendarEvent,
      toolActions,
      mode,
      detectedLanguage,
    }
    res.status(200).json(response)
  } catch (err: any) {
    console.error('[chatController]', err)
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

  try {
    const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization, imageBase64, imageMimeType, lastGeneratedImageUrl } = req.body as ChatPayload

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
    if (isLoggedIn) {
      const profileSnap = await getDoc(doc(db, 'users', uid))
      if (profileSnap.exists()) {
        isPremium = profileSnap.data().isPremium ?? false
        userRole = profileSnap.data().role ?? null
      }
    }

    const targetLanguage = determineTargetLanguage(language, detectedLanguage)
    const systemPrompt = await buildSystemPrompt(mode, englishText, userRole, userPersonalization)
      + buildLanguageInstruction(targetLanguage)

    // Build tools array — always include IMAGE_TOOL + PLANNER_TOOLS for logged-in users
    const tools: ChatCompletionTool[] = [IMAGE_TOOL]
    if (isLoggedIn) {
      tools.push(...PLANNER_TOOLS)
    }

    // Pass user-attached image as vision data so LLM can see it
    const visionData = (imageBase64 && imageMimeType) ? { base64: imageBase64, mimeType: imageMimeType } : undefined

    const toolActions: ToolAction[] = []
    let calendarEvent: CalendarEvent | null = null
    let imageUrls: string[] = []
    let fullText = ''

    // ── Stream first LLM call ────────────────────────────────────────────────
    let firstPassToolCalls: { id: string; name: string; args: Record<string, any> }[] = []
    let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

    for await (const event of streamCallAzureAI(history, englishText, systemPrompt, tools, visionData)) {
      if (event.type === 'chunk') {
        sse({ t: 'c', v: event.text })
        fullText += event.text
      } else {
        firstPassToolCalls = event.toolCalls
        streamUsage = event.usage
      }
    }

    // Store token usage for logged-in users
    console.log(`[chatController:stream] usage — isLoggedIn=${isLoggedIn} uid=${uid} usage=`, streamUsage)
    if (isLoggedIn && uid && streamUsage) {
      incrementUserUsage(uid, streamUsage).catch(err =>
        console.error('[chatController:stream] usage write failed', err)
      )
    } else {
      console.warn(`[chatController:stream] skipping usage write — isLoggedIn=${isLoggedIn} uid=${uid} hasUsage=${!!streamUsage}`)
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
          })
          toolActions.push(imgResult.action)
          imageUrls = imgResult.imageUrls
          toolResults.push({ id: tc.id, result: imgResult.result })
          continue
        }

        // Planner tools (logged-in only)
        if (!isLoggedIn) continue

        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)
        if (outcome.calendarEvent) calendarEvent = outcome.calendarEvent

        if (outcome.result === 'STORAGE_LIMIT_REACHED') {
          const limitMsg = "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!"
          sse({ t: 'c', v: limitMsg })
          sse({ t: 'd', text: limitMsg, calendarEvent: null, toolActions, mode, detectedLanguage, audioUrl: null, imageUrl: null, imageUrls: [] })
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

    // ── Post-process: strip legacy CALENDAR_EVENT block if present ───────────
    let cleanedText = fullText
    if (!calendarEvent) {
      const m = fullText.match(/CALENDAR_EVENT:(\{[\s\S]*?\})\s*$/)
      if (m) {
        try { calendarEvent = JSON.parse(m[1]) } catch { /* ignore */ }
        cleanedText = fullText.replace(/\s*CALENDAR_EVENT:\{[\s\S]*?\}\s*$/, '').trimEnd()
      }
    }

    // TTS after full text is ready
    const { audioUrl } = await processOutbound(cleanedText, detectedLanguage)

    sse({ t: 'd', text: cleanedText, calendarEvent, toolActions, mode, detectedLanguage, audioUrl, imageUrl: imageUrls[0] ?? null, imageUrls })
    res.end()
  } catch (err: any) {
    console.error('[chatController:stream]', err)
    sse({ t: 'e', msg: err.message ?? 'Internal server error' })
    res.end()
  }
}
