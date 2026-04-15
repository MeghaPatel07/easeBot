import { Link, useSearchParams } from 'react-router-dom'
import { XCircle } from 'lucide-react'

export default function PaymentFailure() {
  const [params] = useSearchParams()
  const reason = params.get('reason') ?? 'unknown'
  const txnid = params.get('txnid') ?? ''

  return (
    <div className="min-h-screen bg-background text-white/85 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <XCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 font-headline text-2xl text-foreground">Payment not completed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reason: <span className="font-mono">{reason}</span>
        </p>
        {txnid && (
          <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
            Reference: {txnid}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          No charge was completed. You can try again from the pricing page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/pricing"
            className="min-h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-white/5 inline-flex items-center justify-center"
          >
            Try again
          </Link>
          <Link
            to="/"
            className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center"
          >
            Back to app
          </Link>
        </div>
      </div>
    </div>
  )
}
