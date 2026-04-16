import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PricingTierCard, {
  type PricingTier,
} from '@/components/pricing/PricingTierCard'
import GeolocationService from '@/services/geolocationService'
import ExchangeRateService from '@/services/exchangeRateService'
import { formatCurrency } from '@/utils/currencyFormat'
import { useAccount } from '@/hooks/useAccount'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase'

const SERVICE_NAME = 'Viva by EaseBot'

type BillingCycle = 'monthly' | 'annual'

interface TierPricing {
  tier: PricingTier
  monthlyUsd: number
  annualUsd: number
  isRecommended?: boolean
}

// Canonical prices from PRICING_PRD.md §4
const TIERS: TierPricing[] = [
  { tier: 'free', monthlyUsd: 0, annualUsd: 0 },
  { tier: 'pro', monthlyUsd: 14.99, annualUsd: 119, isRecommended: true },
  { tier: 'promax', monthlyUsd: 39, annualUsd: 299 },
]

const CURRENCY_OPTIONS = ['USD', 'INR', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD'] as const

const TIER_LABEL: Record<'pro' | 'promax', string> = {
  pro: 'Easebot Pro',
  promax: 'Easebot Pro Max',
}

export default function Pricing() {
  const navigate = useNavigate()
  const { plan } = useAccount()
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [currency, setCurrency] = useState<string>('USD')
  const [rate, setRate] = useState<number>(1)
  const [loadingRate, setLoadingRate] = useState(false)

  const currentTier: PricingTier | 'guest' = (
    plan?.tier === 'pro' ? 'pro'
      : plan?.tier === 'promax' ? 'promax'
        : plan?.tier === 'free' ? 'free'
          : 'guest'
  )

  // Detect user currency once on mount.
  useEffect(() => {
    let cancelled = false
    void GeolocationService.getUserCurrency().then((geo) => {
      if (!cancelled) setCurrency(geo.currencyCode.toUpperCase())
    })
    return () => { cancelled = true }
  }, [])

  // Fetch USD → currency rate whenever currency changes.
  useEffect(() => {
    let cancelled = false
    setLoadingRate(true)
    void ExchangeRateService.getRate('USD', currency).then((r) => {
      if (!cancelled) {
        setRate(r)
        setLoadingRate(false)
      }
    })
    return () => { cancelled = true }
  }, [currency])

  const cards = useMemo(() => {
    return TIERS.map((t) => {
      const usd = cycle === 'monthly' ? t.monthlyUsd : t.annualUsd
      const monthlyEquivUsd = cycle === 'annual' && t.annualUsd > 0 ? t.annualUsd / 12 : t.monthlyUsd
      const priceLocal = usd === 0 ? undefined : formatCurrency(usd, currency, rate)
      const subtitle = cycle === 'annual' && usd > 0
        ? `${formatCurrency(monthlyEquivUsd, currency, rate)}/mo billed yearly`
        : undefined
      return { ...t, usd, priceLocal, subtitle }
    })
  }, [cycle, currency, rate])

  const handleCurrencyOverride = (next: string) => {
    GeolocationService.setCurrencyOverride(next === 'USD' ? null : next)
    setCurrency(next)
  }

  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const handleTopup = () => {
    setCheckoutError(null)
    const user = auth.currentUser
    if (!user) {
      window.location.href = '/?auth=signup&next=/pricing'
      return
    }
    if (currentTier !== 'pro' && currentTier !== 'promax') return
    navigate('/checkout', {
      state: {
        plan: 'topup_2m',
        cycle: 'once',
        currency,
        priceUsd: 10,
        label: 'Token top-up — 2M tokens',
      },
    })
  }

  const handleSelect = (tier: PricingTier) => {
    setCheckoutError(null)
    if (tier === 'free') {
      window.location.href = '/'
      return
    }
    const user = auth.currentUser
    if (!user) {
      window.location.href = '/?auth=signup&next=/pricing'
      return
    }
    if (tier === currentTier) return
    // Pro → ProMax is an upgrade, not a new purchase. The backend needs
    // `isUpgrade: true` so the preflight allows it and the webhook drives the
    // `upgrade` state machine trigger.
    const isUpgrade = currentTier === 'pro' && tier === 'promax'
    const row = TIERS.find((t) => t.tier === tier)
    const priceUsd = !row ? 0 : cycle === 'monthly' ? row.monthlyUsd : row.annualUsd
    navigate('/checkout', {
      state: {
        plan: tier,
        cycle,
        currency,
        isUpgrade,
        priceUsd,
        label: `${TIER_LABEL[tier as 'pro' | 'promax']} — ${cycle === 'monthly' ? 'Monthly' : 'Annual'}`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-background text-soft">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-12 md:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {SERVICE_NAME}
        </Link>

        <header className="mb-10 text-center md:text-left">
          <p className="font-label uppercase tracking-[0.2em] text-2xs text-white/40 mb-3">
            Pricing
          </p>
          <h1 className="font-headline text-4xl md:text-5xl tracking-tight text-white mb-3">
            Plans that grow with your wedding
          </h1>
          <p className="text-sm text-white/60 max-w-2xl">
            Vertical wedding AI — planner, stylist, and knowledge modes — priced
            against what you'd pay a human planner, not a ChatGPT subscription.
            Cancel anytime. No refunds per our terms §6.5.
          </p>
        </header>

        {/* Billing cycle + currency controls ─────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="inline-flex rounded-full bg-white/[0.04] p-1"
          >
            {(['monthly', 'annual'] as BillingCycle[]).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  'min-h-9 rounded-full px-4 text-xs font-medium transition-colors',
                  cycle === c
                    ? 'bg-primary text-primary-foreground'
                    : 'text-white/60 hover:text-white/90',
                )}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual — save ~34%'}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-white/50">
            Show prices in
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => handleCurrencyOverride(e.target.value)}
              className="min-h-9 rounded-xl bg-white/[0.04] px-2 text-soft focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {loadingRate && <span aria-live="polite">…</span>}
          </label>
        </div>

        {checkoutError && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {checkoutError}
          </div>
        )}

        <section
          aria-label="Pricing tiers"
          className="mb-12 grid gap-5 sm:grid-cols-1 md:grid-cols-3"
        >
          {cards.map((c) => (
            <div key={c.tier} className="flex flex-col gap-2">
              <PricingTierCard
                tier={c.tier}
                currentUserTier={currentTier}
                priceUsd={c.usd}
                priceLocal={c.priceLocal}
                currency={currency}
                isRecommended={c.isRecommended}
                onSelect={handleSelect}
              />
              {c.subtitle && (
                <p className="text-center text-2xs text-white/40">{c.subtitle}</p>
              )}
            </div>
          ))}
        </section>

        <section
          aria-label="Token top-up pack"
          className="mb-12 rounded-2xl bg-white/[0.03] backdrop-blur-sm p-6"
        >
          <h2 className="font-headline text-xl text-white mb-1">Need more tokens?</h2>
          <p className="text-xs text-white/50 mb-4">
            Pro &amp; Pro Max subscribers can buy a 2 million token top-up pack
            (stackable, max 10 / month). No refunds.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-3">
              <span className="font-headline text-3xl text-white">
                {formatCurrency(10, currency, rate)}
              </span>
              <span className="text-xs text-white/50">/ 2M tokens, one-time</span>
            </div>
            {currentTier !== 'guest' && (
              currentTier === 'free' ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Upgrade to Pro first"
                  aria-label="Buy top-up — upgrade to Pro first"
                  className="min-h-11 rounded-xl bg-primary/40 px-5 text-sm font-medium text-primary-foreground/70 cursor-not-allowed disabled:opacity-60"
                >
                  Buy top-up
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleTopup}
                  aria-label="Buy 2 million token top-up pack"
                  className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Buy top-up
                </button>
              )
            )}
          </div>
        </section>

        <p className="mt-4 text-center text-xs text-white/40">
          Base currency is USD. Local prices update every minute via
          exchangerate-api. Final PayU checkout locks the rate server-side.
          Questions?{' '}
          <a href="mailto:support@easebot.app" className="text-primary hover:underline">
            support@easebot.app
          </a>
        </p>
      </div>
    </div>
  )
}
