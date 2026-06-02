import { useEffect, useState } from 'react'
import { Receipt, AlertTriangle, Zap, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUsageStats } from '@/hooks/useUsageStats'
import { useAccount } from '@/hooks/useAccount'
import { useAuth } from '@/contexts/AuthContext'
import { UsageMeter, type UsageMeterState } from '@/components/pricing/UsageMeter'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  getInvoices,
  downloadInvoicePdf,
  cancelSubscription,
  reactivateSubscription,
  getCurrentSubscription,
  type InvoiceSummary,
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

export function BillingSettings({ className }: { className?: string }) {
  const { user } = useAuth()
  const { plan } = useAccount()
  const { snapshot, isLoading, isError, state: meterState, refetch } = useUsageStats()
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)

  // Subscription state — drives the Cancel / Reactivate flow. The cancel
  // action is a financial-impact destructive action (WCAG 3.3.4 Error
  // Prevention) so it MUST go through an AlertDialog confirm before the API
  // fires. See `cancelConfirmOpen` + `handleConfirmCancel`.
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // aria-live region content for SR announcements (WCAG 4.1.3 Status Messages).
  const [statusAnnounce, setStatusAnnounce] = useState('')

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

  // Load subscription snapshot for paid users so we can correctly render
  // either "Cancel subscription" or "Resume subscription".
  useEffect(() => {
    if (!user) {
      setSubscription(null)
      return
    }
    let alive = true
    void getCurrentSubscription()
      .then((sub) => {
        if (alive) setSubscription(sub)
      })
      .catch(() => {
        // Soft-fail: cancel/reactivate UI just won't render. Don't block the
        // rest of BillingSettings on this.
        if (alive) setSubscription(null)
      })
    return () => {
      alive = false
    }
  }, [user])

  const handleConfirmCancel = async () => {
    setCancelBusy(true)
    setCancelError(null)
    try {
      const clientRequestId = `cancel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await cancelSubscription(clientRequestId)
      setCancelConfirmOpen(false)
      setStatusAnnounce('Subscription cancellation scheduled. You will keep access until the end of your current billing period.')
      // Refresh subscription + usage so the UI flips to the "cancel_scheduled" variant.
      try {
        const sub = await getCurrentSubscription()
        setSubscription(sub)
      } catch {
        // ignore — next mount will reconcile
      }
      void refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCancelError(
        msg.includes('409')
          ? 'This subscription cannot be cancelled right now — it may already be scheduled.'
          : msg.includes('401')
          ? 'Please sign in again to continue.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setCancelBusy(false)
    }
  }

  const handleConfirmReactivate = async () => {
    setCancelBusy(true)
    setCancelError(null)
    try {
      const clientRequestId = `reactivate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await reactivateSubscription(clientRequestId)
      setReactivateConfirmOpen(false)
      setStatusAnnounce('Subscription resumed. Your plan will continue to renew at the end of the current period.')
      try {
        const sub = await getCurrentSubscription()
        setSubscription(sub)
      } catch {
        // ignore
      }
      void refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCancelError(
        msg.includes('401')
          ? 'Please sign in again to continue.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setCancelBusy(false)
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

      {/*
        Cancel / Resume subscription — only rendered for paid users.

        WCAG 3.3.4 Error Prevention (Legal, Financial, Data) requires the
        destructive action to be confirmable before firing. The button does
        NOT call cancelSubscription() directly; it opens an AlertDialog whose
        "Yes, cancel subscription" button is what actually fires the API.
        Default focus stays on the Cancel/Keep escape hatch, so an accidental
        Enter on the trigger only opens the confirm — never cancels.
      */}
      {user && (tier === 'pro' || tier === 'promax') && subscription && (
        <div className="flex flex-col gap-2">
          {subscription.status === 'cancel_scheduled' ? (
            <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/[0.06] p-4 text-xs text-foreground/90">
              <p>
                Your {tierLabel} subscription is scheduled to end
                {snapshot?.resetAt ? ` on ${formatResetDate(subscription.currentPeriodEnd)}` : ' at the end of the current period'}.
                You can resume it any time before then.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setCancelError(null)
                    setReactivateConfirmOpen(true)
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Resume subscription
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => {
                  setCancelError(null)
                  setCancelConfirmOpen(true)
                }}
                aria-haspopup="dialog"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-foreground/[0.12] bg-transparent px-4 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.04]"
              >
                Cancel subscription
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirm cancel — AlertDialog enforces the deliberate two-click pattern. */}
      <AlertDialog
        open={cancelConfirmOpen}
        onOpenChange={(open) => {
          if (!cancelBusy) {
            setCancelConfirmOpen(open)
            if (!open) setCancelError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll keep {tierLabel} access until the end of your current billing cycle, then
              switch to the Free plan. No refunds are issued for the remaining period. You can
              resume your subscription any time before the cycle ends.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {cancelError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-xs text-destructive"
            >
              {cancelError}
            </div>
          )}

          <AlertDialogFooter>
            {/*
              AlertDialogCancel renders first in the DOM so it receives
              default focus per shadcn/Radix — matches the "safer choice
              gets focus" guidance for destructive confirms.
            */}
            <AlertDialogCancel disabled={cancelBusy}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Prevent Radix from auto-closing the dialog so we can show
                // an inline error if the API rejects the call.
                e.preventDefault()
                void handleConfirmCancel()
              }}
              disabled={cancelBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Cancelling…
                </span>
              ) : (
                'Yes, cancel subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reactivate — same pattern, less scary copy. */}
      <AlertDialog
        open={reactivateConfirmOpen}
        onOpenChange={(open) => {
          if (!cancelBusy) {
            setReactivateConfirmOpen(open)
            if (!open) setCancelError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume your {tierLabel} subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will continue to renew at the end of the current billing period
              and you'll keep full access. You can cancel again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {cancelError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-xs text-destructive"
            >
              {cancelError}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmReactivate()
              }}
              disabled={cancelBusy}
            >
              {cancelBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Resuming…
                </span>
              ) : (
                'Yes, resume subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        aria-live status region — announces success/failure of cancel or
        reactivate to screen-reader users without stealing focus (WCAG 4.1.3
        Status Messages, AA). Visually hidden via the sr-only utility.
      */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusAnnounce}
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
