import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { Note } from '@/types/notes'
import {
  subscribeToNote,
  updateNote,
  uploadNoteImage,
} from '@/services/notesService'
import { track } from '@/lib/analytics'

// ── localStorage draft mirror ───────────────────────────────────────────────
// Protects against data loss when a tab crashes / is closed mid-debounce
// or when a network write fails. Cleared on every successful flush.
const DRAFT_KEY_PREFIX = 'notes-draft:'
const DRAFT_MAX_BYTES = 5 * 1024 * 1024

type DraftPayload = { updates: Partial<Note>; savedAt: number }

function draftKey(noteId: string) {
  return DRAFT_KEY_PREFIX + noteId
}

function loadDraft(noteId: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(draftKey(noteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftPayload
    if (!parsed || typeof parsed !== 'object' || !parsed.updates) return null
    return parsed
  } catch {
    return null
  }
}

function saveDraft(noteId: string, updates: Partial<Note>) {
  if (!updates || Object.keys(updates).length === 0) return
  try {
    const payload: DraftPayload = { updates, savedAt: Date.now() }
    const serialized = JSON.stringify(payload)
    if (serialized.length > DRAFT_MAX_BYTES) return
    localStorage.setItem(draftKey(noteId), serialized)
  } catch {
    // quota exceeded or storage unavailable — fail silent
  }
}

function clearDraft(noteId: string) {
  try {
    localStorage.removeItem(draftKey(noteId))
  } catch {
    // ignore
  }
}

// ── Remote-edit conflict state (A1 Approach B) ─────────────────────────────
// When a remote collaborator saves while we have local unflushed edits, we
// surface a banner so the user can resolve (take theirs, or overwrite with
// mine). The editor itself already refuses to clobber divergent local state
// (see NoteEditor.tsx :210-226), so this is purely about preventing the next
// debounce from silently overwriting the collaborator's change.
export type RemoteConflict = {
  remoteEditedBy: string // userId of the collaborator whose change we haven't accepted
  remoteContent: string  // snapshot to apply if the user picks "take theirs"
}

export function useNoteEditor(noteId: string | null, userId: string | null) {
  const [note, setNote] = useState<Note | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [conflict, setConflict] = useState<RemoteConflict | null>(null)

  // Buffered local edits (not yet persisted)
  const pendingUpdatesRef = useRef<Partial<Note>>({})

  // Last remote-content snapshot we've seen from the subscription, used to
  // detect collaborator edits that land while we have local divergence.
  const prevRemoteContentRef = useRef<string | null>(null)

  // Refs to avoid stale closures
  const noteIdRef = useRef(noteId)
  const userIdRef = useRef(userId)

  useEffect(() => {
    noteIdRef.current = noteId
  }, [noteId])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  // Debounce timer ref for auto-save
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Flush helper — persists pending changes immediately ──────────────────
  const flushPending = useCallback((targetNoteId?: string, targetUserId?: string) => {
    const nId = targetNoteId ?? noteIdRef.current
    const uId = targetUserId ?? userIdRef.current
    if (!nId || !uId) return

    const updates = { ...pendingUpdatesRef.current }
    if (Object.keys(updates).length === 0) return

    // Clear buffer immediately to prevent double-writes
    pendingUpdatesRef.current = {}

    updateNote(nId, { ...updates, lastEditedBy: uId })
      .then(() => {
        clearDraft(nId)
        // Our write just became canonical; drop any pending conflict banner.
        if (noteIdRef.current === nId) setConflict(null)
      })
      .catch((err) => console.error('[useNoteEditor] flush failed', err))
  }, [])

  // ── Real-time subscription to the active note ─────────────────────────────
  useEffect(() => {
    if (!noteId) {
      setNote(null)
      setHasUnsavedChanges(false)
      pendingUpdatesRef.current = {}
      prevRemoteContentRef.current = null
      setConflict(null)
      return
    }
    // Reset the remote-snapshot tracker when switching notes so the first
    // subscription event on a fresh note doesn't register as a conflict.
    prevRemoteContentRef.current = null
    setConflict(null)

    const unsub = subscribeToNote(noteId, (n) => {
      if (n) {
        const prev = prevRemoteContentRef.current
        const remoteChanged = prev !== null && prev !== n.content
        const byOther = !!userIdRef.current && n.lastEditedBy !== userIdRef.current
        const hasLocalContentPending = pendingUpdatesRef.current.content !== undefined

        if (remoteChanged && byOther && hasLocalContentPending) {
          setConflict({ remoteEditedBy: n.lastEditedBy, remoteContent: n.content })
          track('note_conflict_detected', { note_id: n.id })
        }
        prevRemoteContentRef.current = n.content
      }
      setNote(n)
    })
    return () => unsub()
  }, [noteId])

  // ── Save pending changes when switching notes or unmounting ───────────────
  const prevNoteIdRef = useRef(noteId)
  useEffect(() => {
    const prevId = prevNoteIdRef.current
    prevNoteIdRef.current = noteId

    // If switching away from a note, flush pending edits for the previous note
    if (prevId && prevId !== noteId) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      flushPending(prevId, userIdRef.current ?? undefined)
    }

    setHasUnsavedChanges(false)
    setLastSavedAt(null)
    pendingUpdatesRef.current = {}

    // Cleanup: flush when the component unmounts
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      // Flush for the current noteId at time of unmount
      const currentNId = noteIdRef.current
      const currentUId = userIdRef.current
      if (currentNId && currentUId) {
        const updates = { ...pendingUpdatesRef.current }
        if (Object.keys(updates).length > 0) {
          pendingUpdatesRef.current = {}
          updateNote(currentNId, { ...updates, lastEditedBy: currentUId })
            .then(() => clearDraft(currentNId))
            .catch((err) => console.error('[useNoteEditor] unmount-save failed', err))
        }
      }
    }
  }, [noteId, flushPending])

  // ── Schedule debounced auto-save (2s after last edit) ─────────────────────
  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      const currentNoteId = noteIdRef.current
      const currentUserId = userIdRef.current
      if (!currentNoteId || !currentUserId) return

      const updates = { ...pendingUpdatesRef.current }
      if (Object.keys(updates).length === 0) return

      pendingUpdatesRef.current = {}
      updateNote(currentNoteId, { ...updates, lastEditedBy: currentUserId })
        .then(() => {
          if (noteIdRef.current === currentNoteId) {
            setHasUnsavedChanges(false)
            setLastSavedAt(new Date())
            setConflict(null)
          }
          clearDraft(currentNoteId)
        })
        .catch((err) => {
          console.error('[useNoteEditor] debounce-save failed', err)
        })
    }, 2000)
  }, [])

  // ── Restore unsaved draft from localStorage after a crash / closed tab ────
  // The draft was written on every keystroke and is only cleared on a
  // successful Firestore flush. If it still exists when we open a note, the
  // previous session's edits never reached the server — recover them.
  useEffect(() => {
    if (!noteId) return
    const draft = loadDraft(noteId)
    if (!draft?.updates || Object.keys(draft.updates).length === 0) return
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...draft.updates }
    setHasUnsavedChanges(true)
    toast.success('Restored unsaved changes from your last session')
    track('note_draft_restored', { note_id: noteId })
    scheduleSave()
  }, [noteId, scheduleSave])

  // ── Buffer content changes locally, then schedule auto-save ───────────────
  const updateContent = useCallback(
    (content: string, wordCount?: number) => {
      pendingUpdatesRef.current.content = content
      if (wordCount !== undefined) pendingUpdatesRef.current.wordCount = wordCount
      setHasUnsavedChanges(true)
      const nId = noteIdRef.current
      if (nId) saveDraft(nId, pendingUpdatesRef.current)
      scheduleSave()
    },
    [scheduleSave]
  )

  const updateTitle = useCallback(
    (title: string) => {
      pendingUpdatesRef.current.title = title
      setHasUnsavedChanges(true)
      const nId = noteIdRef.current
      if (nId) saveDraft(nId, pendingUpdatesRef.current)
      scheduleSave()
    },
    [scheduleSave]
  )

  // ── Explicit save — Ctrl+S / Cmd+S or Save button (immediate) ────────────
  const save = useCallback(async () => {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    const currentNoteId = noteIdRef.current
    const currentUserId = userIdRef.current
    if (!currentNoteId || !currentUserId) return

    const updates = { ...pendingUpdatesRef.current }
    if (Object.keys(updates).length === 0) {
      setHasUnsavedChanges(false)
      setLastSavedAt(new Date())
      clearDraft(currentNoteId)
      return
    }

    pendingUpdatesRef.current = {}
    setIsSaving(true)
    try {
      await updateNote(currentNoteId, { ...updates, lastEditedBy: currentUserId })
      if (noteIdRef.current === currentNoteId) {
        setHasUnsavedChanges(false)
        setLastSavedAt(new Date())
        setConflict(null)
      }
      clearDraft(currentNoteId)
    } catch (err) {
      console.error('[useNoteEditor] save failed', err)
      // Put updates back so they aren't lost
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates }
      setHasUnsavedChanges(true)
    } finally {
      setIsSaving(false)
    }
  }, [])

  // ── Keyboard shortcut: Ctrl+S / Cmd+S ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  // ── Warn on unload if unsaved changes ─────────────────────────────────────
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  // ── Flush on page unload (best effort) ────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      flushPending()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [flushPending])

  // ── Conflict resolution handlers (A1 Approach B) ─────────────────────────
  // "Keep mine": just close the banner. The existing pending edits will save
  // on the next debounce, overwriting the collaborator's version — the user
  // chose that tradeoff by dismissing.
  const dismissConflict = useCallback(() => {
    setConflict(null)
  }, [])

  // "View theirs": throw away local unsaved edits (including the A3 draft)
  // and return the remote-content snapshot so the caller can replace the
  // editor's document with it.
  const discardLocalEdits = useCallback((): string | null => {
    const c = conflict
    const nId = noteIdRef.current
    pendingUpdatesRef.current = {}
    setHasUnsavedChanges(false)
    setConflict(null)
    if (nId) clearDraft(nId)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    return c?.remoteContent ?? null
  }, [conflict])

  // ── Image upload ──────────────────────────────────────────────────────────
  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!noteId) return null
      try {
        const url = await uploadNoteImage(noteId, file)
        if (url) {
          track('note_image_uploaded', { note_id: noteId, size_kb: Math.round(file.size / 1024) })
        }
        return url
      } catch (err) {
        console.error('[useNoteEditor] image upload failed', err)
        return null
      }
    },
    [noteId]
  )

  return {
    note,
    isSaving,
    lastSavedAt,
    hasUnsavedChanges,
    save,
    updateContent,
    updateTitle,
    uploadImage,
    conflict,
    dismissConflict,
    discardLocalEdits,
  }
}
