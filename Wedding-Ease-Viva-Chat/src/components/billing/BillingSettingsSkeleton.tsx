// BillingSettingsSkeleton — Sprint 1 batch B helper (FE-001).
//
// Placeholder slots rendered inside PlanBillingTab. Sprint 2 swaps these for
// real data from GET /account/me + /account/invoices. This component is
// intentionally pure presentation — no hooks, no services.

import { Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PricingTier } from '@/components/pricing/PricingTierCard'

export interface BillingSettingsSkeletonProps {
  currentTier?: PricingTier | 'guest' | null
  nextRenewalDate?: string | null
  className?: string
}

export function BillingSettingsSkeleton({
  currentTier = 'free',
  nextRenewalDate = null,
  className,
}: BillingSettingsSkeletonProps) {
  const tierLabel =
    currentTier === 'promax'
      ? 'Pro Max'
      : currentTier
        ? currentTier.charAt(0).toUpperCase() + currentTier.slice(1)
        : 'Free'

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Current plan badge row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            Current plan
          </span>
          <span className="font-headline text-lg text-foreground">
            {tierLabel}
          </span>
        </div>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-2xs uppercase tracking-wide text-primary">
          Active
        </span>
      </div>

      {/* Next renewal slot */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          Next renewal
        </p>
        <p className="mt-1 text-sm text-foreground">
          {nextRenewalDate ?? 'No upcoming renewal'}
        </p>
      </div>

      {/* Invoice history table slot */}
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Receipt
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground"
          />
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Invoice history
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center gap-1 py-6 text-center"
          role="status"
        >
          <p className="text-sm text-foreground">No invoices yet</p>
          <p className="text-xs text-muted-foreground">
            Sprint 2 will render a paginated invoice table here.
          </p>
        </div>
      </div>

      {/* Manage subscription CTA slot */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground"
      >
        Manage subscription (coming soon)
      </button>
    </div>
  )
}

export default BillingSettingsSkeleton
