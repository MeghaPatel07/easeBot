import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { XCircle, LifeBuoy } from 'lucide-react'
import { track } from '@/lib/analytics'
import { usePageTitle } from '@/hooks/usePageTitle'

// Support contact — kept identical to Help.tsx / Checkout.tsx so help is
// surfaced in a consistent, predictable location across the app (WCAG 3.2.6).
const SUPPORT_EMAIL = 'theweddingease@gmail.com'

export default function PaymentFailure() {
  usePageTitle('Payment not completed')
  const [params] = useSearchParams()
  // We still record the raw gateway reason for our own analytics, but we
  // deliberately do NOT surface PayU error codes to the user — they are
  // unreliable, jargon-heavy, and increase cognitive load at a stressful
  // moment. Users get a calm, generic, actionable message instead.
  const reason = params.get('reason') ?? 'unknown'
  const txnid = params.get('txnid') ?? ''

  useEffect(() => {
    track('payment_failure_page_viewed', {
      order_id: txnid || undefined,
      reason,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="gradient-bg min-h-screen text-soft flex items-center justify-center p-6">
      <div
        className="max-w-md rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-8 text-center"
        role="alert"
        aria-labelledby="payfail-title"
      >
        <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 id="payfail-title" className="mt-4 font-headline text-2xl text-foreground/90">
          Payment didn&rsquo;t go through
        </h1>

        {/* Error-prevention reassurance (WCAG 3.3.4): make it unmistakable that
            no money left the customer's account. */}
        <p className="mt-3 text-sm text-foreground/90">
          Your payment didn&rsquo;t go through, so{' '}
          <span className="font-medium">no charge was made</span>. Your plan is
          unchanged and you can safely try again.
        </p>

        {/* Error-suggestion guidance (WCAG 3.3.3): concrete next steps without
            guessing at a specific gateway error code. */}
        <p className="mt-3 text-sm text-foreground/80">
          This can happen if a card is declined or a bank check times out. You can
          try again, use a different card, or check with your bank if it keeps
          happening.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/pricing"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center transition-colors"
          >
            Try again
          </Link>
          <Link
            to="/"
            className="min-h-11 rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-soft hover:bg-foreground/[0.1] inline-flex items-center justify-center transition-colors"
          >
            Back to app
          </Link>
        </div>

        {/* Persistent, consistently-placed help (WCAG 3.2.6). */}
        <div className="mt-6 border-t border-foreground/[0.08] pt-4">
          <p className="text-xs text-foreground/70">
            Still stuck? We&rsquo;re happy to help.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            <Link
              to="/help"
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
              Help &amp; support
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </div>
          {txnid && (
            <p className="mt-3 text-2xs uppercase tracking-wide text-foreground/45">
              Reference: {txnid}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
