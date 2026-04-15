import { useMemo, useState } from 'react'
import { Bell, Plus, Loader2, Trash2, Mail, MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
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
import { createReminder, deleteReminder } from '@/services/reminderService'
import { isDerivedPhoneEmail } from '@/services/authService'
import type { ReminderDoc } from '@/types'

interface RemindersViewProps {
  reminders: ReminderDoc[]
  onRefresh: () => void | Promise<void>
}

interface LeadTimePreset {
  label: string
  minutes: number
}

const LEAD_TIME_PRESETS: LeadTimePreset[] = [
  { label: '1 hour',  minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '1 day',   minutes: 1440 },
  { label: '2 days',  minutes: 2880 },
  { label: '1 week',  minutes: 10080 },
]
const DEFAULT_LEAD_MINUTES = 1440

function formatLeadTime(min: number): string {
  if (min < 60) return `${min}m before`
  if (min < 1440) {
    const h = Math.round(min / 60)
    return `${h}h before`
  }
  if (min < 10080) {
    const d = Math.round(min / 1440)
    return `${d}d before`
  }
  const w = Math.round(min / 10080)
  return `${w}w before`
}

function formatEventDate(r: ReminderDoc): string {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: r.timezone || undefined,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(r.eventTimeStr ? { hour: 'numeric', minute: '2-digit' } : {}),
    })
    return fmt.format(r.eventAt)
  } catch {
    return r.eventDateStr + (r.eventTimeStr ? ` · ${r.eventTimeStr}` : '')
  }
}

export default function RemindersView({ reminders, onRefresh }: RemindersViewProps) {
  const { user, profile } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [description, setDescription] = useState('')
  const [leadMinutes, setLeadMinutes] = useState<number>(DEFAULT_LEAD_MINUTES)
  const [customLead, setCustomLead] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const resetForm = () => {
    setTitle('')
    setDate('')
    setTime('')
    setDescription('')
    setLeadMinutes(DEFAULT_LEAD_MINUTES)
    setCustomLead('')
  }

  const handleOpenDialog = () => {
    if (!user) {
      toast.error('Please sign in to create reminders.')
      return
    }
    setDialogOpen(true)
  }

  const effectiveLead = useMemo(() => {
    if (customLead.trim()) {
      const n = Number(customLead)
      if (Number.isFinite(n) && n >= 0) return Math.floor(n)
    }
    return leadMinutes
  }, [leadMinutes, customLead])

  const handleCreate = async () => {
    if (!user) {
      toast.error('Please sign in to create reminders.')
      return
    }
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      toast.error('Title is required')
      return
    }
    if (!date) {
      toast.error('Date is required')
      return
    }
    setSubmitting(true)
    try {
      await createReminder(user, profile, {
        title: trimmedTitle,
        eventDateStr: date,
        eventTimeStr: time || null,
        description: description.trim() || null,
        leadTimeMinutes: effectiveLead,
      })
      toast.success(`Reminder set · ${formatLeadTime(effectiveLead)}`)
      setDialogOpen(false)
      resetForm()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create reminder'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (r: ReminderDoc) => {
    if (!user) return
    setDeletingId(r.id)
    try {
      await deleteReminder(user.uid, r.id)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete reminder'
      toast.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  // Sort: upcoming asc, past separately
  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const upcoming: ReminderDoc[] = []
    const past: ReminderDoc[] = []
    for (const r of reminders) {
      if (r.eventAt.getTime() >= now) upcoming.push(r)
      else past.push(r)
    }
    upcoming.sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())
    past.sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime())
    return { upcoming, past }
  }, [reminders])

  const renderCard = (r: ReminderDoc, faded = false) => {
    const channelLabel = r.channel === 'email' ? 'Email' : 'WhatsApp'
    const ChannelIcon = r.channel === 'email' ? Mail : MessageCircle
    const statusLabel =
      r.status === 'sent' ? 'Sent'
      : r.status === 'failed' ? 'Failed'
      : r.status === 'cancelled' ? 'Cancelled'
      : 'Pending'
    const statusClass =
      r.status === 'sent' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : r.status === 'failed' ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : r.status === 'cancelled' ? 'text-white/40 bg-white/5 border-white/10'
      : 'text-[#A17A63] bg-[#A17A63]/10 border-[#A17A63]/20'

    return (
      <div
        key={r.id}
        className={`relative rounded-2xl border px-4 py-3.5 space-y-2 transition-all duration-150 ${
          faded
            ? 'bg-white/5 border-white/10 opacity-60'
            : 'bg-white/10 border-primary/30 hover:bg-white/15 hover:border-primary/40 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-white/80 flex-1 min-w-0 break-words">{r.title}</p>
          <button
            type="button"
            aria-label="Delete reminder"
            onClick={() => handleDelete(r)}
            disabled={deletingId === r.id}
            className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deletingId === r.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <p className="text-xs text-primary font-medium">{formatEventDate(r)}</p>

        {r.description && (
          <p className="text-xs text-white/40 line-clamp-2 break-words">{r.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none bg-white/[0.06] text-white/60 border border-white/10">
            {formatLeadTime(r.leadTimeMinutes)}
          </span>
          <span className="inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none bg-white/[0.06] text-white/60 border border-white/10">
            <ChannelIcon className="h-2.5 w-2.5" />
            {channelLabel}
          </span>
          <span className={`inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-full leading-none border ${statusClass}`}>
            {r.status === 'sent' && <CheckCircle2 className="h-2.5 w-2.5" />}
            {r.status === 'failed' && <AlertTriangle className="h-2.5 w-2.5" />}
            {statusLabel}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          onClick={handleOpenDialog}
          disabled={!user}
          className="h-9 rounded-xl gap-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Reminder
        </Button>
      </div>

      {/* Empty state */}
      {reminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40">
          <Bell className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm">No reminders yet.</p>
          <p className="text-xs mt-1">
            Ask Easebot or click <span className="font-semibold text-primary">+ New Reminder</span>.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-2xs uppercase tracking-wider font-semibold text-white/40">Upcoming</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map(r => renderCard(r))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2 mt-2">
              <h3 className="text-2xs uppercase tracking-wider font-semibold text-white/40">Past reminders</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {past.map(r => renderCard(r, true))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) resetForm()
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md glass-panel rounded-2xl p-6 border border-white/[0.1] shadow-2xl bg-[#1a1a1a]/95 backdrop-blur-md flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg text-white/90">New Reminder</DialogTitle>
            <DialogDescription className="text-white/40 text-xs">
              We'll notify you via {profile?.phone && !isDerivedPhoneEmail(profile?.email) ? 'email or WhatsApp' : profile?.phone ? 'WhatsApp' : 'email'} before the event.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reminder-title" className="text-xs font-medium text-white/70">Title</label>
              <Input
                id="reminder-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Venue walk-through"
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="reminder-date" className="text-xs font-medium text-white/70">Date</label>
                <input
                  id="reminder-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={submitting}
                  className="flex h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-sm text-white/90 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="reminder-time" className="text-xs font-medium text-white/70">
                  Time <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="reminder-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={submitting}
                  className="flex h-9 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-sm text-white/90 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reminder-description" className="text-xs font-medium text-white/70">
                Description <span className="text-white/30">(optional)</span>
              </label>
              <Textarea
                id="reminder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes, location, or details"
                rows={3}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Notify me</label>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_TIME_PRESETS.map(p => {
                  const active = !customLead.trim() && leadMinutes === p.minutes
                  return (
                    <button
                      key={p.minutes}
                      type="button"
                      onClick={() => { setLeadMinutes(p.minutes); setCustomLead('') }}
                      disabled={submitting}
                      className={`text-2xs font-medium px-2 py-1 rounded-full border transition-colors ${
                        active
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'bg-white/[0.04] text-white/60 border-white/10 hover:bg-white/[0.08]'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <label htmlFor="reminder-custom-lead" className="text-2xs text-white/40">Custom (minutes)</label>
                <input
                  id="reminder-custom-lead"
                  type="number"
                  min={0}
                  value={customLead}
                  onChange={(e) => setCustomLead(e.target.value)}
                  placeholder="e.g. 90"
                  disabled={submitting}
                  className="flex h-7 w-24 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 text-xs text-white/90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="text-2xs text-white/30">{formatLeadTime(effectiveLead)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm() }}
              disabled={submitting}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !title.trim() || !date}
              className="rounded-xl gap-1.5"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
