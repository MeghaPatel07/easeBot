import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/lib/firebase'
import type { ChatFunctionPayload, ChatFunctionResponse, CalendarEvent } from '@/types'
import { QUOTA_EVENT, type QuotaExceededPayload } from '@/services/accountService'
import { buildAuthHeaders } from '@/lib/guestSession'
import {
  OfflineError,
  NoStreamError,
  HttpStatusError,
  StreamTimeoutError,
  StreamWatchdog,
  parseRetryAfterMs,
} from '@/lib/chatSendErrors'
// CalendarEvent kept here transitionally — used in StreamDoneEvent below until backend drops the field.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://easebot-production.up.railway.app'

// Stream watchdog tuning (WE-20260601-303). The backend streams SSE; if no
// chunk arrives within IDLE_MS the connection is treated as stalled and aborted
// so the UI can surface a recoverable "response stalled" state instead of
// hanging on the typing skeleton forever. OVERALL_MS is a hard ceiling for the
// whole response (long image-gen turns can legitimately run for tens of
// seconds, so it is generous).
const STREAM_IDLE_TIMEOUT_MS = 45_000
const STREAM_OVERALL_TIMEOUT_MS = 180_000

// WE-20260601-300: a pre-flight guard so an offline send fails fast with a
// typed OfflineError instead of waiting for fetch to reject with an opaque
// TypeError that the old generic catch couldn't distinguish.
function assertOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError()
  }
}

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
  assertOnline()
  const token = await getAuthToken()
  // Authenticated → Authorization; anonymous → X-Guest-Id (valid guest session).
  // The backend rejects fully-anonymous callers on these routes (WE-20260527-202).
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...buildAuthHeaders(token) }

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
    const msg = (err as any).error ?? `Request failed: ${res.status}`
    // WE-20260601-300/301/302: preserve the HTTP status so the send-error
    // taxonomy can split 429 (rate-limited) and 400/413 (too-long) out of the
    // generic error bucket.
    throw new HttpStatusError(res.status, msg, parseRetryAfterMs(res.headers.get('Retry-After')))
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
  assertOnline()
  const token = await getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    ...buildAuthHeaders(token),
  }

  // WE-20260601-303: a watchdog that trips when the stream stalls. It chains
  // the caller's `signal` (Stop button) into its own AbortController so either
  // source aborts the fetch. `watchdog.timedOut` tells a watchdog abort apart
  // from a user Stop, so we can throw StreamTimeoutError instead of the
  // AbortError the user-Stop path expects.
  const watchdog = new StreamWatchdog(STREAM_IDLE_TIMEOUT_MS, STREAM_OVERALL_TIMEOUT_MS, signal)

  let res: Response
  try {
    watchdog.armIdle()
    res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: watchdog.signal,
    })
  } catch (err) {
    watchdog.clear()
    if (watchdog.timedOut) throw new StreamTimeoutError()
    throw err
  }

  if (res.status === 402) {
    watchdog.clear()
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
    watchdog.clear()
    const err = await res.json().catch(() => ({}))
    const msg = (err as any).error ?? `Stream failed: ${res.status}`
    throw new HttpStatusError(res.status, msg, parseRetryAfterMs(res.headers.get('Retry-After')))
  }

  // WE-20260601-304-adjacent: a 200 with no readable body is a malformed stream.
  // Surface it as a typed NoStreamError rather than crashing on `res.body!`.
  if (!res.body) {
    watchdog.clear()
    throw new NoStreamError()
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (err) {
        // The watchdog (idle/overall) aborted a stalled read → timeout.
        if (watchdog.timedOut) throw new StreamTimeoutError()
        throw err
      }
      const { done, value } = chunk
      if (done) break
      // A chunk arrived → reset the idle watchdog.
      watchdog.armIdle()
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
  } finally {
    // Always release the timers + user-abort listener, whether the stream
    // completed, threw, or the consumer broke out of the for-await loop early.
    watchdog.clear()
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
    const token = await getAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...buildAuthHeaders(token) }
    await fetch(`${API_BASE}/api/chat/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId }),
      keepalive: true,  // allow the request to outlive the page if user navigates
    })
  } catch {
    // swallow — Stop should never be blocked by a failed cancel call
  }
}

export const sendChatMessage = chatViaBackend
export const transcribeAudio = transcribeViaBackend
