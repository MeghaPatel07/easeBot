// TokenPoolBar — shows daily + monthly token usage as x/y progress bars.
// PRICING_PRD §5: 75% soft banner, 90% amber + cost preview, 100% paused.

import { Link } from 'react-router-dom'
import { useTokenPool } from '@/hooks/useTokenPool'
import { cn } from '@/lib/utils'

export function TokenPoolBar({ className }: { className?: string }) {
  const { monthlyPct, dailyPct, monthlyLabel, dailyLabel, level, cappedReason, isLoading, snapshot } = useTokenPool()

  // Don't render for guests or while loading the first time
  if (!snapshot && !isLoading) return null
  if (!snapshot) return null

  const barColor =
    level === 'exceeded' || cappedReason ? 'bg-destructive'
      : level === 'critical' ? 'bg-warning'
        : level === 'warning' ? 'bg-warning'
          : 'bg-primary'

  const dailyCapped = cappedReason === 'daily_cap_exceeded'

  return (
    <div className={cn('space-y-2', className)}>
      {/* Monthly pool */}
      <div>
        <div className="flex items-center justify-between text-2xs text-foreground/60 mb-1">
          <span>Monthly tokens</span>
          <span className={cn(
            level === 'exceeded' && 'text-destructive font-medium',
            level === 'critical' && 'text-warning font-medium',
          )}>
            {monthlyLabel}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Monthly token pool usage"
          aria-valuenow={monthlyPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full rounded-full bg-foreground/[0.08] overflow-hidden"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${monthlyPct}%` }}
          />
        </div>
      </div>

      {/* Daily cap */}
      <div>
        <div className="flex items-center justify-between text-2xs text-foreground/60 mb-1">
          <span>Today</span>
          <span className={cn(dailyCapped && 'text-destructive font-medium')}>
            {dailyLabel}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Daily token usage"
          aria-valuenow={dailyPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full rounded-full bg-foreground/[0.08] overflow-hidden"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', dailyCapped ? 'bg-destructive' : 'bg-foreground/30')}
            style={{ width: `${dailyPct}%` }}
          />
        </div>
        {dailyCapped && (
          <p className="text-2xs text-destructive font-medium mt-1">
            Daily limit reached. Resets at midnight UTC.
          </p>
        )}
      </div>

      {/* Warning / upgrade prompt */}
      {level === 'warning' && (
        <p className="text-2xs text-warning">
          You've used 75%+ of your monthly tokens.{' '}
          <Link to="/pricing" className="underline hover:text-warning-subtle">View usage</Link>
        </p>
      )}
      {level === 'critical' && (
        <p className="text-2xs text-warning font-medium">
          90%+ of your monthly pool used. Expensive actions (images, voice) will use remaining tokens quickly.{' '}
          <Link to="/pricing" className="underline hover:text-warning-subtle">Upgrade or top up</Link>
        </p>
      )}
      {level === 'exceeded' && (
        <p className="text-2xs text-destructive font-medium">
          Monthly token pool exhausted.{' '}
          {(snapshot as any).extrasBucket > 0 || (snapshot as any).topUpBalance > 0 ? null : (
            <Link to="/pricing" className="underline hover:text-destructive/80">Upgrade or buy a top-up pack</Link>
          )}
        </p>
      )}
    </div>
  )
}

export default TokenPoolBar
