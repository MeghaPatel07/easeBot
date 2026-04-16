# Sprint 1 Batch B — Frontend Handoff (FE-001, FE-002)

**Agent:** Frontend Engineer
**Status:** Skeletons landed. `npx tsc -p . --noEmit` passes with zero errors.

## Files created

### FE-001 — Components
- `Wedding-Ease-Viva-Chat/src/components/pricing/PricingTierCard.tsx` — wine+gold tier card. Props match spec (`tier`, `currentUserTier`, `onSelect`, `priceUsd`, `priceLocal`, `currency`, `isRecommended`). Implements CTA label logic from EXECUTION_PLAN §7.2 (`Current plan` / `Upgrade` / `Downgrade` / `Start free` / `Get <tier>`) via a local `TIER_RANK` map (`guest < free < pro < promax`). Uses existing tokens (`primary`, `muted-foreground`, `border`, `card`); the `shadow-tier-recommended` glow is inlined via arbitrary Tailwind class until Sprint 2 adds the token alias to `tailwind.config.ts`.
- `Wedding-Ease-Viva-Chat/src/components/pricing/UsageMeter.tsx` — dual progress bars (monthly + daily). All 5 states from `ui-tokens.md` §4 handled (`ok`/`warn`/`crit`/`daily_hit`/`depleted`), icons via lucide (`AlertTriangle`, `Clock`, `Lock`). Uses existing `warning`/`destructive`/`primary` tokens since `meter-*` aliases aren't in `tailwind.config.ts` yet — Sprint 2 swap is a one-line search-and-replace inside `barTone()`. `aria-valuenow/min/max` on both bars.
- `Wedding-Ease-Viva-Chat/src/components/pricing/UpgradeFlow.tsx` — 3-step shell (`confirm` → `preview` → `redirect`) with local `useState<UpgradeStep>`. Each step renders placeholder copy + nav buttons. Sprint 2 replaces the `useState` with a real reducer/state machine and wires `onProceed` to `/api/account/plan/checkout`.
- `Wedding-Ease-Viva-Chat/src/components/pricing/CheckoutModal.tsx` — wraps shadcn `Dialog`. Shows plan summary row, conditional GST fieldset (GSTIN + company name + address), `Pay via PayU` CTA (stubbed), Cancel link, fine-print block. GST fields default to visible when `currency === 'INR'` or `showTaxFields` prop forces it. Uses shadcn `Input` + `Label` primitives (no new packages).
- `Wedding-Ease-Viva-Chat/src/components/billing/BillingSettingsSkeleton.tsx` — pure presentation helper: current plan badge row, next renewal slot, invoice history placeholder, disabled "Manage subscription (coming soon)" button.

### FE-002 — Services
- `Wedding-Ease-Viva-Chat/src/services/geolocationService.ts` — `GeolocationService` class with the exact `API_BASE_URL` + `API_KEY` constants from the spec. `getUserCurrency()` returns `{ countryCode: 'US', currencyCode: 'USD' }` with a TODO. `void` references on private statics so tsc doesn't treat them as unused.
- `Wedding-Ease-Viva-Chat/src/services/exchangeRateService.ts` — `ExchangeRateService.getRate(from, to)` returns `1.0`, same TODO pattern.
- `Wedding-Ease-Viva-Chat/src/utils/currencyFormat.ts` — `formatCurrency(amountUsd, currency, rate)` returns `` `$${amountUsd}` ``.

## Files modified

### `Wedding-Ease-Viva-Chat/src/App.tsx`
- Line 6: added `Navigate` to the `react-router-dom` import.
- Lines 54–59 (new): added `/billing` route that `Navigate`s to `/?settings=plan-billing` (keeps the billing UI inside the existing settings shell — no new page component needed for the skeleton).

### `Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx`
- Lines 1–22 (new imports + feature flag): added `PricingTierCard` import, `USE_NEW_PRICING_CARDS = true` flag constant, and `NEW_PRICING_MOCKS` array with hardcoded USD mocks for `free` / `pro` (recommended) / `promax`.
- Inside the main `<section>` region: added a new `<section>` above the legacy grid that renders three `<PricingTierCard />` instances when the flag is on. The legacy `PLANS.map(...)` block is left untouched for review comparison. Responsive grid uses `sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3` so at 320px we stack (`1 col`), at tablet we hit 2-up, and at laptop+ we get the 3-up row required by the responsive matrix.

### `Wedding-Ease-Viva-Chat/src/pages/settings/tabs/PlanBillingTab.tsx`
- Added `import { BillingSettingsSkeleton } from '@/components/billing/BillingSettingsSkeleton'` in the import block.
- Inside `return` at the top of `<TabShell>` body: inserted `<BillingSettingsSkeleton currentTier={...} nextRenewalDate={renewsAt} />`. Since `PlanBillingTab` still types its internal tier as `'free'|'pro'|'premium'`, the `currentTier` prop is mapped with a ternary (`currentTier === 'premium' ? 'promax' : currentTier`) so the skeleton only ever sees the new vocabulary.

## Design decisions — mobile layout
- Tier cards: default `grid` (1 col at 320px) → `md:grid-cols-2` (tablet) → `lg:grid-cols-3` (laptop+). No horizontal scroll; each card is `flex flex-col` with `flex-1` on the feature `<ul>` so the CTA pins to the bottom and heights match across cards.
- `CheckoutModal` uses shadcn `Dialog` with `max-w-lg` + `max-h-[min(90vh,720px)]` + `overflow-y-auto`. On 320px the dialog body scrolls rather than overflowing — Sprint 2 should consider swapping to shadcn `Sheet` on `base/sm` for the full-screen `h-dvh-safe` treatment from ui-tokens §7, but for the skeleton the overflowing dialog is safe.
- `UsageMeter` is a vertical flex stack with no `min-width`, so it renders fine at the 320px base and in any flex/grid slot.
- `UpgradeFlow` step indicator uses small 20px circles + icon separators; at 320px the labels wrap naturally.
- All interactive elements use `min-h-11` (44px) per §5 touch target rule. `CheckoutModal`'s primary CTA is `min-h-12` for prominence (ui-tokens §7 step 5).

## Verification
- `npx tsc -p . --noEmit` → **exit 0, zero errors** (run from `Wedding-Ease-Viva-Chat/`).
- `npm run dev` not run — not needed for type check and explicitly optional per instructions.
- No new npm packages installed.
- `therapist` / `consultant` mode strings: not referenced anywhere in new files.

## Things Sprint 2 FE needs to know
1. **Token aliases not added yet.** `UsageMeter.barTone()` uses `bg-primary`/`bg-warning`/`bg-destructive`/`bg-muted-foreground/40` as placeholders. When the UI agent lands the `meter-ok` / `meter-warn` / `meter-crit` / `meter-depleted` aliases in `tailwind.config.ts`, swap the four `return` lines in `barTone()` — no other call sites.
2. **Recommended card glow is inlined.** `PricingTierCard` uses an arbitrary Tailwind shadow class for the gold glow. Once `shadow-tier-recommended` + `animate-tier-pulse` tokens land, replace the inline `shadow-[...]` with the semantic class.
3. **`PlanBillingTab` still uses `'premium'` internally.** The whole tab (and its `PLANS` constant, `PlanTier` type, `switchPlan` call) still speaks the old vocabulary. The new `BillingSettingsSkeleton` accepts the new `'promax'` name — I map at the call site. Sprint 2 should migrate `PlanBillingTab`'s internal type from `premium` → `promax` and update `accountService.switchPlan`'s type signature in the same PR.
4. **`CheckoutModal` state is local.** `gstin`/`companyName`/`address` live in `useState`. Sprint 2 should lift these into a form schema (react-hook-form + zod already available in the codebase).
5. **`UpgradeFlow.initialStep` is a prop** — use it from tests or deep-links, but remove it from the production CTA path so users always start at `confirm`.
6. **Feature flag `USE_NEW_PRICING_CARDS`** in `Pricing.tsx` — Sprint 2 can delete the legacy `PLANS` block + legacy grid (lines ~16–61, ~93–135 of the current file) once the new cards are wired to real currency + subscription state.
7. **`/billing` route** is a `Navigate` redirect, not a dedicated page. If the PRD wants a standalone `/billing` page (distinct from settings), Sprint 2 will need to build it.
8. **Services are pure stubs.** `GeolocationService.getUserCurrency()` and `ExchangeRateService.getRate()` always return the fallback values. Both reference their private constants via `void` to satisfy `noUnusedParameters` — remove those `void` lines when you wire the real fetch.

## Blockers
None.
