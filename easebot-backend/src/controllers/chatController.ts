import { collection, doc, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Request, Response } from 'express'
import { processInbound } from '../pipeline/inbound'
import { processOutbound } from '../pipeline/outbound'
import { callAzureAI } from '../services/azureAI'
import { isImageRequest, generateImage } from '../services/imageGeneration'
import { getRelevantProducts, formatProductsContext } from '../services/products'
import { detectMode } from '../modeRouter'
import { getPlannerPrompt } from '../prompts/planner'
import { getStylistPrompt } from '../prompts/stylist'
import { getTherapistPrompt } from '../prompts/therapist'
import { getKnowledgePrompt } from '../prompts/knowledge'
import { getConsultantPrompt } from '../prompts/consultant'
import { getAssistantPrompt } from '../prompts/assistant'
import type { ChatPayload, ChatResponse, CalendarEvent, HistoryMessage, Mode } from '../types'

async function buildSystemPrompt(mode: Mode, userMessage: string): Promise<string> {
  if (mode === 'stylist') {
    try {
      const products = await getRelevantProducts(userMessage)
      const context = formatProductsContext(products)
      return getStylistPrompt(context)
    } catch {
      return getStylistPrompt()
    }
  }
  switch (mode) {
    case 'planner':    return getPlannerPrompt()
    case 'therapist':  return getTherapistPrompt()
    case 'knowledge':  return getKnowledgePrompt()
    case 'consultant': return getConsultantPrompt()
    default:           return getAssistantPrompt()
  }
}

async function getChatHistory(threadId: string | undefined, providedHistory: HistoryMessage[] | undefined, historyLimit = 10): Promise<HistoryMessage[]> {
  // If no threadId (guest) but history is provided, use that
  if (!threadId && providedHistory && providedHistory.length > 0) {
    return providedHistory.slice(-historyLimit)
  }
  
  // If threadId is provided, fetch from Firestore
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
  const { message, threadId, audioBase64, language, mode: requestedMode, history: providedHistory } = req.body as ChatPayload

  if (!message && !audioBase64) { res.status(400).json({ error: 'message or audioBase64 is required' }); return }

  try {
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, language)
    const mode: Mode = requestedMode ?? detectMode(englishText)
    const history = await getChatHistory(threadId, providedHistory)
    const systemPrompt = await buildSystemPrompt(mode, englishText)
    const [aiEnglishText, imageUrl] = await Promise.all([
      callAzureAI(history, englishText, systemPrompt),
      isImageRequest(englishText) ? generateImage(englishText) : Promise.resolve(null),
    ])

    // Extract CALENDAR_EVENT JSON block if present (planner mode)
    let calendarEvent: CalendarEvent | null = null
    let cleanedText = aiEnglishText
    const calendarMatch = aiEnglishText.match(/CALENDAR_EVENT:(\{[\s\S]*?\})\s*$/)
    if (calendarMatch) {
      try {
        calendarEvent = JSON.parse(calendarMatch[1]) as CalendarEvent
        // Strip the entire CALENDAR_EVENT line + any trailing whitespace/text after it
        cleanedText = aiEnglishText.slice(0, calendarMatch.index).trimEnd()
      } catch {
        // If JSON parse fails, still strip the raw line so it doesn't show in chat
        cleanedText = aiEnglishText.slice(0, calendarMatch.index).trimEnd()
        console.warn('[chatController] Failed to parse CALENDAR_EVENT JSON')
      }
    }

    const { text: finalText, audioUrl } = await processOutbound(cleanedText, detectedLanguage)
    const response: ChatResponse = { text: finalText, audioUrl, imageUrl, calendarEvent, mode, detectedLanguage }
    res.status(200).json(response)
  } catch (err: any) {
    console.error('[chatController]', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
