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
import { streamChatMessage, generateImage, addCalendarEvent, type StreamDoneEvent } from '@/services/functionsService'
import type { ChatThread, ChatMessage, Mode, CalendarEvent, CalendarEventDoc, ToolAction } from '@/types'

export interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  mode?: Mode
  liked?: boolean
  audioUrl?: string | null
  imageUrl?: string | null
  calendarEvent?: CalendarEvent | null
  calendarAdded?: boolean   // true once successfully added to Google Calendar
  convertToTable?: boolean  // true when AI returned a budget/guest list
  threadId?: string
}

export interface UseChatResult {
  messages: Message[]
  threads: ChatThread[]
  activeThreadId: string | null
  isTyping: boolean
  allLikedMessages: Message[]
  calendarEvents: CalendarEventDoc[]
  lastToolActions: ToolAction[]
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
  const { user, googleCalendarToken } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [allLikedMessages, setAllLikedMessages] = useState<Message[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventDoc[]>([])
  const [lastToolActions, setLastToolActions] = useState<ToolAction[]>([])

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

  // ── Fetch calendar events from Firestore ──────────────────────────────────
  useEffect(() => {
    if (!user) { setCalendarEvents([]); return }
    const fetchCalendarEvents = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'calendarEvents'),
            orderBy('date', 'asc')
          )
        )
        setCalendarEvents(
          snap.docs.map(d => ({
            id: d.id,
            title: d.data().title,
            date: d.data().date,
            time: d.data().time ?? null,
            description: d.data().description ?? null,
            htmlLink: d.data().htmlLink,
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
          }))
        )
      } catch (err) {
        console.error('[useChat] fetchCalendarEvents error:', err)
      }
    }
    fetchCalendarEvents()
  }, [user?.uid])

  // ── Clear state on logout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setMessages([])
      setActiveThreadId(null)
    }
  }, [user])

  // ── Image intent detection (mirrors backend regex) ────────────────────────
  const IMAGE_INTENT_RE =
    /\b(generate|create|make|show|draw|design|visualize|render)\b.{0,60}\b(images?|pictures?|photos?|visuals?|illustrations?|mockups?|renders?|sketches?)\b/i

  // ── Smart Blocks: detect budget breakdowns and guest lists ────────────────
  const TABLE_CONTENT_RE =
    /(\bbudget\b.*(\d+%|\₹|\$|cost|spend|allocat))|(\bguest\s*list\b.*\d+)|(category\s*\|.*\|)|(item\s*\|.*amount)/i

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
      const aiMsgId = (Date.now() + 1).toString()

      // Add an empty placeholder AI message immediately so streaming text appears
      setMessages(prev => [...prev, {
        id: aiMsgId,
        text: '',
        sender: 'ai',
        timestamp: new Date(),
        mode,
        liked: false,
      } as Message])

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
      }

      // ── Stream the response ───────────────────────────────────────────────
      const isImgReq = IMAGE_INTENT_RE.test(text)
      const history = user ? undefined : messagesRef.current.map(m => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }))

      let streamedText = ''
      let finalMeta: StreamDoneEvent | null = null

      const [, imgResult] = await Promise.all([
        (async () => {
          for await (const event of streamChatMessage(
            { message: text, threadId: threadId ?? null, audioBase64, history, mode, language },
            controller.signal
          )) {
            if (event.t === 'c') {
              streamedText += event.v
              setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, text: streamedText } : m
              ))
            } else if (event.t === 'd') {
              finalMeta = event
            } else if (event.t === 'e') {
              throw new Error(event.msg)
            }
          }
        })(),
        isImgReq ? generateImage(text).catch(() => null) : Promise.resolve(null),
      ])

      if (!finalMeta) return

      const imageUrl = (imgResult as any)?.imageUrl ?? finalMeta.imageUrl ?? null

      // Handle calendar event
      let calendarAdded = false
      if (finalMeta.calendarEvent && user) {
        try {
          const calRes = await addCalendarEvent(googleCalendarToken, finalMeta.calendarEvent)
          calendarAdded = true
          setCalendarEvents(prev => [...prev, {
            id: calRes.eventId,
            title: finalMeta!.calendarEvent!.title,
            date: finalMeta!.calendarEvent!.date,
            time: finalMeta!.calendarEvent!.time ?? null,
            description: finalMeta!.calendarEvent!.description ?? null,
            htmlLink: calRes.htmlLink,
            createdAt: new Date(),
          }].sort((a, b) => a.date.localeCompare(b.date)))
        } catch (err) {
          console.error('[useChat] calendar add failed:', err)
        }
      }

      if (finalMeta.toolActions?.length) {
        setLastToolActions(finalMeta.toolActions as ToolAction[])
      }

      // Finalize the message with clean text + metadata
      setMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: finalMeta!.text || streamedText,
        mode: finalMeta!.mode as Mode,
        audioUrl: finalMeta!.audioUrl,
        imageUrl,
        calendarEvent: finalMeta!.calendarEvent ?? null,
        calendarAdded,
        convertToTable: TABLE_CONTENT_RE.test(finalMeta!.text || streamedText),
      } : m))

      // Persist assistant message to Firestore
      if (user && threadId) {
        await addMessage(threadId, {
          role: 'assistant',
          content: finalMeta.text || streamedText,
          originalContent: null,
          mode: finalMeta.mode as Mode,
          language: finalMeta.detectedLanguage,
          audioUrl: finalMeta.audioUrl,
          liked: false,
        } as NewMessage)
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
    calendarEvents,
    lastToolActions,
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
