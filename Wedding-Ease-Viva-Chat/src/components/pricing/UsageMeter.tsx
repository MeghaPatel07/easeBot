// UsageMeter — Sprint 1 batch B skeleton (FE-001).
//
// Visual-only: two progress bars (daily + monthly) colored by `state`. Sprint 2
// wires real data from GET /account/me. The 5 states are defined in
// .orchestrator/specs/ui-tokens.md §4.
//
// The `meter-*` token aliases are not yet in tailwind.config.ts; the UI agent
// adds them in Sprint 2. For the skeleton we fall back to the existing
// `primary` / `warning` / `destructive` / `muted` tokens so the component
// compiles today.

import { useEffect, useRef } from 'react'
import { AlertTriangle, Clock, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'

export type UsageMeterState =
  | 'ok'
  | 'warn'
  | 'crit'
  | 'daily_hit'
  | 'depleted'

export interface UsageMeterProps {
  usedDaily: number
  capDaily: number
  usedMonthly: number
  capMonthly: number
  /** Extra top-up tokens (from paid top-ups). Not used visually in skeleton. */
  extras?: number
  state: UsageMeterState
  /** Optional label override. Defaults to state-based copy. */
  label?: string
  className?: string
}

function barTone(state: UsageMeterState): string {
  switch (state) {
    case 'ok':
      return 'bg-primary' // Sprint 2: bg-meter-ok (forest green)
    case 'warn':
      return 'bg-warning'
    case 'crit':
    case 'daily_hit':
      return 'bg-destructive'
    case 'depleted':
      return 'bg-muted-foreground/40'
    default:
      return 'bg-primary'
  }
}

function stateCopy(state: UsageMeterState): string {
  switch (state) {
    case 'warn':
      return 'Approaching limit'
    case 'crit':
      return 'Almost at your limit'
    case 'daily_hit':
      return 'Daily limit reached. Resets at midnight UTC.'
    case 'depleted':
      return 'Monthly pool used up.'
    case 'ok':
    default:
      return 'Monthly usage'
  }
}

function StateIcon({ state }: { state: UsageMeterState }) {
  if (state === 'crit') {
    return (
      <AlertTriangle
        aria-hidden="true"
        className="h-3.5 w-3.5 text-destructive"
      />
    )
  }
  if (state === 'daily_hit') {
    return <Clock aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
  }
  if (state === 'depleted') {
    return (
      <Lock aria-hidden="true" className="h-3.5 w-3.5 text-foreground/90" />
    )
  }
  return null
}

export function UsageMeter({
  usedDaily,
  capDaily,
  usedMonthly,
  capMonthly,
  extras = 0,
  state,
  label,
  className,
}: UsageMeterProps) {
  const monthlyPct =
    capMonthly > 0
      ? Math.min(100, Math.round((usedMonthly / capMonthly) * 100))
      : 0
  const dailyPct =
    capDaily > 0 ? Math.min(100, Math.round((usedDaily / capDaily) * 100)) : 0

  const firedThresholds = useRef<Set<80 | 95>>(new Set())
  useEffect(() => {
    if (capMonthly <= 0) return
    const remaining = Math.max(0, capMonthly - usedMonthly)
    if (monthlyPct >= 95 && !firedThresholds.current.has(95)) {
      firedThresholds.current.add(95)
      track('token_meter_warning', { threshold: 95, remaining_tokens: remaining })
    } else if (monthlyPct >= 80 && !firedThresholds.current.has(80)) {
      firedThresholds.current.add(80)
      track('token_meter_warning', { threshold: 80, remaining_tokens: remaining })
    }
  }, [monthlyPct, usedMonthly, capMonthly])

  const monthlyTone = barTone(state)
  const dailyTone =
    state === 'daily_hit' ? 'bg-destructive' : 'bg-primary/60'

  const copy = label ?? stateCopy(state)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StateIcon state={state} />
          <span className="text-caption font-label uppercase tracking-wide text-foreground/90">
            {copy}
          </span>
        </div>
        <span className="text-2xs text-foreground/90">
          {monthlyPct}%{extras > 0 && ' · + top-up'}
        </span>
      </div>

      {/* Monthly bar — primary driver */}
      <div
        role="progressbar"
        aria-label="Monthly token pool usage"
        aria-valuenow={monthlyPct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          aria-hidden="true"
          className={cn(
            'h-full rounded-full transition-all duration-300',
            monthlyTone,
            state === 'daily_hit' &&
              'bg-[repeating-linear-gradient(45deg,currentColor_0_6px,transparent_6px_12px)] text-destructive',
          )}
          style={{ width: `${monthlyPct}%` }}
        />
      </div>

      {/* Daily bar — smaller secondary indicator */}
      <div
        role="progressbar"
        aria-label="Daily token ceiling usage"
        aria-valuenow={dailyPct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-1 w-full overflow-hidden rounded-full bg-muted/60"
      >
        <div
          aria-hidden="true"
          className={cn('h-full rounded-full transition-all duration-300', dailyTone)}
          style={{ width: `${dailyPct}%` }}
        />
      </div>
      <div className="flex justify-between text-3xs text-foreground/90">
        <span>Daily</span>
        <span>{dailyPct}%</span>
      </div>
    </div>
  )
}

export default UsageMeter
