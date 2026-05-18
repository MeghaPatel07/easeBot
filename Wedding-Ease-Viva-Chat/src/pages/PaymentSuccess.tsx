import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { paymentVerify } from '@/services/cloudFunctionsService'
import { track } from '@/lib/analytics'

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
  const queryClient = useQueryClient()

  useEffect(() => {
    track('payment_success_page_viewed', { order_id: txnid || undefined })
  }, [])

  useEffect(() => {
    let cancelled = false

    const runVerify = async () => {
      try {
        if (!txnid) { setError('Missing transaction id.'); return }
        // Retry a few times — the webhook writes state='paid' asynchronously
        // and may not have landed by the time the browser hits this page.
        let verifyResult = null
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            verifyResult = await paymentVerify({
              orderId: txnid,
              payuTransactionId: txnid,
            })
            if (verifyResult.verified || verifyResult.status === 'failed') break
          } catch (e: any) {
            if (e?.code !== 'not_found' && attempt < 4) {
              await new Promise((r) => setTimeout(r, 1000))
              continue
            }
            throw e
          }
        }
        // Force fresh token so any tier/claim change is visible.
        if (auth.currentUser) await auth.currentUser.getIdToken(true)
        // Invalidate the account query so BillingSettings picks up the new
        // tier/extras immediately when the user navigates back.
        await queryClient.invalidateQueries({ queryKey: ['account', 'me'] })
        if (!cancelled && verifyResult) {
          setInfo({
            txnid,
            state: verifyResult.verified ? 'paid' : 'failed',
            plan: '',
            cycle: '',
            amountLocal: '',
            currency: '',
          })
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || String(err)
          setError(msg || 'Failed to verify payment')
        }
      }
    }

    // After the PayU round-trip the page is a fresh load — Firebase restores
    // auth.currentUser asynchronously from IndexedDB, so we MUST wait for the
    // auth state to hydrate before calling verify. Otherwise authFetch sees
    // currentUser === null and throws 'not_signed_in'.
    const unsub = onAuthStateChanged(auth, (user) => {
      if (cancelled) return
      if (!user) {
        setError('You were signed out during checkout. Please sign in again to view this receipt.')
        return
      }
      void runVerify()
      unsub()
    })

    return () => { cancelled = true; unsub() }
  }, [txnid, queryClient])

  return (
    <div className="gradient-bg min-h-screen text-soft flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 font-headline text-2xl text-foreground/90">Payment received</h1>
        {error ? (
          <p className="mt-2 text-sm text-destructive">We could not verify your transaction ({error}). Please contact support if this persists.</p>
        ) : info ? (
          <>
            <p className="mt-2 text-sm text-foreground/90">
              {info.plan?.toUpperCase()} · {info.cycle}
            </p>
            <p className="mt-1 text-sm text-foreground/90">
              {info.currency} {info.amountLocal}
            </p>
            <p className="mt-1 text-2xs uppercase tracking-wide text-foreground/90">
              {info.state}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-foreground/90">Verifying your payment…</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/?settings=plan-billing"
            className="min-h-11 rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-soft hover:bg-foreground/[0.1] inline-flex items-center justify-center transition-colors"
          >
            Go to Plan &amp; Billing
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
