import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, LogIn, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { verifyPayment } from '@/services/paymentService'
import { track } from '@/lib/analytics'
import SignInModal from '@/components/auth/SignInModal'

interface VerifyResponse {
  txnid: string
  state: 'pending' | 'paid' | 'failed' | string
  plan?: string
  cycle?: string
  amountLocal?: string
  currency?: string
}

// We persist the txnid here when a user lands on /payment/success unauthenticated
// so that after they sign in (in-page modal OR returning from a fresh tab) we can
// still resume verification — even if the URL query string was dropped along the way.
const PENDING_TXNID_KEY = 'easebot:pending_payment_txnid'

type AuthState = 'pending' | 'in' | 'out'

export default function PaymentSuccess() {
  const [params] = useSearchParams()
  const urlTxnid = params.get('txnid') ?? ''
  // Fall back to sessionStorage if the URL lost its query string (e.g. user
  // navigated away and came back). The URL is the source of truth when present.
  const storedTxnid =
    typeof window !== 'undefined' ? window.sessionStorage.getItem(PENDING_TXNID_KEY) ?? '' : ''
  const txnid = urlTxnid || storedTxnid

  const [authState, setAuthState] = useState<AuthState>('pending')
  const [info, setInfo] = useState<VerifyResponse | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    track('payment_success_page_viewed', { order_id: txnid || undefined })
    // Fire once per page-view; txnid is a string captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preserve the txnid across an unauthenticated detour so we can resume verify
  // after the user signs in. Clear once we successfully render a receipt.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (urlTxnid) {
      window.sessionStorage.setItem(PENDING_TXNID_KEY, urlTxnid)
    }
  }, [urlTxnid])

  useEffect(() => {
    let cancelled = false

    const runVerify = async () => {
      try {
        if (!txnid) { setVerifyError('Missing transaction id.'); return }
        // Retry a few times — the webhook writes state='paid' asynchronously
        // and may not have landed by the time the browser hits this page.
        let res: VerifyResponse | null = null
        for (let attempt = 0; attempt < 5; attempt++) {
          res = (await verifyPayment(txnid)) as VerifyResponse
          if (res.state === 'paid' || res.state === 'failed') break
          await new Promise((r) => setTimeout(r, 1000))
        }
        // Force fresh token so any tier/claim change is visible.
        if (auth.currentUser) await auth.currentUser.getIdToken(true)
        // Refetch the account query to pick up the updated plan immediately
        await queryClient.refetchQueries({ queryKey: ['account', 'me'] })
        if (!cancelled && res) {
          setInfo(res)
          // Verification complete — safe to drop the pending txnid.
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(PENDING_TXNID_KEY)
          }
        }
      } catch (err) {
        if (!cancelled) setVerifyError(err instanceof Error ? err.message : String(err))
      }
    }

    // After the PayU round-trip the page is a fresh load — Firebase restores
    // auth.currentUser asynchronously from IndexedDB, so we MUST wait for the
    // auth state to hydrate before calling verify. Otherwise authFetch sees
    // currentUser === null and throws 'not_signed_in'.
    //
    // We also subscribe (not just first-fire) so that if the user signs in via
    // the in-page modal, this effect picks up the new user and resumes verify
    // automatically — no reload required.
    const unsub = onAuthStateChanged(auth, (user) => {
      if (cancelled) return
      if (!user) {
        setAuthState('out')
        // Do NOT set a destructive `verifyError` here — being signed-out on this
        // page is an expected state with its own UI, not a verify failure.
        return
      }
      setAuthState('in')
      // Closing the modal once we're signed in is just a UX nicety; it would
      // close itself on next render anyway because `open` won't be set.
      setShowSignIn(false)
      void runVerify()
    })

    return () => { cancelled = true; unsub() }
  }, [txnid, queryClient])

  // ---- Render helpers ------------------------------------------------------

  const renderHeadline = () => {
    if (authState === 'out') {
      return (
        <>
          <LogIn className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 font-headline text-2xl text-foreground/90">
            Sign in to view your payment receipt
          </h1>
        </>
      )
    }
    if (verifyError) {
      return (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 font-headline text-2xl text-foreground/90">
            We couldn&rsquo;t verify your transaction
          </h1>
        </>
      )
    }
    if (info && info.state === 'paid') {
      return (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 font-headline text-2xl text-foreground/90">Payment received</h1>
        </>
      )
    }
    return (
      <>
        <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
        <h1 className="mt-4 font-headline text-2xl text-foreground/90">Verifying your payment…</h1>
      </>
    )
  }

  const renderBody = () => {
    if (authState === 'pending') {
      return (
        <p className="mt-2 text-sm text-foreground/90">Checking your sign-in status…</p>
      )
    }
    if (authState === 'out') {
      return (
        <>
          <p className="mt-2 text-sm text-foreground/90">
            {txnid
              ? 'You were signed out at some point during checkout. Sign in to confirm and view your receipt — your transaction reference is saved.'
              : 'Sign in to your WeddingEase account to view recent payments and your current plan.'}
          </p>
          {txnid && (
            <p className="mt-3 text-2xs uppercase tracking-wide text-foreground/60">
              Reference: {txnid}
            </p>
          )}
        </>
      )
    }
    if (verifyError) {
      return (
        <p className="mt-2 text-sm text-foreground/90">
          We hit an error while confirming this transaction ({verifyError}). If you were charged,
          your plan will update automatically once our team confirms — please contact support if
          you don&rsquo;t see it within a few minutes.
        </p>
      )
    }
    if (info) {
      return (
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
      )
    }
    return <p className="mt-2 text-sm text-foreground/90">Verifying your payment…</p>
  }

  const renderActions = () => {
    if (authState === 'out') {
      return (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowSignIn(true)}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center transition-colors"
          >
            Sign in
          </button>
          <Link
            to="/"
            className="min-h-11 rounded-xl bg-foreground/[0.06] px-4 text-sm font-medium text-soft hover:bg-foreground/[0.1] inline-flex items-center justify-center transition-colors"
          >
            Back to app
          </Link>
        </div>
      )
    }
    return (
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
    )
  }

  return (
    <div className="gradient-bg min-h-screen text-soft flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-8 text-center">
        {renderHeadline()}
        {renderBody()}
        {renderActions()}
      </div>
      <SignInModal
        open={showSignIn}
        onOpenChange={setShowSignIn}
        onSwitchToSignUp={() => {
          // Sign-up isn't wired on this page — direct the user to the main app
          // where the full sign-up modal lives. The txnid is preserved in
          // sessionStorage so they can return and resume verify.
          setShowSignIn(false)
          window.location.assign('/')
        }}
      />
    </div>
  )
}
