// DowngradeFlow — modal dialog for Pro Max → Pro downgrade.
//
// 2-step flow:
//   1. confirm  — explain deferred downgrade (keeps ProMax until period end)
//   2. result   — success or error

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, Check, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { downgradeSubscription, getCurrentSubscription } from '@/services/paymentService'
import { track } from '@/lib/analytics'
import type { PricingTier } from './PricingTierCard'

type Step = 'confirm' | 'loading' | 'success' | 'error'

export interface DowngradeFlowProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTier: PricingTier | 'guest'
  targetTier: PricingTier
}

export function DowngradeFlow({
  open,
  onOpenChange,
  currentTier,
  targetTier,
}: DowngradeFlowProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('confirm')
  const [error, setError] = useState<string | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)

  const tierLabel = (t: string) =>
    t === 'promax' ? 'Pro Max' : t === 'pro' ? 'Pro' : t.charAt(0).toUpperCase() + t.slice(1)

  // Reset state + fetch current period end date when dialog opens
  useEffect(() => {
    if (open) {
      setStep('confirm')
      setError(null)
      setPeriodEnd(null)
      track('downgrade_flow_opened', { from_tier: currentTier, to_tier: targetTier })
      void getCurrentSubscription()
        .then((sub) => {
          if (sub.currentPeriodEnd) {
            setPeriodEnd(
              new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            )
          }
        })
        .catch(() => {})
    }
  }, [open])

  const handleConfirm = useCallback(async () => {
    setStep('loading')
    setError(null)
    try {
      const clientRequestId = `downgrade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await downgradeSubscription(clientRequestId)
      track('downgrade_completed', { from_tier: currentTier, to_tier: targetTier })
      setStep('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409')) {
        setError('Your current plan cannot be downgraded. It may already be scheduled.')
      } else if (msg.includes('401')) {
        setError('Please sign in again to continue.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setStep('error')
    }
  }, [currentTier, targetTier])

  const handleDone = useCallback(() => {
    onOpenChange(false)
    navigate('/', { state: { planChanged: targetTier } })
  }, [navigate, onOpenChange, targetTier])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl text-foreground">
            {step === 'success'
              ? 'Downgrade scheduled'
              : `Downgrade to ${tierLabel(targetTier)}`}
          </DialogTitle>
          <DialogDescription className="text-foreground/50">
            {step === 'success'
              ? `Your plan will switch to ${tierLabel(targetTier)} at the end of your billing period.`
              : `You're currently on ${tierLabel(currentTier)}.`}
          </DialogDescription>
        </DialogHeader>

        {/* Confirm */}
        {step === 'confirm' && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-xl bg-foreground/[0.04] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/60">{tierLabel(currentTier)}</span>
                <ArrowDown className="h-4 w-4 text-foreground/40" />
                <span className="text-foreground font-medium">{tierLabel(targetTier)}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-foreground/50">
              <p>
                You'll keep full {tierLabel(currentTier)} access
                {periodEnd ? ` until ${periodEnd}` : ' until the end of your current billing period'}.
                After that, your plan will automatically switch to {tierLabel(targetTier)}.
              </p>
              <p>
                No refund is issued for the remaining period. You can reactivate
                your current plan anytime before the switch.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.04] border border-foreground/[0.08] px-5 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
              >
                Confirm downgrade
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Keep {tierLabel(currentTier)}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-foreground/60">Scheduling your downgrade…</p>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm text-foreground/90">
                Downgrade scheduled successfully.
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                You'll continue with {tierLabel(currentTier)} features
                {periodEnd ? ` until ${periodEnd}` : ' until the end of your billing period'}.
                After that, you'll switch to {tierLabel(targetTier)}.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDone}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
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

export default DowngradeFlow
