import * as admin from 'firebase-admin'
import { Request, Response } from 'express'
import { processInbound } from '../pipeline/inbound'
import { processOutbound } from '../pipeline/outbound'
import { callAzureAI } from '../services/azureAI'
import { trackTokens } from '../services/tokenTracker'
import { isImageRequest, generateImage } from '../services/imageGeneration'
import { getRelevantProducts, formatProductsContext } from '../services/products'
import { detectMode } from '../modeRouter'
import { getPlannerPrompt } from '../prompts/planner'
import { getStylistPrompt } from '../prompts/stylist'
import { getTherapistPrompt } from '../prompts/therapist'
import { getKnowledgePrompt } from '../prompts/knowledge'
import { getConsultantPrompt } from '../prompts/consultant'
import { getAssistantPrompt } from '../prompts/assistant'
import { getGuestPrompt } from '../prompts/guest'
import type { ChatPayload, ChatResponse, HistoryMessage, Mode } from '../types'

const db = admin.firestore()

// BCP-47 base code → human-readable language name for the system prompt
const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  gu: 'Gujarati',
  es: 'Spanish',
  fr: 'French',
  ar: 'Arabic',
  pt: 'Portuguese',
  de: 'German',
  zh: 'Chinese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  tr: 'Turkish',
  nl: 'Dutch',
  pl: 'Polish',
}

function buildLanguageRule(detectedLanguage: string): string {
  const name = LANGUAGE_NAMES[detectedLanguage]
  if (name) {
    return ` Reply in ${name} only.`
  }
  return ` Reply in the same language the user wrote in.`
}

const IMAGE_CAPABILITY_NOTE =
  ` CRITICAL RULE — IMAGE GENERATION: You CAN generate images. When the user asks for an image, picture, or visual, respond with enthusiasm, confirm you are generating it, and briefly describe what it will look like. The image will appear automatically below your reply. NEVER say you cannot create or generate images. This is a hard rule with no exceptions.`

async function buildSystemPrompt(mode: Mode, userMessage: string, detectedLanguage: string): Promise<string> {
  let base: string

  if (mode === 'stylist') {
    try {
      const products = await getRelevantProducts(userMessage)
      const context = formatProductsContext(products)
      base = getStylistPrompt(context)
    } catch {
      base = getStylistPrompt()
    }
  } else {
    switch (mode) {
      case 'planner':    base = getPlannerPrompt();    break
      case 'therapist':  base = getTherapistPrompt();  break
      case 'knowledge':  base = getKnowledgePrompt();  break
      case 'consultant': base = getConsultantPrompt(); break
      default:           base = getAssistantPrompt()
    }
  }

  return base + buildLanguageRule(detectedLanguage)
}

async function getChatHistory(threadId: string, limit = 10): Promise<HistoryMessage[]> {
  const snap = await db
    .collection('chats').doc(threadId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get()

  return snap.docs
    .reverse()
    .map(d => ({ role: d.data().role as 'user' | 'assistant', content: d.data().content as string }))
}

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { message, threadId, audioBase64, language, mode: requestedMode, history: clientHistory } = req.body as ChatPayload

  if (!message && !audioBase64) {
    res.status(400).json({ error: 'message or audioBase64 is required' })
    return
  }

  const uid: string | null = req.user?.uid ?? null
  const isLoggedIn = uid !== null

  try {
    const { englishText, detectedLanguage } = await processInbound(message, audioBase64, language)
    const mode: Mode = requestedMode ?? detectMode(englishText)

    // Guest mode (threadId null): use client-supplied history. Logged-in: fetch from Firestore.
    const history: HistoryMessage[] = threadId
      ? await getChatHistory(threadId)
      : (clientHistory ?? [])

    // Logged-in users get full mode-specific prompts (max 800 tokens).
    // Guests get a compact prompt and capped at 300 tokens to minimise cost.
    const systemPrompt = isLoggedIn
      ? await buildSystemPrompt(mode, englishText, detectedLanguage) + IMAGE_CAPABILITY_NOTE
      : getGuestPrompt() + buildLanguageRule(detectedLanguage) + IMAGE_CAPABILITY_NOTE

    const maxTokens = isLoggedIn ? 800 : 300

    const aiResult = await callAzureAI(history, englishText, systemPrompt, maxTokens)
    const { text: finalText, audioUrl } = await processOutbound(aiResult.text, detectedLanguage)

    // Track token usage in Firestore for logged-in users (fire-and-forget)
    if (isLoggedIn) {
      trackTokens(uid, aiResult.usage).catch(err =>
        console.error('[chatController] token tracking failed:', err)
      )
    }

    // Generate image via Nano Banana if the user asked for one
    let imageUrl: string | null = null
    if (isImageRequest(englishText)) {
      imageUrl = await generateImage(englishText)
    }

    const response: ChatResponse = { text: finalText, audioUrl, imageUrl, mode, detectedLanguage }
    res.status(200).json(response)
  } catch (err: any) {
    console.error('[chatController] error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
