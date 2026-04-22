import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Minus, Check, X as XIcon } from 'lucide-react'
import PricingTierCard, {
  type PricingTier,
} from '@/components/pricing/PricingTierCard'
import { UpgradeFlow } from '@/components/pricing/UpgradeFlow'
import { DowngradeFlow } from '@/components/pricing/DowngradeFlow'
import GeolocationService from '@/services/geolocationService'
import ExchangeRateService from '@/services/exchangeRateService'
import { formatCurrency } from '@/utils/currencyFormat'
import { useAccount } from '@/hooks/useAccount'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase'
import { track } from '@/lib/analytics'

const SERVICE_NAME = 'TheWeddingBot'

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
  { tier: 'pro', monthlyUsd: 10, annualUsd: 0.12, isRecommended: true },
  { tier: 'promax', monthlyUsd: 39, annualUsd: 299 },
]

const CURRENCY_OPTIONS = ['USD', 'INR', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD'] as const

const TIER_LABEL: Record<'pro' | 'promax', string> = {
  pro: 'TheWeddingBot Pro',
  promax: 'TheWeddingBot Pro Max',
}

const FAQ_ITEMS = [
  {
    q: 'What is TheWeddingBot and how does it work?',
    a: 'TheWeddingBot is an AI-powered wedding planning assistant. It helps you plan your entire wedding — from venue research and vendor comparisons to budget tracking, style inspiration, and timeline management — all through natural conversation.',
  },
  {
    q: 'What should I use TheWeddingBot for?',
    a: 'Use TheWeddingBot for brainstorming wedding ideas, getting style and vibe recommendations, tracking your budget, managing your planning checklist, creating timelines, and getting instant answers to wedding planning questions 24/7.',
  },
  {
    q: 'How much does it cost to use?',
    a: 'TheWeddingBot offers a free tier to get started. Pro ($10/mo) adds more tokens, image generation, and advanced planning tools. Pro Max ($39/mo) is for power planners with the highest limits and priority support. Annual billing saves ~34%.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes, you can cancel anytime. Your plan benefits continue until the end of your current billing period. No refunds are issued for partial months per our terms of service.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your chats, images, and planning data remain accessible on the free tier after cancellation. You can export or delete your data at any time from Settings → Data & Privacy.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes. Upgrades take effect immediately with prorated billing. When you downgrade, your current plan benefits remain active until the end of the billing period, then switches to the lower tier.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Detailed feature comparison table — data sourced from PRICING_PRD.md §4
// ─────────────────────────────────────────────────────────────────────────────

type CellValue = string | boolean

interface ComparisonRow {
  feature: string
  free: CellValue
  pro: CellValue
  promax: CellValue
}

interface ComparisonGroup {
  heading: string
  rows: ComparisonRow[]
}

const COMPARISON_DATA: ComparisonGroup[] = [
  {
    heading: 'Token Pool',
    rows: [
      { feature: 'Monthly pool', free: '300K', pro: '3M', promax: '8M' },
      { feature: 'Daily cap', free: '50K', pro: '300K', promax: '800K' },
      { feature: 'Token top-up packs', free: false, pro: '$10 / 2M', promax: '$10 / 2M (max 10/mo)' },
    ],
  },
  {
    heading: 'AI Modes',
    rows: [
      { feature: 'Planner, Stylist, Knowledge', free: true, pro: true, promax: true },
      { feature: 'Priority routing (faster latency)', free: false, pro: false, promax: true },
    ],
  },
  {
    heading: 'Voice & Vision',
    rows: [
      { feature: 'Voice TTS + STT', free: true, pro: true, promax: 'Priority queue' },
      { feature: 'Vision / photo upload', free: true, pro: true, promax: true },
    ],
  },
  {
    heading: 'Image Generation',
    rows: [
      { feature: 'AI image generation', free: true, pro: true, promax: true },
      { feature: 'Watermark-free images', free: false, pro: true, promax: true },
    ],
  },
  {
    heading: 'Reminders',
    rows: [
      { feature: 'Active reminders', free: '3', pro: 'Unlimited', promax: 'Unlimited' },
      { feature: 'Email reminders', free: true, pro: true, promax: true },
      { feature: 'WhatsApp reminders', free: false, pro: true, promax: true },
      ],
  },
  {
    heading: 'Chat & Storage',
    rows: [
      { feature: 'Chat history', free: '30-day rolling', pro: 'Full, searchable', promax: 'Full, searchable, exportable' },
      { feature: 'Wedding projects', free: '1', pro: '2', promax: '5' },
      { feature: 'Notes', free: 'View only', pro: 'Full access', promax: 'Full access' },
    ],
  },
  {
    heading: 'Export',
    rows: [
      { feature: 'PDF export', free: 'Checklist only', pro: true, promax: true },
      { feature: 'CSV export', free: false, pro: true, promax: true },
      { feature: 'JSON export', free: false, pro: false, promax: true },
      { feature: 'Shareable read-only links', free: false, pro: false, promax: true },
    ],
  },
  {
    heading: 'Planning Tools',
    rows: [
      { feature: 'Moodboards & vibe boards', free: true, pro: true, promax: true },
      { feature: 'Vendor outreach drafts', free: true, pro: true, promax: true },
    ],
  },
  {
    heading: 'Pro Max Exclusives',
    rows: [
      { feature: 'Concierge support (24h response)', free: false, pro: false, promax: true },
    ],
  },
  {
    heading: 'Support',
    rows: [
      { feature: 'Support channel', free: 'Community / docs', pro: 'Email', promax: 'Priority email' },
    ],
  },
]

function ComparisonCell({ value }: { value: CellValue }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-primary" />
    ) : (
      <XIcon className="mx-auto h-4 w-4 text-foreground/20" />
    )
  }
  return <span className="text-foreground/80">{value}</span>
}

function ComparisonTable({ className }: { className?: string }) {
  return (
    <section aria-label="Detailed feature comparison" className={className}>
      <h2 className="font-headline text-3xl md:text-4xl text-foreground text-center mb-10">
        Compare Plans in Detail
      </h2>

      <div className="overflow-x-auto rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] backdrop-blur-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-foreground/[0.08]">
              <th className="py-4 px-5 text-left text-xs font-medium uppercase tracking-wider text-foreground/40">
                Feature
              </th>
              <th className="py-4 px-4 text-center text-xs font-medium uppercase tracking-wider text-foreground/40 w-[140px]">
                Free
              </th>
              <th className="py-4 px-4 text-center text-xs font-medium uppercase tracking-wider text-primary w-[140px]">
                Pro
              </th>
              <th className="py-4 px-4 text-center text-xs font-medium uppercase tracking-wider text-foreground/40 w-[160px]">
                Pro Max
              </th>
            </tr>
          </thead>
          {COMPARISON_DATA.map((group) => (
            <tbody key={group.heading}>
              <tr>
                <td
                  colSpan={4}
                  className="bg-foreground/[0.03] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-foreground/60 border-t border-foreground/[0.06]"
                >
                  {group.heading}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.feature}
                  className="border-t border-foreground/[0.04] hover:bg-foreground/[0.02] transition-colors"
                >
                  <td className="py-3 px-5 text-foreground/70">{row.feature}</td>
                  <td className="py-3 px-4 text-center text-xs">
                    <ComparisonCell value={row.free} />
                  </td>
                  <td className="py-3 px-4 text-center text-xs">
                    <ComparisonCell value={row.pro} />
                  </td>
                  <td className="py-3 px-4 text-center text-xs">
                    <ComparisonCell value={row.promax} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

export default function Pricing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { plan } = useAccount()
  const returnReason = (location.state as { returnReason?: string } | null)?.returnReason
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [currency, setCurrency] = useState<string>('USD')
  const [rate, setRate] = useState<number>(1)
  const [loadingRate, setLoadingRate] = useState(false)
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null)

  const currentTier: PricingTier | 'guest' = (
    plan?.tier === 'pro' ? 'pro'
      : plan?.tier === 'promax' ? 'promax'
        : plan?.tier === 'free' ? 'free'
          : 'guest'
  )

  useEffect(() => {
    track('plan_viewed', { source: returnReason })
  }, [])

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

  // Upgrade / Downgrade modal state
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [downgradeOpen, setDowngradeOpen] = useState(false)
  const [flowTarget, setFlowTarget] = useState<PricingTier>('promax')

  const handleTopup = () => {
    setCheckoutError(null)
    track('topup_clicked', { pack_id: 'topup_2m' })
    const user = auth.currentUser
    if (!user) {
      navigate('/login?next=/pricing')
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
    track('plan_selected', { tier, billing_cycle: cycle, currency })
    if (tier === 'free') {
      navigate('/')
      return
    }
    const user = auth.currentUser
    if (!user) {
      navigate('/login?next=/pricing')
      return
    }
    if (tier === currentTier) return

    const TIER_RANK: Record<PricingTier | 'guest', number> = { guest: 0, free: 1, pro: 2, promax: 3 }
    const currentRank = TIER_RANK[currentTier]
    const targetRank = TIER_RANK[tier]
    const isPaidUser = currentTier === 'pro' || currentTier === 'promax'

    // Paid user → open upgrade or downgrade modal
    if (isPaidUser && targetRank > currentRank) {
      setFlowTarget(tier)
      setUpgradeOpen(true)
      return
    }

    if (isPaidUser && targetRank < currentRank) {
      setFlowTarget(tier)
      setDowngradeOpen(true)
      return
    }

    // Free/guest user → fresh purchase via checkout
    const row = TIERS.find((t) => t.tier === tier)
    const priceUsd = !row ? 0 : cycle === 'monthly' ? row.monthlyUsd : row.annualUsd
    navigate('/checkout', {
      state: {
        plan: tier,
        cycle,
        currency,
        isUpgrade: false,
        priceUsd,
        label: `${TIER_LABEL[tier as 'pro' | 'promax']} — ${cycle === 'monthly' ? 'Monthly' : 'Annual'}`,
      },
    })
  }

  // Price for upgrade flow modal
  const upgradeTargetRow = TIERS.find((t) => t.tier === flowTarget)
  const upgradeTargetUsd = !upgradeTargetRow ? 0 : cycle === 'monthly' ? upgradeTargetRow.monthlyUsd : upgradeTargetRow.annualUsd

  return (
    <div className="gradient-bg min-h-screen text-foreground/90">
      <div className="relative mx-auto max-w-5xl px-6 py-12 md:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground/90 transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {SERVICE_NAME}
        </Link>

        <header className="mb-10 text-center md:text-left">
          <p className="font-label uppercase tracking-[0.2em] text-2xs text-foreground/40 mb-3">
            Pricing
          </p>
          <h1 className="font-headline text-4xl md:text-5xl tracking-tight text-foreground mb-3">
            Plans That Grow With Your Wedding
          </h1>
          <p className="text-sm text-foreground/60 max-w-2xl">
            Vertical wedding AI — planner, stylist, and knowledge modes — priced
            against what you'd pay a human planner, not a ChatGPT subscription.
            Cancel anytime.
          </p>
        </header>

        {/* Billing cycle + currency controls ─────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="inline-flex rounded-full bg-foreground/[0.04] p-1"
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
                    : 'text-foreground/60 hover:text-foreground/90',
                )}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual — save ~34%'}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-foreground/50">
            Show prices in
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => handleCurrencyOverride(e.target.value)}
              className="min-h-9 rounded-xl bg-foreground/[0.04] px-2 text-foreground/90 focus:outline-none focus:ring-1 focus:ring-foreground/10 transition-colors"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {loadingRate && <span aria-live="polite">…</span>}
          </label>
        </div>

        {returnReason === 'already_subscribed' && (
          <div
            role="status"
            className="mb-4 rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-foreground/90"
          >
            You already have an active plan. Choose a different tier below to upgrade or downgrade.
          </div>
        )}

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
                <p className="text-center text-2xs text-foreground/40">{c.subtitle}</p>
              )}
            </div>
          ))}
        </section>

        {(currentTier === 'pro' || currentTier === 'promax') && (
          <section
            aria-label="Token top-up pack"
            className="mb-12 rounded-2xl bg-foreground/[0.03] backdrop-blur-sm p-6 border border-foreground/[0.06]"
          >
            <h2 className="font-headline text-xl text-foreground mb-1">Need More Tokens?</h2>
            <p className="text-xs text-foreground/50 mb-4">
              Buy a 2 million token top-up pack — tokens are added to your existing
              pool instantly (stackable, max 10 / month). No refunds.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-headline text-3xl text-foreground">
                  {formatCurrency(10, currency, rate)}
                </span>
                <span className="text-xs text-foreground/50">/ 2M tokens, one-time</span>
              </div>
              <button
                type="button"
                onClick={handleTopup}
                aria-label="Buy 2 million token top-up pack"
                className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Buy Top-Up
              </button>
            </div>
          </section>
        )}

        <p className="text-center text-2xs text-foreground/35 mb-12">
          *Usage limits apply. Prices shown don't include applicable tax. Prices and plans are subject to change at TheWeddingBot's discretion.
        </p>

        {/* ── Detailed Comparison Table ───────────────────────────────────── */}
        <ComparisonTable className="mb-16" />

        {/* ── FAQ Section ──────────────────────────────────────────────────── */}
        <section aria-label="Frequently asked questions" className="mb-16">
          <h2 className="font-headline text-3xl md:text-4xl text-foreground text-center mb-10">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto divide-y divide-foreground/[0.08]">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx
              return (
                <div key={idx}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 py-5 text-left group"
                    aria-expanded={isOpen}
                  >
                    <span className="text-base md:text-lg font-medium text-foreground/90 group-hover:text-foreground transition-colors">
                      {item.q}
                    </span>
                    {isOpen ? (
                      <Minus className="h-5 w-5 text-foreground/40 flex-shrink-0" />
                    ) : (
                      <Plus className="h-5 w-5 text-foreground/40 flex-shrink-0" />
                    )}
                  </button>
                  <div
                    className={cn(
                      'overflow-hidden transition-all duration-300',
                      isOpen ? 'max-h-40 pb-5 opacity-100' : 'max-h-0 pb-0 opacity-0',
                    )}
                  >
                    <p className="text-sm text-foreground/50 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="text-center text-xs text-foreground/40">
          Base currency is USD. Local prices update every minute via
          exchangerate-api. Final checkout locks the rate server-side.
          Questions?{' '}
          <a href="mailto:support@theweddingbot.ai" className="text-primary hover:underline">
            support@theweddingbot.ai
          </a>
        </p>
      </div>

      {/* Upgrade / Downgrade modals */}
      <UpgradeFlow
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentTier={currentTier}
        targetTier={flowTarget}
        cycle={cycle}
        currency={currency}
        rate={rate}
        priceUsd={upgradeTargetUsd}
      />
      <DowngradeFlow
        open={downgradeOpen}
        onOpenChange={setDowngradeOpen}
        currentTier={currentTier}
        targetTier={flowTarget}
      />
    </div>
  )
}
