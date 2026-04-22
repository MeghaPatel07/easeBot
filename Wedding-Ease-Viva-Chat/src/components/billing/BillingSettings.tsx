import { useState } from 'react'
import { Receipt, AlertTriangle, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUsageStats } from '@/hooks/useUsageStats'
import { useAccount } from '@/hooks/useAccount'
import { useAuth } from '@/contexts/AuthContext'
import { UsageMeter, type UsageMeterState } from '@/components/pricing/UsageMeter'
import { cn } from '@/lib/utils'
import {
  getInvoices,
  downloadInvoicePdf,
  type InvoiceSummary,
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

export function BillingSettings({ className }: { className?: string }) {
  const { user } = useAuth()
  const { plan } = useAccount()
  const { snapshot, isLoading, isError, state: meterState, refetch } = useUsageStats()
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)

  const handleViewInvoices = async () => {
    setInvoicesLoading(true)
    setInvoicesError(null)
    try {
      const rows = await getInvoices()
      setInvoices(rows)
      setInvoicesLoaded(true)
    } catch (err) {
      setInvoicesError(err instanceof Error ? err.message : String(err))
    } finally {
      setInvoicesLoading(false)
    }
  }

  const tier = snapshot?.tier ?? plan?.tier ?? 'free'
  const tierLabel =
    tier === 'promax' ? 'Pro Max'
    : tier === 'pro' ? 'Pro'
    : tier === 'guest' ? 'Guest'
    : 'Free'

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
              Top-up balance: {extras.toLocaleString()} tokens
            </p>
          </div>
          <p className="mt-1 text-xs text-foreground/90">
            Top-up tokens drain after your monthly pool. They never expire.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/pricing"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-foreground/90 hover:bg-foreground/[0.08]"
        >
          {tier === 'free' || tier === 'guest' ? 'Upgrade plan' : 'Change plan'}
        </Link>
      </div>

      {/* Invoices — lazy-loaded on click (hidden for signed-out users) */}
      {/* {user && <div className="rounded-xl bg-foreground/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-foreground/90" />
            <p className="text-2xs uppercase tracking-wide text-foreground/90">Invoice history</p>
          </div>
          {invoicesLoaded && (
            <button
              type="button"
              onClick={() => void handleViewInvoices()}
              disabled={invoicesLoading}
              className="text-2xs uppercase tracking-wide text-primary hover:underline disabled:opacity-50"
            >
              Refresh
            </button>
          )}
        </div>

        {!invoicesLoaded && !invoicesLoading && !invoicesError && (
          <button
            type="button"
            onClick={() => void handleViewInvoices()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-foreground/90 hover:bg-foreground/[0.08]"
          >
            View invoices
          </button>
        )}

        {invoicesLoading && (
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
        )}

        {invoicesError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              Could not load invoices.{' '}
              <button type="button" onClick={() => void handleViewInvoices()} className="underline">
                Retry
              </button>
            </div>
          </div>
        )}

        {invoicesLoaded && !invoicesLoading && !invoicesError && (
          invoices.length === 0 ? (
            <p className="text-xs text-foreground/90">
              Invoices appear here after your first paid cycle.
            </p>
          ) : (
            <ul className="divide-y divide-foreground/[0.06] text-sm">
              {invoices.map((inv) => (
                <li key={inv.invoiceId} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-foreground/90">{inv.invoiceNumber}</p>
                    <p className="text-xs text-foreground/90">
                      {inv.date ? new Date(inv.date).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-medium text-foreground/90">
                        {inv.currencyCode || 'USD'} {inv.totalLocal.toFixed(2)}
                      </p>
                      <p className="text-2xs uppercase tracking-wide text-foreground/90">{inv.status}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void downloadInvoicePdf(inv.invoiceId)}
                      className="rounded-lg bg-foreground/[0.06] px-3 py-1 text-xs text-foreground/90 hover:bg-foreground/[0.08]"
                    >
                      PDF
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>} */}
    </div>
  )
}

export default BillingSettings
