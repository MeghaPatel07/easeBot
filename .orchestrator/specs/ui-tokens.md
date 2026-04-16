# UI Tokens Spec — Pricing, Usage Meter, Checkout

**Ticket:** UI-001 (Sprint 1, UI/UX Designer Agent)
**Status:** Reference spec — no code, no config changes. Consumed by Sprint 2+ frontend work.
**Scope:** Design tokens, breakpoints, anatomy and a11y rules for the new Pricing page, Usage Meter, and Checkout Modal.

This spec **extends** the existing EaseBot design system (dark burgundy/wine base + warm gold primary). It does **not** introduce a new palette. Any new token listed in §3 is additive and must land via a Sprint 2 Tailwind config PR.

Context files:
- `/Users/krish/Desktop/easebot/PRICING_PRD.md` §8 (tier summary table)
- `/Users/krish/Desktop/easebot/EXECUTION_PLAN.md` §10 (responsive matrix)
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/tailwind.config.ts`
- `/Users/krish/Desktop/easebot/Wedding-Ease-Viva-Chat/src/index.css`

---

## 1. Existing Token Inventory (facts only)

Pulled from `tailwind.config.ts` + `src/index.css` as of this sprint. No opinions — this is the ground truth Sprint 2 must extend, not replace.

### 1.1 Colors

| Token | Value / CSS var | Use |
|---|---|---|
| `background` | `hsl(330 40% 12%)` — deep burgundy | Page background |
| `foreground` | `hsl(30 20% 90%)` — warm off-white | Primary text |
| `card` | `hsl(330 30% 16%)` | Card surface |
| `popover` | `hsl(330 30% 16%)` | Popover / dropdown surface |
| `primary.DEFAULT` | `#C6944A` (`hsl(36 56% 51%)`) | Warm gold — brand, CTA, focus ring |
| `primary.container` | `#F0E3CC` | Light gold container |
| `primary.muted` | `#B07D35` | Deep gold (hover / active) |
| `primary.foreground` | white | Text on gold |
| `secondary.DEFAULT` | `#C9B89A` | Warm beige |
| `secondary.container` | `#F0E8DA` | Light beige container |
| `destructive` | `hsl(0 74% 42%)` — `#BA1A1A` | Errors, dangerous actions |
| `warning.DEFAULT` | `hsl(38 92% 50%)` — amber | Non-destructive caution (added Sprint 4, Hana) |
| `muted` / `muted.foreground` | `hsl(330 25% 18%)` / `hsl(30 15% 65%)` | Subdued surfaces / subdued text |
| `accent` / `accent.foreground` | `hsl(330 25% 18%)` / `hsl(30 15% 75%)` | Hover / subtle accent |
| `border` | `hsl(330 20% 25%)` — subtle wine | Default border |
| `input` | `hsl(330 20% 22%)` | Form field border/background |
| `ring` | `hsl(36 56% 51%)` — gold | Focus ring |
| `surface.DEFAULT` → `surface.container-highest` | 5-stop elevation scale (wine tones) | Material-style elevation |
| `outline` / `outline.variant` | `hsl(30 8% 50%)` / `hsl(330 15% 30%)` | Dividers / outlines |
| `sidebar.*` | Dedicated sidebar palette (wine + gold border) | Sidebar only |
| `mode-auto` | `#8A7E72` | AI mode chip |
| `mode-planner` | `#C6944A` | AI mode chip (= primary) |
| `mode-stylist` / `mode-stylist-dark` | `#D4AF37` / `#B8860B` | AI mode chip |
| `mode-therapist` | `#9B8B7A` | AI mode chip |
| `mode-knowledge` | `#6B5E52` | AI mode chip |
| `mode-consultant` | `#A87C33` | AI mode chip |

Dark mode: all semantic tokens have `.dark` overrides in `index.css` (darker wine, same gold primary). The app is effectively "always dark" today — the root is already on the dark wine palette; `.dark` is a second, slightly deeper variant.

### 1.2 Spacing & Container

| Token | Value | Notes |
|---|---|---|
| Spacing scale | Tailwind default (`0`, `0.5`, `1` … `96`; `4px` base unit) | No project-specific overrides |
| Container padding | `2rem` | From `theme.container.padding` |
| Container center | `true` | `max-width` at `2xl` breakpoint: `1400px` |
| `--dense-spacing` CSS var | `1rem` comfortable / `0.5rem` compact | Density toggle (Sprint 4, Hana). Used via `space-y-[var(--dense-spacing,1rem)]` on `.settings-dense` containers. |

### 1.3 Typography

| Token | Value | Use |
|---|---|---|
| `font-headline` | Noto Serif (italic when `.elegant-heading`) | Headings, prices, tier names |
| `font-body` | Inter | Body copy |
| `font-label` | Inter (uppercase, tracked) | Labels, badges, eyebrow text |
| `text-3xs` | 9px / 12lh | Legal fine print |
| `text-2xs` | 10px / 14lh | Badge / timestamp |
| `text-label` | 11px / 16lh | Eyebrow labels |
| `text-caption` | 13px / 18lh | Captions, helper text |
| `text-xs`…`text-base`…`text-5xl` | Tailwind defaults | Normal scale |

iOS guard: `@media (max-width: 640px)` forces `input, select, textarea { font-size: 16px }` to prevent iOS input zoom. Any new checkout/currency form field must respect this — don't override to smaller.

### 1.4 Radius

`sm = radius − 4px`, `md = radius − 2px`, `lg = radius` (`0.75rem`), `xl = radius + 4px`, `2xl = 1rem`, `3xl = 1.5rem`. Tier cards and the checkout modal should use `rounded-2xl` (`1rem`) to match the existing `Pricing.tsx` sketch and settings shell.

### 1.5 Existing motion / effects utilities

- `.glass-panel`, `.glass-sidebar`, `.glass-action-card` — backdrop-blur glass surfaces (reuse for modal backdrop)
- `.pulse-glow` — `box-shadow` breath on gold (reuse for recommended tier card)
- `.custom-scrollbar`, `.scrollbar-hide` — scrollbar utilities
- `.input-glow:focus-within` — gold focus glow (reuse on currency selector + company name fields)
- `.h-dvh-safe`, `.min-h-dvh-safe`, `.px-safe`, `.pb-safe` — dynamic viewport + iOS safe-area (use on mobile full-screen checkout)
- `prefers-reduced-motion` is globally honored — any new animation must be disable-able by this rule (it already is if you use Tailwind's animation plugin).

---

## 2. Responsive Breakpoints

EaseBot uses stock Tailwind breakpoints plus the default (unprefixed) mobile-first base. The 7-row matrix from `EXECUTION_PLAN.md` §10 maps onto 6 Tailwind prefixes (Mobile S / M / L all live at the default base; `sm:` kicks in at 640 but we treat `md:` as the first real layout shift for the pricing page).

| Breakpoint (PRD) | Width | Tailwind prefix | Pricing cards | Usage meter | Checkout modal |
|---|---|---|---|---|---|
| Mobile S | 320 px | (default, no prefix) | 1 col, fully stacked, horizontally scroll-safe | Compact inline (single-line pill in chat header) | Full-screen sheet (`h-dvh-safe`, `px-safe`) |
| Mobile M | 375 px | `sm:` (≥640 in Tailwind — at 375 we're still base) | 1 col | Compact inline | Full-screen sheet |
| Mobile L | 414 px | base | 1 col | Compact inline | Full-screen sheet |
| Tablet | 768 px | `md:` | 2 col grid | Sidebar placement (settings shell) | Centered modal, 500 px wide |
| Laptop | 1024 px | `lg:` | 3 col grid (Free / Pro / Pro Max) — guest promo as 4th if present | Sidebar placement | Centered modal, 600 px wide |
| Desktop | 1280 px | `xl:` | 4 col grid (Guest + Free + Pro + Pro Max), above the fold | Header placement (top right of chat) | Centered modal, 640 px wide |
| Large | 1920 px | `2xl:` | 4 col, capped at `max-w-[1280px]` container, centered | Header placement | Centered modal, 640 px wide (do not stretch) |

**Hard rules** (from §10 + `index.css`):
- No horizontal scroll at any breakpoint. `html, body { overflow-x: hidden }` is already set globally — do not fight it; design widths accordingly.
- All CTAs ≥ 44px tall at every breakpoint (§10).
- Tier cards are `flex flex-col` with `flex-1` feature lists so CTA buttons align across cards even when feature lists differ in length.
- At `lg+`, all visible tiers must be above the fold on a 720-tall laptop viewport (§10).

---

## 3. New Tokens to Add in Sprint 2

Additive only. Sprint 2 owns the Tailwind config edit; this spec only specifies names, intent, and starting values. HSL given so it plugs into the existing `hsl(var(--x))` pattern.

### 3.1 Usage meter state colors

| Token | Light / base value | Dark override | Purpose |
|---|---|---|---|
| `meter-ok` | `hsl(142 55% 42%)` (forest green) | `hsl(142 50% 48%)` | 0–74% usage — healthy |
| `meter-warn` | Reuse existing `--warning` (`hsl(38 92% 50%)`) — alias as `meter-warn` for semantic clarity | same | 75–89% usage |
| `meter-crit` | Reuse existing `--destructive` (`hsl(0 74% 42%)`) — alias as `meter-crit` | `hsl(0 62.8% 42%)` | 90–100% usage |
| `meter-depleted` | `hsl(30 8% 40%)` (warm gray, derived from existing `--outline`) | `hsl(30 8% 35%)` | 100% + paused state |

Rationale for aliasing `warning`/`destructive`: we already went through a migration to replace raw `bg-amber-500` with `warning` in the PlanBillingTab meter (noted in `tailwind.config.ts` comments, Sprint 4 Hana / Marcus M-10). The meter now has 5 states, so we introduce semantic meter-* aliases so consumers can say `bg-meter-warn` instead of leaking `warning` into non-warning contexts.

### 3.2 Semantic tier colors

| Token | Value | Purpose |
|---|---|---|
| `tier-free` | `hsl(30 8% 55%)` — warm gray, derived from existing outline palette | Free tier card border/accent + Free chip in header |
| `tier-pro` | `#C6944A` (alias of `primary.DEFAULT`) | Pro tier — matches brand gold |
| `tier-promax` | `#B8860B` (alias of `mode-stylist-dark`) | Pro Max — deeper, richer gold so it visually outranks Pro |

We deliberately don't invent a new hue for Pro Max — EaseBot's palette is mono-gold, and a purple/blue "premium" accent would break the wine+gold identity. Pro Max is darker, heavier, and uses the "recommended" glow only on Pro (the PRD's primary revenue tier) so Pro Max feels aspirational rather than hyped.

### 3.3 Recommended tier glow

| Token | Value | Purpose |
|---|---|---|
| `shadow-tier-recommended` | `0 0 0 1px rgba(198,148,74,0.55), 0 0 32px rgba(198,148,74,0.22), 0 12px 40px -16px rgba(198,148,74,0.35)` | Static glow around the Pro card (the "Most popular" tier) |
| `animate-tier-pulse` | Reuse existing `.pulse-glow` (`pulse-glow 3s ease-in-out infinite`) gated behind `@media (prefers-reduced-motion: no-preference)` | Optional breathing glow — must be off under reduced-motion |

### 3.4 Checkout modal surface

No new color needed — reuse `surface.container-high` for the modal body and `glass-panel` for the backdrop. New additive token:

| Token | Value | Purpose |
|---|---|---|
| `shadow-modal-checkout` | `0 24px 64px -12px rgba(0,0,0,0.55), 0 0 0 1px hsl(var(--border))` | Elevation for the centered checkout modal on md+ |

---

## 4. Usage Meter Visual States

The usage meter is a single component rendered in 3 placements (chat header on xl+, settings sidebar on md/lg, compact inline on mobile). It reads `{ monthly, daily, extras, remaining }` from `GET /account/me` (PRD §6, `accountController.ts`).

It uses the token meter as the truth: the bar represents **monthly** pool consumption; a small secondary tick represents **daily** ceiling. The 5 user-visible states below are driven by `monthlyPctUsed` with daily overrides.

| State | Condition | Bar color | Label | Icon | Modal |
|---|---|---|---|---|---|
| 1 — OK | 0–74 % monthly used | `meter-ok` (green) | No label (hide). Tooltip on hover reads "X % used — Y tokens remaining" | none | — |
| 2 — Warn | 75–89 % monthly used | `meter-warn` (amber) | `"75% used"` (or actual %) in `text-caption font-label` | none | — |
| 3 — Critical | 90–99 % monthly used | `meter-crit` (red) | `"90% used — approaching limit"` | `AlertTriangle` (lucide) in red | Non-blocking toast on first crossing of 90 % in a session |
| 4 — Daily limit hit | `dailyUsed ≥ dailyCap` AND monthly not yet 100 % | `meter-crit` (red) with striped pattern to distinguish from state 3 | `"Daily limit reached. Resets at midnight UTC."` | `Clock` icon | Inline banner in chat; NO checkout modal (not a monetization moment) |
| 5 — Monthly depleted | `monthlyUsed ≥ monthlyCap` | `meter-depleted` (gray) with red border | Free/Guest: `"Your free pool is used up. Upgrade to Pro to continue."` Pro/Pro Max: `"Monthly pool used up. Top-up or wait until {reset_date}."` | `Lock` icon | Checkout modal auto-triggered on next chat send (focus-trapped per §10) |

Rules:
- Reset to OK on billing cycle rollover (driven by account state, not meter-local).
- State transitions animate `bar-width` over 400 ms unless `prefers-reduced-motion: reduce` — then snap instantly.
- The meter is a single source of truth — do not let individual features (image gen, voice) render their own "you're out" banner. They call the meter component with a `reason` prop instead.

---

## 5. Touch Targets + Accessibility Rules

Every new component in Sprint 2+ must pass these. Marcus (QA) and the Designer agent both have rejection power on violations.

- **44 × 44 px minimum** for any interactive element. The existing `Pricing.tsx` sketch already uses `min-h-11` (44 px) on CTAs — keep that pattern.
- **Visible focus ring** on every CTA, currency selector, plan card, billing-cycle toggle, top-up button. Use `ring` token (gold) — reuse `.input-glow:focus-within` where the target is a form field.
- **Tab order** on the pricing page: back link → currency selector → billing cycle toggle → tier cards (left to right) → each card's CTA → footer. No `tabindex > 0`.
- **Aria labels required** on:
  - Usage meter — `role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly token pool usage"`
  - Each plan card — `role="article" aria-labelledby="tier-{id}-name"` with the recommended card adding `aria-describedby="tier-pro-recommended"`
  - Token count displays — `aria-label="X of Y monthly tokens used"` (expose raw numbers, not formatted strings)
  - Currency selector — `aria-label="Display currency"` + announce value changes via `aria-live="polite"`
  - Billing cycle toggle — `role="radiogroup" aria-label="Billing cycle"` with two radios (monthly / yearly)
- **Keyboard**: Esc closes the checkout modal, Tab focus trap while open (reuse existing Radix primitives from shadcn if possible — see `components.json`).
- **Dark mode parity**: every new component must render in both the base wine palette and the `.dark` variant. Checkout modal and tier cards must be screenshot-tested in both.
- **Reduced motion**: the `prefers-reduced-motion` block in `index.css` already reduces all animations to 0.01 ms globally. Don't bypass it with inline styles.
- **Color contrast**: amber `warning` on dark wine background is marginal for `text-warning`. Use `bg-warning text-warning-foreground` pill style for text on amber; do not use `text-warning` on `bg-background`. Meter states 2/3 must pass WCAG AA at `text-caption` size (13 px) — verify in QA.
- **Screen reader**: when the meter transitions to state 5 (depleted), fire an `aria-live="assertive"` announcement with the upgrade copy — otherwise VoiceOver users won't know why chat sends are failing.

---

## 6. Pricing Card Anatomy

Top-to-bottom structure of a single tier card. All tiers share this shell; differences are data-driven.

1. **Recommended ribbon** (Pro tier only) — absolute-positioned `-top-3 left-6` pill, `rounded-full border border-primary/60 bg-background px-3 py-0.5 text-2xs uppercase tracking-wide text-primary`, copy: `"Most popular"`. Already prototyped in `Pricing.tsx`. Hidden on non-Pro tiers; the slot still exists in the DOM for consistent card height.
2. **Tier name** — `font-headline text-2xl` (Noto Serif). Colored with the tier-specific accent (`tier-free` / `tier-pro` / `tier-promax`) when on the card, plain white on the chip variant.
3. **Tagline** — `text-xs text-muted-foreground` — one sentence, user-facing benefit (not marketing jargon). Pulled from PRD §4.
4. **Price block** — `flex items-baseline gap-1`:
   - Currency indicator (small leading prefix like `₹` / `$` / `€`) in `text-caption text-muted-foreground`.
   - Amount in `font-headline text-4xl text-foreground`.
   - Billing period `"/ month"` or `"/ year"` in `text-xs text-muted-foreground`.
   - When yearly is active via the cycle toggle, show a `text-2xs text-primary` savings badge (e.g. `"save 34%"`) below the price — data from PRD §4 (`$119/yr` on Pro).
5. **Billing cycle toggle** — lives **above** the grid, not per-card (single toggle controls all three cards simultaneously). Spec'd here for completeness: 2-option segmented control, `role="radiogroup"`, `"Monthly"` / `"Yearly (save up to 36%)"`.
6. **Feature list** — `ul` with `flex flex-1 flex-col gap-2.5`; each `li` is `flex items-start gap-2 text-sm text-muted-foreground` with a `Check` lucide icon in `text-primary`. Uses `flex-1` so the CTA always pins to the bottom of the card regardless of list length.
7. **CTA button** — `min-h-11` (44 px) full-width button. Variants:
   - Current tier: `variant="outline"` disabled, label `"Current plan"`, `aria-disabled="true"`.
   - Upgrade target (Pro from Free): `bg-primary text-primary-foreground hover:bg-primary/90` (the Pro recommended style).
   - Sidegrade / downgrade: outline variant.
   - Free when user is guest: filled primary, label `"Start free"`.
8. **"Current plan" badge state** — when this card matches the user's active tier, show a small pill top-right of the card: `rounded-full bg-primary/10 text-primary text-2xs px-2 py-0.5 border border-primary/40`, copy `"Current plan"`. The CTA also changes (see 7).
9. **Fine print footnote** — per-card, `text-3xs text-muted-foreground` under the CTA. Used for things like `"No refunds. Cancel = stop renewal."` (PRD §8).

Data-driven props contract (for the Sprint 2 component author):
```
{
  id: 'guest' | 'free' | 'pro' | 'promax',
  name, tagline, priceMonthly, priceYearly,
  currency, features[], recommended: boolean,
  current: boolean, ctaLabel, ctaVariant,
  fineprint?: string,
}
```

---

## 7. Checkout Modal Anatomy

Centered modal (md+) or full-screen sheet (base/sm). Triggered from any tier CTA that represents an upgrade or from the meter's state-5 auto-trigger. Focus-trapped, Esc-closable, scrollable body (per §10).

Layout, top-to-bottom:

1. **Header row** — tier name (headline) + close X button. Close button is 44×44 px, aria-label `"Close checkout"`.
2. **Plan summary row** — selected tier name, price, billing cycle chip, currency chip. One-line layout on md+, stacks on base. Links back to the pricing page ("Change plan") for clarity.
3. **Billing cycle selector** — the same segmented control from the pricing page, so the user can switch monthly↔yearly without leaving the modal. Updates the summary row live.
4. **Optional company name + GSTIN fields** — Sprint 3 addition. Rendered conditionally when `currency === 'INR'` or `showTaxFields === true`. Two inputs: `"Company name (optional)"` + `"GSTIN (optional)"`. Use existing `input` surface tokens + `.input-glow:focus-within`. Inline validation for GSTIN format. Help text in `text-caption text-muted-foreground` below the field.
5. **Pay via PayU button** — primary filled CTA, full-width, `min-h-12` (48 px for extra prominence), label `"Pay via PayU"`, followed by PayU trust badge (small icon row). Disabled state while the PayU form is being built. Loading state during handoff.
6. **Cancel link** — ghost/text button below the pay button, label `"Cancel"`, dismisses the modal.
7. **Fine print** — `text-2xs text-muted-foreground` with copy locked from PRD §8:
   - `"No refunds. Cancel anytime to stop the next renewal."`
   - `"Period terms: subscription renews {monthly|yearly} until cancelled."`
   - Currency conversion note: `"Amount shown in {CCY}. Conversion locked at checkout."`

Behavior:
- Full-screen on base/sm using `h-dvh-safe px-safe pb-safe` so iOS notch + gesture bar are respected. Centered on md+ using `shadow-modal-checkout` and `bg-surface-container-high`.
- Backdrop uses `.glass-panel` blur.
- Do not block tier grant on invoice PDF generation (PRD §9.4) — the modal's success state hands off to PayU and relies on webhook; it never awaits invoice PDF.

---

## 8. Currency Selector

A simple dropdown that lets the user override the auto-detected display currency on the pricing page (and, downstream, the checkout modal).

- **Placement**: top-right of the pricing page header, aligned with the "Back" link on the left. On base/sm it collapses under the header into a full-width row above the tagline.
- **Component**: reuse shadcn `Select` (present in `components/ui/` per `components.json`). No new primitive.
- **Options**: USD, INR, EUR, GBP, AUD, CAD, JPY (matches `services/currencyFormat.ts` reference in PRD §4.5). Auto-detected currency appears first, flagged as `"(detected)"`.
- **Persistence**: write selected currency to `localStorage` key `easebot:display-currency` on change. On page load, prefer localStorage → detected → USD fallback.
- **Token pool stays identical across currencies** (PRD §4.5) — the selector only affects display formatting, not entitlement. Make sure the tier cards re-render prices, not features, when the currency changes.
- **A11y**: `aria-label="Display currency"`, `aria-live="polite"` on the price region so SR users hear the re-formatted price when they change currency.
- **Visual**: same wine+gold styling as the settings shell selects (`SettingsShell.tsx` pattern). 44 px min-height. Gold focus ring.
- **Do not** expose the selector inside the checkout modal — once the user is in checkout, currency is locked per PRD §8 (no refund arbitrage). Show the locked currency as a chip instead (see §7 step 2).

---

## 9. Hand-off Notes for Sprint 2

- The new tokens in §3 are the only Tailwind config change authorized by this spec. Everything else is consumption of existing tokens.
- `Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx` is the untracked sketch referenced in the ticket. Sprint 2 should **replace** it, not extend it — the sketch hardcodes USD and doesn't yet match tier names (`premium` vs the PRD's `promax`). Use the PRD §8 table as the source of truth for tier names, prices, and features.
- Settings shell pattern (`pages/settings/SettingsShell.tsx`) is the layout cousin for the checkout modal on tablet+. Match its radius, border, and elevation tokens.
- Reduced-motion is handled globally — no per-component opt-in needed.
- Density toggle (`--dense-spacing`) is settings-only today; do **not** apply it to pricing or checkout surfaces (they are marketing/transactional, not dashboard UI).
