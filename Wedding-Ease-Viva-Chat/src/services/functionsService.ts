import { apiUrl, authHeaders, rememberGuestId } from './apiClient'
import type { ChatFunctionPayload, ChatFunctionResponse, CalendarEvent } from '@/types'
import { QUOTA_EVENT, type QuotaExceededPayload } from '@/services/accountService'
// CalendarEvent kept here transitionally — used in StreamDoneEvent below until backend drops the field.


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

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  })
  rememberGuestId(res)

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

// Hard ceiling on a transcription request so a stalled STT call can't hang the
// mic UI forever. Combines a caller's cancel signal with a timeout: a user
// cancel aborts with AbortError (silent in useVoice), a timeout aborts with a
// TimeoutError DOMException (surfaced to the user).
const STT_REQUEST_TIMEOUT_MS = 20_000

function withTimeoutSignal(
  signal: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const onAbort = (reason: unknown) => { try { ctrl.abort(reason) } catch { /* noop */ } }
  const id = setTimeout(
    () => onAbort(new DOMException('Voice request timed out', 'TimeoutError')),
    ms,
  )
  if (signal) {
    if (signal.aborted) onAbort(signal.reason)
    else signal.addEventListener('abort', () => onAbort(signal.reason), { once: true })
  }
  return { signal: ctrl.signal, clear: () => clearTimeout(id) }
}

export async function transcribeViaBackend(
  audioBase64: string,
  signal?: AbortSignal,
  language?: string
): Promise<{ text: string; detectedLanguage: string; reason?: string }> {
  const t = withTimeoutSignal(signal, STT_REQUEST_TIMEOUT_MS)
  try {
    return await post('/api/transcribe', { audioBase64, language }, t.signal)
  } finally {
    t.clear()
  }
}

// ── Active exports — swap to switch between backends ─────────────────────────
// Currently: backend REST API (supports AbortSignal / stop generation)
// To switch to Firebase Functions: replace with chatViaFunctions / transcribeViaFunctions
export async function generateImage(prompt: string): Promise<{ imageUrl: string }> {
  return post<{ imageUrl: string }>('/api/generate-image', { prompt })
}

// ── Streaming chat (SSE) ───────────────────────────────────────────────────────

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
export interface StreamProductsEvent { t: 'p'; products: StreamProductCard[]; hasMore: boolean; productsQuery?: string }
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
  productsQuery?: string
  /** Ephemeral follow-up question chips for this reply — held in memory only,
   * never persisted. Empty/absent when generation was skipped or failed. */
  suggestions?: string[]
}
export interface StreamErrorEvent { t: 'e'; msg: string }
export interface StreamImageEvent { t: 'img'; status: 'generating' | 'partial'; data?: string }
export type StreamSSEEvent = StreamChunkEvent | StreamProductsEvent | StreamDoneEvent | StreamErrorEvent | StreamImageEvent

export async function* streamChatMessage(
  payload: ChatFunctionPayload,
  signal?: AbortSignal
): AsyncGenerator<StreamSSEEvent> {
  const res = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', ...authHeaders() },
    body: JSON.stringify(payload),
    signal,
  })
  rememberGuestId(res)

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
    throw new Error((err as any).error ?? `Stream failed: ${res.status}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try { yield JSON.parse(raw) as StreamSSEEvent } catch { /* skip malformed */ }
    }
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
    await fetch(apiUrl('/api/chat/cancel'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ requestId }),
      keepalive: true,  // allow the request to outlive the page if user navigates
    })
  } catch {
    // swallow — Stop should never be blocked by a failed cancel call
  }
}

export const sendChatMessage = chatViaBackend
export const transcribeAudio = transcribeViaBackend
