import { api, apiAll, invalidate, liveQuery } from './apiClient'
import type { Timestamp } from '@/lib/timestamp'
import type { ChatThread, ChatMessage, Mode } from '@/types'

type Unsubscribe = () => void
const PAGE_SIZE = 30

// ── Threads ──────────────────────────────────────────────────────────────────

export async function createThread(_userId: string, firstMessage: string): Promise<string> {
  const t = await api<{ id: string }>('/conversations', { json: { firstMessage } })
  invalidate('threads')
  return t.id
}

const patchThread = async (threadId: string, body: Record<string, unknown>) => {
  await api(`/conversations/${threadId}`, { method: 'PATCH', json: body })
  invalidate('threads')
}
export const updateThreadMode = (threadId: string, mode: Mode) => patchThread(threadId, { mode })
export const updateThreadTitle = (threadId: string, title: string) => patchThread(threadId, { title })
export const togglePinThread = (threadId: string, pinned: boolean) => patchThread(threadId, { pinned })
export const archiveThread = (threadId: string, archived: boolean) => patchThread(threadId, { archived })
export const updateThreadTags = (threadId: string, tags: string[]) => patchThread(threadId, { tags })

/** Deletes the thread, its messages and the caller's stored images (server-side). */
export async function deleteThread(threadId: string): Promise<void> {
  await api(`/conversations/${threadId}`, { method: 'DELETE' })
  invalidate('threads')
}

export function subscribeToThreads(_userId: string, callback: (threads: ChatThread[]) => void): Unsubscribe {
  return liveQuery('threads', async () => {
    const rows = await apiAll<ChatThread>('/conversations', 5)
    return rows
      .map((t) => ({ pinned: false, archived: false, tags: [], ...t }) as ChatThread)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1 // pinned first
        return ((b.updatedAt as unknown as Timestamp)?.toMillis?.() ?? 0) - ((a.updatedAt as unknown as Timestamp)?.toMillis?.() ?? 0)
      })
  }, callback, { intervalMs: 45_000 })
}

// ── Messages ─────────────────────────────────────────────────────────────────

// Callers don't need to supply `id` or `timestamp` — both are set server-side.
export type NewMessage = Omit<ChatMessage, 'id' | 'timestamp'>

/** API rows carry `createdAt`; the UI model calls it `timestamp`. */
const toMessage = (m: Record<string, unknown>): ChatMessage => {
  const { createdAt, conversationId: _c, userId: _u, ...rest } = m
  return { ...rest, timestamp: createdAt } as unknown as ChatMessage
}

export async function addMessage(threadId: string, message: NewMessage): Promise<string> {
  const { id: _i, ...body } = message as NewMessage & { id?: string }
  const m = await api<{ id: string }>(`/conversations/${threadId}/messages`, { json: body })
  invalidate('threads', `messages:${threadId}`)
  return m.id
}

export async function toggleLikeMessage(threadId: string, messageId: string, liked: boolean): Promise<void> {
  await api(`/conversations/${threadId}/messages/${messageId}`, { method: 'PATCH', json: { liked } })
}

/** Opaque "older than this" marker, replacing the Firestore `DocumentSnapshot` the UI used to hold. */
export interface MessageCursor { cursor: string }

export function subscribeToMessages(threadId: string, callback: (messages: ChatMessage[]) => void): Unsubscribe {
  return liveQuery(`messages:${threadId}`, async () => (await loadLatestMessages(threadId)).messages, callback, { intervalMs: 0 })
}

export interface PaginatedMessages {
  messages: ChatMessage[]
  hasMore: boolean
  firstDoc: MessageCursor | null
}

const page = (r: { items: Record<string, unknown>[]; nextCursor: string | null }): PaginatedMessages => ({
  messages: r.items.map(toMessage).reverse(), // API is newest-first; the UI renders oldest-first
  hasMore: r.nextCursor !== null,
  firstDoc: r.nextCursor ? { cursor: r.nextCursor } : null,
})

/** Ownership is enforced by every conversation endpoint (403/404 for another user's thread). */
export async function getThreadOwnerId(threadId: string): Promise<string | null> {
  try {
    return (await api<{ userId: string }>(`/conversations/${threadId}`)).userId ?? null
  } catch {
    return null
  }
}

export async function loadLatestMessages(threadId: string): Promise<PaginatedMessages> {
  return page(await api(`/conversations/${threadId}/messages?limit=${PAGE_SIZE}`))
}

export async function loadOlderMessages(threadId: string, before: MessageCursor): Promise<PaginatedMessages> {
  return page(await api(`/conversations/${threadId}/messages?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(before.cursor)}`))
}

// ── Full-text search across messages ──────────────────────────────────────────

export interface SearchResult {
  threadId: string
  threadTitle: string
  messageId: string
  snippet: string
  role: 'user' | 'assistant'
  timestamp: Date
}

/** Search all messages across user's threads (client-side filtering) */

export async function searchAllMessages(_userId: string, queryStr: string, _threads?: ChatThread[]): Promise<SearchResult[]> {
  const r = await api<{ items: (Omit<SearchResult, 'timestamp'> & { timestamp: Timestamp })[] }>(`/search/messages?q=${encodeURIComponent(queryStr)}&limit=50`)
  return r.items.map((x) => ({ ...x, timestamp: x.timestamp?.toDate?.() ?? new Date() }))
}

// ── Shared chats ───────────────────────────────────────────────────────────────

export interface SharedChatProductCard {
  uid: string
  name: string
  description: string
  imageUrl: string
  productUrl: string
}

export interface SharedChatMessage {
  role: 'user' | 'assistant'
  content: string
  mode?: Mode
  timestamp: Date
  imageUrl?: string | null
  imageUrls?: string[]
  products?: SharedChatProductCard[]
}

export interface SharedChatData {
  threadTitle: string
  messages: SharedChatMessage[]
  sharedAt: Date
  expiresAt: Date
}

/** Deep-strip `undefined` values from a plain object. Firestore rejects
 *  undefined on the Web SDK by default (no `ignoreUndefinedProperties`),
 *  so the share write would throw if ANY message on the thread has an
 *  undefined field (e.g. `mode` on older messages, or `description` on
 *  a product where the backend didn't set it). */

export async function createSharedChat(threadId: string, _threadTitle?: string): Promise<string> {
  return (await api<{ shareId: string }>(`/conversations/${threadId}/share`, { method: 'POST' })).shareId
}

export async function getSharedChat(shareId: string): Promise<SharedChatData | null> {
  try {
    const d = await api<{ threadTitle: string; messages: any[]; sharedAt: Timestamp; expiresAt: Timestamp }>(`/shared-chats/${encodeURIComponent(shareId)}`)
    return {
      threadTitle: d.threadTitle,
      messages: (d.messages ?? []).map((m) => ({ ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() })),
      sharedAt: d.sharedAt?.toDate?.() ?? new Date(),
      expiresAt: d.expiresAt?.toDate?.() ?? new Date(0),
    }
  } catch {
    return null
  }
}

// ── Images ─────────────────────────────────────────────────────────────────────

/** Removes `imageUrl` from the message (marking it deleted when none remain) and, best-effort, from storage. */
export async function removeMessageImage(threadId: string, messageId: string, imageUrl: string): Promise<void> {
  await api(`/conversations/${threadId}/messages/${messageId}/image?url=${encodeURIComponent(imageUrl)}`, { method: 'DELETE' })
  invalidate(`messages:${threadId}`)
}

/** Uploads a user-attached image (base64) and returns its download URL. */
export async function uploadAttachedImage(_userId: string, threadId: string, base64Data: string, mimeType: string = 'image/png'): Promise<string> {
  return (await api<{ url: string }>('/uploads/attachment', { json: { threadId, base64: base64Data, mimeType } })).url
}
