import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { verifyPayment } from '@/services/paymentService'

interface VerifyResponse {
  txnid: string
  state: 'pending' | 'paid' | 'failed' | string
  plan?: string
  cycle?: string
  amountLocal?: string
  currency?: string
}

export default function PaymentSuccess() {
  const [params] = useSearchParams()
  const txnid = params.get('txnid') ?? ''
  const [info, setInfo] = useState<VerifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Force fresh token so any tier/claim change is visible.
        if (auth.currentUser) await auth.currentUser.getIdToken(true)
        if (!txnid) { setError('Missing transaction id.'); return }
        const res = (await verifyPayment(txnid)) as VerifyResponse
        if (!cancelled) setInfo(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { cancelled = true }
  }, [txnid])

  return (
    <div className="min-h-screen bg-background text-white/85 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 font-headline text-2xl text-foreground">Payment received</h1>
        {error ? (
          <p className="mt-2 text-sm text-destructive">We could not verify your transaction ({error}). Please contact support if this persists.</p>
        ) : info ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {info.plan?.toUpperCase()} · {info.cycle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {info.currency} {info.amountLocal}
            </p>
            <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
              {info.state}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Verifying your payment…</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/?settings=plan-billing"
            className="min-h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-white/5 inline-flex items-center justify-center"
          >
            Go to Plan &amp; Billing
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
