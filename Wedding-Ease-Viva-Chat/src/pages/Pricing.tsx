import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import PricingTierCard, {
  type PricingTier,
} from '@/components/pricing/PricingTierCard'

const SERVICE_NAME = 'Viva by EaseBot'

// Sprint 1 batch B (FE-001): toggle on the new skeleton tier cards. Sprint 2
// removes the old layout once the new cards are wired to real data.
const USE_NEW_PRICING_CARDS = true

interface NewPricingMock {
  tier: PricingTier
  priceUsd: number
  isRecommended?: boolean
}

const NEW_PRICING_MOCKS: NewPricingMock[] = [
  { tier: 'free', priceUsd: 0 },
  { tier: 'pro', priceUsd: 12, isRecommended: true },
  { tier: 'promax', priceUsd: 29 },
]

interface PlanDef {
  tier: 'free' | 'pro' | 'premium'
  name: string
  tagline: string
  price: string
  period: string
  features: string[]
  highlight?: boolean
}

const PLANS: PlanDef[] = [
  {
    tier: 'free',
    name: 'Free',
    tagline: 'Get a feel for Easebot.',
    price: '$0',
    period: '/ month',
    features: [
      '100 chat messages per month',
      'Planner & Stylist modes', // Disabled: Therapist mode removed
      // 'Planner, Stylist & Therapist modes',
      'Basic checklist & notes',
      'Single device',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    tagline: 'For couples deep in planning.',
    price: '$12',
    period: '/ month',
    features: [
      '2,000 chat messages per month',
      'All AI modes incl. Knowledge', // Disabled: '& Consultant' removed
      // 'All AI modes incl. Knowledge & Consultant',
      'Voice replies & image generation',
      'Reminders via email & WhatsApp',
      'Priority response speed',
    ],
    highlight: true,
  },
  {
    tier: 'premium',
    name: 'Premium',
    tagline: 'White-glove planning support.',
    price: '$29',
    period: '/ month',
    features: [
      'Unlimited chat messages',
      'Everything in Pro',
      'Personal vibe board & moodboards',
      'Vendor outreach drafts',
      'Concierge support within 24h',
    ],
  },
]

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-white/85">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] bg-secondary/10 rounded-full blur-3xl" />
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
            Start free, upgrade when you need more chats, voice replies, or
            personalized planning. Cancel or downgrade anytime — your data
            stays exactly where you left it.
          </p>
        </header>

        {USE_NEW_PRICING_CARDS && (
          <section
            aria-label="Pricing tiers (new skeleton)"
            className="mb-12 grid gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          >
            {NEW_PRICING_MOCKS.map((mock) => (
              <PricingTierCard
                key={mock.tier}
                tier={mock.tier}
                currentUserTier="free"
                priceUsd={mock.priceUsd}
                currency="USD"
                isRecommended={mock.isRecommended}
              />
            ))}
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-sm transition-colors ${
                plan.highlight
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full border border-primary/60 bg-background px-3 py-0.5 text-2xs uppercase tracking-wide text-primary">
                  Most popular
                </span>
              )}
              <h2 className="font-headline text-2xl text-white">{plan.name}</h2>
              <p className="mt-1 text-xs text-white/50">{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-headline text-4xl text-white">{plan.price}</span>
                <span className="text-xs text-white/50">{plan.period}</span>
              </div>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/?settings=plan-billing"
                className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors ${
                  plan.highlight
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-white/20 bg-transparent text-white hover:bg-white/5'
                }`}
              >
                {plan.tier === 'free' ? 'Start free' : `Choose ${plan.name}`}
              </Link>
            </div>
          ))}
        </section>

        <p className="mt-10 text-center text-xs text-white/40">
          Prices shown in USD. Taxes may apply. Contact{' '}
          <a
            href="mailto:support@easebot.app"
            className="text-primary hover:underline"
          >
            support@easebot.app
          </a>{' '}
          for enterprise or annual billing.
        </p>
      </div>
    </div>
  )
}
