import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import {
  initiatePayment,
  autoSubmitToPayu,
  type BillingAddressInput,
  type BillingCycle,
  type Plan,
} from '@/services/paymentService'
import ExchangeRateService from '@/services/exchangeRateService'
import { formatCurrency } from '@/utils/currencyFormat'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'

interface CheckoutState {
  plan: Plan | 'topup_2m'
  cycle: BillingCycle | 'once'
  currency: string
  isUpgrade?: boolean
  priceUsd: number
  label: string
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
]

const IN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
  'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep',
]

export default function Checkout() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as CheckoutState | null

  // Hooks must run unconditionally — early returns with hooks below would
  // violate React's rules of hooks. Gate rendering via state flags instead.
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('IN')
  const [stateName, setStateName] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [line1, setLine1] = useState('')
  const [gstin, setGstin] = useState('')
  const [rate, setRate] = useState(1)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const didSubmitRef = useRef(false)

  // Wait for Firebase auth to hydrate before deciding whether to render or
  // bounce. Without this gate, direct navigation to /checkout from a new tab
  // would see auth.currentUser === null and redirect an actually-signed-in
  // user back to signup.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
      if (u) {
        setFullName((prev) => prev || u.displayName || '')
        setEmail((prev) => prev || u.email || '')
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!state?.currency) return
    let cancelled = false
    void ExchangeRateService.getRate('USD', state.currency).then((r) => {
      if (!cancelled) setRate(r)
    })
    return () => { cancelled = true }
  }, [state?.currency])

  useEffect(() => {
    return () => {
      if (!didSubmitRef.current && state?.plan) {
        track('payment_abandoned', { step: 'checkout_form', tier: String(state.plan) })
      }
    }
  }, [state?.plan])

  const priceDisplay = useMemo(
    () => state ? formatCurrency(state.priceUsd, state.currency, rate) : '',
    [state, rate],
  )

  // Direct navigation without state → bounce back to pricing.
  if (!state?.plan || !state?.cycle) {
    return <Navigate to="/pricing" replace />
  }

  if (!authReady) {
    return (
      <div className="gradient-bg min-h-screen text-soft flex items-center justify-center p-6">
        <p className="text-sm text-foreground/60">Loading checkout…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login?next=/pricing" replace />
  }

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Full name is required.'
    if (!email.trim()) return 'Email is required.'
    if (!country) return 'Country is required.'
    if (country === 'IN' && !stateName) return 'State is required for Indian addresses.'
    if (!line1.trim()) return 'Address line 1 is required.'
    if (!city.trim()) return 'City is required.'
    if (!postalCode.trim()) return 'Postal code is required.'
    if (gstin && !GSTIN_REGEX.test(gstin.toUpperCase())) return 'GSTIN format is invalid.'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err = validate()
    if (err) { setFormError(err); return }

    const billingAddress: BillingAddressInput = {
      name: fullName.trim(),
      country,
      state: country === 'IN' ? stateName : (stateName || undefined),
      city: city.trim(),
      postalCode: postalCode.trim(),
      line1: line1.trim(),
    }

    try {
      setSubmitting(true)
      track('checkout_started', {
        tier: state.plan,
        cycle: state.cycle,
        amount: state.priceUsd,
        currency: state.currency,
      })
      const firstname = fullName.trim().split(' ')[0] || 'Customer'
      const init = await initiatePayment({
        plan: state.plan,
        cycle: state.cycle,
        currency: state.currency,
        firstname,
        email: email.trim(),
        billingAddress,
        gstin: gstin ? gstin.toUpperCase() : undefined,
        isUpgrade: state.isUpgrade,
      })
      track('payu_redirect_started', {
        order_id: init.txnid,
        tier: state.plan,
        amount: state.priceUsd,
        currency: state.currency,
      })
      didSubmitRef.current = true
      autoSubmitToPayu(init)
    } catch (submitErr) {
      const msg = submitErr instanceof Error ? submitErr.message : String(submitErr)
      console.error('[Checkout] initiate failed', submitErr)
      if (msg.includes('409') && msg.includes('already_subscribed')) {
        navigate('/pricing', { state: { returnReason: 'already_subscribed' } })
      } else if (msg.includes('409') && msg.includes('upgrade_requires_pro_tier')) {
        setFormError('Upgrades are only available from the Pro tier.')
      } else if (msg.includes('503') || msg.includes('rate_api_unavailable')) {
        setFormError('Currency conversion is temporarily unavailable. Please try again.')
      } else if (msg.includes('missing_billing_state')) {
        setFormError('State is required for Indian addresses.')
      } else if (msg.includes('invalid_gstin')) {
        setFormError('GSTIN format is invalid.')
      } else {
        setFormError('Could not start checkout. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const inputCls =
    'min-h-11 w-full rounded-xl border-0 bg-[hsl(22.5deg_25.6%_50.98%/5%)] px-3 text-sm text-soft placeholder-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/10 focus:bg-foreground/[0.06] transition-colors'

  return (
    <div className="gradient-bg min-h-screen text-soft">
      <div className="relative mx-auto max-w-3xl px-6 py-12 md:py-16">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground/90 transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <header className="mb-8">
          <p className="font-label uppercase tracking-[0.2em] text-2xs text-foreground/40 mb-3">
            Checkout
          </p>
          <h1 className="font-headline text-3xl md:text-4xl tracking-tight text-foreground mb-2">
            Billing information
          </h1>
          <p className="text-sm text-foreground/60">
            Enter your billing address to generate a tax-compliant invoice. GSTIN
            is optional and only used for Indian businesses.
          </p>
        </header>

        <div className="rounded-2xl bg-card/90 border border-border/50 shadow-card backdrop-blur-2xl p-6 md:p-8">
          {/* Order summary */}
          <div className="mb-6 rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-5">
            <p className="text-2xs uppercase tracking-wide text-foreground/40">Order summary</p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="text-lg text-foreground">{state.label}</p>
              <p className="font-headline text-2xl text-foreground">{priceDisplay}</p>
            </div>
            <p className="mt-1 text-2xs text-foreground/40">
              Billed in {state.currency} · locked at checkout · no refunds per terms §6.5
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" data-ph-mask>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              Full name
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputCls}
                placeholder="Priya Sharma"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
            Address line
            <input
              type="text"
              required
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className={inputCls}
              placeholder="Flat 4B, 221 Park Avenue"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              Country
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value)
                  if (e.target.value !== 'IN') setStateName('')
                }}
                className={cn(inputCls, 'appearance-none')}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              State / Region
              {country === 'IN' ? (
                <select
                  required
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className={cn(inputCls, 'appearance-none')}
                >
                  <option value="">Select a state…</option>
                  {IN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className={inputCls}
                  placeholder="Optional"
                />
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              City
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputCls}
                placeholder="Mumbai"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
              Postal code
              <input
                type="text"
                required
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={inputCls}
                placeholder="400001"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-xs text-foreground/60">
            GSTIN (optional — Indian businesses only)
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              className={cn(inputCls, 'font-mono uppercase tracking-wider')}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
            <span className="text-2xs text-foreground/40">
              15 characters. We&apos;ll add this to your tax invoice for input credit.
            </span>
          </label>

          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:w-auto transition-colors"
            >
              {submitting ? 'Redirecting to PayU…' : `Pay ${priceDisplay}`}
            </button>
            <p className="mt-3 text-2xs text-foreground/40">
              You&apos;ll be redirected to PayU&apos;s secure sandbox. By continuing
              you agree to the <Link to="/terms" className="underline">Terms</Link>{' '}
              and <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </div>
          </form>
        </div>
      </div>
    </div>
  )
}
