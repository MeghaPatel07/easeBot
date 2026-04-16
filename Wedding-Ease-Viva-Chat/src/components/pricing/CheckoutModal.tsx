// CheckoutModal — Sprint 1 batch B skeleton (FE-001).
//
// Modal shell for the final PayU handoff. Per EXECUTION_PLAN.md §8.9:
//   - GST fields (GSTIN, company name, address) — optional, shown when
//     currency === 'INR' or the user opts in.
//   - Currency display (locked at checkout — see ui-tokens.md §8).
//   - Final price line + "Proceed to pay" CTA (stubbed).
//
// Uses shadcn Dialog for focus trap + Esc + backdrop. On mobile it falls
// back to a full-height dialog via the existing `h-dvh-safe` utility.

import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { PricingTier } from './PricingTierCard'

export interface CheckoutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: PricingTier
  priceUsd: number
  priceLocal?: string
  currency?: string
  showTaxFields?: boolean
  /** Stubbed — Sprint 2 wires to /api/account/plan/checkout. */
  onProceed?: () => void
}

export function CheckoutModal({
  open,
  onOpenChange,
  tier,
  priceUsd,
  priceLocal,
  currency = 'USD',
  showTaxFields,
  onProceed,
}: CheckoutModalProps) {
  const [gstin, setGstin] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')

  const displayPrice = priceLocal ?? `$${priceUsd}`
  const tierLabel =
    tier === 'promax' ? 'Pro Max' : tier.charAt(0).toUpperCase() + tier.slice(1)
  const taxVisible = showTaxFields ?? currency === 'INR'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-lg overflow-y-auto rounded-2xl border-border bg-card text-card-foreground',
          'max-h-[min(90vh,720px)]',
          'sm:max-w-lg',
        )}
      >
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="font-headline text-2xl text-foreground">
              Checkout — {tierLabel}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review your plan and proceed to secure payment via PayU.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Plan summary row */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              Plan
            </span>
            <span className="font-headline text-lg text-foreground">
              {tierLabel} · Monthly
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="font-headline text-2xl text-foreground">
              {displayPrice}
            </span>
            <span className="text-3xs text-muted-foreground">
              Locked in {currency}
            </span>
          </div>
        </div>

        {/* GST / business fields — conditional */}
        {taxVisible && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Business details (optional)
            </legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-company" className="text-xs">
                Company name
              </Label>
              <Input
                id="checkout-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Weddings Pvt. Ltd."
                autoComplete="organization"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-gstin" className="text-xs">
                GSTIN
              </Label>
              <Input
                id="checkout-gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                inputMode="text"
                maxLength={15}
                aria-describedby="gstin-help"
              />
              <p id="gstin-help" className="text-3xs text-muted-foreground">
                Enter a valid 15-character GSTIN to receive a tax invoice.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-address" className="text-xs">
                Billing address
              </Label>
              <Input
                id="checkout-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, city, state, PIN"
                autoComplete="street-address"
              />
            </div>
          </fieldset>
        )}

        {/* Proceed CTA — stubbed */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              // Sprint 2: call /api/account/plan/checkout and redirect to PayU.
              onProceed?.()
            }}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Pay via PayU
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Cancel
          </button>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3 text-2xs text-muted-foreground">
          <p>No refunds. Cancel anytime to stop the next renewal.</p>
          <p>Amount shown in {currency}. Conversion locked at checkout.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CheckoutModal
