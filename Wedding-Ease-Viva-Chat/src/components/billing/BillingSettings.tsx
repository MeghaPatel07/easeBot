import { useEffect, useState } from 'react'
import { Receipt, AlertTriangle, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUsageStats } from '@/hooks/useUsageStats'
import { useAccount } from '@/hooks/useAccount'
import { useAuth } from '@/contexts/AuthContext'
import { UsageMeter, type UsageMeterState } from '@/components/pricing/UsageMeter'
import { cn } from '@/lib/utils'
import {
  downloadInvoicePdf,
  getBillingHistory,
  getCurrentSubscription,
  type BillingHistoryRow,
  type SubscriptionSnapshot,
} from '@/services/paymentService'

function formatResetDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Always display reset times in UTC so the value the server stores is the
  // value the user sees — avoids "why did my monthly reset show tomorrow?"
  // confusion for non-UTC browsers (e.g. IST = UTC+5:30).
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC'
}

function formatPlanDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function planLabel(plan: string | null, cycle: string | null): string | null {
  if (!plan) return null
  const base =
    plan === 'promax' ? 'Pro Max'
    : plan === 'pro' ? 'Pro'
    : plan === 'topup_2m' ? 'Top-up'
    : plan
  const c = cycle === 'annual' ? 'Annual' : cycle === 'monthly' ? 'Monthly' : null
  return c ? `${base} — ${c}` : base
}

function providerLabel(p: string | null): string | null {
  if (p === 'razorpay') return 'Razorpay'
  if (p === 'payu') return 'PayU'
  return null
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'text-emerald-600 dark:text-emerald-400',
  FAILED: 'text-destructive',
  PENDING: 'text-amber-600 dark:text-amber-400',
  REVIEW: 'text-foreground/60',
}

export function BillingSettings({ className }: { className?: string }) {
  const { user } = useAuth()
  const { plan } = useAccount()
  const { snapshot, isLoading, isError, state: meterState, refetch } = useUsageStats()

  const [history, setHistory] = useState<BillingHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [sub, setSub] = useState<SubscriptionSnapshot | null>(null)

  // Auto-load purchase history + subscription period whenever the signed-in
  // user changes (and on first mount of the tab).
  useEffect(() => {
    if (!user) {
      setHistory([])
      setSub(null)
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    getBillingHistory()
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch((err) => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    getCurrentSubscription()
      .then((s) => { if (!cancelled) setSub(s) })
      .catch(() => { if (!cancelled) setSub(null) })
    return () => { cancelled = true }
  }, [user])

  const refreshHistory = async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      setHistory(await getBillingHistory())
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err))
    } finally {
      setHistoryLoading(false)
    }
  }

  const tier = snapshot?.tier ?? plan?.tier ?? 'free'
  const tierLabel =
    tier === 'promax' ? 'Pro Max'
    : tier === 'pro' ? 'Pro'
    : tier === 'guest' ? 'Guest'
    : 'Free'
  const isPaidTier = tier === 'pro' || tier === 'promax'

  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
  const periodEndValid = periodEnd !== null && !Number.isNaN(periodEnd.getTime())
  const daysLeft = periodEndValid
    ? Math.max(0, Math.ceil((periodEnd!.getTime() - Date.now()) / 86_400_000))
    : null
  const willDowngrade = sub?.cancelAtPeriodEnd === true

  const monthlyTokensUsed = snapshot?.monthlyTokensUsed ?? 0
  const monthlyTokensMax = snapshot?.monthlyPoolMax ?? 0
  const extras = snapshot?.extrasBucket ?? 0
  const dailyUsed = snapshot?.dailyUsed ?? 0
  // dailyMax is null in the payload — frontend approximates from tier caps.
  const dailyMaxMap: Record<string, number> = { guest: 0, free: 50_000, pro: 300_000, promax: 800_000 }
  const dailyMax = dailyMaxMap[tier] ?? 50_000

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Current plan */}
      <div className="rounded-xl bg-foreground/[0.03] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-2xs uppercase tracking-wide text-foreground/90">Current plan</p>
            <p className="font-headline text-2xl text-foreground/90">{tierLabel}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-2xs uppercase tracking-wide text-primary">
            {tier === 'free' || tier === 'guest' ? 'Free tier' : 'Active'}
          </span>
        </div>

        {!user ? (
          <p className="text-xs text-foreground/90">Sign in to view your usage details.</p>
        ) : isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
        ) : isError ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
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

        {/* Plan expiry — paid tiers drop to Free at period end unless renewed */}
        {user && isPaidTier && periodEndValid && (
          <div className="mt-4 rounded-lg bg-foreground/[0.04] p-3 text-xs">
            <p className="uppercase tracking-wide text-2xs text-foreground/70">
              {willDowngrade ? 'Moves to Free on' : 'Active until'}
            </p>
            <p className="text-foreground/90">
              {formatPlanDate(sub?.currentPeriodEnd)}
              {daysLeft !== null && (
                <span className="text-foreground/60"> · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
              )}
            </p>
            <p className="mt-1 text-2xs text-foreground/60">
              {willDowngrade
                ? 'Your plan is cancelled and switches to Free on the date above.'
                : 'After this date your plan moves to Free unless you renew.'}
            </p>
          </div>
        )}

        {user && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-foreground/90">
            <div>
              <p className="uppercase tracking-wide text-2xs">Monthly resets</p>
              <p className="text-foreground/90">{formatResetDate(snapshot?.resetAt)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-2xs">Daily resets</p>
              <p className="text-foreground/90">{formatResetDate(snapshot?.dailyResetAt)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Extras */}
      {extras > 0 && (
        <div className="rounded-xl bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground/90">
              Top-up pack active
            </p>
          </div>
          <p className="mt-1 text-xs text-foreground/90">
            Extra headroom on top of your monthly allowance — it drains after your monthly pool and never expires.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/pricing"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-foreground/90 hover:bg-foreground/[0.08]"
        >
          {tier === 'free' || tier === 'guest' ? 'Upgrade plan' : 'Renew or change plan'}
        </Link>
      </div>

      {/* Purchase history — invoices + payment attempts (hidden for signed-out) */}
      {user && (
        <div className="rounded-xl bg-foreground/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-foreground/90" />
              <p className="text-2xs uppercase tracking-wide text-foreground/90">Purchase history</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshHistory()}
              disabled={historyLoading}
              className="text-2xs uppercase tracking-wide text-primary hover:underline disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
          ) : historyError ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="flex-1">
                Could not load history.{' '}
                <button type="button" onClick={() => void refreshHistory()} className="underline">
                  Retry
                </button>
              </div>
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-foreground/90">
              Your purchases appear here after your first paid cycle.
            </p>
          ) : (
            <ul className="divide-y divide-foreground/[0.06] text-sm">
              {history.map((row) => {
                const title =
                  row.invoiceNumber || row.productinfo || planLabel(row.plan, row.cycle) || 'Payment'
                const prov = providerLabel(row.provider)
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground/90">{title}</p>
                      <p className="text-xs text-foreground/70">
                        {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                        {prov ? ` · ${prov}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium text-foreground/90">
                          {row.currencyCode || 'USD'} {row.amount.toFixed(2)}
                        </p>
                        <p className={cn('text-2xs uppercase tracking-wide', STATUS_STYLES[row.status] ?? 'text-foreground/60')}>
                          {row.status}
                        </p>
                      </div>
                      {row.hasPdf && (
                        <button
                          type="button"
                          onClick={() => void downloadInvoicePdf(row.id)}
                          className="rounded-lg bg-foreground/[0.06] px-3 py-1 text-xs text-foreground/90 hover:bg-foreground/[0.08]"
                        >
                          PDF
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default BillingSettings
