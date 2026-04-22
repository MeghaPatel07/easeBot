// UpgradeFlow — modal dialog for Pro → Pro Max upgrade.
//
// 3-step flow:
//   1. confirm  — show current plan, target plan, call /subscription/upgrade for credit preview
//   2. preview  — show prorated credit & effective charge
//   3. result   — free upgrade success OR redirect to checkout for payment

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { upgradeSubscription } from '@/services/paymentService'
import { formatCurrency } from '@/utils/currencyFormat'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import type { PricingTier } from './PricingTierCard'

type BillingCycle = 'monthly' | 'annual'
type Step = 'confirm' | 'loading' | 'preview' | 'success' | 'error'

interface UpgradeResult {
  freeUpgrade: boolean
  requiresCheckout?: boolean
  effectiveChargeUsd?: number
  state?: string
  applied?: boolean
  credit?: {
    chargeNowUsd: number
    newForwardCreditUsd: number
    proCreditUsd: number
  }
  targetPlan?: string
  cycle?: string
}

export interface UpgradeFlowProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTier: PricingTier | 'guest'
  targetTier: PricingTier
  cycle: BillingCycle
  currency: string
  rate: number
  priceUsd: number
}

const STEP_LABELS: Step[] = ['confirm', 'loading', 'preview']

export function UpgradeFlow({
  open,
  onOpenChange,
  currentTier,
  targetTier,
  cycle,
  currency,
  rate,
  priceUsd,
}: UpgradeFlowProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('confirm')
  const [result, setResult] = useState<UpgradeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tierLabel = (t: string) =>
    t === 'promax' ? 'Pro Max' : t === 'pro' ? 'Pro' : t.charAt(0).toUpperCase() + t.slice(1)

  const displayPrice = formatCurrency(priceUsd, currency, rate)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('confirm')
      setResult(null)
      setError(null)
      track('upgrade_flow_opened', { from_tier: currentTier, to_tier: targetTier })
    }
  }, [open, currentTier, targetTier])

  const handleConfirm = useCallback(async () => {
    setStep('loading')
    setError(null)
    try {
      const res = await upgradeSubscription(cycle) as UpgradeResult
      setResult(res)

      if (res.freeUpgrade) {
        setStep('success')
      } else {
        setStep('preview')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409')) {
        setError('Your current plan cannot be upgraded. Please check your subscription status.')
      } else if (msg.includes('401')) {
        setError('Please sign in again to continue.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setStep('error')
    }
  }, [cycle])

  const handleProceedToCheckout = useCallback(() => {
    if (!result) return
    const effectiveUsd = result.effectiveChargeUsd ?? result.credit?.chargeNowUsd ?? priceUsd
    onOpenChange(false)
    navigate('/checkout', {
      state: {
        plan: targetTier,
        cycle,
        currency,
        isUpgrade: true,
        priceUsd: effectiveUsd,
        label: `${tierLabel(targetTier)} — ${cycle === 'monthly' ? 'Monthly' : 'Annual'} (upgrade)`,
      },
    })
  }, [result, targetTier, cycle, currency, priceUsd, navigate, onOpenChange])

  const handleSuccessDone = useCallback(() => {
    onOpenChange(false)
    navigate('/', { state: { planChanged: targetTier } })
  }, [navigate, onOpenChange, targetTier])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-foreground">
            {step === 'success'
              ? 'Upgrade complete'
              : `Upgrade to ${tierLabel(targetTier)}`}
          </DialogTitle>
          <DialogDescription className="text-foreground/50">
            {step === 'success'
              ? `You're now on ${tierLabel(targetTier)}.`
              : `You're currently on ${tierLabel(currentTier)}.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step !== 'success' && step !== 'error' && (
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wide text-foreground/40">
            {(['confirm', 'preview'] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border text-3xs',
                    (step === s || (step === 'loading' && s === 'confirm'))
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-foreground/20 text-foreground/40',
                  )}
                >
                  {i + 1}
                </span>
                <span>{s}</span>
                {i < 1 && <ArrowRight className="h-3 w-3 text-foreground/20" />}
              </span>
            ))}
          </div>
        )}

        {/* Step 1: Confirm */}
        {step === 'confirm' && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-xl bg-foreground/[0.04] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/60">{tierLabel(currentTier)}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="text-foreground font-medium">{tierLabel(targetTier)}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-headline text-2xl text-foreground">{displayPrice}</span>
                <span className="text-xs text-foreground/50">/ {cycle === 'annual' ? 'year' : 'month'}</span>
              </div>
            </div>

            <p className="text-xs text-foreground/50">
              Any unused time on your current plan will be prorated as credit
              toward your new plan. Upgrade takes effect immediately.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.04] border border-foreground/[0.08] px-5 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-foreground/60">Calculating your prorated credit…</p>
          </div>
        )}

        {/* Step 2: Preview (requires payment) */}
        {step === 'preview' && result && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-xl bg-foreground/[0.04] p-4 space-y-3">
              {result.credit && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/60">Pro credit (prorated)</span>
                    <span className="text-success">
                      -{formatCurrency(result.credit.proCreditUsd, currency, rate)}
                    </span>
                  </div>
                  {result.credit.newForwardCreditUsd > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground/60">Forward credit</span>
                      <span className="text-success">
                        {formatCurrency(result.credit.newForwardCreditUsd, currency, rate)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-foreground/10 pt-3 flex justify-between text-sm font-medium">
                    <span className="text-foreground">Amount due now</span>
                    <span className="text-foreground font-headline text-lg">
                      {formatCurrency(result.credit.chargeNowUsd, currency, rate)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <p className="text-xs text-foreground/50">
              You'll be redirected to PayU to complete the payment.
              Billed in {currency}.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleProceedToCheckout}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Proceed to checkout
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.04] border border-foreground/[0.08] px-5 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Success (free upgrade) */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <Check className="h-6 w-6 text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm text-foreground/90">
                Your prorated credit covered the full upgrade.
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                You now have access to all {tierLabel(targetTier)} features.
              </p>
              {result?.credit && result.credit.newForwardCreditUsd > 0 && (
                <p className="mt-2 text-xs text-success">
                  {formatCurrency(result.credit.newForwardCreditUsd, currency, rate)} credit carried forward.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSuccessDone}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.04] border border-foreground/[0.08] px-5 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.04] border border-foreground/[0.08] px-5 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UpgradeFlow
