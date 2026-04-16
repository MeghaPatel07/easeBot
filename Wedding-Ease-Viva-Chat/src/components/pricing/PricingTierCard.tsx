// PricingTierCard — Sprint 1 batch B skeleton (FE-001).
//
// Wine + gold tier card used on the /pricing page. Skeleton only — Sprint 2
// wires real state (currency, subscription, CTA handlers). See:
//   - PRICING_PRD.md §4 (tier definitions)
//   - EXECUTION_PLAN.md §7.2 (subscription-state CTA logic)
//   - .orchestrator/specs/ui-tokens.md §6 (pricing card anatomy)
//
// This component renders pure structure. It accepts a computed price + locale
// price so the parent owns currency conversion (see geolocationService /
// exchangeRateService skeletons, FE-002).

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PricingTier = 'free' | 'pro' | 'promax'

export interface PricingTierCardProps {
  tier: PricingTier
  /** The viewer's current tier — drives the CTA label + disabled state. */
  currentUserTier?: PricingTier | 'guest' | null
  /** Raw USD price (for analytics + fallback display). */
  priceUsd: number
  /** Pre-formatted locale price string (e.g. "₹999", "€11"). Parent formats. */
  priceLocal?: string
  /** ISO-4217 currency code the `priceLocal` is in. */
  currency?: string
  /** Show the "Most popular" ribbon + gold glow. */
  isRecommended?: boolean
  /** Fires when the user clicks the CTA. Sprint 2 wires this to UpgradeFlow. */
  onSelect?: (tier: PricingTier) => void
}

// Tier metadata — visual strings only. Real copy lives in PRD §4 and will be
// passed in via props in Sprint 2. This is placeholder text for the skeleton.
const TIER_META: Record<
  PricingTier,
  { name: string; tagline: string; features: string[] }
> = {
  free: {
    name: 'Free',
    tagline: 'Get a feel for Easebot.',
    features: [
      'Starter monthly token pool',
      'Planner & Stylist modes',
      'Basic checklist & notes',
      'Single device',
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'For couples deep in planning.',
    features: [
      'Larger monthly token pool',
      'All AI modes incl. Knowledge',
      'Voice replies & image generation',
      'Reminders via email & WhatsApp',
      'Priority response speed',
    ],
  },
  promax: {
    name: 'Pro Max',
    tagline: 'White-glove planning support.',
    features: [
      'Highest monthly token pool',
      'Everything in Pro',
      'Personal vibe board & moodboards',
      'Vendor outreach drafts',
      'Concierge support within 24h',
    ],
  },
}

// EXECUTION_PLAN §7.2 — CTA label logic.
// Ordering: free < pro < promax. Guest is below free.
const TIER_RANK: Record<PricingTier | 'guest', number> = {
  guest: 0,
  free: 1,
  pro: 2,
  promax: 3,
}

function computeCta(
  tier: PricingTier,
  current: PricingTier | 'guest' | null | undefined,
): { label: string; disabled: boolean; variant: 'filled' | 'outline' } {
  if (!current || current === 'guest') {
    return {
      label: tier === 'free' ? 'Start free' : `Get ${TIER_META[tier].name}`,
      disabled: false,
      variant: tier === 'pro' ? 'filled' : 'outline',
    }
  }
  if (current === tier) {
    return { label: 'Current plan', disabled: true, variant: 'outline' }
  }
  const currentRank = TIER_RANK[current]
  const targetRank = TIER_RANK[tier]
  if (targetRank > currentRank) {
    return { label: 'Upgrade', disabled: false, variant: 'filled' }
  }
  return { label: 'Downgrade', disabled: false, variant: 'outline' }
}

export function PricingTierCard({
  tier,
  currentUserTier = null,
  priceUsd,
  priceLocal,
  currency = 'USD',
  isRecommended = false,
  onSelect,
}: PricingTierCardProps) {
  const meta = TIER_META[tier]
  const cta = computeCta(tier, currentUserTier)
  const isCurrent = currentUserTier === tier
  const displayPrice = priceLocal ?? `$${priceUsd}`

  return (
    <article
      role="article"
      aria-labelledby={`tier-${tier}-name`}
      aria-describedby={isRecommended ? `tier-${tier}-recommended` : undefined}
      className={cn(
        'relative flex flex-col rounded-2xl border-0 p-6 backdrop-blur-sm transition-colors',
        isRecommended
          ? 'bg-primary/[0.06] shadow-[0_0_32px_rgba(198,148,74,0.15),0_12px_40px_-16px_rgba(198,148,74,0.2)]'
          : 'bg-white/[0.03]',
      )}
    >
      {/* Recommended ribbon — DOM slot preserved on all cards for height parity */}
      <span
        id={isRecommended ? `tier-${tier}-recommended` : undefined}
        className={cn(
          'absolute -top-3 left-6 rounded-full bg-primary/15 px-3 py-0.5 text-2xs uppercase tracking-wide text-primary',
          !isRecommended && 'invisible',
        )}
      >
        Most popular
      </span>

      {/* Current plan pill */}
      {isCurrent && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2 py-0.5 text-2xs uppercase tracking-wide text-primary">
          Current plan
        </span>
      )}

      <h2
        id={`tier-${tier}-name`}
        className="font-headline text-2xl text-foreground"
      >
        {meta.name}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{meta.tagline}</p>

      <div
        className="mt-5 flex items-baseline gap-1"
        aria-live="polite"
      >
        <span className="font-headline text-4xl text-foreground">
          {displayPrice}
        </span>
        <span className="text-xs text-muted-foreground">/ month</span>
      </div>
      {currency !== 'USD' && (
        <p className="mt-1 text-3xs text-muted-foreground">
          Billed in {currency}. ~${priceUsd} USD.
        </p>
      )}

      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {meta.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => !cta.disabled && onSelect?.(tier)}
        disabled={cta.disabled}
        aria-disabled={cta.disabled}
        aria-label={`${cta.label} — ${meta.name}`}
        className={cn(
          'mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10',
          cta.disabled && 'cursor-not-allowed opacity-60',
          !cta.disabled && cta.variant === 'filled'
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-white/[0.06] text-foreground hover:bg-white/[0.1]',
        )}
      >
        {cta.label}
      </button>

      <p className="mt-3 text-3xs text-muted-foreground">
        No refunds. Cancel anytime to stop renewal.
      </p>
    </article>
  )
}

export default PricingTierCard
