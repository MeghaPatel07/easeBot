import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Image as ImageIcon, FileText, ListChecks, Calendar, Upload,
  ArrowLeft, Search, Loader2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  useChatAttachments,
  type ChatAttachmentKind,
} from '@/contexts/ChatAttachmentsContext'
import { useNotes } from '@/hooks/useNotes'
import { subscribeToChecklists } from '@/services/checklistService'
import { subscribeToTimelineEvents } from '@/services/timelineEventsService'
import { getUserImages, type UserImage } from '@/services/galleryService'
import type { Checklist, TimelineEvent } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// AttachmentPicker
// -----------------------------------------------------------------------------
// Unified "attach anything" menu that replaces the old single image-picker
// button in ChatInput. Two-level menu:
//   level 1 — Note | Checklist | Timeline event | Gallery image | Upload image
//   level 2 — list of the user's items in that category (live Firestore)
// Selection → ChatAttachmentsContext.addAttachment() → chip appears in tray.
// Upload image → fires the existing onUploadImage() prop (file dialog path).
//
// Guest users (no uid): artifact categories are disabled with a "sign in" hint;
// Upload image remains available.
// ─────────────────────────────────────────────────────────────────────────────

type View = 'root' | 'note' | 'checklist' | 'timeline' | 'image'

interface Props {
  /** Invoked when the user picks "Upload image" — parent opens the file dialog. */
  onUploadImage: () => void
  /** Trigger classes — lets ChatInput size it for mobile vs desktop. */
  triggerClassName?: string
  /** Icon rendered inside the trigger (defaults to Plus). */
  TriggerIcon?: React.ElementType
  /** Controls inner icon sizing. */
  triggerIconClassName?: string
}

const CATEGORIES: Array<{
  key: Exclude<View, 'root'>
  label: string
  description: string
  Icon: React.ElementType
  kind: ChatAttachmentKind
}> = [
  { key: 'note',      label: 'Note',           description: 'Attach a saved note',            Icon: FileText,   kind: 'note' },
  { key: 'checklist', label: 'Checklist',      description: 'Attach a planner checklist',     Icon: ListChecks, kind: 'checklist' },
  { key: 'timeline',  label: 'Timeline event', description: 'Attach a timeline item',         Icon: Calendar,   kind: 'timeline' },
  { key: 'image',     label: 'Gallery image',  description: 'Attach a generated image',       Icon: ImageIcon,  kind: 'image' },
]

const SEARCH_THRESHOLD = 10

function plainTextFromTiptap(raw: string): string {
  try {
    const doc = JSON.parse(raw) as Record<string, unknown>
    const extract = (n: Record<string, unknown>): string => {
      if (n.text) return n.text as string
      if (Array.isArray(n.content)) {
        return (n.content as Record<string, unknown>[]).map(extract).join(' ')
      }
      return ''
    }
    return extract(doc).trim()
  } catch {
    return raw || ''
  }
}

function tsToIso(ts: unknown): string | null {
  if (!ts) return null
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    try { return (ts as { toDate: () => Date }).toDate().toISOString() } catch { /* noop */ }
  }
  if (ts instanceof Date) return ts.toISOString()
  return null
}

export default function AttachmentPicker({
  onUploadImage,
  triggerClassName,
  TriggerIcon = Plus,
  triggerIconClassName = 'h-5 w-5',
}: Props) {
  const { user } = useAuth()
  const userId = user?.uid ?? null
  const userEmail = user?.email ?? null
  const { addAttachment, attachments } = useChatAttachments()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('root')
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Live data
  const { filteredNotes: notes } = useNotes(userId, userEmail)
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [images, setImages] = useState<UserImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  useEffect(() => {
    if (!userId) { setChecklists([]); return }
    const unsub = subscribeToChecklists(userId, setChecklists)
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  useEffect(() => {
    if (!userId) { setTimeline([]); return }
    const unsub = subscribeToTimelineEvents(userId, setTimeline)
    return () => { try { unsub?.() } catch { /* noop */ } }
  }, [userId])

  // Gallery — one-shot fetch on entering the image submenu. Refetch per open
  // to keep it fresh without a live listener (galleryService has no subscribe).
  useEffect(() => {
    if (view !== 'image' || !userId) return
    let cancelled = false
    setImagesLoading(true)
    getUserImages(userId, { maxResults: 100 })
      .then(list => { if (!cancelled) setImages(list) })
      .finally(() => { if (!cancelled) setImagesLoading(false) })
    return () => { cancelled = true }
  }, [view, userId])

  // Reset when closed
  useEffect(() => {
    if (!open) { setView('root'); setQuery('') }
  }, [open])

  // Autofocus search when it appears
  useEffect(() => {
    if (open && view !== 'root') {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [open, view])

  // Close on outside click / ESC (ESC backs out a level first)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || !target.closest('[data-attachment-picker]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view !== 'root') setView('root')
      else setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, view])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const m = <T,>(arr: T[], keyOf: (x: T) => string) =>
      q ? arr.filter(x => keyOf(x).toLowerCase().includes(q)) : arr
    if (view === 'note')      return m(notes,      n => n.title || '')
    if (view === 'checklist') return m(checklists, c => c.title || '')
    if (view === 'timeline')  return m(timeline,   t => t.title || '')
    if (view === 'image')     return m(images,     i => i.prompt || '')
    return []
  }, [view, query, notes, checklists, timeline, images])

  const totalForView =
    view === 'note' ? notes.length :
    view === 'checklist' ? checklists.length :
    view === 'timeline' ? timeline.length :
    view === 'image' ? images.length : 0
  const showSearch = totalForView > SEARCH_THRESHOLD

  // ── Attach handlers ──────────────────────────────────────────────────────
  const attachNote = (n: (typeof notes)[number]) => {
    if (attachments.length >= 5) {
      toast.error('Max 5 attachments per message')
      return
    }
    addAttachment({
      kind: 'note',
      id: n.id,
      title: n.title || 'Untitled',
      preview: plainTextFromTiptap(n.content).slice(0, 200),
      payload: { noteId: n.id, content: n.content },
    })
    toast.success('Note attached')
    setOpen(false)
  }

  const attachChecklist = (cl: Checklist) => {
    if (attachments.length >= 5) {
      toast.error('Max 5 attachments per message')
      return
    }
    const done = cl.items.filter(i => i.completed).length
    addAttachment({
      kind: 'checklist',
      id: cl.id,
      title: cl.title,
      preview: `${cl.items.length} items · ${done} done`,
      payload: {
        checklistId: cl.id,
        title: cl.title,
        items: cl.items.map(i => ({ label: i.text, done: i.completed })),
        createdAt: tsToIso(cl.createdAt),
      },
    })
    toast.success('Checklist attached')
    setOpen(false)
  }

  const attachTimeline = (ev: TimelineEvent) => {
    if (attachments.length >= 5) {
      toast.error('Max 5 attachments per message')
      return
    }
    addAttachment({
      kind: 'timeline',
      id: ev.id,
      title: ev.title,
      preview: `${ev.date} — ${ev.title}`,
      payload: {
        events: [{ date: ev.date, title: ev.title, description: ev.description ?? '' }],
        itemId: ev.id,
      },
    })
    toast.success('Timeline event attached')
    setOpen(false)
  }

  const attachImage = (img: UserImage) => {
    if (attachments.length >= 5) {
      toast.error('Max 5 attachments per message')
      return
    }
    addAttachment({
      kind: 'image',
      id: img.id,
      title: img.prompt?.slice(0, 60) || 'AI-generated image',
      preview: img.prompt?.slice(0, 200),
      payload: { imageId: img.id, url: img.url, prompt: img.prompt, mode: img.mode },
    })
    toast.success('Image attached')
    setOpen(false)
  }

  const pickUpload = () => {
    setOpen(false)
    // Defer so the popover close doesn't swallow the file dialog.
    requestAnimationFrame(() => onUploadImage())
  }

  // Closes the picker, then routes to the matching section so empty-state
  // CTAs ("Open Notes", "Open Planner", etc.) take the user there in one tap
  // instead of forcing the 6-step manual escape.
  const goTo = (path: string) => {
    setOpen(false)
    requestAnimationFrame(() => navigate(path))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative" data-attachment-picker>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Attach"
        title="Attach"
        aria-expanded={open}
        className={
          triggerClassName ??
          'h-9 w-9 flex items-center justify-center text-foreground/55 hover:text-primary hover:bg-foreground/[0.08] active:scale-95 transition-all rounded-full flex-shrink-0'
        }
      >
        <TriggerIcon className={triggerIconClassName} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Attach"
          className="absolute bottom-full left-0 mb-2 w-[min(20rem,calc(100vw-2rem))] max-h-[70dvh] overflow-hidden rounded-2xl bg-card-elevated/95 backdrop-blur-xl border border-foreground/[0.1] shadow-dropdown-sm z-[60] animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-foreground/[0.06] flex-shrink-0">
            {view !== 'root' && (
              <button
                type="button"
                onClick={() => { setView('root'); setQuery('') }}
                aria-label="Back"
                className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span className="flex-1 text-sm font-medium text-foreground/80">
              {view === 'root' && 'Attach'}
              {view === 'note' && 'Notes'}
              {view === 'checklist' && 'Checklists'}
              {view === 'timeline' && 'Timeline'}
              {view === 'image' && 'Gallery'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="h-7 w-7 flex items-center justify-center rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search (only when list is long) */}
          {showSearch && (
            <div className="px-2.5 pt-2 pb-1 border-b border-foreground/[0.04] flex-shrink-0">
              <div className="flex items-center gap-1.5 h-8 rounded-md bg-foreground/[0.04] border border-foreground/[0.06] px-2">
                <Search className="h-3.5 w-3.5 text-foreground/35 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search"
                  className="flex-1 bg-transparent text-xs text-foreground/80 placeholder-foreground/30 outline-none"
                />
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {view === 'root' && (
              <>
                {CATEGORIES.map(c => {
                  const disabled = !userId
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => !disabled && setView(c.key)}
                      disabled={disabled}
                      className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-foreground/[0.05]'
                      }`}
                    >
                      <c.Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary/80" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground/80">{c.label}</div>
                        <p className="text-2xs text-foreground/40 leading-snug mt-0.5">
                          {disabled ? 'Sign in to attach your saved items' : c.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
                <div className="my-1 border-t border-foreground/[0.06]" />
                <button
                  type="button"
                  onClick={pickUpload}
                  className="w-full flex items-start gap-3 px-3.5 py-2.5 text-left hover:bg-foreground/[0.05] transition-colors"
                >
                  <Upload className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary/80" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground/80">Upload image</div>
                    <p className="text-2xs text-foreground/40 leading-snug mt-0.5">Pick a photo from your device</p>
                  </div>
                </button>
              </>
            )}

            {view === 'note' && (
              (filtered as typeof notes).length === 0
                ? (notes.length === 0
                    ? <EmptyState
                        msg="No notes yet."
                        actionLabel={userId ? 'Open Notes' : undefined}
                        onAction={userId ? () => goTo(`/${userId}/notes`) : undefined}
                      />
                    : <EmptyState msg="No notes match." />)
                : (filtered as typeof notes).map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => attachNote(n)}
                      className="w-full flex items-start gap-2.5 px-3.5 py-2 text-left hover:bg-foreground/[0.05] transition-colors"
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5">{n.icon || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground/80 truncate">{n.title || 'Untitled'}</div>
                      </div>
                    </button>
                  ))
            )}

            {view === 'checklist' && (
              (filtered as Checklist[]).length === 0
                ? (checklists.length === 0
                    ? <EmptyState
                        msg="No checklists yet."
                        actionLabel={userId ? 'Open Planner' : undefined}
                        onAction={userId ? () => goTo(`/${userId}/planner`) : undefined}
                      />
                    : <EmptyState msg="No checklists match." />)
                : (filtered as Checklist[]).map(cl => {
                    const done = cl.items.filter(i => i.completed).length
                    return (
                      <button
                        key={cl.id}
                        type="button"
                        onClick={() => attachChecklist(cl)}
                        className="w-full flex items-start gap-2.5 px-3.5 py-2 text-left hover:bg-foreground/[0.05] transition-colors"
                      >
                        <ListChecks className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary/70" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground/80 truncate">{cl.title}</div>
                          <div className="text-2xs text-foreground/40 mt-0.5">{cl.items.length} items · {done} done</div>
                        </div>
                      </button>
                    )
                  })
            )}

            {view === 'timeline' && (
              (filtered as TimelineEvent[]).length === 0
                ? (timeline.length === 0
                    ? <EmptyState
                        msg="No timeline events yet."
                        actionLabel={userId ? 'Open Timeline' : undefined}
                        onAction={userId ? () => goTo(`/${userId}/timeline`) : undefined}
                      />
                    : <EmptyState msg="No events match." />)
                : (filtered as TimelineEvent[]).map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => attachTimeline(e)}
                      className="w-full flex items-start gap-2.5 px-3.5 py-2 text-left hover:bg-foreground/[0.05] transition-colors"
                    >
                      <Calendar className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary/70" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground/80 truncate">{e.title}</div>
                        <div className="text-2xs text-foreground/40 mt-0.5 truncate">{e.date}</div>
                      </div>
                    </button>
                  ))
            )}

            {view === 'image' && (
              imagesLoading
                ? (
                  <div className="flex items-center justify-center py-8 text-foreground/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )
                : (filtered as UserImage[]).length === 0
                  ? (images.length === 0
                      ? <EmptyState
                          msg="No images yet."
                          actionLabel={userId ? 'Open Gallery' : undefined}
                          onAction={userId ? () => goTo(`/${userId}/gallery`) : undefined}
                        />
                      : <EmptyState msg="No images match." />)
                  : (
                    <div className="grid grid-cols-3 gap-1 p-1.5">
                      {(filtered as UserImage[]).map(img => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => attachImage(img)}
                          title={img.prompt}
                          className="relative aspect-square rounded-md overflow-hidden bg-foreground/[0.04] hover:ring-1 hover:ring-primary/50 transition-all group"
                        >
                          <img
                            src={img.url}
                            alt={img.prompt}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                          />
                        </button>
                      ))}
                    </div>
                  )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  msg,
  actionLabel,
  onAction,
}: {
  msg: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
      <p className="text-xs text-foreground/40">{msg}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
