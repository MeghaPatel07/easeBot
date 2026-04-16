import { useMemo, useState } from 'react'
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
} from 'lucide-react'
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
import { createReminder } from '@/services/reminderService'
import { createChecklist, updateItemDueDate } from '@/services/checklistService'
import type { ReminderDoc, TimelineEvent } from '@/types'

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
  completed: 'bg-emerald-500',
  upcoming: 'bg-[#A17A63]',
  overdue: 'bg-red-400',
  today: 'bg-amber-400',
}

const statusLabel: Record<EntryStatus, { text: string; className: string }> = {
  completed: { text: 'Completed', className: 'text-emerald-400' },
  upcoming: { text: 'Upcoming', className: 'text-[#A17A63]' },
  overdue: { text: 'Overdue', className: 'text-red-400' },
  today: { text: 'Today', className: 'text-amber-400' },
}

const statusIcon: Record<EntryStatus, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
  upcoming: <Clock className="h-3 w-3 text-[#A17A63]" />,
  overdue: <AlertTriangle className="h-3 w-3 text-red-400" />,
  today: <Flag className="h-3 w-3 text-amber-400" />,
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [chooserMode, setChooserMode] = useState<ChooserMode>('chooser')
  const [submitting, setSubmitting] = useState(false)

  // Event form state
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evTime, setEvTime] = useState('')
  const [evDescription, setEvDescription] = useState('')

  // Task form state
  const [taskText, setTaskText] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')

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
      await createReminder(user, profile, {
        title: trimmedTitle,
        eventDateStr: evDate,
        eventTimeStr: evTime || null,
        description: evDescription.trim() || null,
        leadTimeMinutes: 1440,
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
      toast.success('Task created')
      closeDialog()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      toast.error(msg)
    } finally {
      setSubmitting(false)
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
    <div className="flex-shrink-0 px-4 pt-4">
      <Button
        size="sm"
        onClick={handleOpenDialog}
        className="h-9 rounded-xl gap-1.5 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" />
        New
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-white/[0.1] shadow-2xl bg-[#1a1a1a]/95 backdrop-blur-md flex flex-col gap-4">
        {chooserMode === 'chooser' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-headline text-lg text-white/90">
                New Timeline Entry
              </DialogTitle>
              <DialogDescription className="text-white/40 text-xs">
                What would you like to add to your timeline?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setChooserMode('event')}
                className="flex-1 h-20 rounded-xl flex flex-col gap-1"
                disabled={!user}
              >
                <Calendar className="h-5 w-5" />
                <span className="text-xs font-medium">New Event</span>
              </Button>
              <Button
                onClick={() => setChooserMode('task')}
                className="flex-1 h-20 rounded-xl flex flex-col gap-1"
                variant="outline"
              >
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-xs font-medium">New Task</span>
              </Button>
            </div>
            {!user && (
              <p className="text-2xs text-white/40 text-center">
                Sign in to create events.
              </p>
            )}
          </>
        )}

        {chooserMode === 'event' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-headline text-lg text-white/90">
                New Event
              </DialogTitle>
              <DialogDescription className="text-white/40 text-xs">
                Add an event with a 1-day-before notification.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-ev-title" className="text-xs font-medium text-white/70">Title</label>
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
                  <label htmlFor="tl-ev-date" className="text-xs font-medium text-white/70">Date</label>
                  <input
                    id="tl-ev-date"
                    type="date"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-sm text-white/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label htmlFor="tl-ev-time" className="text-xs font-medium text-white/70">
                    Time <span className="text-white/30">(optional)</span>
                  </label>
                  <input
                    id="tl-ev-time"
                    type="time"
                    value={evTime}
                    onChange={(e) => setEvTime(e.target.value)}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-sm text-white/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-ev-desc" className="text-xs font-medium text-white/70">
                  Description <span className="text-white/30">(optional)</span>
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
                className="rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateEvent}
                disabled={submitting || !evTitle.trim() || !evDate}
                className="rounded-xl gap-1.5"
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
              <DialogTitle className="font-headline text-lg text-white/90">
                New Task
              </DialogTitle>
              <DialogDescription className="text-white/40 text-xs">
                Create a task with a due date.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tl-task-text" className="text-xs font-medium text-white/70">Task</label>
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
                <label htmlFor="tl-task-due" className="text-xs font-medium text-white/70">Due date</label>
                <input
                  id="tl-task-due"
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  disabled={submitting}
                  className="flex h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-sm text-white/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setChooserMode('chooser')}
                disabled={submitting}
                className="rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateTask}
                disabled={submitting || !taskText.trim() || !taskDueDate}
                className="rounded-xl gap-1.5"
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
          <div className="h-14 w-14 rounded-full bg-white/[0.06] flex items-center justify-center mb-4">
            <Calendar className="h-7 w-7 text-white/40" />
          </div>
          <h3 className="text-sm font-semibold text-white/70 mb-1">No timeline items yet</h3>
          <p className="text-xs text-white/40 max-w-[260px] leading-relaxed">
            Add due dates to your checklist items or create calendar events to see them on your timeline.
          </p>
        </div>
        {dialogJSX}
      </div>
    )
  }

  const weddingDateStr = weddingDate ? toDateStr(weddingDate) : null
  const weddingMonthKey = weddingDate ? formatMonthYear(weddingDate) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {toolbar}
      {/* Stats bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-3">
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <div className="flex-1 min-w-0 rounded-xl bg-white/[0.06] border border-white/[0.08] px-2.5 py-2 text-center">
            <p className="text-base font-bold text-white/70">{stats.total}</p>
            <p className="text-3xs text-white/40 font-medium">Total</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-emerald-400">{stats.completed}</p>
            <p className="text-3xs text-emerald-400/70 font-medium">Completed</p>
          </div>
          <div className="flex-1 min-w-0 rounded-xl bg-[#A17A63]/10 border border-[#A17A63]/20 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-[#A17A63]">{stats.upcoming}</p>
            <p className="text-3xs text-[#A17A63]/70 font-medium">Upcoming</p>
          </div>
          {stats.overdue > 0 && (
            <div className="flex-1 min-w-0 rounded-xl bg-red-500/10 border border-red-500/20 px-2.5 py-2 text-center">
              <p className="text-base font-bold text-red-400">{stats.overdue}</p>
              <p className="text-3xs text-red-400/70 font-medium">Overdue</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {Array.from(grouped.entries()).map(([monthKey, monthEntries]) => (
          <div key={monthKey} className="mb-6">
            {/* Month header */}
            <div className="sticky top-0 z-10 bg-white/[0.04] backdrop-blur-sm rounded-lg py-1.5 px-2 mb-2">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
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
              <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-white/[0.08]" />

              {monthEntries.map((entry, idx) => {
                const isLast = idx === monthEntries.length - 1

                return (
                  <div key={entry.id} className={`relative flex gap-3 ${isLast ? '' : 'mb-3'}`}>
                    {/* Dot */}
                    <div className="relative z-[1] flex-shrink-0 mt-2.5">
                      <div className={`h-3 w-3 rounded-full ${dotColor[entry.status]} ring-2 ring-white/10`} />
                    </div>

                    {/* Card */}
                    <div className="flex-1 rounded-xl bg-white/[0.06] border border-white/[0.08] px-3 py-2.5 min-w-0 hover:bg-white/[0.08] transition-colors">
                      {/* Date row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xs text-white/40 font-medium">
                          {formatDate(entry.date)}
                        </span>

                        {/* Type badge */}
                        <span
                          className={`text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none ${
                            entry.type === 'task'
                              ? 'bg-[#A17A63]/15 text-[#A17A63]'
                              : 'bg-blue-400/15 text-blue-400'
                          }`}
                        >
                          {entry.type === 'task' ? 'Task' : 'Event'}
                        </span>

                        {/* Category badge (timeline events only) */}
                        {entry.category && (
                          <span className="text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none bg-purple-400/15 text-purple-300">
                            {entry.category}
                          </span>
                        )}

                        {/* Status */}
                        <span className={`flex items-center gap-0.5 text-2xs font-medium ml-auto ${statusLabel[entry.status].className}`}>
                          {statusIcon[entry.status]}
                          <span className="hidden sm:inline">{statusLabel[entry.status].text}</span>
                        </span>
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-white/85 leading-snug mb-0.5">
                        {entry.type === 'task' && (
                          <span className="inline-flex items-center mr-1.5 align-middle">
                            {entry.completed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <span className="inline-block h-3.5 w-3.5 rounded border border-white/20" />
                            )}
                          </span>
                        )}
                        {entry.title}
                        {entry.type === 'event' && entry.htmlLink && (
                          <a
                            href={entry.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center ml-1.5 text-[#A17A63]/70 hover:text-[#A17A63] transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>

                      {/* Description / checklist source */}
                      {entry.description && (
                        <p className="text-xs text-white/40 leading-relaxed line-clamp-3">
                          {entry.description}
                        </p>
                      )}
                      {entry.checklistTitle && (
                        <p className="text-2xs text-white/30 mt-0.5">
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
        <div className="h-5 w-5 rounded-full bg-pink-500/80 ring-2 ring-pink-500/20 flex items-center justify-center">
          <Heart className="h-3 w-3 text-white fill-white" />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 rounded-xl bg-pink-500/10 border border-pink-500/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-pink-300">Wedding Day</span>
          <span className="text-2xs font-medium text-pink-400/80 bg-pink-500/15 px-1.5 py-0.5 rounded-full leading-none">
            {countdown}
          </span>
        </div>
        <p className="text-xs text-pink-400/60 mt-0.5">{formatDate(date)}</p>
      </div>
    </div>
  )
}
