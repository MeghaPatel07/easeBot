import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ChatThread, ChatMessage, Mode } from '@/types'

// ── Threads ──────────────────────────────────────────────────────────────────

export async function createThread(userId: string, firstMessage: string): Promise<string> {
  const threadRef = await addDoc(collection(db, 'chats'), {
    userId,
    title: firstMessage.slice(0, 60),
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
  await Promise.all(messagesSnap.docs.map(d => deleteDoc(d.ref)))
  await deleteDoc(doc(db, 'chats', threadId))
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
        .map((d) => ({ id: d.id, ...d.data() } as ChatThread))
        .sort((a, b) => {
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
