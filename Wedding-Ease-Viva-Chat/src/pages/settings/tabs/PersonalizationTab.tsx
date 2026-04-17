// PersonalizationTab — Sprint 2 (Aarav). PRD §5 / §6.
// Owns wedding details, active vibe display, and a read-only context summary.
// Only writes through `useAccount.updateProfile` (Sprint 1 hook); never
// touches settingsService — that's reserved for AI Behavior fields.

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useAccount } from '@/hooks/useAccount'
import { cn } from '@/lib/utils'

import TabShell from './_TabShell'

// ── Helpers ─────────────────────────────────────────────────────────────────

type RoleValue = 'bride' | 'groom' | 'partner' | 'planner' | 'family'

const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: 'bride', label: 'Bride' },
  { value: 'groom', label: 'Groom' },
  { value: 'partner', label: 'Partner' },
  { value: 'planner', label: 'Planner' },
  { value: 'family', label: 'Family' },
]

interface FormState {
  weddingDate: Date | null
  partnerName: string
  role: string
  budget: string
}

function profileToForm(profile: ReturnType<typeof useAccount>['profile']): FormState {
  // weddingDate on UserProfile is a Firestore Timestamp (or null). Some fallback
  // paths may already convert it to a JS Date. Be defensive about both.
  let date: Date | null = null
  const raw = profile?.weddingDate as unknown
  if (raw) {
    if (raw instanceof Date) date = raw
    else if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
      try {
        date = (raw as { toDate: () => Date }).toDate()
      } catch {
        date = null
      }
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) date = d
    }
  }
  return {
    weddingDate: date,
    partnerName: profile?.partnerName ?? '',
    role: profile?.role ?? '',
    budget: profile?.budget != null ? String(profile.budget) : '',
  }
}

function formatBudget(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `₹${value.toLocaleString()}`
  }
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null
  const now = new Date()
  const ms = date.getTime() - now.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

// ── Component ────────────────────────────────────────────────────────────────

// Sprint 4 (Kenji): Custom-instructions max length matches Claude's UX.
const CUSTOM_INSTRUCTIONS_MAX = 1500

export function PersonalizationTab() {
  const { profile, updateProfile } = useAccount()
  const { toast } = useToast()

  const initial = useMemo(() => profileToForm(profile), [profile])
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)

  // ── Sprint 4 (Kenji): Custom instructions card state ────────────────────
  const initialAbout = profile?.about ?? ''
  const initialResponseStyle = profile?.responseStyle ?? ''
  const [about, setAbout] = useState(initialAbout)
  const [responseStyle, setResponseStyle] = useState(initialResponseStyle)
  const [savingInstructions, setSavingInstructions] = useState(false)

  useEffect(() => {
    setAbout(profile?.about ?? '')
    setResponseStyle(profile?.responseStyle ?? '')
  }, [profile?.uid, profile?.about, profile?.responseStyle])

  const instructionsDirty =
    about !== initialAbout || responseStyle !== initialResponseStyle

  const handleSaveInstructions = async () => {
    if (!instructionsDirty || savingInstructions) return
    if (about.length > CUSTOM_INSTRUCTIONS_MAX || responseStyle.length > CUSTOM_INSTRUCTIONS_MAX) {
      toast({
        title: 'Too long',
        description: `Each field must be ${CUSTOM_INSTRUCTIONS_MAX} characters or fewer.`,
        variant: 'destructive',
      })
      return
    }
    setSavingInstructions(true)
    const snapshot = { about: initialAbout, responseStyle: initialResponseStyle }
    try {
      await updateProfile({
        about: about.trim() || null,
        responseStyle: responseStyle.trim() || null,
      })
      toast({
        title: 'Custom instructions saved',
        description: 'TheWeddingBot will use these on your next chat.',
      })
    } catch (err) {
      toast({
        title: 'Could not save',
        description: (err as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      })
      // Roll back optimistic edits.
      setAbout(snapshot.about)
      setResponseStyle(snapshot.responseStyle)
    } finally {
      setSavingInstructions(false)
    }
  }

  // Re-hydrate when profile changes (eg. after a successful save).
  useEffect(() => {
    setForm(initial)
  }, [initial])

  const isDirty =
    (form.weddingDate?.getTime() ?? null) !== (initial.weddingDate?.getTime() ?? null) ||
    form.partnerName.trim() !== (initial.partnerName ?? '').trim() ||
    form.role !== initial.role ||
    form.budget.trim() !== initial.budget.trim()

  const handleSave = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      const budgetNum = form.budget.trim() === '' ? null : Number(form.budget)
      if (budgetNum != null && Number.isNaN(budgetNum)) {
        toast({
          title: 'Invalid budget',
          description: 'Please enter a numeric value.',
          variant: 'destructive',
        })
        setSaving(false)
        return
      }
      await updateProfile({
        weddingDate: form.weddingDate ? form.weddingDate.toISOString() : null,
        partnerName: form.partnerName.trim() || null,
        role: form.role || null,
        budget: budgetNum,
      })
      toast({
        title: 'Wedding details saved',
        description: 'Your personalization has been updated.',
      })
    } catch (err) {
      console.error('[PersonalizationTab] save failed:', err)
      toast({
        title: 'Could not save',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Active vibe ───────────────────────────────────────────────────────────
  const activeVibe = profile?.activeVibe ?? null

  const handleClearVibe = () => {
    // No backend path yet — surface an explicit toast so users know how to act.
    toast({
      title: 'Ask the chat to clear your vibe',
      description:
        'Vibes are managed from chat — say "clear my vibe" and TheWeddingBot will do it.',
    })
  }

  // ── Wedding context summary ───────────────────────────────────────────────
  const summaryDays = daysUntil(initial.weddingDate)
  const summaryBudget = formatBudget(profile?.budget ?? null)

  return (
    <TabShell
      title="Personalization"
      description="Wedding details, active vibe, and how TheWeddingBot adapts to your big day."
    >
      {/* ── Wedding details ──────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-white/90">Wedding details</h3>
          <p className="mt-1 text-xs text-white/90">
            Used to plan timelines, budgets, and recommendations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Wedding date */}
          <div className="space-y-2">
            <Label htmlFor="wedding-date" className="text-sm font-medium">
              Wedding date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="wedding-date"
                  type="button"
                  variant="outline"
                  className={cn(
                    'min-h-11 w-full justify-start bg-white/[0.04] text-left text-sm font-normal',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    !form.weddingDate && 'text-white/90',
                  )}
                  aria-label="Pick wedding date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  {form.weddingDate
                    ? format(form.weddingDate, 'PPP')
                    : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto bg-popover p-0 text-white/90"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={form.weddingDate ?? undefined}
                  onSelect={(d) => setForm((p) => ({ ...p, weddingDate: d ?? null }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {form.weddingDate && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, weddingDate: null }))}
                className="text-xs text-white/90 underline-offset-4 hover:text-white/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Clear date
              </button>
            )}
          </div>

          {/* Partner name */}
          <div className="space-y-2">
            <Label htmlFor="partner-name" className="text-sm font-medium">
              Partner name
            </Label>
            <Input
              id="partner-name"
              value={form.partnerName}
              onChange={(e) => setForm((p) => ({ ...p, partnerName: e.target.value }))}
              placeholder="e.g. Arjun"
              className="min-h-11 bg-white/[0.04] text-white/90 placeholder:text-white/90 focus-visible:ring-ring"
              autoComplete="off"
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">
              Your role
            </Label>
            <Select
              value={form.role || undefined}
              onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}
            >
              <SelectTrigger
                id="role"
                aria-label="Your role in the wedding"
                className="min-h-11 bg-white/[0.04] text-white/90 focus-visible:ring-ring"
              >
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-white/90">
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget" className="text-sm font-medium">
              Total budget
            </Label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/90"
              >
                ₹
              </span>
              <Input
                id="budget"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={form.budget}
                onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                placeholder="500000"
                className="min-h-11 bg-white/[0.04] pl-7 text-white/90 placeholder:text-white/90 focus-visible:ring-ring"
              />
            </div>
            {form.budget && !Number.isNaN(Number(form.budget)) && (
              <p className="text-xs text-white/90">
                {formatBudget(Number(form.budget))}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {isDirty && (
            <span className="text-xs text-white/90">Unsaved changes</span>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </Card>

      {/* ── Custom instructions (Sprint 4 — Kenji) ───────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-white/90">Custom instructions</h3>
          <p className="mt-1 text-xs text-white/90">
            Tell TheWeddingBot what to remember about you and how you want it to respond.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <div className="space-y-2">
            <Label htmlFor="custom-about" className="text-sm font-medium">
              What should TheWeddingBot know about you?
            </Label>
            <Textarea
              id="custom-about"
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX))}
              placeholder="e.g. I'm planning a 200-guest South Indian wedding in Bangalore in November. I love minimalism, hate clutter, and my partner is vegetarian."
              rows={4}
              maxLength={CUSTOM_INSTRUCTIONS_MAX}
              className="min-h-24 bg-white/[0.04] text-white/90 placeholder:text-white/90 focus-visible:ring-ring"
              aria-describedby="custom-about-counter"
            />
            <p
              id="custom-about-counter"
              className="text-right text-2xs text-white/90"
            >
              {about.length} / {CUSTOM_INSTRUCTIONS_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-response" className="text-sm font-medium">
              How should TheWeddingBot respond?
            </Label>
            <Textarea
              id="custom-response"
              value={responseStyle}
              onChange={(e) =>
                setResponseStyle(e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX))
              }
              placeholder="e.g. Keep replies short and punchy. Use bullet points. Skip the small talk."
              rows={4}
              maxLength={CUSTOM_INSTRUCTIONS_MAX}
              className="min-h-24 bg-white/[0.04] text-white/90 placeholder:text-white/90 focus-visible:ring-ring"
              aria-describedby="custom-response-counter"
            />
            <p
              id="custom-response-counter"
              className="text-right text-2xs text-white/90"
            >
              {responseStyle.length} / {CUSTOM_INSTRUCTIONS_MAX}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {instructionsDirty && (
            <span className="text-xs text-white/90">Unsaved changes</span>
          )}
          <Button
            type="button"
            onClick={handleSaveInstructions}
            disabled={!instructionsDirty || savingInstructions}
            className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring focus-visible:ring-offset-background"
          >
            {savingInstructions ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save instructions'
            )}
          </Button>
        </div>
      </Card>

      {/* ── Active vibe ──────────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white/90">Active vibe</h3>
            <p className="mt-1 text-xs text-white/90">
              The aesthetic TheWeddingBot uses for image generation and styling.
            </p>
          </div>
          <Sparkles
            className="h-5 w-5 text-white/90"
            aria-hidden="true"
          />
        </div>

        {activeVibe ? (
          <div className="rounded-md bg-white/[0.04] p-4">
            <p className="text-sm font-medium text-white/90">{activeVibe.title}</p>
            {activeVibe.subtitle && (
              <p className="mt-1 text-xs text-white/90">
                {activeVibe.subtitle}
              </p>
            )}
            {activeVibe.descriptors?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {activeVibe.descriptors.slice(0, 6).map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-white/[0.06] px-2 py-0.5 text-2xs font-medium text-white/90"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClearVibe}
                className="min-h-11 bg-white/[0.04] text-white/90 hover:bg-white/[0.06] focus-visible:ring-ring focus-visible:ring-offset-background"
              >
                Clear vibe
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-white/[0.03] p-4">
            <p className="text-sm text-white/90">
              No vibe set — ask the chat to set a vibe (e.g. “make my vibe modern
              minimalist”).
            </p>
          </div>
        )}
      </Card>

      {/* ── Wedding context summary ──────────────────────────────────────── */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-white/90">
          Wedding context summary
        </h3>
        <p className="mt-1 text-xs text-white/90">
          A read-only snapshot TheWeddingBot uses to tailor responses.
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-white/90">
              Days until wedding
            </dt>
            <dd className="mt-1 text-lg font-semibold text-white/90">
              {summaryDays == null
                ? '—'
                : summaryDays >= 0
                  ? `${summaryDays} days`
                  : 'Already happened'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-white/90">
              Budget
            </dt>
            <dd className="mt-1 text-lg font-semibold text-white/90">
              {summaryBudget}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-white/90">
              Role
            </dt>
            <dd className="mt-1 text-lg font-semibold capitalize text-white/90">
              {profile?.role ?? '—'}
            </dd>
          </div>
        </dl>
      </Card>
    </TabShell>
  )
}

export default PersonalizationTab
