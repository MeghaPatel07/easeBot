import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/lib/firebase'
import type { ChatFunctionPayload, ChatFunctionResponse, CalendarEvent } from '@/types'
import { QUOTA_EVENT, type QuotaExceededPayload } from '@/services/accountService'
// CalendarEvent kept here transitionally — used in StreamDoneEvent below until backend drops the field.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://backend.theweddingbot.ai'

export interface ChatQuotaError extends Error {
  code: 'quota_exceeded'
  status: 402
  details: QuotaExceededPayload
}

function dispatchQuotaEvent(payload: QuotaExceededPayload): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUOTA_EVENT, { detail: payload }))
  }
}

function makeQuotaError(payload: QuotaExceededPayload): ChatQuotaError {
  const err = new Error(payload.message || 'Quota exceeded') as ChatQuotaError
  err.code = 'quota_exceeded'
  err.status = 402
  err.details = payload
  return err
}

// ── Backend REST API ──────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  const token = await user.getIdToken()
  // Expose on window so checklistService can read it for direct PATCH calls
  ;(window as any).__firebaseToken = token
  return token
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const token = await getAuthToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 402) {
    const payload = (await res.json().catch(() => null)) as QuotaExceededPayload | null
    if (payload) dispatchQuotaEvent(payload)
    throw makeQuotaError(payload ?? {
      error: 'quota_exceeded',
      reason: 'daily_cap_exceeded',
      message: 'Quota exceeded',
      resetAt: null,
      upgradeUrl: '/pricing',
    })
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function chatViaBackend(
  payload: ChatFunctionPayload,
  signal?: AbortSignal
): Promise<ChatFunctionResponse> {
  return post<ChatFunctionResponse>('/api/chat', payload, signal)
}

export async function transcribeViaBackend(
  audioBase64: string,
  signal?: AbortSignal,
  language?: string
): Promise<{ text: string; detectedLanguage: string }> {
  return post('/api/transcribe', { audioBase64, language }, signal)
}

// ── Firebase httpsCallable (available, not currently active) ──────────────────
// To switch: change the active exports at the bottom of this file.

export async function chatViaFunctions(
  payload: ChatFunctionPayload,
  _signal?: AbortSignal   // httpsCallable does not support AbortSignal
): Promise<ChatFunctionResponse> {
  const fn = httpsCallable<ChatFunctionPayload, ChatFunctionResponse>(functions, 'chat')
  const result = await fn(payload)
  return result.data
}

export async function transcribeViaFunctions(
  audioBase64: string,
  _signal?: AbortSignal
): Promise<{ text: string; detectedLanguage: string }> {
  const fn = httpsCallable<{ audioBase64: string }, { text: string; detectedLanguage: string }>(
    functions,
    'transcribeAudio'
  )
  const result = await fn({ audioBase64 })
  return result.data
}

// ── Active exports — swap to switch between backends ─────────────────────────
// Currently: backend REST API (supports AbortSignal / stop generation)
// To switch to Firebase Functions: replace with chatViaFunctions / transcribeViaFunctions
export async function generateImage(prompt: string): Promise<{ imageUrl: string }> {
  return post<{ imageUrl: string }>('/api/generate-image', { prompt })
}

// ── Streaming chat (Cloud Functions with polling) ───────────────────────────────

export interface StreamProductCard {
  uid: string
  name: string
  description: string
  imageUrl: string
  productUrl: string
  price?: number
  currency?: string
}
export interface StreamChunkEvent { t: 'c'; v: string }
export interface StreamProductsEvent { t: 'p'; products: StreamProductCard[]; hasMore: boolean }
export interface StreamDoneEvent {
  t: 'd'
  text: string
  calendarEvent: CalendarEvent | null
  toolActions: { tool: string; checklistId?: string; itemId?: string; checklistTitle?: string; checklistItems?: string[]; imagePrompt?: string; imageAction?: string; imageAspectRatio?: string; imageVariants?: number }[]
  mode: string
  detectedLanguage: string
  /** The language the AI actually responded in (for TTS voice selection). */
  responseLanguage?: string
  audioUrl: string | null
  imageUrl: string | null
  imageUrls?: string[]
  imageQuota?: { allowed: boolean; remaining: number; dailyUsed: number; dailyLimit: number; resetAt: string }
  styleMemory?: { descriptors: string[]; colorPalette: string[]; aestheticRegister: string; culturalContext: string; lastGeneratedImageUrl: string | null }
  products?: StreamProductCard[]
  productsHasMore?: boolean
}
export interface StreamErrorEvent { t: 'e'; msg: string }
export interface StreamImageEvent { t: 'img'; status: 'generating' | 'partial'; data?: string }
export type StreamSSEEvent = StreamChunkEvent | StreamProductsEvent | StreamDoneEvent | StreamErrorEvent | StreamImageEvent

export async function* streamChatMessage(
  payload: ChatFunctionPayload,
  signal?: AbortSignal
): AsyncGenerator<StreamSSEEvent> {
  // Import here to avoid circular dependencies
  const { streamChatViaCloudFunctions } = await import('./cloudFunctionsService')

  // Generate unique request ID for this chat request
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  // Convert ChatFunctionPayload to CloudFunctionsService format
  const cfRequest = {
    threadId: (payload as any).threadId ?? null,
    message: payload.message,
    mode: (payload as any).mode ?? 'assistant',
    language: (payload as any).language,
    audioBase64: (payload as any).audioBase64,
    imageBase64: (payload as any).imageBase64,
    imageMimeType: (payload as any).imageMimeType,
    userPersonalization: (payload as any).userPersonalization,
    attachments: (payload as any).attachments,
    forceImageGeneration: (payload as any).forceImageGeneration,
    skipImageGeneration: (payload as any).skipImageGeneration,
    preferredAspectRatio: (payload as any).preferredAspectRatio,
    vibeTitle: (payload as any).vibeTitle,
    vibeDescriptors: (payload as any).vibeDescriptors,
    styleMemory: (payload as any).styleMemory,
    requestId,
  }

  try {
    // Use Cloud Functions with polling for streaming
    for await (const update of streamChatViaCloudFunctions(cfRequest, signal, 400)) {
      // Map cloud function updates to SSE event format
      const event: StreamSSEEvent = {
        ...update,
      } as any

      yield event
    }
  } catch (error: any) {
    if (error.message?.includes('quota_exceeded') || error.code === 'quota_exceeded') {
      const payload = error.details ?? {
        error: 'quota_exceeded',
        reason: 'unknown',
        message: error.message || 'Quota exceeded',
        resetAt: null,
        upgradeUrl: '/pricing',
      }
      dispatchQuotaEvent(payload)
      throw makeQuotaError(payload)
    }
    throw error
  }
}

/**
 * Explicitly cancel an in-flight chat stream. We call this alongside
 * `AbortController.abort()` on the fetch because production reverse
 * proxies/LBs often hold the upstream socket open after a client abort — the
 * backend never sees `req.on('close')` fire, and the image pipeline (Azure
 * fetch + Firebase Storage upload + Firestore write) runs to completion
 * regardless. This endpoint sets an in-memory flag the backend checks.
 *
 * Best-effort: failures are swallowed so Stop feels instant.
 */
export async function cancelChatRequest(requestId: string): Promise<void> {
  try {
    // Import here to avoid circular dependencies
    const { chatCancel } = await import('./cloudFunctionsService')
    await chatCancel(requestId)
  } catch {
    // swallow — Stop should never be blocked by a failed cancel call
    console.warn('[cancelChatRequest] Cancel request failed (expected for slow connections)')
  }
}

export const sendChatMessage = chatViaBackend
export const transcribeAudio = transcribeViaBackend
