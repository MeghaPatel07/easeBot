import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Note, NoteFolder } from '@/types/notes'
import {
  subscribeToNotes,
  subscribeToSharedNotes,
  subscribeToFolders,
  getNote as getNoteService,
  createNote as createNoteService,
  updateNote as updateNoteService,
  deleteNote as deleteNoteService,
  restoreNote as restoreNoteService,
  createFolder as createFolderService,
  updateFolder as updateFolderService,
  deleteFolder as deleteFolderService,
  moveNoteToFolder as moveNoteToFolderService,
} from '@/services/notesService'

export function useNotes(userId: string | null, userEmail: string | null) {
  const [notes, setNotes] = useState<Note[]>([])
  const [sharedNotes, setSharedNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track whether we've received the first snapshot
  const hasReceivedFirstSnapshot = useRef(false)

  // ── Debounce search query ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // ── Subscribe to own notes ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setNotes([])
      setIsLoading(false)
      return
    }

    hasReceivedFirstSnapshot.current = false
    setIsLoading(true)
    setError(null)

    try {
      const unsub = subscribeToNotes(userId, (updatedNotes) => {
        setNotes(updatedNotes)
        if (!hasReceivedFirstSnapshot.current) {
          hasReceivedFirstSnapshot.current = true
          setIsLoading(false)
        }
      })
      return () => unsub()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load notes'
      console.error('[useNotes] subscription error', err)
      setError(message)
      setIsLoading(false)
    }
  }, [userId])

  // ── Subscribe to shared notes ─────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) {
      setSharedNotes([])
      return
    }
    try {
      const unsub = subscribeToSharedNotes(userEmail, setSharedNotes)
      return () => unsub()
    } catch (err) {
      console.error('[useNotes] shared notes subscription error', err)
    }
  }, [userEmail])

  // ── Subscribe to folders ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setFolders([])
      return
    }
    try {
      const unsub = subscribeToFolders(userId, setFolders)
      return () => unsub()
    } catch (err) {
      console.error('[useNotes] folders subscription error', err)
    }
  }, [userId])

  // ── Filtered / searched notes (excludes trashed) ──────────────────────────
  const filteredNotes = useMemo(() => {
    let result = notes.filter(n => !n.isDeleted)

    if (activeFolder) {
      result = result.filter(n => n.folderId === activeFolder)
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        n =>
          n.title.toLowerCase().includes(q) ||
          n.tags.some(t => t.toLowerCase().includes(q)) ||
          n.category.toLowerCase().includes(q)
      )
    }

    return result
  }, [notes, activeFolder, debouncedSearch])

  // ── Trashed notes ─────────────────────────────────────────────────────────
  const trashedNotes = useMemo(() => {
    return notes.filter(n => n.isDeleted)
  }, [notes])

  // ── CRUD wrappers ─────────────────────────────────────────────────────────

  const createNote = useCallback(
    async (data?: Partial<Note>) => {
      if (!userId || !userEmail) return null
      try {
        const note = await createNoteService(userId, userEmail, data)
        setActiveNoteId(note.id)
        return note
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create note'
        console.error('[useNotes] create failed', err)
        setError(message)
        return null
      }
    },
    [userId, userEmail]
  )

  const updateNote = useCallback(
    async (noteId: string, updates: Partial<Note>) => {
      await updateNoteService(noteId, updates)
    },
    []
  )

  const deleteNote = useCallback(
    async (noteId: string) => {
      await deleteNoteService(noteId)
      if (activeNoteId === noteId) setActiveNoteId(null)
    },
    [activeNoteId]
  )

  const restoreNote = useCallback(
    async (noteId: string) => {
      await restoreNoteService(noteId)
    },
    []
  )

  // ── Duplicate note ────────────────────────────────────────────────────────
  const duplicateNote = useCallback(
    async (noteId: string) => {
      if (!userId || !userEmail) return null
      try {
        const source = await getNoteService(noteId)
        if (!source) {
          setError('Note not found')
          return null
        }
        const copy = await createNoteService(userId, userEmail, {
          title: `Copy of ${source.title}`,
          content: source.content,
          category: source.category,
          tags: [...source.tags],
          folderId: source.folderId,
          icon: source.icon,
          coverImage: source.coverImage,
          color: source.color,
        })
        setActiveNoteId(copy.id)
        return copy
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to duplicate note'
        console.error('[useNotes] duplicate failed', err)
        setError(message)
        return null
      }
    },
    [userId, userEmail]
  )

  const createFolder = useCallback(
    async (name: string, icon?: string) => {
      if (!userId) return null
      return createFolderService(userId, name, icon)
    },
    [userId]
  )

  const updateFolder = useCallback(
    async (folderId: string, updates: Partial<NoteFolder>) => {
      await updateFolderService(folderId, updates)
    },
    []
  )

  const deleteFolder = useCallback(
    async (folderId: string) => {
      await deleteFolderService(folderId)
      if (activeFolder === folderId) setActiveFolder(null)
    },
    [activeFolder]
  )

  const moveNoteToFolder = useCallback(
    async (noteId: string, folderId: string | null) => {
      await moveNoteToFolderService(noteId, folderId)
    },
    []
  )

  return {
    // State
    notes,
    sharedNotes,
    folders,
    filteredNotes,
    trashedNotes,
    activeNoteId,
    searchQuery,
    activeFolder,
    isLoading,
    error,

    // Setters
    setActiveNoteId,
    setSearchQuery,
    setActiveFolder,

    // Note CRUD
    createNote,
    updateNote,
    deleteNote,
    restoreNote,
    duplicateNote,

    // Folder CRUD
    createFolder,
    updateFolder,
    deleteFolder,

    // Move
    moveNoteToFolder,
  }
}
