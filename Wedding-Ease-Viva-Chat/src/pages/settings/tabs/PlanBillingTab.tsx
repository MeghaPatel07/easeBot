// PlanBillingTab — Sprint 2 (Tomás Herrera).
// Plan & Billing surface for the Settings redesign per PRD §6.6 / §7.
//
// Reads plan + usage via useAccount (Sprint 1, Mei). Pricing is currently
// stubbed in the `PLANS` constant below — this is a placeholder until a real
// pricing service / Stripe-PayU integration ships in Section 2 of the
// improvement plan. No hex values, all tokens, all shadcn primitives.
//
// Checkout: backend stub at POST /api/account/plan/checkout returns 501
// (per Rohan's Sprint 1). We never call it directly here — `useAccount` and
// `accountService` are read-only this sprint — so we surface a graceful
// "launching soon" toast that fires before any network attempt could crash.

import { useMemo } from 'react'
import { Check, CreditCard, ExternalLink, Receipt, Sparkles } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useToast } from '@/hooks/use-toast'
import { useAccount } from '@/hooks/useAccount'
import { cn } from '@/lib/utils'

import TabShell from './_TabShell'

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder pricing — replace with a real pricing service when payments
// (improvement.md §2) ships. DO NOT hardcode prices anywhere else in the app.
// ─────────────────────────────────────────────────────────────────────────────
type PlanTier = 'free' | 'pro' | 'premium'

interface PlanDef {
  tier: PlanTier
  name: string
  tagline: string
  price: string
  period: string
  features: string[]
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
      'Planner, Stylist & Therapist modes',
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
      'All AI modes incl. Knowledge & Consultant',
      'Voice replies & image generation',
      'Reminders via email & WhatsApp',
      'Priority response speed',
    ],
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(input: string | Date | null | undefined): string | null {
  if (!input) return null
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getMeterToneClass(percent: number): string {
  // Tokenized only — no raw palette ramps. Sprint 4 (Hana) replaces
  // `bg-amber-500` with the semantic `bg-warning` token (Marcus QA M-10).
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-warning'
  return 'bg-primary'
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PlanBillingTab() {
  const { plan, usage, profile, isLoading } = useAccount()
  const { toast } = useToast()

  const currentTier: PlanTier = (plan?.tier ?? profile?.plan ?? 'free') as PlanTier
  const currentPlan = useMemo(
    () => PLANS.find((p) => p.tier === currentTier) ?? PLANS[0],
    [currentTier],
  )

  // Usage meter values — fall through to "no data" placeholder if absent.
  const hasUsage =
    !!usage &&
    typeof usage.messagesUsed === 'number' &&
    typeof usage.messagesAllowed === 'number' &&
    usage.messagesAllowed > 0

  const used = hasUsage ? usage!.messagesUsed : 0
  const allowed = hasUsage ? usage!.messagesAllowed : 0
  const percent = hasUsage ? Math.min(100, Math.round((used / allowed) * 100)) : 0
  const meterTone = getMeterToneClass(percent)

  const renewsAt =
    formatDate(plan?.renewsAt) ??
    (profile?.planRenewsAt
      ? formatDate(
          // Firestore Timestamp duck-type
          (profile.planRenewsAt as unknown as { toDate?: () => Date }).toDate?.() ?? null,
        )
      : null)
  const periodEndLabel = formatDate(usage?.periodEnd)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCheckout = (targetTier: PlanTier) => {
    // Backend POST /api/account/plan/checkout is currently a 501 stub
    // (Rohan, Sprint 1). We don't call accountService directly here because
    // `accountService` is a read-only contract this sprint. Surface the
    // "launching soon" toast immediately so the UI never crashes.
    void targetTier
    toast({
      title: 'Payments launching soon',
      description:
        'Billing is not live yet. Tap "Join the waitlist" in the meantime — we will email you the moment Pro & Premium open up.',
    })
  }

  const handleAddPaymentMethod = () => {
    toast({
      title: 'Payments launching soon',
      description:
        'Payment methods open up alongside Pro & Premium billing. Hold tight — we will let you know.',
    })
  }

  const handleManageSubscription = () => {
    toast({
      title: 'Subscription portal coming soon',
      description:
        'You will manage renewals, invoices, and cancellations from here once billing goes live.',
    })
  }

  const isPaid = currentTier !== 'free'

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <TabShell
      title="Plan & Billing"
      description="See your current tier, monthly usage, and upgrade options."
    >
      {/* 1. Current plan hero card ─────────────────────────────────────────── */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current plan
                </span>
              </div>
              <CardTitle className="font-headline text-2xl font-semibold">
                {currentPlan.name}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {currentPlan.tagline}
              </CardDescription>
            </div>
            <Badge
              variant={isPaid ? 'default' : 'secondary'}
              className="h-6 px-3 text-label uppercase tracking-wide"
            >
              {isPaid ? currentPlan.name : 'Free tier'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {isPaid && (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">
                {currentPlan.price}
              </span>
              <span className="text-sm text-muted-foreground">{currentPlan.period}</span>
            </div>
          )}
          {isPaid && renewsAt && (
            <p className="text-xs text-muted-foreground">
              Renews on <span className="text-foreground">{renewsAt}</span>
            </p>
          )}
          {!isPaid && (
            <p className="text-sm text-muted-foreground">
              You are on the free tier. Upgrade for more messages, voice replies, and reminders.
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap gap-3">
          {isPaid ? (
            <Button
              type="button"
              onClick={handleManageSubscription}
              aria-label="Manage your subscription"
              className="min-h-11 min-w-11"
            >
              Manage subscription
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => handleCheckout('pro')}
              aria-label="Upgrade to Pro"
              className="min-h-11 min-w-11"
            >
              <Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
              Upgrade to Pro
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCheckout(currentTier)}
            aria-label="Compare plans"
            className="min-h-11 min-w-11"
          >
            Compare plans
          </Button>
        </CardFooter>
      </Card>

      {/* 2. Usage meter card ──────────────────────────────────────────────── */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Monthly usage</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Chat messages count against your monthly quota. The meter resets at the
            end of each billing cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <div
              className="h-4 w-full animate-pulse rounded-full bg-muted"
              aria-hidden="true"
            />
          ) : hasUsage ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {used.toLocaleString()} / {allowed.toLocaleString()} messages
                </span>
                <span className="text-xs text-muted-foreground">{percent}%</span>
              </div>
              {/* Tokenized progress bar (per design system §6 — a tokenized
                  div is allowed when shadcn Progress cannot express the
                  warn/danger threshold colors). */}
              <div
                role="progressbar"
                aria-label={`${used} of ${allowed} messages used`}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'h-full rounded-full transition-all duration-200',
                    meterTone,
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {percent >= 90
                  ? 'You have nearly hit your monthly cap.'
                  : percent >= 70
                  ? 'Heads up — you are approaching your monthly cap.'
                  : 'Plenty of headroom this cycle.'}
                {periodEndLabel && (
                  <>
                    {' · Resets '}
                    <span className="text-foreground">{periodEndLabel}</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <div
              className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
              role="status"
            >
              Usage tracking will appear here once you send your first message.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Plan comparison ──────────────────────────────────────────────── */}
      <section aria-labelledby="plan-comparison-heading" className="flex flex-col gap-3">
        <h3
          id="plan-comparison-heading"
          className="text-base font-semibold text-foreground"
        >
          Compare plans
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = p.tier === currentTier
            return (
              <Card
                key={p.tier}
                className={cn(
                  'flex h-full flex-col border-border bg-card text-card-foreground transition-colors',
                  isCurrent && 'border-primary ring-1 ring-primary',
                )}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <CardHeader className="gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">{p.name}</CardTitle>
                    {isCurrent && (
                      <Badge className="h-5 px-2 text-2xs uppercase tracking-wide">
                        Current
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    {p.tagline}
                  </CardDescription>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-xl font-semibold text-foreground">
                      {p.price}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="flex flex-col gap-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        />
                        <span className="text-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant={isCurrent ? 'outline' : p.tier === 'pro' ? 'default' : 'outline'}
                    disabled={isCurrent}
                    onClick={() => handleCheckout(p.tier)}
                    aria-label={
                      isCurrent ? `${p.name} is your current plan` : `Select the ${p.name} plan`
                    }
                    className="min-h-11 w-full min-w-11"
                  >
                    {isCurrent ? 'Current plan' : `Select ${p.name}`}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </section>

      {/* 4. Billing history ──────────────────────────────────────────────── */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Billing history</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Past invoices and receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center"
            role="status"
          >
            <Receipt aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No invoices yet
            </p>
            <p className="text-xs text-muted-foreground">
              You are on the Free plan. Invoices appear here after your first paid cycle.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 5. Payment method ──────────────────────────────────────────────── */}
      {/* <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Payment method</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Card or wallet used for renewals.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            No payment method on file. Add one when you upgrade.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddPaymentMethod}
              aria-label="Add a payment method"
              className="min-h-11 min-w-11"
            >
              <CreditCard aria-hidden="true" className="mr-2 h-4 w-4" />
              Add payment method
            </Button>
          </div>
        </CardContent>
      </Card> */}

      {/* 6. Plan FAQ ────────────────────────────────────────────────────── */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Plan FAQ</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Quick answers to common billing questions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="upgrade-midmonth" className="border-border">
              <AccordionTrigger className="min-h-11 text-left text-sm font-medium">
                What happens when I upgrade mid-month?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Your new plan starts immediately. We prorate the difference between
                what you have already paid and the new tier, so you only pay for the
                days remaining in your current cycle. Your message quota refreshes
                to the new tier on the spot.
              </AccordionContent>
            </AccordionItem>
            <Separator className="bg-border" />
            <AccordionItem value="cancel-anytime" className="border-border">
              <AccordionTrigger className="min-h-11 text-left text-sm font-medium">
                Can I cancel anytime?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Yes — cancel from this page in one click. You keep paid features
                until the end of the cycle you have already paid for, then drop to
                the Free tier automatically. No cancellation fees, ever.
              </AccordionContent>
            </AccordionItem>
            <Separator className="bg-border" />
            <AccordionItem value="data-on-downgrade" className="border-border">
              <AccordionTrigger className="min-h-11 text-left text-sm font-medium">
                Is my data deleted if I downgrade?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                No. Your chats, notes, checklists, and wedding details stay exactly
                where they are. Pro-only features (voice replies, reminders, image
                generation) become read-only, and your monthly cap returns to the
                Free tier. Re-upgrade anytime to unlock them again.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
        <CardFooter>
          <a
            href="https://weddingease.com/pricing"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open the full pricing page in a new tab"
          >
            See full pricing details
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        </CardFooter>
      </Card>
    </TabShell>
  )
}

export default PlanBillingTab
