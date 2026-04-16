# Sprint 2 — Tomás Herrera (Frontend, Plan & Billing tab)

**Track:** Settings & User Profile redesign — Plan & Billing surface
**PRD:** `docs/prd-settings-profile.md` §6.6, §7
**Design contract:** `docs/settings-design-system.md`
**Status:** Complete

## Scope

Sole owner of `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PlanBillingTab.tsx`.
No other file in the repo was modified.

## Sections implemented

1. **Current plan hero card** — plan name (Free/Pro/Premium), tagline, price
   (paid only), renewal date (paid only). Primary CTA is "Upgrade to Pro" on
   free, "Manage subscription" on paid; a secondary "Compare plans" button
   sits next to it. Click → graceful 501 toast.
2. **Usage meter card** — tokenized progress bar with `messagesUsed /
   messagesAllowed`, percent label, threshold colors (neutral <70 %, amber
   ≥70 %, destructive ≥90 %), human-friendly reset date from `usage.periodEnd`.
   Shows a placeholder ("Usage tracking will appear here once you send your
   first message.") when usage data is missing or zero-allowed instead of
   rendering a broken bar. Loading skeleton while `useAccount.isLoading`.
3. **Plan comparison** — 1-column on mobile, 3-column from `md:` up, current
   tier highlighted with `border-primary` + `ring-1 ring-primary` and
   `aria-current="true"`. Each card has bullet feature list and a "Select
   {plan}" button (disabled for current plan, 501-toast stub for others).
4. **Billing history card** — empty state ("No invoices yet — you are on the
   Free plan"), no fake rows. Dashed border + muted surface preserves the
   slot for real invoice rows in a future sprint.
5. **Payment method card** — empty state with "Add payment method" button →
   501-toast stub.
6. **Plan FAQ** — collapsible `Accordion` with sane short answers for the
   three required questions (mid-month upgrade, cancel anytime, downgrade
   data). External "See full pricing details" link in the footer.

## Pricing source

A local `const PLANS` array sits at the top of `PlanBillingTab.tsx`, clearly
marked as a placeholder until a real pricing service / Section 2 payments
work lands. No prices are hardcoded anywhere else in the file or app.

## Usage meter — missing data behavior

`useAccount` returns `usage` as `AccountUsage | null`. The tab considers data
"present" only when `usage` is non-null **and** both `messagesUsed` and
`messagesAllowed` are numbers **and** `messagesAllowed > 0`. Any other state
renders the friendly placeholder `<div role="status">…</div>` instead of a
broken bar. While `useAccount.isLoading` is true, a single
`animate-pulse` skeleton bar is shown.

The progress bar itself is a tokenized `<div role="progressbar">` with valid
`aria-valuenow / aria-valuemin / aria-valuemax / aria-label`. shadcn's
`Progress` primitive cannot express the warn/danger thresholds without
hacking its internal `Indicator`, and the design doc §6 explicitly allows
"a tokenized div" as the alternative — so I used that path.

## Checkout 501 handling

`accountService` does not export a `startCheckout` symbol this sprint, and
the hard constraints forbid modifying `accountService` or `useAccount`.
Rather than introduce a side-channel fetch that would race the existing
`useAccount` query and risk a crash, the tab handles the entire flow
locally: every checkout-style click (`Upgrade to Pro`, `Select Pro`,
`Select Premium`, `Manage subscription`, `Add payment method`) calls a
local `handleCheckout` / `handleAddPaymentMethod` / `handleManageSubscription`
which immediately fires a `useToast` toast:

> "Payments launching soon — Billing is not live yet. Tap 'Join the
> waitlist' in the meantime — we will email you the moment Pro & Premium
> open up."

This satisfies the spec ("501 → toast, never crash") with zero network
attempts and zero coupling to the read-only service module. When Rohan
ships a real `accountService.startCheckout` in Sprint 3, swapping the
toast for `await accountService.startCheckout(tier)` in `handleCheckout` is
a one-line change.

## Design-system compliance

- All colors via tokens (`bg-card`, `bg-muted`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary`, `bg-destructive`,
  plus `bg-amber-500` for the warn threshold which is a Tailwind palette
  token already shipped in `tailwind.config.ts`). No raw hex.
- Cards composed from shadcn `Card` / `CardHeader` / `CardContent` /
  `CardFooter`. Buttons via shadcn `Button`. Badges via shadcn `Badge`.
  Accordion via shadcn `Accordion`. Separator via shadcn `Separator`.
- All buttons and the FAQ external link include `min-h-11 min-w-11`,
  visible focus rings, and explicit `aria-label`s.
- Responsive: mobile-first single column; plan comparison flips to
  `md:grid-cols-3`. Hero card flex wraps gracefully under 360 px.
- Dark mode: every surface uses semantic tokens, so the tab automatically
  re-skins when the user toggles theme. No `dark:` color variants.

## Verification

- `npm run build` → exit 0, `built in 3.97 s`. No new TypeScript errors.
  Bundle sizes unchanged within rounding (the new tab is a few KB inside
  the existing `Index-*.js` chunk).
- Manual review at `?settings=plan-billing` — hero, meter, comparison,
  history, payment, and FAQ render in order. Progress bar exposes
  `role="progressbar"` with valid ARIA values via DOM inspection.
- Mobile width sanity check via Tailwind class audit: every `md:` /
  `lg:` modifier has a mobile-first base class; no horizontal overflow
  in the comparison row (cards stack at <768 px).

## Hard constraints — confirmation

- Modified ONLY `src/pages/settings/tabs/PlanBillingTab.tsx`. No other file
  in the repo was touched. `useAccount.ts` and `accountService.ts` are
  untouched per the read-only contract.
- No Firebase deploy, no rules edits, no `firebase.json` edits, no config
  edits, no new npm packages installed.
- No prices hardcoded outside the local `PLANS` constant.
- All 501 endpoints are handled with toasts before any network call —
  the tab cannot crash on a stubbed backend.
- No secrets, no env edits.
