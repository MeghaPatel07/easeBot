import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/lib/firebase'
import type { ChatFunctionPayload, ChatFunctionResponse, CalendarEvent } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

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
  audioBase64: string
): Promise<{ text: string; detectedLanguage: string }> {
  return post('/api/transcribe', { audioBase64 })
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
  audioBase64: string
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

export async function addCalendarEvent(
  googleAccessToken: string | null,
  event: CalendarEvent
): Promise<{ eventId: string; htmlLink: string }> {
  return post('/api/calendar/add-event', { googleAccessToken, event })
}

// ── Streaming chat (SSE) ───────────────────────────────────────────────────────

export interface StreamChunkEvent { t: 'c'; v: string }
export interface StreamDoneEvent {
  t: 'd'
  text: string
  calendarEvent: CalendarEvent | null
  toolActions: { tool: string; checklistId?: string; itemId?: string }[]
  mode: string
  detectedLanguage: string
  audioUrl: string | null
  imageUrl: string | null
}
export interface StreamErrorEvent { t: 'e'; msg: string }
export type StreamSSEEvent = StreamChunkEvent | StreamDoneEvent | StreamErrorEvent

export async function* streamChatMessage(
  payload: ChatFunctionPayload,
  signal?: AbortSignal
): AsyncGenerator<StreamSSEEvent> {
  const token = await getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  })

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

export const sendChatMessage = chatViaBackend
export const transcribeAudio = transcribeViaBackend
