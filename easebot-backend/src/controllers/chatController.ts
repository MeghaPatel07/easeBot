import { collection, doc, getDocs, orderBy, query, limit, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Request, Response } from 'express'
import { processInbound } from '../pipeline/inbound'
import { processOutbound } from '../pipeline/outbound'
import { callAzureAI, callAzureAIWithToolResults, streamCallAzureAI, streamCallAzureAIWithToolResults } from '../services/azureAI'
import { isImageRequest, generateImage } from '../services/imageGeneration'
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

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization } = req.body as ChatPayload

  if (!message && !audioBase64) {
    res.status(400).json({ error: 'message or audioBase64 is required' })
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

    // Enable function calling for planner mode (logged-in only)
    const tools = (isLoggedIn && mode === 'planner') ? PLANNER_TOOLS : undefined

    const [aiResult, imageUrl] = await Promise.all([
      callAzureAI(history, englishText, systemPrompt, tools),
      isImageRequest(englishText) ? generateImage(englishText).catch(() => null) : Promise.resolve(null),
    ])

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

    // Execute tool calls if any
    if (aiResult.toolCalls.length > 0 && isLoggedIn) {
      const toolResults: { id: string; result: string }[] = []

      for (const tc of aiResult.toolCalls) {
        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)

        // save_reminder tool provides the calendarEvent directly — no regex needed
        if (outcome.calendarEvent) {
          calendarEvent = outcome.calendarEvent
        }

        if (outcome.result === 'STORAGE_LIMIT_REACHED') {
          const { text: limitText, audioUrl } = await processOutbound(
            "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!",
            detectedLanguage
          )
          res.status(200).json({ text: limitText, audioUrl, imageUrl, calendarEvent: null, toolActions, mode, detectedLanguage } as ChatResponse)
          return
        }

        toolResults.push({ id: tc.id, result: outcome.result })
      }

      // Second LLM call to get user-facing reply with tool results injected
      finalAiText = await callAzureAIWithToolResults(
        history, englishText, systemPrompt, aiResult.toolCalls, toolResults
      )
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
      imageUrl,
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
    const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory, userPersonalization } = req.body as ChatPayload

    if (!message && !audioBase64) {
      sse({ t: 'e', msg: 'message or audioBase64 is required' })
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
    const tools = (isLoggedIn && mode === 'planner') ? PLANNER_TOOLS : undefined

    const toolActions: ToolAction[] = []
    let calendarEvent: CalendarEvent | null = null
    let fullText = ''

    // ── Stream first LLM call ────────────────────────────────────────────────
    let firstPassToolCalls: { id: string; name: string; args: Record<string, any> }[] = []
    let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

    for await (const event of streamCallAzureAI(history, englishText, systemPrompt, tools)) {
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
    if (firstPassToolCalls.length > 0 && isLoggedIn) {
      // Reset text — when tools are called the first pass emits no readable content
      fullText = ''
      const toolResults: { id: string; result: string }[] = []

      for (const tc of firstPassToolCalls) {
        const outcome = await executeToolCall(uid, tc.name, tc.args, isPremium)
        toolActions.push(outcome.action)
        if (outcome.calendarEvent) calendarEvent = outcome.calendarEvent

        if (outcome.result === 'STORAGE_LIMIT_REACHED') {
          const limitMsg = "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!"
          sse({ t: 'c', v: limitMsg })
          sse({ t: 'd', text: limitMsg, calendarEvent: null, toolActions, mode, detectedLanguage, audioUrl: null, imageUrl: null })
          res.end(); return
        }

        toolResults.push({ id: tc.id, result: outcome.result })
      }

      for await (const chunk of streamCallAzureAIWithToolResults(history, englishText, systemPrompt, firstPassToolCalls, toolResults)) {
        sse({ t: 'c', v: chunk })
        fullText += chunk
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

    sse({ t: 'd', text: cleanedText, calendarEvent, toolActions, mode, detectedLanguage, audioUrl, imageUrl: null })
    res.end()
  } catch (err: any) {
    console.error('[chatController:stream]', err)
    sse({ t: 'e', msg: err.message ?? 'Internal server error' })
    res.end()
  }
}
