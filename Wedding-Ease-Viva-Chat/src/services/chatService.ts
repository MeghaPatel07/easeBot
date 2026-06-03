import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  limitToLast,
  startAfter,
  endBefore,
  serverTimestamp,
  Unsubscribe,
  DocumentSnapshot,
} from 'firebase/firestore'
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import type { ChatThread, ChatMessage, Mode } from '@/types'

// ── Storage helpers ─────────────────────────────────────────────────────────

/** Extract a Firebase Storage path from a download URL, or null if external. */
function storageRefFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('firebasestorage.googleapis.com')) return null;
    const pathMatch = u.pathname.match(/\/o\/(.+?)(\?|$)/);
    if (!pathMatch) return null;
    return decodeURIComponent(pathMatch[1]);
  } catch {
    return null;
  }
}

// ── Threads ──────────────────────────────────────────────────────────────────

export async function createThread(userId: string, firstMessage: string): Promise<string> {
  const threadRef = await addDoc(collection(db, 'chats'), {
    userId,
    title: firstMessage.slice(0, 60),
    pinned: false,
    archived: false,
    tags: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    activeMode: 'assistant' as Mode,
  })
  return threadRef.id
}

export async function updateThreadMode(threadId: string, mode: Mode): Promise<void> {
  await updateDoc(doc(db, 'chats', threadId), {
    activeMode: mode,
    updatedAt: serverTimestamp(),
  })
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  await updateDoc(doc(db, 'chats', threadId), {
    title: title.slice(0, 60),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteThread(threadId: string): Promise<void> {
  const messagesSnap = await getDocs(collection(db, 'chats', threadId, 'messages'))

  // Collect all image URLs from messages and delete from Firebase Storage
  const imageUrls: string[] = [];
  messagesSnap.docs.forEach(d => {
    const data = d.data();
    if (data.imageUrl) imageUrls.push(data.imageUrl);
    if (data.attachedImageUrl) imageUrls.push(data.attachedImageUrl);
    if (Array.isArray(data.imageUrls)) imageUrls.push(...data.imageUrls);
  });

  await Promise.allSettled(
    imageUrls
      .map(storageRefFromUrl)
      .filter((p): p is string => p !== null)
      .map(path => deleteObject(ref(storage, path)))
  );

  await Promise.all(messagesSnap.docs.map(d => deleteDoc(d.ref)))
  await deleteDoc(doc(db, 'chats', threadId))
}

export async function togglePinThread(threadId: string, pinned: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', threadId), { pinned })
}

export async function archiveThread(threadId: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, 'chats', threadId), { archived })
}

export async function updateThreadTags(threadId: string, tags: string[]): Promise<void> {
  await updateDoc(doc(db, 'chats', threadId), { tags })
}

// Real-time listener for all threads belonging to a user.
// Sorting is done client-side to avoid requiring a composite Firestore index.
export function subscribeToThreads(
  userId: string,
  callback: (threads: ChatThread[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chats'),
    where('userId', '==', userId)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const threads = snapshot.docs
        .map((d) => ({ id: d.id, pinned: false, archived: false, tags: [], ...d.data() } as ChatThread))
        .sort((a, b) => {
          // Pinned threads always come first
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          const aMs = (a.updatedAt as any)?.toMillis?.() ?? 0
          const bMs = (b.updatedAt as any)?.toMillis?.() ?? 0
          return bMs - aMs   // newest first
        })
      callback(threads)
    },
    (error) => {
      console.error('[subscribeToThreads] Firestore error:', error.message)
    }
  )
}

// ── Messages ─────────────────────────────────────────────────────────────────

// Callers don't need to supply `id` or `timestamp` — both are set here.
export type NewMessage = Omit<ChatMessage, 'id' | 'timestamp'>

export async function addMessage(threadId: string, message: NewMessage): Promise<string> {
  const msgRef = await addDoc(collection(db, 'chats', threadId, 'messages'), {
    ...message,
    timestamp: serverTimestamp(),
  })
  // bump thread updatedAt so sidebar re-sorts correctly
  await updateDoc(doc(db, 'chats', threadId), { updatedAt: serverTimestamp() })
  return msgRef.id
}

export async function toggleLikeMessage(
  threadId: string,
  messageId: string,
  liked: boolean
): Promise<void> {
  await setDoc(
    doc(db, 'chats', threadId, 'messages', messageId),
    { liked },
    { merge: true }
  )
}

// Real-time listener for messages in a thread
export function subscribeToMessages(
  threadId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chats', threadId, 'messages'),
    orderBy('timestamp', 'asc')
  )
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
    callback(messages)
  })
}

// ── Paginated messages ────────────────────────────────────────────────────────

const PAGE_SIZE = 30

export interface PaginatedMessages {
  messages: ChatMessage[]
  hasMore: boolean
  firstDoc: DocumentSnapshot | null
}

/** Load the latest N messages for a thread */
export async function loadLatestMessages(threadId: string): Promise<PaginatedMessages> {
  const q = query(
    collection(db, 'chats', threadId, 'messages'),
    orderBy('timestamp', 'asc'),
    limitToLast(PAGE_SIZE)
  )
  const snap = await getDocs(q)
  // If we got exactly PAGE_SIZE, there are probably more
  const totalSnap = await getDocs(query(
    collection(db, 'chats', threadId, 'messages'),
    limit(PAGE_SIZE + 1)
  ))
  return {
    messages: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)),
    hasMore: totalSnap.size > PAGE_SIZE,
    firstDoc: snap.docs[0] ?? null,
  }
}

/** Load older messages before a given document */
export async function loadOlderMessages(threadId: string, beforeDoc: DocumentSnapshot): Promise<PaginatedMessages> {
  const q = query(
    collection(db, 'chats', threadId, 'messages'),
    orderBy('timestamp', 'asc'),
    endBefore(beforeDoc),
    limitToLast(PAGE_SIZE)
  )
  const snap = await getDocs(q)
  return {
    messages: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)),
    hasMore: snap.size >= PAGE_SIZE,
    firstDoc: snap.docs[0] ?? null,
  }
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
export async function searchAllMessages(
  userId: string,
  queryStr: string,
  threads: ChatThread[]
): Promise<SearchResult[]> {
  const lower = queryStr.toLowerCase()
  const results: SearchResult[] = []

  // Load messages for all threads in parallel (batched)
  const batches = await Promise.all(
    threads.map(async (thread) => {
      const snap = await getDocs(
        query(collection(db, 'chats', thread.id, 'messages'), orderBy('timestamp', 'desc'), limit(100))
      )
      return { thread, docs: snap.docs }
    })
  )

  for (const { thread, docs } of batches) {
    for (const d of docs) {
      const data = d.data() as ChatMessage
      const idx = data.content.toLowerCase().indexOf(lower)
      if (idx === -1) continue
      // Extract a snippet around the match
      const start = Math.max(0, idx - 40)
      const end = Math.min(data.content.length, idx + queryStr.length + 40)
      const snippet = (start > 0 ? '...' : '') + data.content.slice(start, end) + (end < data.content.length ? '...' : '')
      results.push({
        threadId: thread.id,
        threadTitle: thread.title,
        messageId: d.id,
        snippet,
        role: data.role,
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
      })
    }
  }
  return results
}

// ── Share conversation ────────────────────────────────────────────────────────

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
function pruneUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(pruneUndefined) as unknown as T
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = pruneUndefined(v)
    }
    return out as T
  }
  return obj
}

/**
 * Sanitize a user-controlled thread title before writing it to a publicly
 * readable Firestore doc (`sharedChats/*`). Defense-in-depth against
 * Markdown/HTML injection — see WE-20260528-107.
 *
 * Strips:
 *   - HTML tags (`<script>`, `<img onerror=…>`, anchors, etc.)
 *   - Markdown link syntax `[label](url)` → keeps `label`, drops the URL
 *     (defangs `javascript:`-scheme links)
 *   - Stray `<` and `>` characters (belt-and-suspenders)
 *
 * Also trims whitespace and caps length at 80 chars so a malicious title
 * cannot bloat storage or overflow the share-page header.
 *
 * Pair with plain-text rendering at the consumer (no Markdown component
 * wraps the title in `SharedChat.tsx`).
 */
export function sanitizeShareTitle(rawTitle: string | null | undefined): string {
  let s = (rawTitle || '').replace(/<[^>]+>/g, '') // strip HTML tags

  // Strip Markdown link syntax `[label](url)` — keep only the label.
  // The URL may contain balanced parens (e.g. `javascript:alert(1)`), so we
  // allow one level of nested parens inside the URL group, then sweep any
  // residual `[label](…)` until the string stabilizes.
  const mdLink = /\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g
  let prev: string
  do {
    prev = s
    s = s.replace(mdLink, '$1')
  } while (s !== prev)

  return s
    .replace(/[<>[\]()]/g, '') // belt-and-suspenders: drop stray brackets
    .trim()
    .slice(0, 80)
}

/** Create a shareable snapshot of a conversation */
export async function createSharedChat(threadId: string, threadTitle: string): Promise<string> {
  const msgSnap = await getDocs(
    query(collection(db, 'chats', threadId, 'messages'), orderBy('timestamp', 'asc'))
  )
  const messages = msgSnap.docs.map(d => {
    const data = d.data() as ChatMessage
    const raw = {
      role: data.role,
      content: data.content,
      mode: data.mode,
      timestamp: data.timestamp?.toDate?.() ?? new Date(),
      imageUrl: data.imageUrl ?? null,
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
      products: Array.isArray((data as any).products) ? (data as any).products : [],
    }
    return pruneUndefined(raw)
  })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7-day expiry

  // SECURITY (WE-20260528-107): always sanitize before writing to the
  // publicly readable `sharedChats` collection — never trust the caller.
  const cleanTitle = sanitizeShareTitle(threadTitle)

  const shareRef = await addDoc(collection(db, 'sharedChats'), {
    threadTitle: cleanTitle,
    messages,
    sharedAt: serverTimestamp(),
    expiresAt,
  })
  return shareRef.id
}

/** Load a shared conversation by ID */
export async function getSharedChat(shareId: string): Promise<SharedChatData | null> {
  const snap = await getDoc(doc(db, 'sharedChats', shareId))
  if (!snap.exists()) return null
  const data = snap.data()
  const expiresAt = data.expiresAt?.toDate?.() ?? new Date(0)
  if (expiresAt < new Date()) return null // expired
  return {
    threadTitle: data.threadTitle,
    messages: (data.messages ?? []).map((m: any) => ({
      role: m.role,
      content: m.content,
      mode: m.mode,
      timestamp: m.timestamp?.toDate?.() ?? new Date(m.timestamp),
      imageUrl: m.imageUrl ?? null,
      imageUrls: Array.isArray(m.imageUrls) ? m.imageUrls : [],
      products: Array.isArray(m.products) ? m.products : [],
    })),
    sharedAt: data.sharedAt?.toDate?.() ?? new Date(),
    expiresAt,
  }
}

// ── Remove image from a message ──────────────────────────────────────────────

/** Remove a specific image URL from a message, delete from Firebase Storage, and flag as deleted */
export async function removeMessageImage(
  threadId: string,
  messageId: string,
  imageUrl: string
): Promise<void> {
  const msgRef = doc(db, 'chats', threadId, 'messages', messageId)
  const snap = await getDoc(msgRef)
  if (!snap.exists()) return
  const data = snap.data()

  const updates: Record<string, any> = {}

  // Remove from imageUrls array
  if (Array.isArray(data.imageUrls)) {
    const filtered = data.imageUrls.filter((u: string) => u !== imageUrl)
    updates.imageUrls = filtered
    if (data.imageUrl === imageUrl) {
      updates.imageUrl = filtered[0] ?? null
    }
  } else if (data.imageUrl === imageUrl) {
    updates.imageUrl = null
    updates.imageUrls = []
  }

  // If no images remain after removal, mark as deleted
  const remainingUrls = updates.imageUrls ?? data.imageUrls ?? []
  const remainingUrl = updates.imageUrl ?? data.imageUrl ?? null
  if (remainingUrls.length === 0 && !remainingUrl) {
    updates.imageDeleted = true
  }

  // Also clear attachedImageUrl if it matches
  if (data.attachedImageUrl === imageUrl) {
    updates.attachedImageUrl = null
  }

  if (Object.keys(updates).length > 0) {
    await updateDoc(msgRef, updates)
  }

  // Delete from Firebase Storage (best-effort — ignore if URL is external or already gone)
  const storagePath = storageRefFromUrl(imageUrl)
  if (storagePath) {
    try {
      await deleteObject(ref(storage, storagePath))
    } catch {
      // Already deleted or transient error — that's fine
    }
  }
}

// ── User-attached image upload ──────────────────────────────────────────────

/**
 * Upload a user-attached image (base64) to Firebase Storage.
 * Returns the download URL. Optimized: compresses before upload.
 */
export async function uploadAttachedImage(
  userId: string,
  threadId: string,
  base64Data: string,
  mimeType: string = 'image/png'
): Promise<string> {
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
  const fileName = `${Date.now()}.${ext}`
  const storagePath = `userAttachments/${userId}/${threadId}/${fileName}`
  const storageRef = ref(storage, storagePath)
  await uploadString(storageRef, base64Data, 'base64', { contentType: mimeType })
  return getDownloadURL(storageRef)
}
