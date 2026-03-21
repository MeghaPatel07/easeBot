import { useMemo } from 'react'
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Heart,
  ExternalLink,
  Flag,
} from 'lucide-react'

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
  calendarEvents: Array<{
    id: string
    title: string
    date: string
    time: string | null
    description: string | null
    htmlLink: string
  }>
  weddingDate: Date | null
}

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
  upcoming: 'bg-blue-500',
  overdue: 'bg-red-500',
  today: 'bg-amber-500',
}

const statusLabel: Record<EntryStatus, { text: string; className: string }> = {
  completed: { text: 'Completed', className: 'text-emerald-600' },
  upcoming: { text: 'Upcoming', className: 'text-blue-600' },
  overdue: { text: 'Overdue', className: 'text-red-600' },
  today: { text: 'Today', className: 'text-amber-600' },
}

const statusIcon: Record<EntryStatus, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  upcoming: <Clock className="h-3 w-3 text-blue-500" />,
  overdue: <AlertTriangle className="h-3 w-3 text-red-500" />,
  today: <Flag className="h-3 w-3 text-amber-500" />,
}

export default function TimelineView({
  userId: _userId,
  checklists,
  calendarEvents,
  weddingDate,
}: TimelineViewProps) {
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
        })
      }
    }

    for (const ev of calendarEvents) {
      if (!ev.date) continue
      const date = parseDate(ev.date)
      items.push({
        id: `event-${ev.id}`,
        title: ev.title,
        date,
        dateStr: ev.date,
        type: 'event',
        status: getStatus(ev.date, false),
        sourceId: ev.id,
        description: ev.description,
        completed: false,
        htmlLink: ev.htmlLink || null,
        checklistTitle: null,
      })
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime())
    return items
  }, [checklists, calendarEvents])

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>()

    // Insert wedding date as a synthetic entry for grouping awareness
    const allEntries = [...entries]
    if (weddingDate) {
      const wdStr = toDateStr(weddingDate)
      // Don't add duplicate — we render wedding marker separately
      // but include it to ensure its month group exists
      const key = formatMonthYear(weddingDate)
      if (!allEntries.some(e => formatMonthYear(e.date) === key)) {
        // placeholder so the month group gets created
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
      else upcoming++ // today counts as upcoming
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

  // Empty state
  if (entries.length === 0 && !weddingDate) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
        <div className="h-14 w-14 rounded-full bg-stone-100 flex items-center justify-center mb-4">
          <Calendar className="h-7 w-7 text-stone-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">No timeline items yet</h3>
        <p className="text-xs text-gray-400 max-w-[260px] leading-relaxed">
          Add due dates to your checklist items or create calendar events to see them on your timeline.
        </p>
      </div>
    )
  }

  const weddingDateStr = weddingDate ? toDateStr(weddingDate) : null
  const weddingMonthKey = weddingDate ? formatMonthYear(weddingDate) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-stone-50 border border-[#EBE4D9] px-2.5 py-2 text-center">
            <p className="text-base font-bold text-gray-700">{stats.total}</p>
            <p className="text-[9px] text-gray-500 font-medium">Total</p>
          </div>
          <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-100 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-emerald-600">{stats.completed}</p>
            <p className="text-[9px] text-emerald-500 font-medium">Completed</p>
          </div>
          <div className="flex-1 rounded-xl bg-blue-50 border border-blue-100 px-2.5 py-2 text-center">
            <p className="text-base font-bold text-blue-600">{stats.upcoming}</p>
            <p className="text-[9px] text-blue-500 font-medium">Upcoming</p>
          </div>
          {stats.overdue > 0 && (
            <div className="flex-1 rounded-xl bg-red-50 border border-red-200 px-2.5 py-2 text-center">
              <p className="text-base font-bold text-red-600">{stats.overdue}</p>
              <p className="text-[9px] text-red-500 font-medium">Overdue</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {Array.from(grouped.entries()).map(([monthKey, monthEntries]) => (
          <div key={monthKey} className="mb-6">
            {/* Month header */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm py-1.5 mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
              <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-stone-200" />

              {monthEntries.map((entry, idx) => {
                const isLast = idx === monthEntries.length - 1

                return (
                  <div key={entry.id} className={`relative flex gap-3 ${isLast ? '' : 'mb-3'}`}>
                    {/* Dot */}
                    <div className="relative z-[1] flex-shrink-0 mt-2.5">
                      <div className={`h-3 w-3 rounded-full ${dotColor[entry.status]} ring-2 ring-white`} />
                    </div>

                    {/* Card */}
                    <div className="flex-1 rounded-xl bg-white/70 border border-[#EBE4D9] px-3 py-2.5 min-w-0">
                      {/* Date row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {formatDate(entry.date)}
                        </span>

                        {/* Type badge */}
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none ${
                            entry.type === 'task'
                              ? 'bg-[#A2B29D]/15 text-[#A2B29D]'
                              : 'bg-blue-50 text-blue-500'
                          }`}
                        >
                          {entry.type === 'task' ? 'Task' : 'Event'}
                        </span>

                        {/* Status */}
                        <span className={`flex items-center gap-0.5 text-[10px] font-medium ml-auto ${statusLabel[entry.status].className}`}>
                          {statusIcon[entry.status]}
                          <span className="hidden sm:inline">{statusLabel[entry.status].text}</span>
                        </span>
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-gray-800 leading-snug mb-0.5">
                        {entry.type === 'task' && (
                          <span className="inline-flex items-center mr-1.5 align-middle">
                            {entry.completed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <span className="inline-block h-3.5 w-3.5 rounded border border-gray-300" />
                            )}
                          </span>
                        )}
                        {entry.title}
                        {entry.type === 'event' && entry.htmlLink && (
                          <a
                            href={entry.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center ml-1.5 text-blue-400 hover:text-blue-600 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>

                      {/* Description / checklist source */}
                      {entry.description && (
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                          {entry.description}
                        </p>
                      )}
                      {entry.checklistTitle && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
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
    </div>
  )
}

function WeddingMarker({ date, countdown }: { date: Date; countdown: string }) {
  return (
    <div className="relative flex gap-3 mb-4">
      {/* Heart dot */}
      <div className="relative z-[1] flex-shrink-0 mt-2">
        <div className="h-5 w-5 rounded-full bg-pink-500 ring-2 ring-white flex items-center justify-center">
          <Heart className="h-3 w-3 text-white fill-white" />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-pink-700">Wedding Day</span>
          <span className="text-[10px] font-medium text-pink-400 bg-pink-100 px-1.5 py-0.5 rounded-full leading-none">
            {countdown}
          </span>
        </div>
        <p className="text-xs text-pink-500 mt-0.5">{formatDate(date)}</p>
      </div>
    </div>
  )
}
