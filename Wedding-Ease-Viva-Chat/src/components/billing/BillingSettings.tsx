import { useState } from 'react'
import { Receipt, AlertTriangle, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUsageStats } from '@/hooks/useUsageStats'
import { useAccount } from '@/hooks/useAccount'
import { UsageMeter, type UsageMeterState } from '@/components/pricing/UsageMeter'
import { cn } from '@/lib/utils'

function formatResetDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function BillingSettings({ className }: { className?: string }) {
  const { plan } = useAccount()
  const { snapshot, isLoading, isError, state: meterState, refetch } = useUsageStats()
  const [cancelOpen, setCancelOpen] = useState(false)

  const tier = snapshot?.tier ?? plan?.tier ?? 'free'
  const tierLabel =
    tier === 'promax' ? 'Pro Max'
    : tier === 'premium' ? 'Pro Max'
    : tier === 'pro' ? 'Pro'
    : tier === 'guest' ? 'Guest'
    : 'Free'

  const monthlyTokensUsed = snapshot?.monthlyTokensUsed ?? 0
  const monthlyTokensMax = snapshot?.monthlyPoolMax ?? 0
  const extras = snapshot?.extrasBucket ?? 0
  const dailyUsed = snapshot?.dailyUsed ?? 0
  // dailyMax is null in the payload — frontend approximates from tier caps.
  const dailyMaxMap: Record<string, number> = { guest: 0, free: 50_000, pro: 300_000, promax: 800_000, premium: 800_000 }
  const dailyMax = dailyMaxMap[tier] ?? 50_000

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Current plan */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">Current plan</p>
            <p className="font-headline text-2xl text-foreground">{tierLabel}</p>
          </div>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-2xs uppercase tracking-wide text-primary">
            {tier === 'free' || tier === 'guest' ? 'Free tier' : 'Active'}
          </span>
        </div>

        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
        ) : isError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              Could not load usage. <button type="button" onClick={() => void refetch()} className="underline">Retry</button>
            </div>
          </div>
        ) : (
          <UsageMeter
            usedDaily={dailyUsed}
            capDaily={dailyMax}
            usedMonthly={monthlyTokensUsed}
            capMonthly={monthlyTokensMax}
            extras={extras}
            state={meterState as UsageMeterState}
          />
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div>
            <p className="uppercase tracking-wide text-2xs">Monthly resets</p>
            <p className="text-foreground">{formatResetDate(snapshot?.resetAt)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-2xs">Daily resets</p>
            <p className="text-foreground">{formatResetDate(snapshot?.dailyResetAt)}</p>
          </div>
        </div>
      </div>

      {/* Extras */}
      {extras > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              Top-up balance: {extras.toLocaleString()} tokens
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Top-up tokens drain after your monthly pool. They never expire.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/pricing"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-white/5"
        >
          {tier === 'free' || tier === 'guest' ? 'Upgrade plan' : 'Change plan'}
        </Link>
        {tier !== 'free' && tier !== 'guest' && (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-4 text-sm font-medium text-destructive hover:bg-destructive/20"
          >
            Cancel subscription
          </button>
        )}
      </div>

      {/* Invoices placeholder (Sprint 3) */}
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">Invoice history</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Invoices appear here after your first paid cycle.
        </p>
      </div>

      {/* Cancel confirmation modal */}
      {cancelOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCancelOpen(false)}
        >
          <div
            className="max-w-md rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="cancel-dialog-title" className="font-headline text-xl text-foreground">
              Cancel subscription?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your plan stays active until the end of the current cycle, then
              drops back to Free. <strong className="text-foreground">
              Per our terms §6.5, no refunds are issued for partial cycles,
              unused tokens, or top-up packs.
              </strong> You can re-subscribe any time.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="min-h-11 rounded-md border border-border bg-transparent px-4 text-sm text-foreground hover:bg-white/5"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelOpen(false)
                  // Sprint 3 wires a real /api/payment/cancel endpoint.
                  window.alert('Cancellation flow launches in Sprint 3.')
                }}
                className="min-h-11 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Cancel anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BillingSettings
