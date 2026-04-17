import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, where, getDocs, DocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  createThread,
  subscribeToThreads,
  addMessage,
  updateThreadTitle,
  deleteThread as deleteThreadDoc,
  toggleLikeMessage,
  togglePinThread,
  archiveThread as archiveThreadDoc,
  updateThreadTags as updateThreadTagsDoc,
  loadLatestMessages,
  loadOlderMessages,
  uploadAttachedImage,
  removeMessageImage,
  type NewMessage,
} from '@/services/chatService'
import { streamChatMessage, type StreamDoneEvent } from '@/services/functionsService'
import { listReminders } from '@/services/reminderService'
import type { ChatThread, ChatMessage, Mode, CalendarEvent, ReminderDoc, ToolAction, UserPersonalization } from '@/types'

export interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  mode?: Mode
  liked?: boolean
  audioUrl?: string | null
  imageUrl?: string | null
  attachedImage?: string    // base64 data URI of user-uploaded image (displayed in user bubble)
  calendarEvent?: CalendarEvent | null
  convertToTable?: boolean  // true when AI returned a budget/guest list
  truncated?: boolean       // true when response appears cut off (token limit)
  language?: string         // detected response language (BCP-47)
  threadId?: string
  checklistData?: { id: string; title: string; items: string[] } | null  // inline checklist
  imageUrls?: string[]  // Multiple image variants
  imageGenerating?: boolean // true while image is being generated server-side
  imageDeleted?: boolean    // true when image was deleted from chat
  partialImageUrl?: string    // partial progressive render from GPT-Image-1.5
}

export interface SendMessageOptions {
  audioBase64?: string
  mode?: Mode
  language?: string
  imageBase64?: string
  imageMimeType?: string
  forceImageGeneration?: boolean
  skipImageGeneration?: boolean
  preferredAspectRatio?: string
  vibeTitle?: string
  vibeDescriptors?: string[]
}

export interface UseChatResult {
  messages: Message[]
  threads: ChatThread[]
  activeThreadId: string | null
  isTyping: boolean
  allLikedMessages: Message[]
  reminders: ReminderDoc[]
  lastToolActions: ToolAction[]
  hasMoreMessages: boolean
  sendMessage: {
    (text: string, audioBase64?: string, mode?: Mode, language?: string, imageBase64?: string, imageMimeType?: string): Promise<void>
    (text: string, options: SendMessageOptions): Promise<void>
  }
  stopGeneration: () => void
  loadChat: (threadId: string) => Promise<void>
  startNewChat: () => void
  deleteThread: (threadId: string) => Promise<void>
  renameThread: (threadId: string, title: string) => Promise<void>
  truncateMessages: (toIndex: number) => void
  restoreMessages: (msgs: Message[]) => void
  toggleLike: (messageId: string) => Promise<void>
  pinThread: (threadId: string, pinned: boolean) => Promise<void>
  archiveThread: (threadId: string, archived: boolean) => Promise<void>
  updateThreadTags: (threadId: string, tags: string[]) => Promise<void>
  loadMoreMessages: () => Promise<void>
  deleteMessageImage: (messageId: string, imageUrl: string) => Promise<void>
  refetchReminders: () => Promise<void>
  chatLoadError: boolean
}

export function useChat(): UseChatResult {
  const { user, profile } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [allLikedMessages, setAllLikedMessages] = useState<Message[]>([])
  const [reminders, setReminders] = useState<ReminderDoc[]>([])
  const [lastToolActions, setLastToolActions] = useState<ToolAction[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [chatLoadError, setChatLoadError] = useState(false)
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState<string | null>(null)
  const [styleMemory, setStyleMemory] = useState<import('@/types').StyleMemory | null>(null)
  const firstDocRef = useRef<DocumentSnapshot | null>(null)

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
                imageUrl: data.imageUrl ?? null,
                imageUrls: data.imageUrls?.length ? data.imageUrls : undefined,
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

  // ── Fetch reminders from Firestore ────────────────────────────────────────
  const refetchReminders = useCallback(async () => {
    if (!user) { setReminders([]); return }
    try {
      const list = await listReminders(user.uid)
      setReminders(list)
    } catch (err) {
      console.error('[useChat] refetchReminders error:', err)
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user) { setReminders([]); return }
    refetchReminders()
  }, [user?.uid, refetchReminders])

  // ── Clear state on logout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setMessages([])
      setActiveThreadId(null)
    }
  }, [user])

  // ── Truncation detection (response ends mid-sentence) ────────────────────
  const isTruncated = (text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length < 100) return false
    
    // Check if user explicitly stopped the generation
    if (trimmed.includes('*You stopped this response*')) return true
    
    const lastChar = trimmed[trimmed.length - 1]
    // Ends with sentence-ending punctuation or quote/bracket → not truncated
    if (/[.!?)\]}"']/.test(lastChar)) return false
    
    // Ends with colon (common in structured responses) → not truncated
    if (lastChar === ':') return false
    
    // Ends mid-word or mid-sentence without clear completion marker → likely truncated
    // But be conservative - only mark as truncated if it looks like incomplete text
    return /[a-zA-Z0-9]$/.test(trimmed) && !trimmed.endsWith('...') && trimmed.split('\n').length === 1
  }

  // ── Smart Blocks: detect budget breakdowns and guest lists ────────────────
  const TABLE_CONTENT_RE =
    /(\bbudget\b.*(\d+%|\₹|\$|cost|spend|allocat))|(\bguest\s*list\b.*\d+)|(category\s*\|.*\|)|(item\s*\|.*amount)/i

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    audioBase64OrOptions?: string | SendMessageOptions,
    modeArg?: Mode,
    languageArg?: string,
    imageBase64Arg?: string,
    imageMimeTypeArg?: string,
  ) => {
    // Normalize: support both positional and options-object call styles.
    const isOptionsObject =
      audioBase64OrOptions !== undefined &&
      typeof audioBase64OrOptions !== 'string'
    const opts: SendMessageOptions = isOptionsObject
      ? (audioBase64OrOptions as SendMessageOptions)
      : {
          audioBase64: audioBase64OrOptions as string | undefined,
          mode: modeArg,
          language: languageArg,
          imageBase64: imageBase64Arg,
          imageMimeType: imageMimeTypeArg,
        }
    const audioBase64 = opts.audioBase64
    const mode = opts.mode
    const language = opts.language
    const imageBase64 = opts.imageBase64
    const imageMimeType = opts.imageMimeType
    const forceImageGeneration = opts.forceImageGeneration
    const skipImageGeneration = opts.skipImageGeneration
    const preferredAspectRatio = opts.preferredAspectRatio
    const vibeTitle = opts.vibeTitle
    const vibeDescriptors = opts.vibeDescriptors

    if (!text.trim() && !audioBase64 && !imageBase64) return

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text || (imageBase64 ? '📷 Image' : '🎙️ Voice message'),
      sender: 'user',
      timestamp: new Date(),
      liked: false,
      attachedImage: imageBase64 ? `data:${imageMimeType || 'image/png'};base64,${imageBase64}` : undefined,
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

        // Upload attached image to Firebase Storage (non-blocking for speed)
        let attachedImageUrl: string | null = null
        if (imageBase64 && threadId) {
          try {
            attachedImageUrl = await uploadAttachedImage(user.uid, threadId, imageBase64, imageMimeType || 'image/png')
          } catch (err) {
            console.error('[useChat] image upload failed, continuing without:', err)
          }
        }

        await addMessage(threadId, {
          role: 'user',
          content: text,
          originalContent: null,
          mode: 'assistant',
          language: 'en',
          audioUrl: null,
          attachedImageUrl,
          liked: false,
        } as NewMessage)
      }

      // ── Stream the response ───────────────────────────────────────────────
      const history = user ? undefined : messagesRef.current.map(m => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.attachedImage ? `[User attached an image] ${m.text}` : m.text,
      }))

      let streamedText = ''
      let finalMeta: StreamDoneEvent | null = null

      const userPersonalization: UserPersonalization | undefined = profile ? {
        nickname: profile.nickname,
        voiceId: profile.voiceId,
        toneSettings: profile.toneSettings,
      } : undefined

      // Backend handles image generation in parallel with streaming now
      for await (const event of streamChatMessage(
        {
          message: text,
          threadId: threadId ?? null,
          audioBase64,
          history,
          mode,
          language,
          userPersonalization,
          imageBase64,
          imageMimeType,
          lastGeneratedImageUrl,
          styleMemory: styleMemory ?? undefined,
          ...(forceImageGeneration !== undefined ? { forceImageGeneration } : {}),
          ...(skipImageGeneration !== undefined ? { skipImageGeneration } : {}),
          ...(preferredAspectRatio !== undefined ? { preferredAspectRatio } : {}),
          ...(vibeTitle !== undefined ? { vibeTitle } : {}),
          ...(vibeDescriptors !== undefined ? { vibeDescriptors } : {}),
        },
        controller.signal
      )) {
        if (event.t === 'c') {
          streamedText += event.v
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, text: streamedText } : m
          ))
        } else if (event.t === 'img') {
          if (event.status === 'partial' && event.data) {
            // Progressive image render — show partial image
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, imageGenerating: true, partialImageUrl: event.data } : m
            ))
          } else {
            // Server confirmed image generation started — show skeleton immediately
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, imageGenerating: true } : m
            ))
          }
        } else if (event.t === 'd') {
          finalMeta = event
          // The `d` event is authoritative — replace the accumulated stream
          // text with the server's final text. This matters when the backend
          // rewrites the response mid-stream (e.g. when it forces image
          // generation after detecting an LLM refusal on a user-uploaded
          // photo) so the user doesn't keep seeing stale refusal text.
          if (typeof event.text === 'string' && event.text !== streamedText) {
            streamedText = event.text
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, text: streamedText } : m
            ))
          }
        } else if (event.t === 'e') {
          throw new Error(event.msg)
        }
      }

      // If the user aborted while streaming, the loop may exit cleanly
      // (no AbortError thrown). Detect this and persist the interrupted message.
      if (controller.signal.aborted) {
        const wasGeneratingImage = messagesRef.current[messagesRef.current.length - 1]?.imageGenerating
        const stoppedSuffix = wasGeneratingImage
          ? '\n\n---\n*The response was interrupted*'
          : '\n\n---\n*You stopped this response*'
        const stoppedText = streamedText
          ? streamedText + stoppedSuffix
          : wasGeneratingImage ? '*The response was interrupted*' : '*You stopped this response*'

        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg && lastMsg.sender === 'ai') {
            return [...prev.slice(0, -1), { ...lastMsg, text: stoppedText, imageGenerating: false, partialImageUrl: undefined }]
          }
          return prev
        })

        if (user && threadId) {
          addMessage(threadId, {
            role: 'assistant',
            content: stoppedText,
            originalContent: null,
            mode: (mode ?? 'assistant') as Mode,
            language: 'en',
            audioUrl: null,
            liked: false,
          } as NewMessage).catch(e => console.error('[useChat] persist stopped msg error:', e))
        }
        return
      }

      if (!finalMeta) return

      const imageUrl = finalMeta.imageUrl ?? null
      const imageUrls = finalMeta.imageUrls ?? (imageUrl ? [imageUrl] : [])

      // Track last generated image for iterative editing
      if (imageUrl) {
        setLastGeneratedImageUrl(imageUrl)
      }

      // Update style memory for cross-generation consistency
      if (finalMeta.styleMemory) {
        setStyleMemory(finalMeta.styleMemory as import('@/types').StyleMemory)
      }

      if (finalMeta.toolActions?.length) {
        setLastToolActions(finalMeta.toolActions as ToolAction[])
      }

      // If the backend created a reminder via tool, refetch the list.
      if (
        user &&
        finalMeta.toolActions?.some(
          (a: any) => a.tool === 'save_reminder' || a.tool === 'create_reminder',
        )
      ) {
        try {
          await refetchReminders()
        } catch (err) {
          console.error('[useChat] refetchReminders after tool call failed:', err)
        }
      }

      // Extract inline checklist data from tool actions
      console.log('[useChat] toolActions:', JSON.stringify(finalMeta.toolActions))
      const createdChecklist = finalMeta.toolActions?.find(
        (a: any) => a.tool === 'create_checklist' && a.checklistId && a.checklistItems
      )
      console.log('[useChat] createdChecklist:', createdChecklist)
      const checklistData = createdChecklist
        ? { id: createdChecklist.checklistId!, title: createdChecklist.checklistTitle || 'Checklist', items: createdChecklist.checklistItems || [] }
        : null

      // Finalize the message with clean text + metadata
      // Use responseLanguage (language the AI replied in) for TTS; fall back to detectedLanguage
      setMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: finalMeta!.text || streamedText,
        mode: finalMeta!.mode as Mode,
        audioUrl: finalMeta!.audioUrl,
        imageUrl,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        imageGenerating: false,
        calendarEvent: finalMeta!.calendarEvent ?? null,
        convertToTable: TABLE_CONTENT_RE.test(finalMeta!.text || streamedText),
        truncated: isTruncated(finalMeta!.text || streamedText),
        language: finalMeta!.responseLanguage || finalMeta!.detectedLanguage || 'en',
        checklistData,
      } : m))

      // Persist assistant message to Firestore (including image URLs)
      if (user && threadId) {
        await addMessage(threadId, {
          role: 'assistant',
          content: finalMeta.text || streamedText,
          originalContent: null,
          mode: finalMeta.mode as Mode,
          language: finalMeta.responseLanguage || finalMeta.detectedLanguage,
          audioUrl: finalMeta.audioUrl,
          imageUrl: imageUrl,
          imageUrls: imageUrls,
          liked: false,
          checklistData: checklistData ?? null,
        } as NewMessage)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Mark the partial AI message as stopped — use the closure's
        // `streamedText` which always holds the latest accumulated text,
        // rather than messagesRef which may lag behind due to batched renders.
        // Check if the AI was generating an image when stopped.
        const wasGeneratingImage = messagesRef.current[messagesRef.current.length - 1]?.imageGenerating
        const stoppedSuffix = wasGeneratingImage
          ? '\n\n---\n*The response was interrupted*'
          : '\n\n---\n*You stopped this response*'
        const stoppedText = streamedText
          ? streamedText + stoppedSuffix
          : wasGeneratingImage ? '*The response was interrupted*' : '*You stopped this response*'

        setMessages(prev => {
          const lastMsg = prev[prev.length - 1]
          if (lastMsg && lastMsg.sender === 'ai') {
            return [...prev.slice(0, -1), { ...lastMsg, text: stoppedText, imageGenerating: false }]
          }
          return prev
        })

        // Persist stopped response to Firestore
        if (user && threadId) {
          addMessage(threadId, {
            role: 'assistant',
            content: stoppedText,
            originalContent: null,
            mode: (mode ?? 'assistant') as Mode,
            language: 'en',
            audioUrl: null,
            liked: false,
          } as NewMessage).catch(e => console.error('[useChat] persist stopped msg error:', e))
        }
        return
      }
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
  }, [user, profile, refetchReminders])

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

  // ── Delete image from message ──────────────────────────────────────────────
  const deleteMessageImage = useCallback(async (messageId: string, imageUrl: string) => {
    // Update local state immediately (works for both guest and logged-in)
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const newUrls = (m.imageUrls ?? (m.imageUrl ? [m.imageUrl] : [])).filter(u => u !== imageUrl)
      const newImageUrl = m.imageUrl === imageUrl ? (newUrls[0] ?? null) : m.imageUrl
      const allGone = newUrls.length === 0 && !newImageUrl
      return {
        ...m,
        imageUrl: newImageUrl,
        imageUrls: newUrls,
        imageDeleted: allGone ? true : m.imageDeleted,
      }
    }))

    // Persist to Firestore + delete from Storage (logged-in users only)
    const threadId = activeThreadIdRef.current
    if (threadId) {
      try {
        await removeMessageImage(threadId, messageId, imageUrl)
      } catch (err) {
        console.error('[useChat] deleteMessageImage error:', err)
      }
    }
  }, [])

  // ── Stop generation ────────────────────────────────────────────────────────
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  // ── Load a thread from Firestore (paginated — latest 30) ──────────────────
  const loadChat = useCallback(async (threadId: string) => {
    if (threadId === activeThreadIdRef.current) return
    setChatLoadError(false)
    setActiveThreadId(threadId)
    activeThreadIdRef.current = threadId
    try {
      const result = await loadLatestMessages(threadId)
      setHasMoreMessages(result.hasMore)
      firstDocRef.current = result.firstDoc
      setMessages(
        result.messages.map((data) => ({
          id: data.id,
          text: data.content,
          sender: data.role === 'user' ? 'user' : 'ai',
          timestamp: data.timestamp?.toDate?.() ?? new Date(),
          mode: data.mode,
          liked: data.liked ?? false,
          audioUrl: data.audioUrl ?? null,
          imageUrl: data.imageUrl ?? null,
          imageUrls: data.imageUrls?.length ? data.imageUrls : undefined,
          imageDeleted: data.imageDeleted ?? false,
          attachedImage: data.attachedImageUrl ?? undefined,
          language: data.language || 'en',
          checklistData: data.checklistData ?? null,
        } as Message))
      )
    } catch (err) {
      console.error('[useChat] loadChat error:', err)
      setChatLoadError(true)
    }
  }, [])

  // ── Load older messages (pagination) ────────────────────────────────────────
  const loadMoreMessages = useCallback(async () => {
    const threadId = activeThreadIdRef.current
    if (!threadId || !firstDocRef.current || !hasMoreMessages) return
    try {
      const result = await loadOlderMessages(threadId, firstDocRef.current)
      setHasMoreMessages(result.hasMore)
      firstDocRef.current = result.firstDoc
      const older: Message[] = result.messages.map((data) => ({
        id: data.id,
        text: data.content,
        sender: data.role === 'user' ? 'user' : 'ai',
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
        mode: data.mode,
        liked: data.liked ?? false,
        audioUrl: data.audioUrl ?? null,
        imageUrl: data.imageUrl ?? null,
        imageUrls: data.imageUrls?.length ? data.imageUrls : undefined,
        imageDeleted: data.imageDeleted ?? false,
        attachedImage: data.attachedImageUrl ?? undefined,
        language: data.language || 'en',
        checklistData: data.checklistData ?? null,
      }))
      setMessages(prev => [...older, ...prev])
    } catch (err) {
      console.error('[useChat] loadMoreMessages error:', err)
    }
  }, [hasMoreMessages])

  // ── New chat ───────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setMessages([])
    setActiveThreadId(null)
    activeThreadIdRef.current = null
    setLastGeneratedImageUrl(null)
    setStyleMemory(null)
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

  // ── Pin / unpin thread ────────────────────────────────────────────────────
  const pinThread = useCallback(async (threadId: string, pinned: boolean) => {
    await togglePinThread(threadId, pinned)
  }, [])

  // ── Archive / unarchive thread ──────────────────────────────────────────
  const archiveThread = useCallback(async (threadId: string, archived: boolean) => {
    await archiveThreadDoc(threadId, archived)
  }, [])

  // ── Update thread tags ─────────────────────────────────────────────────
  const updateThreadTags = useCallback(async (threadId: string, tags: string[]) => {
    await updateThreadTagsDoc(threadId, tags)
  }, [])

  // ── Truncate messages (for edit / regenerate flows in UI) ─────────────────
  const truncateMessages = useCallback((toIndex: number) => {
    setMessages((prev) => prev.slice(0, toIndex))
  }, [])

  // ── Restore messages (for branch switching) ────────────────────────────────
  const restoreMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs)
  }, [])

  return {
    messages,
    threads,
    activeThreadId,
    isTyping,
    allLikedMessages,
    reminders,
    lastToolActions,
    hasMoreMessages,
    sendMessage,
    stopGeneration,
    loadChat,
    startNewChat,
    deleteThread,
    renameThread,
    truncateMessages,
    restoreMessages,
    toggleLike,
    pinThread,
    archiveThread,
    updateThreadTags,
    loadMoreMessages,
    deleteMessageImage,
    refetchReminders,
    chatLoadError,
  }
}
