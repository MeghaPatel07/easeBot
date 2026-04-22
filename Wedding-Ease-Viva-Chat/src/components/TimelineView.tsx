import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Heart,
  ExternalLink,
  Flag,
  Plus,
  Loader2,
  MoreVertical,
  Trash2,
  Pencil,
  Circle,
  MessageSquarePlus,
  Paperclip,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useChatAttachments } from '@/contexts/ChatAttachmentsContext'
import { createReminder, deleteReminder } from '@/services/reminderService'
import {
  createChecklist,
  updateItemDueDate,
  toggleItemDone,
  deleteChecklistItem,
} from '@/services/checklistService'
import { deleteTimelineEvent } from '@/services/timelineEventsService'
import type { ReminderDoc, TimelineEvent } from '@/types'
import { track } from '@/lib/analytics'

interface TimelineViewProps {
  userId: string
  checklists: Array<{
    id: string
    title: string
    items: Array<{
      id: string
      text: string
      completed: boolean
      dueDate: string | null
    }>
    createdAt: any
  }>
  reminders: ReminderDoc[]
  timelineEvents?: TimelineEvent[]
  weddingDate: Date | null
  onRefresh: () => void | Promise<void>
}

type ChooserMode = 'chooser' | 'event' | 'task'

type EntryType = 'task' | 'event'
type EntryStatus = 'completed' | 'upcoming' | 'overdue' | 'today'

interface TimelineEntry {
  id: string
  title: string
  date: Date
  dateStr: string
  type: EntryType
  status: EntryStatus
  sourceId: string
  itemId: string | null
  description: string | null
  completed: boolean
  htmlLink: string | null
  checklistTitle: string | null
  category: string | null
  source: 'checklist' | 'reminder' | 'timelineEvent'
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getStatus(dateStr: string, completed: boolean): EntryStatus {
  if (completed) return 'completed'
  const today = toDateStr(new Date())
  if (dateStr === today) return 'today'
  if (dateStr < today) return 'overdue'
  return 'upcoming'
}

const dotColor: Record<EntryStatus, string> = {
  completed: 'bg-success',
  upcoming: 'bg-primary',
  overdue: 'bg-destructive',
  today: 'bg-cat-budget',
}

const statusLabel: Record<EntryStatus, { text: string; className: string }> = {
  completed: { text: 'Completed', className: 'text-success' },
  upcoming: { text: 'Upcoming', className: 'text-primary' },
  overdue: { text: 'Overdue', className: 'text-destructive' },
  today: { text: 'Today', className: 'text-cat-budget-fg' },
}

const statusIcon: Record<EntryStatus, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  upcoming: <Clock className="h-3.5 w-3.5 text-primary" />,
  overdue: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
  today: <Flag className="h-3.5 w-3.5 text-cat-budget-fg" />,
}

export default function TimelineView({
  userId,
  checklists,
  reminders,
  timelineEvents = [],
  weddingDate,
  onRefresh,
}: TimelineViewProps) {
  const { user, profile } = useAuth()
  const { addAttachment } = useChatAttachments()
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [chooserMode, setChooserMode] = useState<ChooserMode>('chooser')
  const [submitting, setSubmitting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Event form state
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evTime, setEvTime] = useState('')
  const [evDescription, setEvDescription] = useState('')

  // Task form state
  const [taskText, setTaskText] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')

  // Close open menu when tapping outside
  useEffect(() => {
    if (!openMenuId) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [openMenuId])

  const resetForms = () => {
    setEvTitle('')
    setEvDate('')
    setEvTime('')
    setEvDescription('')
    setTaskText('')
    setTaskDueDate('')
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setTimeout(() => {
      setChooserMode('chooser')
      resetForms()
    }, 150)
  }

  const handleOpenDialog = () => {
    setChooserMode('chooser')
    resetForms()
    setDialogOpen(true)
  }

  const handleCreateEvent = async () => {
    const trimmedTitle = evTitle.trim()
    if (!trimmedTitle) {
      toast.error('Title is required')
      return
    }
    if (!evDate) {
      toast.error('Date is required')
      return
    }
    if (!user) {
      toast.error('Please sign in to create events')
      return
    }
    setSubmitting(true)
    try {
      const created = await createReminder(user, profile, {
        title: trimmedTitle,
        eventDateStr: evDate,
        eventTimeStr: evTime || null,
        description: evDescription.trim() || null,
        leadTimeMinutes: 1440,
      })
      track('reminder_created', {
        reminder_id: created?.id ?? '',
        source: 'manual',
        has_whatsapp: created?.channel === 'whatsapp',
      })
      toast.success('Event created')
      closeDialog()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create event'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateTask = async () => {
    const trimmedText = taskText.trim()
    if (!trimmedText) {
      toast.error('Task text is required')
      return
    }
    if (!taskDueDate) {
      toast.error('Due date is required')
      return
    }
    setSubmitting(true)
    try {
      const created = await createChecklist(userId, trimmedText, [trimmedText])
      const firstItem = created.items[0]
      if (firstItem) {
        await updateItemDueDate(userId, created.id, firstItem.id, taskDueDate)
      }
      track('checklist_created', { checklist_id: created.id, item_count: 1, source: 'timeline' })
      toast.success('Task created')
      closeDialog()
      // Kick off reminders refresh but don't block UI updates, which come
      // via Firestore onSnapshot subscriptions in the parent.
      void onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleTask = async (entry: TimelineEntry) => {
    if (entry.type !== 'task' || !entry.itemId) return
    setBusyId(entry.id)
    try {
      await toggleItemDone(userId, entry.sourceId, entry.itemId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update task'
      toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (entry: TimelineEntry) => {
    setOpenMenuId(null)
    if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return
    setBusyId(entry.id)
    try {
      if (entry.source === 'checklist' && entry.itemId) {
        await deleteChecklistItem(userId, entry.sourceId, entry.itemId)
        track('checklist_item_deleted', { checklist_id: entry.sourceId })
      } else if (entry.source === 'reminder') {
        await deleteReminder(userId, entry.sourceId)
        track('reminder_dismissed', { reminder_id: entry.sourceId })
        void onRefresh()
      } else if (entry.source === 'timelineEvent') {
        await deleteTimelineEvent(entry.sourceId)
        track('timeline_event_deleted', { event_id: entry.sourceId })
      }
      toast.success('Deleted')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete'
      toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  const handleEditDueDate = async (entry: TimelineEntry) => {
    setOpenMenuId(null)
    if (entry.source !== 'checklist' || !entry.itemId) {
      toast.info('Editing dates for this item is not supported yet.')
      return
    }
    const next = window.prompt('New due date (YYYY-MM-DD):', entry.dateStr)
    if (!next) return
    const trimmed = next.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      toast.error('Invalid date. Use YYYY-MM-DD.')
      return
    }
    setBusyId(entry.id)
    try {
      await updateItemDueDate(userId, entry.sourceId, entry.itemId, trimmed)
      toast.success('Due date updated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update date'
      toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  const entries = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = []

    for (const cl of checklists) {
      for (const item of cl.items) {
        if (!item.dueDate) continue
        const date = parseDate(item.dueDate)
        items.push({
          id: `task-${cl.id}-${item.id}`,
          title: item.text,
          date,
          dateStr: item.dueDate,
          type: 'task',
          status: getStatus(item.dueDate, item.completed),
          sourceId: cl.id,
          itemId: item.id,
          description: null,
          completed: item.completed,
          htmlLink: null,
          checklistTitle: cl.title,
          category: null,
          source: 'checklist',
        })
      }
    }

    for (const r of reminders) {
      if (!r.eventDateStr) continue
      const date = parseDate(r.eventDateStr)
      items.push({
        id: `event-${r.id}`,
        title: r.title,
        date,
        dateStr: r.eventDateStr,
        type: 'event',
        status: getStatus(r.eventDateStr, false),
        sourceId: r.id,
        itemId: null,
        description: r.description,
        completed: false,
        htmlLink: null,
        checklistTitle: null,
        category: null,
        source: 'reminder',
      })
    }

    for (const ev of timelineEvents) {
      if (!ev.date) continue
      // Backend stores `date` as ISO (YYYY-MM-DD or full timestamp). Normalize
      // to a YYYY-MM-DD string for consistent status comparison.
      const dateStr = ev.date.length >= 10 ? ev.date.slice(0, 10) : ev.date
      let date: Date
      try {
        date = parseDate(dateStr)
        if (isNaN(date.getTime())) continue
      } catch {
        continue
      }
      items.push({
        id: `timeline-${ev.id}`,
        title: ev.title,
        date,
        dateStr,
        type: 'event',
        status: getStatus(dateStr, false),
        sourceId: ev.id,
        itemId: null,
        description: ev.description ?? null,
        completed: false,
        htmlLink: null,
        checklistTitle: null,
        category: ev.category ?? null,
        source: 'timelineEvent',
      })
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime())
    return items
  }, [checklists, reminders, timelineEvents])

  const handleAttachItem = (entry: TimelineEntry) => {
    setOpenMenuId(null)
    addAttachment({
      kind: 'timeline',
      id: entry.id,
      title: entry.title,
      preview: `${entry.dateStr} — ${entry.title}`,
      payload: {
        itemId: entry.id,
        title: entry.title,
        date: entry.dateStr,
        status: entry.status,
        description: entry.description,
      },
    })
    toast.success('Item attached')
    navigate('/')
  }

  const handleAttachWholeTimeline = () => {
    if (entries.length === 0) {
      toast.info('No timeline items to attach yet.')
      return
    }
    const earliestDate = entries[0]?.dateStr ?? ''
    const latestDate = entries[entries.length - 1]?.dateStr ?? ''
    addAttachment({
      kind: 'timeline',
      id: `timeline-${userId}-${Date.now()}`,
      title: 'Full wedding timeline',
      preview: `${entries.length} items from ${earliestDate} to ${latestDate}`,
      payload: {
        items: entries.map((e) => ({
          date: e.dateStr,
          title: e.title,
          status: e.status,
          description: e.description,
        })),
        totalCount: entries.length,
      },
    })
    toast.success('Timeline attached — ask Viva about it in chat')
    navigate('/')
  }

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>()

    const allEntries = [...entries]
    if (weddingDate) {
      const wdStr = toDateStr(weddingDate)
      const key = formatMonthYear(weddingDate)
      if (!allEntries.some(e => formatMonthYear(e.date) === key)) {
        allEntries.push({
          id: '__wedding__',
          title: 'Wedding Day',
          date: weddingDate,
          dateStr: wdStr,
          type: 'event',
          status: 'upcoming',
          sourceId: '',
          itemId: null,
          description: null,
          completed: false,
          htmlLink: null,
          checklistTitle: null,
          category: null,
          source: 'reminder',
        })
        allEntries.sort((a, b) => a.date.getTime() - b.date.getTime())
      }
    }

    for (const entry of allEntries) {
      const key = formatMonthYear(entry.date)
      if (!map.has(key)) map.set(key, [])
      if (entry.id !== '__wedding__') {
        map.get(key)!.push(entry)
      }
    }

    return map
  }, [entries, weddingDate])

  const stats = useMemo(() => {
    let completed = 0, upcoming = 0, overdue = 0
    for (const e of entries) {
      if (e.status === 'completed') completed++
      else if (e.status === 'overdue') overdue++
      else upcoming++
    }
    return { total: entries.length, completed, upcoming, overdue }
  }, [entries])

  const weddingCountdown = useMemo(() => {
    if (!weddingDate) return null
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const wd = new Date(weddingDate)
    wd.setHours(0, 0, 0, 0)
    const diff = Math.ceil((wd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today!'
    if (diff < 0) return `${Math.abs(diff)} days ago`
    return `${diff} days away`
  }, [weddingDate])

  const toolbar = (
    <div className="flex-shrink-0 px-4 pt-4 flex items-center gap-2">
      <Button
        size="sm"
        onClick={handleOpenDialog}
        className="h-11 sm:h-9 rounded-xl gap-1.5 text-xs font-medium touch-manipulation"
      >
        <Plus className="h-3.5 w-3.5" />
        New
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleAttachWholeTimeline}
        disabled={entries.length === 0}
        aria-label="Attach whole timeline to chat"
        title="Attach whole timeline to chat"
        className="h-11 sm:h-9 rounded-xl gap-1.5 text-xs font-medium touch-manipulation"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Attach to chat</span>
      </Button>
    </div>
  )

  const dialogJSX = (
    <Dialog
      open={dialogOpen}
      onOpenChange={(o) => {
        if (!o) closeDialog()
        else setDialogOpen(o)
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-foreground/[0.08] shadow-modal bg-card-elevated/90 backdrop-blur-2xl flex flex-col gap-4">
        {chooserMode === 'chooser' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-headline text-lg text-foreground/90">
                New Timeline Entry
              </DialogTitle>
              <DialogDescription className="text-foreground/40 text-xs">
                What would you like to add to your timeline?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setChooserMode('event')}
                className="flex-1 h-20 rounded-xl flex flex-col gap-1 touch-manipulation"
                disabled={!user}
              >
                <Calendar className="h-5 w-5" />
                <span className="text-xs font-medium">New Event</span>
              </Button>
              <Button
                onClick={() => setChooserMode('task')}
                className="flex-1 h-20 rounded-xl flex flex-col gap-1 touch-manipulation"
                variant="outline"
              >
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-xs font-medium">New Task</span>
              </Button>
            </div>
            {!user && (
              <p className="text-2xs text-foreground/40 text-center">
                Sign in to create events.
              </p>
            )}
          </>
        )}

        {chooserMode === 'event' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-headline text-lg text-foreground/90">
                New Event
              </DialogTitle>
              <DialogDescription className="text-foreground/40 text-xs">
                Add an event with a 1-day-before notification.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-ev-title" className="text-xs font-medium text-foreground/70">Title</label>
                <Input
                  id="tl-ev-title"
                  autoFocus
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="e.g. Cake tasting"
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label htmlFor="tl-ev-date" className="text-xs font-medium text-foreground/70">Date</label>
                  <input
                    id="tl-ev-date"
                    type="date"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-foreground/[0.1] bg-foreground/[0.04] px-3 py-1 text-sm text-foreground/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label htmlFor="tl-ev-time" className="text-xs font-medium text-foreground/70">
                    Time <span className="text-foreground/30">(optional)</span>
                  </label>
                  <input
                    id="tl-ev-time"
                    type="time"
                    value={evTime}
                    onChange={(e) => setEvTime(e.target.value)}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-foreground/[0.1] bg-foreground/[0.04] px-3 py-1 text-sm text-foreground/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-ev-desc" className="text-xs font-medium text-foreground/70">
                  Description <span className="text-foreground/30">(optional)</span>
                </label>
                <Textarea
                  id="tl-ev-desc"
                  value={evDescription}
                  onChange={(e) => setEvDescription(e.target.value)}
                  rows={3}
                  disabled={submitting}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setChooserMode('chooser')}
                disabled={submitting}
                className="rounded-xl touch-manipulation"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateEvent}
                disabled={submitting || !evTitle.trim() || !evDate}
                className="rounded-xl gap-1.5 touch-manipulation"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Creating…' : 'Create Event'}
              </Button>
            </DialogFooter>
          </>
        )}

        {chooserMode === 'task' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-headline text-lg text-foreground/90">
                New Task
              </DialogTitle>
              <DialogDescription className="text-foreground/40 text-xs">
                Create a task with a due date.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-task-text" className="text-xs font-medium text-foreground/70">Task</label>
                <Input
                  id="tl-task-text"
                  autoFocus
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  placeholder="e.g. Order centerpieces"
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-task-due" className="text-xs font-medium text-foreground/70">Due date</label>
                <input
                  id="tl-task-due"
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  disabled={submitting}
                  className="flex h-9 w-full rounded-md border border-foreground/[0.1] bg-foreground/[0.04] px-3 py-1 text-sm text-foreground/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setChooserMode('chooser')}
                disabled={submitting}
                className="rounded-xl touch-manipulation"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateTask}
                disabled={submitting || !taskText.trim() || !taskDueDate}
                className="rounded-xl gap-1.5 touch-manipulation"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Adding…' : 'Add Task'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )

  // Empty state
  if (entries.length === 0 && !weddingDate) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
          <div className="h-14 w-14 rounded-full bg-foreground/[0.06] flex items-center justify-center mb-4">
            <Calendar className="h-7 w-7 text-foreground/40" />
          </div>
          <h3 className="text-sm font-semibold text-foreground/70 mb-1">No timeline items yet</h3>
          <p className="text-xs text-foreground/40 max-w-[260px] leading-relaxed">
            Add due dates to your checklist items or create calendar events to see them on your timeline.
          </p>
        </div>
        {dialogJSX}
      </div>
    )
  }

  const weddingMonthKey = weddingDate ? formatMonthYear(weddingDate) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {toolbar}
      {/* Stats bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-3">
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <div className="flex-1 min-w-0 rounded-xl bg-foreground/[0.06] border border-foreground/[0.08] px-2.5 py-2 text-center">
            <p className="text-base font-bold text-foreground/70">{stats.total}</p>
            <p className="text-3xs text-foreground/40 font-medium">Total</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-success/10 border border-success/20 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-success">{stats.completed}</p>
            <p className="text-3xs text-success/70 font-medium">Completed</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-primary/10 border border-primary/20 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-primary">{stats.upcoming}</p>
            <p className="text-3xs text-primary/70 font-medium">Upcoming</p>
          </div>
          {stats.overdue > 0 && (
            <div className="flex-1 min-w-0 rounded-xl bg-destructive/10 border border-destructive/20 px-2.5 py-2 text-center">
              <p className="text-base font-bold text-destructive">{stats.overdue}</p>
              <p className="text-3xs text-destructive/70 font-medium">Overdue</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ touchAction: 'pan-y' }}>
        {Array.from(grouped.entries()).map(([monthKey, monthEntries]) => (
          <div key={monthKey} className="mb-6">
            {/* Month header */}
            <div className="sticky top-0 z-10 bg-foreground/[0.04] backdrop-blur-sm rounded-lg py-1.5 px-2 mb-2">
              <h4 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                {monthKey}
              </h4>
            </div>

            {/* Wedding date marker if in this month */}
            {weddingMonthKey === monthKey && weddingDate && (
              <WeddingMarker date={weddingDate} countdown={weddingCountdown!} />
            )}

            {/* Entries */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-foreground/[0.08] pointer-events-none" />

              {monthEntries.map((entry, idx) => {
                const isLast = idx === monthEntries.length - 1
                const isBusy = busyId === entry.id
                const isTask = entry.type === 'task'
                const menuOpen = openMenuId === entry.id
                const primaryAction = isTask
                  ? () => handleToggleTask(entry)
                  : () => {
                      if (entry.htmlLink) {
                        window.open(entry.htmlLink, '_blank', 'noopener,noreferrer')
                      }
                    }

                return (
                  <div key={entry.id} className={`relative flex gap-3 ${isLast ? '' : 'mb-3'}`}>
                    {/* Dot */}
                    <div className="relative z-[1] flex-shrink-0 mt-2.5">
                      <div className={`h-3 w-3 rounded-full ${dotColor[entry.status]} ring-2 ring-foreground/10`} />
                    </div>

                    {/* Card */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={
                        isTask
                          ? `${entry.completed ? 'Mark incomplete' : 'Mark complete'}: ${entry.title}`
                          : entry.title
                      }
                      aria-busy={isBusy}
                      onClick={primaryAction}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          primaryAction()
                        }
                      }}
                      className={`flex-1 rounded-xl bg-foreground/[0.06] border border-foreground/[0.08] px-3 py-2.5 min-w-0 active:bg-foreground/[0.1] hover:bg-foreground/[0.08] transition-colors min-h-[44px] cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${isBusy ? 'opacity-60' : ''}`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      {/* Date row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xs text-foreground/40 font-medium">
                          {formatDate(entry.date)}
                        </span>

                        {/* Type badge */}
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none ${
                            entry.type === 'task'
                              ? 'bg-primary/15 text-primary'
                              : 'bg-info/15 text-info'
                          }`}
                        >
                          {entry.type === 'task' ? 'Task' : 'Event'}
                        </span>

                        {/* Category badge (timeline events only) */}
                        {entry.category && (
                          <span className="text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none bg-cat-milestone/15 text-cat-milestone-fg">
                            {entry.category}
                          </span>
                        )}

                        {/* Status flag — interactive for tasks, static for events */}
                        {isTask ? (
                          <button
                            type="button"
                            aria-label={`Toggle status for ${entry.title}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleTask(entry)
                            }}
                            disabled={isBusy}
                            className={`ml-auto inline-flex items-center gap-1 min-h-[28px] min-w-[28px] px-2 py-1 rounded-full text-2xs font-medium leading-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 hover:bg-foreground/10 active:bg-foreground/15 transition-colors ${statusLabel[entry.status].className}`}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            {statusIcon[entry.status]}
                            <span className="hidden sm:inline">{statusLabel[entry.status].text}</span>
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 ml-auto text-2xs font-medium ${statusLabel[entry.status].className}`}
                            aria-label={`Status: ${statusLabel[entry.status].text}`}
                          >
                            {statusIcon[entry.status]}
                            <span className="hidden sm:inline">{statusLabel[entry.status].text}</span>
                          </span>
                        )}

                        {/* Menu button (delete / edit) */}
                        <div
                          className="relative flex-shrink-0"
                          ref={menuOpen ? menuRef : undefined}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`More actions for ${entry.title}`}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(menuOpen ? null : entry.id)
                            }}
                            className="inline-flex items-center justify-center h-10 w-10 sm:h-7 sm:w-7 rounded-lg text-foreground/50 hover:text-foreground/90 hover:bg-foreground/10 active:bg-foreground/15 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuOpen && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full mt-1 z-50 bg-overlay-scrim/95 backdrop-blur-md border border-foreground/10 rounded-lg shadow-xl py-1 min-w-[160px]"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleAttachItem(entry)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-foreground/80 hover:bg-foreground/10 active:bg-foreground/15 transition-colors min-h-[40px] touch-manipulation"
                              >
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                Attach to chat
                              </button>
                              {isTask && entry.itemId && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(null)
                                    handleToggleTask(entry)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-foreground/80 hover:bg-foreground/10 active:bg-foreground/15 transition-colors min-h-[40px] touch-manipulation"
                                >
                                  {entry.completed ? (
                                    <>
                                      <Circle className="h-3.5 w-3.5" />
                                      Mark incomplete
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Mark complete
                                    </>
                                  )}
                                </button>
                              )}
                              {isTask && entry.itemId && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleEditDueDate(entry)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-foreground/80 hover:bg-foreground/10 active:bg-foreground/15 transition-colors min-h-[40px] touch-manipulation"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit due date
                                </button>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(entry)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors min-h-[40px] touch-manipulation"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-foreground/85 leading-snug mb-0.5">
                        {entry.type === 'task' && (
                          <span className="inline-flex items-center mr-1.5 align-middle">
                            {entry.completed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <span className="inline-block h-3.5 w-3.5 rounded border border-foreground/20" />
                            )}
                          </span>
                        )}
                        {entry.title}
                        {entry.type === 'event' && entry.htmlLink && (
                          <a
                            href={entry.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center ml-1.5 text-primary/70 hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>

                      {/* Description / checklist source */}
                      {entry.description && (
                        <p className="text-xs text-foreground/40 leading-relaxed line-clamp-3">
                          {entry.description}
                        </p>
                      )}
                      {entry.checklistTitle && (
                        <p className="text-2xs text-foreground/30 mt-0.5">
                          From: {entry.checklistTitle}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {dialogJSX}
    </div>
  )
}

function WeddingMarker({ date, countdown }: { date: Date; countdown: string }) {
  return (
    <div className="relative flex gap-3 mb-4">
      {/* Heart dot */}
      <div className="relative z-[1] flex-shrink-0 mt-2">
        <div className="h-5 w-5 rounded-full bg-cat-timeline/80 ring-2 ring-cat-timeline/20 flex items-center justify-center">
          <Heart className="h-3 w-3 text-foreground fill-white" />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 rounded-xl bg-cat-timeline/10 border border-cat-timeline/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-cat-timeline-fg">Wedding Day</span>
          <span className="text-2xs font-medium text-cat-timeline/80 bg-cat-timeline/15 px-1.5 py-0.5 rounded-full leading-none">
            {countdown}
          </span>
        </div>
        <p className="text-xs text-cat-timeline/60 mt-0.5">{formatDate(date)}</p>
      </div>
    </div>
  )
}
