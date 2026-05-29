import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { track } from '@/lib/analytics'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function PaymentFailure() {
  usePageTitle('Payment failed')
  const [params] = useSearchParams()
  const reason = params.get('reason') ?? 'unknown'
  const txnid = params.get('txnid') ?? ''

  useEffect(() => {
    track('payment_failure_page_viewed', {
      order_id: txnid || undefined,
      reason,
    })
  }, [])

  return (
    <div className="gradient-bg min-h-screen text-soft flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-8 text-center">
        <XCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 font-headline text-2xl text-foreground/90">Payment not completed</h1>
        <p className="mt-2 text-sm text-foreground/90">
          Reason: <span className="font-mono">{reason}</span>
        </p>
        {txnid && (
          <p className="mt-1 text-2xs uppercase tracking-wide text-foreground/90">
            Reference: {txnid}
          </p>
        )}
        <p className="mt-4 text-xs text-foreground/90">
          No charge was completed. You can try again from the pricing page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/pricing"
            className="min-h-11 rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-soft hover:bg-foreground/[0.1] inline-flex items-center justify-center transition-colors"
          >
            Try again
          </Link>
          <Link
            to="/"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center transition-colors"
          >
            Back to app
          </Link>
        </div>
      </div>
    </div>
  )
}
