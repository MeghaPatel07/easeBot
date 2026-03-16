import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, orderBy, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  createThread,
  subscribeToThreads,
  addMessage,
  updateThreadTitle,
  deleteThread as deleteThreadDoc,
  toggleLikeMessage,
  type NewMessage,
} from '@/services/chatService'
import { sendChatMessage } from '@/services/functionsService'
import type { ChatThread, ChatMessage, Mode } from '@/types'

export interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  mode?: Mode
  liked?: boolean
  audioUrl?: string | null
  threadId?: string   // set on liked messages for cross-thread navigation
}

export interface UseChatResult {
  messages: Message[]
  threads: ChatThread[]
  activeThreadId: string | null
  isTyping: boolean
  allLikedMessages: Message[]
  sendMessage: (text: string, audioBase64?: string, mode?: Mode, language?: string) => Promise<void>
  stopGeneration: () => void
  loadChat: (threadId: string) => Promise<void>
  startNewChat: () => void
  deleteThread: (threadId: string) => Promise<void>
  renameThread: (threadId: string, title: string) => Promise<void>
  truncateMessages: (toIndex: number) => void
  toggleLike: (messageId: string) => Promise<void>
}

export function useChat(): UseChatResult {
  const { user } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [allLikedMessages, setAllLikedMessages] = useState<Message[]>([])

  // Keep refs so callbacks always see latest values without needing them as deps
  const messagesRef = useRef<Message[]>(messages)
  const activeThreadIdRef = useRef<string | null>(activeThreadId)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { activeThreadIdRef.current = activeThreadId }, [activeThreadId])

  const abortControllerRef = useRef<AbortController | null>(null)

  // ── Firestore thread subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!user) { setThreads([]); return }
    return subscribeToThreads(user.uid, setThreads)
  }, [user?.uid])

  // ── Fetch all liked messages across all threads on login ──────────────────
  useEffect(() => {
    if (!user) { setAllLikedMessages([]); return }

    const fetchLiked = async () => {
      try {
        const threadsSnap = await getDocs(
          query(collection(db, 'chats'), where('userId', '==', user.uid))
        )
        const results = await Promise.all(
          threadsSnap.docs.map(async (threadDoc) => {
            const snap = await getDocs(
              query(
                collection(db, 'chats', threadDoc.id, 'messages'),
                where('liked', '==', true)
              )
            )
            return snap.docs.map((d) => {
              const data = d.data() as ChatMessage
              return {
                id: d.id,
                text: data.content,
                sender: (data.role === 'assistant' ? 'ai' : 'user') as 'user' | 'ai',
                timestamp: data.timestamp?.toDate?.() ?? new Date(),
                mode: data.mode,
                liked: true,
                threadId: threadDoc.id,
              } satisfies Message
            })
          })
        )
        setAllLikedMessages(results.flat())
      } catch (err) {
        console.error('[useChat] fetchLiked error:', err)
      }
    }

    fetchLiked()
  }, [user?.uid])

  // ── Clear state on logout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setMessages([])
      setActiveThreadId(null)
    }
  }, [user])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, audioBase64?: string, mode?: Mode, language?: string) => {
    if (!text.trim() && !audioBase64) return

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text || '🎙️ Voice message',
      sender: 'user',
      timestamp: new Date(),
      liked: false,
    }
    setMessages((prev) => [...prev, userMsg])
    setIsTyping(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let threadId = activeThreadIdRef.current

    try {
      if (user) {
        if (!threadId) {
          threadId = await createThread(user.uid, text)
          setActiveThreadId(threadId)
          activeThreadIdRef.current = threadId
        }

        await addMessage(threadId, {
          role: 'user',
          content: text,
          originalContent: null,
          mode: 'assistant',
          language: 'en',
          audioUrl: null,
          liked: false,
        } as NewMessage)

        const result = await sendChatMessage(
          { message: text, threadId, audioBase64, mode, language },
          controller.signal
        )

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: result.text,
          sender: 'ai',
          timestamp: new Date(),
          mode: result.mode,
          liked: false,
          audioUrl: result.audioUrl,
        }
        setMessages((prev) => [...prev, aiMsg])

        await addMessage(threadId, {
          role: 'assistant',
          content: result.text,
          originalContent: null,
          mode: result.mode,
          language: result.detectedLanguage,
          audioUrl: result.audioUrl,
          liked: false,
        } as NewMessage)
      } else {
        const history = messagesRef.current.map((m) => ({
          role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        }))

        const result = await sendChatMessage(
          { message: text, threadId: null, audioBase64, history, mode, language },
          controller.signal
        )

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: result.text,
            sender: 'ai',
            timestamp: new Date(),
            mode: result.mode,
            liked: false,
            audioUrl: result.audioUrl,
          },
        ])
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      console.error('[useChat] sendMessage error:', err)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: 'Something went wrong. Please try again.',
          sender: 'ai',
          timestamp: new Date(),
          liked: false,
        },
      ])
    } finally {
      setIsTyping(false)
      abortControllerRef.current = null
    }
  }, [user])

  // ── Toggle like ────────────────────────────────────────────────────────────
  const toggleLike = useCallback(async (messageId: string) => {
    const msg = messagesRef.current.find((m) => m.id === messageId)
    if (!msg) return

    const newLiked = !msg.liked

    // Update in-session messages
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, liked: newLiked } : m))
    )

    // Update allLikedMessages (attach threadId so sidebar nav works)
    setAllLikedMessages((prev) => {
      if (newLiked) {
        return [
          ...prev.filter((m) => m.id !== messageId),
          { ...msg, liked: true, threadId: activeThreadIdRef.current ?? undefined },
        ]
      }
      return prev.filter((m) => m.id !== messageId)
    })

    // Persist to Firestore for logged-in users
    if (user && activeThreadIdRef.current) {
      try {
        await toggleLikeMessage(activeThreadIdRef.current, messageId, newLiked)
      } catch (err) {
        console.error('[useChat] toggleLike persist error:', err)
      }
    }
  }, [user])

  // ── Stop generation ────────────────────────────────────────────────────────
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  // ── Load a thread from Firestore ───────────────────────────────────────────
  const loadChat = useCallback(async (threadId: string) => {
    if (threadId === activeThreadIdRef.current) return
    setActiveThreadId(threadId)
    activeThreadIdRef.current = threadId
    try {
      const snap = await getDocs(
        query(collection(db, 'chats', threadId, 'messages'), orderBy('timestamp', 'asc'))
      )
      setMessages(
        snap.docs.map((d) => {
          const data = d.data() as ChatMessage
          return {
            id: d.id,
            text: data.content,
            sender: data.role === 'user' ? 'user' : 'ai',
            timestamp: data.timestamp?.toDate?.() ?? new Date(),
            mode: data.mode,
            liked: data.liked ?? false,
            audioUrl: data.audioUrl ?? null,
          }
        })
      )
    } catch (err) {
      console.error('[useChat] loadChat error:', err)
    }
  }, [])

  // ── New chat ───────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setMessages([])
    setActiveThreadId(null)
    activeThreadIdRef.current = null
  }, [])

  // ── Delete thread ──────────────────────────────────────────────────────────
  const deleteThread = useCallback(async (threadId: string) => {
    await deleteThreadDoc(threadId)
    if (activeThreadIdRef.current === threadId) {
      setMessages([])
      setActiveThreadId(null)
      activeThreadIdRef.current = null
    }
    // Remove liked messages that belonged to this thread (they're identified by being in session only;
    // for full cross-thread liked removal we'd need threadId on each liked msg — skip for now)
  }, [])

  // ── Rename thread ──────────────────────────────────────────────────────────
  const renameThread = useCallback(async (threadId: string, title: string) => {
    await updateThreadTitle(threadId, title)
  }, [])

  // ── Truncate messages (for edit / regenerate flows in UI) ─────────────────
  const truncateMessages = useCallback((toIndex: number) => {
    setMessages((prev) => prev.slice(0, toIndex))
  }, [])

  return {
    messages,
    threads,
    activeThreadId,
    isTyping,
    allLikedMessages,
    sendMessage,
    stopGeneration,
    loadChat,
    startNewChat,
    deleteThread,
    renameThread,
    truncateMessages,
    toggleLike,
  }
}
