// CheckoutModal (FE-001).
//
// Modal shell for the final PayU handoff. Per EXECUTION_PLAN.md §8.9:
//   - GST fields (GSTIN, company name, address) — optional, shown when
//     currency === 'INR' or the user opts in.
//   - Currency display (locked at checkout — see ui-tokens.md §8).
//   - Final price line + "Proceed to pay" CTA.
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
  /** Called when user confirms payment. */
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
          'max-w-lg overflow-y-auto rounded-2xl bg-card-elevated/90 backdrop-blur-2xl border border-foreground/[0.08] text-foreground/90',
          'max-h-[min(90vh,720px)]',
          'shadow-modal',
          'sm:max-w-lg',
        )}
      >
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle className="font-headline text-2xl text-foreground/90">
              Checkout — {tierLabel}
            </DialogTitle>
            <DialogDescription className="text-xs text-foreground/90">
              Review your plan and proceed to secure payment via PayU.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Plan summary row */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] p-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs uppercase tracking-wide text-foreground/90">
              Plan
            </span>
            <span className="font-headline text-lg text-foreground/90">
              {tierLabel} · Monthly
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-2xs uppercase tracking-wide text-foreground/90">
              Total
            </span>
            <span className="font-headline text-2xl text-foreground/90">
              {displayPrice}
            </span>
            <span className="text-3xs text-foreground/90">
              Locked in {currency}
            </span>
          </div>
        </div>

        {/* GST / business fields — conditional */}
        {taxVisible && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-foreground/[0.08] p-4">
            <legend className="px-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
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
              <p id="gstin-help" className="text-3xs text-foreground/90">
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

        {/* Proceed CTA */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onProceed?.()
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            Pay via PayU
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-full bg-foreground/[0.04] border border-foreground/[0.08] text-xs text-foreground/60 hover:text-foreground/80 hover:bg-foreground/[0.08] transition-colors"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Cancel
          </button>
        </div>

        <div className="flex flex-col gap-1 border-t pt-3 text-2xs text-foreground/90">
          <p>No refunds. Cancel anytime to stop the next renewal.</p>
          <p>Amount shown in {currency}. Conversion locked at checkout.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CheckoutModal
