// UpgradeFlow — Sprint 1 batch B skeleton (FE-001).
//
// Wraps the 3-step upgrade state machine. Sprint 2 swaps placeholder copy for
// a real XState/reducer machine and wires the PayU handoff.
//
// Steps:
//   1. confirm — "You're about to upgrade to X" + cancel / continue
//   2. preview — locked price + currency + tax fields preview
//   3. redirect — loading state while POSTing to /api/account/plan/checkout
//
// See EXECUTION_PLAN.md §8 for checkout handoff logic.

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PricingTier } from './PricingTierCard'

export type UpgradeStep = 'confirm' | 'preview' | 'redirect'

export interface UpgradeFlowProps {
  targetTier: PricingTier
  currentTier?: PricingTier | 'guest' | null
  priceUsd: number
  priceLocal?: string
  currency?: string
  /** Sprint 2: called when user hits the final CTA. */
  onProceed?: () => void
  onCancel?: () => void
  /** Initial step (for testing / deep-linking). */
  initialStep?: UpgradeStep
}

export function UpgradeFlow({
  targetTier,
  currentTier = null,
  priceUsd,
  priceLocal,
  currency = 'USD',
  onProceed,
  onCancel,
  initialStep = 'confirm',
}: UpgradeFlowProps) {
  const [step, setStep] = useState<UpgradeStep>(initialStep)

  const displayPrice = priceLocal ?? `$${priceUsd}`
  const tierLabel =
    targetTier === 'promax' ? 'Pro Max' : targetTier.charAt(0).toUpperCase() + targetTier.slice(1)

  return (
    <div
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 text-card-foreground"
      role="region"
      aria-label={`Upgrade flow to ${tierLabel}`}
    >
      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-2xs uppercase tracking-wide text-muted-foreground">
        {(['confirm', 'preview', 'redirect'] as const).map((s, i) => (
          <li
            key={s}
            className={cn(
              'flex items-center gap-2',
              step === s && 'text-primary',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border text-3xs',
                step === s
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            <span>{s}</span>
            {i < 2 && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {/* Step 1: confirm */}
      {step === 'confirm' && (
        <div className="flex flex-col gap-4">
          <h3 className="font-headline text-xl text-foreground">
            Upgrade to {tierLabel}?
          </h3>
          <p className="text-sm text-muted-foreground">
            You are currently on the{' '}
            <span className="text-foreground">{currentTier ?? 'guest'}</span>{' '}
            tier. Upgrading unlocks the full {tierLabel} feature set immediately.
          </p>
          <p className="text-3xs text-muted-foreground">
            Placeholder — Sprint 2 will show proration + billing date here.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep('preview')}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: price preview */}
      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          <h3 className="font-headline text-xl text-foreground">
            Price preview
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-3xl text-foreground">
              {displayPrice}
            </span>
            <span className="text-xs text-muted-foreground">/ month</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Amount locked in {currency}. Taxes + GST fields captured in the
            checkout modal.
          </p>
          <p className="text-3xs text-muted-foreground">
            Placeholder — Sprint 2 will show currency, tax, and total line items.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('redirect')
                onProceed?.()
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Proceed to checkout
            </button>
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: redirect */}
      {step === 'redirect' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2
            className="h-6 w-6 animate-spin text-primary"
            aria-hidden="true"
          />
          <h3 className="font-headline text-xl text-foreground">
            Redirecting to PayU…
          </h3>
          <p className="text-xs text-muted-foreground">
            Placeholder — Sprint 2 will POST to /api/account/plan/checkout and
            hand off to PayU.
          </p>
        </div>
      )}
    </div>
  )
}

export default UpgradeFlow
