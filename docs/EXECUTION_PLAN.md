# Easebot Pricing & Billing — Execution Plan

**Companion to:** `PRICING_PRD.md`
**Status:** Plan v1 — pre-implementation
**Date:** 2026-04-14
**Hard constraint:** Zero bugs, zero loopholes at handoff. GTM-ready.

---

## 0. Absolute Guardrails (read this first, every agent)

These are non-negotiable. Any task that touches them is **rejected by the Orchestrator** without discussion.

1. **NO DEPLOYS.** No `firebase deploy`, no `vercel --prod`, no pushing to production. All work is local + preview builds only. The human operator (Krish) is the only entity that deploys.
2. **NO FIREBASE RULES / PERMISSIONS / RIGHTS CHANGES.** Do not touch:
   - `firestore.rules` / `storage.rules` / `database.rules.json`
   - Firebase Auth provider settings, IAM, service account permissions
   - Firebase Admin SDK key scopes
   - Any security rule file or CORS config on Firebase
   If a task *appears* to require a rules change, **stop and surface to the Orchestrator**; the human will decide.
3. **NO SECRETS IN CODE.** PayU keys, Azure keys, WhatsApp tokens — all `.env` only. Any agent that hardcodes a key has its work rejected.
4. **NO BREAKING CHANGES TO EXISTING AUTH.** Middleware is Firebase Admin SDK (commit `9d7bc6c`). Do not re-architect it; only extend it with tier/quota reads.
5. **NO DESTRUCTIVE GIT.** No force push, no rebase of shared branches, no `reset --hard` on anything but the agent's own worktree.
6. **RESPONSIVE OR IT DOESN'T SHIP.** Every UI change must pass the QA responsive matrix (see §10) on mobile, tablet, desktop before merge.
7. **THERAPIST + CONSULTANT MODES DO NOT EXIST.** Only Planner, Stylist, Knowledge (+ Assistant fallback). Every reference to `therapist` or `consultant` — in `modeRouter.ts`, `prompts/therapist.ts`, `prompts/consultant.ts`, `types.ts` Mode union, `chatController.ts` routing, any frontend mode picker, any copy, any pricing feature list — must be **commented out, not deleted** (so we can re-enable later without rewriting). Sprint 1 opens with a cleanup ticket that greps for both terms across the entire repo and comments every hit. QA verifies zero live references before the sprint closes.
8. **NO MINI MODEL FALLBACK.** Every user — guest, Free, Pro, Pro Max — runs on the same full GPT-4o deployment. Remove / never introduce any "degraded" path, any `AZURE_DEPLOYMENT_NAME_MINI` switch, any auto-downgrade on cap hit. When pool = 0, stop cleanly and offer top-up (paid) or upgrade (Free). The existing `azureAI.ts` must not gain a mini branch. If a prior version of this plan mentioned mini — ignore those references; no-mini overrides.
9. **NO REFUNDS, NO CANCELLATION POLICY.** All sales final. Cancel = stop auto-renewal only, no money returned, access continues until period end. Data retained indefinitely after downgrade — users keep read access to everything they created on a paid tier. No agent implements a `/payment/refund` user-facing route. An admin-only refund path *may* exist for chargeback defense, but it is gated and not documented to customers.
10. **CURRENCY IS LOCALIZED, NOT REGIONALIZED.** There is exactly one price in code: USD. Localization happens at display time (frontend via `GeolocationService` + `ExchangeRateService`) and is locked server-side at `/payment/initiate`. No separate regional SKUs, no India-specific price list, no hard-coded INR values.

---

## 1. Team Roster — Agent Roles & Scope

Each role below maps to a Claude subagent spawned under the Orchestrator. Agents are stateless between sessions; all shared state lives in `.orchestrator/` (see §3).

### 1.1 CEO Agent — *Strategic guardian*
- **Mandate:** Protect the business thesis from §1 of the PRD. Veto power on any change that (a) breaks the $14.99 / $39 price anchors, (b) removes the token-pool model, (c) adds feature gates that would hurt conversion.
- **Inputs:** PRD, GTM checklist, Orchestrator escalations tagged `strategic`.
- **Outputs:** `APPROVE | REJECT | AMEND` decisions with one-line rationale, written to `.orchestrator/decisions.log`.
- **Never touches code.**

### 1.2 Product Manager Agent — *Sprint runner*
- **Mandate:** Own the sprint backlog. Break PRD into shippable tickets. Run the QA loop until zero bugs.
- **Responsibilities:**
  - Convert PRD sections into tickets in `.orchestrator/backlog.md`
  - Assign tickets to Engineering / UI / Payment agents
  - Receive QA bug reports; re-assign fixes; gate sprint close on zero P0/P1 bugs
  - Surface blockers to the Orchestrator
- **Cannot merge code.** Only the Orchestrator can merge.

### 1.3 System Architect Agent — *Technical coherence*
- **Mandate:** Own the architecture of the token meter, quota middleware, subscription state machine, and PayU integration contract. Every other engineering agent reads the Architect's spec before writing code.
- **Responsibilities:**
  - Produce `.orchestrator/specs/token-meter.md`, `quota-middleware.md`, `subscription-state.md`, `payu-contract.md`
  - Review engineering PRs for architectural drift
  - Sign off on data model changes
- **Veto power on schema changes.**

### 1.4 Backend Engineer Agent — *Server implementation*
- **Scope:** `easebot-backend/src/**`
- **Responsibilities:**
  - Implement `tokenMeter.ts`, `quotaMiddleware.ts`
  - Wire every cost site (chat, image, TTS, STT, vision, Algolia, WhatsApp) to the meter
  - Implement subscription controller (purchase, upgrade, downgrade, cancel, resume)
  - Implement invoice generation (see §8)
  - Never touches Firebase rules. Never deploys.

### 1.5 Frontend Engineer Agent — *React / Vite implementation*
- **Scope:** `Wedding-Ease-Viva-Chat/src/**` (except `pages/settings/` shared zones flagged by UI agent)
- **Responsibilities:**
  - Rewrite `Pricing.tsx` to match PRD (current sketch is $12/$29 — wrong)
  - Build usage-meter component, top-up modal, upgrade flow
  - Wire payment buttons to backend PayU routes
  - Honor the "already has a plan → show upgrade, not buy" logic (see §7)
- **Cannot invent API shapes.** Must consume the Architect's contract.

### 1.6 UI / UX Designer Agent — *Design system + responsive*
- **Scope:** Tailwind tokens, layout primitives, responsive breakpoints, a11y
- **Responsibilities:**
  - Audit pricing/settings/chat flows on mobile (375px), tablet (768px), desktop (1280px), large (1920px)
  - Define the usage-meter visual states (0–74%, 75–89%, 90–99%, 100%, degraded)
  - Approve every new component's dark/light mode and touch-target sizing (min 44px)
  - Sign off that the pricing page is readable / scrollable on a 375×667 iPhone SE without horizontal scroll
- **Rejection power on any UI that fails the responsive matrix.**

### 1.7 QA Agent — *Zero-bug gate*
- **Scope:** Everything. Reads code, runs the use-case catalog, runs edge cases, runs loophole catalog, reports to PM.
- **Responsibilities:**
  - Maintain `.orchestrator/test-matrix.md` (every use case × every tier × every device)
  - Static review: read every PR diff for common bugs (race conditions, missing awaits, wrong types, dead branches, unhandled nulls)
  - Functional review: walk each user flow in §5 and §6 and record PASS / FAIL
  - Loophole hunt: actively try to break each tier's enforcement (see §6)
  - File bugs with severity (P0 blocker → P3 cosmetic) to the PM Agent
  - **The sprint does not close until P0 and P1 bug count = 0.**

### 1.8 Payment Gateway Master Agent — *PayU specialist*
- **Scope:** Everything PayU. Merchant key handling, hash generation, redirect flow, webhook verification, refund flow, invoice emission.
- **Responsibilities:**
  - Own `.orchestrator/specs/payu-contract.md`
  - Implement `paymentController.ts` with `/payment/initiate`, `/payment/webhook`, `/payment/verify`, `/payment/refund`
  - Implement the subscription state machine in coordination with the Architect
  - Implement invoice PDF generation + email delivery
  - **Never** touches Firebase rules. **Never** commits a real merchant key.
- **Solo authority on payment code.** No other agent edits `payment*.ts`.

### 1.9 Orchestrator — *Central coordinator*
- **Mandate:** Single point of truth. Spawns agents, routes messages, enforces guardrails, runs the QA loop, reports to the human.
- See §3 for full protocol.

---

## 2. Reality Check on "Agents Running in Parallel"

**What this plan actually does:** Each agent above is a Claude subagent spawned with a *specific, bounded* prompt and scope. Agents *do not literally talk to each other in real time* — they communicate by writing to shared files under `.orchestrator/` which the Orchestrator reads and routes. This is a well-known pattern (file-based message passing) and is the only way to get reliable multi-agent coordination without a live event bus.

**What "parallel" means here:** When tasks are independent (e.g., Frontend building the pricing page while Backend builds the token meter), the Orchestrator spawns them in a single tool-call batch so they run concurrently. When tasks are dependent (Frontend needs the API shape first), they run sequentially. The Orchestrator computes this dependency graph from the backlog.

**What this plan does NOT promise:** True autonomous multi-agent negotiation. The human (Krish) is the final decision-maker whenever the Orchestrator escalates.

---

## 3. Orchestrator Protocol

### 3.1 Shared state layout
```
.orchestrator/
  backlog.md              # PM-owned ticket list
  decisions.log           # CEO + PM decisions, append-only
  bugs/
    P0-001.md ... P3-NNN.md
  specs/
    token-meter.md
    quota-middleware.md
    subscription-state.md
    payu-contract.md
    invoice-format.md
  test-matrix.md          # QA-owned, checked every sprint close
  sprint-N.md             # current sprint summary
  handoffs/               # inter-agent messages (QA→PM, Architect→Backend, etc.)
```

### 3.2 Message format (handoffs/)
```markdown
---
from: qa
to: pm
severity: P1
sprint: 2
ticket: PAY-014
---
Body of message…
```

### 3.3 The loop
1. **Plan:** PM Agent reads PRD → writes backlog.
2. **Design:** Architect reads backlog → writes specs.
3. **Build:** Backend + Frontend + UI + Payment agents run in parallel, each reading their assigned tickets and the Architect's specs.
4. **Review:** QA Agent runs the full test matrix.
5. **Triage:** Bugs filed → PM assigns fixes.
6. **Fix:** Relevant agent fixes, PM re-queues QA.
7. **Gate:** Loop 4–6 until QA reports 0 P0 + 0 P1.
8. **Sprint close:** Orchestrator writes a summary to the human. Human inspects, decides deploy timing (human deploys — not the Orchestrator).

### 3.4 Escalation triggers
- Any task that would touch Firebase rules → **stop, escalate to human**
- Any task that would touch deploy configs → **stop, escalate to human**
- CEO veto fires twice on same topic → **stop, escalate to human**
- QA cannot reach zero bugs after 3 sprint iterations → **stop, escalate to human**
- Any agent produces conflicting specs with another agent → **Orchestrator resolves via Architect; if unresolved, escalate**

---

## 4. Sprint Plan (4 sprints, QA-gated)

### Sprint 1 — Foundation (spec + scaffolding + cleanup)
- **Cleanup ticket (first, blocks everything else):** grep for `therapist` and `consultant` across the entire repo. Comment out every hit (do not delete). Update `types.ts` Mode union to only `'planner' | 'stylist' | 'knowledge' | 'assistant'`. Verify zero TypeScript errors after.
- **Cleanup ticket:** grep for any `MINI` / `GPT_4O_MINI` / `AZURE_DEPLOYMENT_NAME_MINI` references. If any exist, remove or refuse to add. Everyone runs on the single full GPT-4o deployment.
- Architect: produce all 5 specs + §8.7/8.8/8.9 derived specs (geolocation, currency, checkout form)
- Backend: skeleton `tokenMeter.ts`, `quotaMiddleware.ts` (no enforcement yet)
- Frontend: skeleton `PricingPage`, `UsageMeter`, `UpgradeFlow`, **`GeolocationService`**, **`ExchangeRateService`**, **`currencyFormat.ts`** (no wiring)
- Payment Master: PayU sandbox credentials documented in `.env.example`, hash generation utility, server-side exchange rate lock utility
- UI: responsive token system audit; approve rounding table in §8.8
- QA: build test-matrix.md from §5 + §6 of this plan, add new UCs for currency conversion
- **Exit gate:** specs reviewed, skeletons compile, zero TypeScript errors, zero live references to `therapist`/`consultant`/`mini` in touched files

### Sprint 2 — Wiring (meter live on backend, pricing page live on frontend)
- Backend: wire every cost site to `tokenMeter`; implement daily+monthly enforcement; implement guest counter
- Frontend: complete `PricingPage` with all 4 tiers matching PRD; wire upgrade/buy buttons
- Payment Master: `/payment/initiate` + `/payment/webhook` with signature verification (sandbox only)
- UI: responsive check + dark mode pass
- QA: walk use cases UC-01 through UC-12 (see §5)
- **Exit gate:** 0 P0 bugs, token meter provably enforced on all services

### Sprint 3 — Subscription lifecycle + invoicing
- Backend: subscription state machine (see §7); upgrade/downgrade proration logic
- Payment Master: invoice PDF generation, email delivery via existing `emailService`
- Frontend: "already subscribed" view, upgrade CTA swap, billing history page
- QA: walk use cases UC-13 through UC-25; execute full loophole catalog (§6)
- **Exit gate:** 0 P0 + 0 P1 bugs, every subscription state transition tested

### Sprint 4 — Polish + responsiveness + final QA
- UI: final responsive + a11y sweep across mobile/tablet/desktop/large
- Frontend: toast/banner states, error states, empty states, loading skeletons
- Backend: observability — emit token-meter events to a log for GTM metrics
- QA: full regression of all 25 use cases × 4 tiers × 4 breakpoints. Random-order walkthrough to catch state leakage.
- **Exit gate:** 0 P0 + 0 P1 + <5 P2 bugs. Zero known loopholes. Handoff to human for deploy.

---

## 5. Use Case Catalog (QA must pass all)

Every use case has: **Actor → Trigger → Expected → Loophole-hunt notes.** QA walks each on mobile and desktop, each browser (Chrome, Safari, Firefox), each tier.

### Acquisition / Guest
- **UC-01** Guest opens site, sends first chat message → message succeeds, counter → 1/10
- **UC-02** Guest sends 10th message → message succeeds, 11th blocked with signup CTA
- **UC-03** Guest generates image → counter → 1/3, watermark visible, correct EXIF
- **UC-04** Guest generates 4th image → blocked with signup CTA, partial charge NOT recorded
- **UC-05** Guest uses voice TTS 3 times → 4th blocked (session limit per user edit)
- **UC-06** Guest uses voice STT 3 times → 4th blocked
- **UC-07** Guest uploads vision image 3 times → 4th blocked
- **UC-08** Guest closes tab, reopens → session state cleared, counters persist (via guestId)
- **UC-09** Guest clears cookies → new guestId, counters reset, **IP hash dedupe catches repeat abuse** within same ASN
- **UC-10** Guest tries to access `/reminders`, `/notes`, `/settings/notifications` → redirect to signup
- **UC-11** Guest signup converts mid-session → in-flight chat persists, tier=Free, guest counters archived

### Free tier (logged in)
- **UC-12** Free user sends chat → tokens charged correctly (input 1×, output 4×)
- **UC-13** Free user at 74% monthly pool → no banner
- **UC-14** Free user at 75% monthly pool → soft banner appears
- **UC-15** Free user at 100% monthly → chat disabled, upsell to Pro modal
- **UC-16** Free user hits daily 50k cap at 60% monthly → "resets at midnight UTC" message, monthly cap still has room
- **UC-17** Free user creates 4th reminder → blocked (3 active limit)
- **UC-18** Free user tries to edit Notes → read-only enforced (per PRD edit: no editable or collaborator access)
- **UC-19** Free user views pricing page → sees "Current plan: Free" + "Upgrade to Pro" CTA (no "Buy Free" button)
- **UC-20** Free user at 90% pool generates image → confirm modal ("This will use 16,000 tokens")

### Pro / Pro Max tier
- **UC-21** Pro user sends chat → tokens charged, meter updates in real-time on frontend
- **UC-22** Pro user at 100% monthly → chat **stops cleanly** (no mini fallback), modal offers top-up or wait-until-reset, image gen disabled, voice disabled, history remains readable
- **UC-23** Pro user buys $10 / +2M top-up → tokens added instantly, chat resumes at full quality, no model change
- **UC-24** Pro user views pricing page → "Current plan: Pro" + "Upgrade to Pro Max" + "Cancel subscription" (no "Buy Pro" button)
- **UC-25** Pro Max user at 100% monthly → chat/image/voice stop cleanly, top-up modal offered (max 10/month enforced)
- **UC-25a** Pro Max user buys 10th top-up in same month → success. Attempts 11th → 409 "Monthly top-up limit reached."
- **UC-25b** Pro Max user with unused top-up tokens spanning a monthly reset → top-up tokens persist; monthly pool resets; user has top-up + full new monthly pool available

### Payment / lifecycle (critical)
- **UC-26** User buys Pro → PayU redirect → success → webhook fires → tier=pro within 5s → invoice emailed
- **UC-27** User buys Pro → PayU redirect → cancels → tier stays free → no charge
- **UC-28** User buys Pro → PayU redirect → failure → tier stays free → error banner with retry
- **UC-29** Pro user upgrades to Pro Max mid-cycle → prorated charge (see §7.2) → tier=promax → new invoice with proration line
- **UC-30** Pro Max user downgrades to Pro → downgrade scheduled for period end, not immediate → cancellation prevents auto-downgrade reversal
- **UC-31** Pro user cancels → subscription marked `cancel_at_period_end=true` → access continues until period end → reverts to Free. **Data retained, including images/threads/notes.**
- **UC-32** Pro user cancels then reactivates before period end → `cancel_at_period_end=false` → no new charge
- **UC-33** Pro user requests a refund through support → response: "All sales are final. Your access continues until {periodEnd}; no refund will be issued." Data + reminders continue to work until period end.
- **UC-34** Webhook arrives twice for same transaction (PayU retries) → idempotent, no double-credit
- **UC-35** Webhook signature invalid → rejected, logged, no state change
- **UC-36** User opens pricing page while already on Pro Max → sees "Current plan: Pro Max" + "Cancel subscription" (no upgrade CTA — highest tier, no refund path)
- **UC-37** User tries to buy the same plan they already have → backend rejects with 409 Conflict + frontend message "You're already on this plan"

### Currency / geolocation
- **UC-38** User in India opens pricing page → IP detected → Pro shows "₹1,299/mo" (or current rate rounded per §8.8), Pro Max "₹3,299/mo"
- **UC-39** User in US opens pricing page → currency = USD → prices show verbatim
- **UC-40** User in Germany opens pricing page → EUR, "€13.99/mo" for Pro
- **UC-41** Exchange rate API down when user opens pricing page → fallback to USD display + small banner "Prices shown in USD"
- **UC-42** Exchange rate API down when user clicks Pay → `/payment/initiate` returns 503, frontend shows "Payment temporarily unavailable, try again in a moment." No charge, no partial state.
- **UC-43** User opens pricing at 10am (rate = X), clicks Pay at 11am → server fetches fresh rate at 11am, charges that. Frontend display may have been stale; server is authoritative.
- **UC-44** User on VPN spoofing country → whichever country the IP resolves to is what they see. Accepted behavior; no geolocation anti-abuse in v1.
- **UC-45** User provides Indian GSTIN at checkout → invoice shows CGST/SGST split; payment succeeds; GSTIN printed
- **UC-46** User provides invalid GSTIN → checkout shows inline validation error; cannot proceed until fixed or field cleared
- **UC-47** User in India leaves GSTIN blank → invoice treats as B2C, consolidated 18% GST line, no split
- **UC-48** Non-India user provides a company name but no GSTIN → invoice shows "Bill to: {companyName}", tax line = "N/A"

---

## 6. Loophole & Edge Case Catalog (QA adversarial pass)

Every bullet is a concrete attack or edge case. QA must verify the system handles it.

### Token meter loopholes
- **LH-01** User sends a single prompt with 100k-token context → pre-call estimate must reject if over cap; do not let one call burn the whole pool
- **LH-02** User abuses streaming — disconnects mid-stream → charge for tokens actually generated, not zero and not full
- **LH-03** Concurrent calls race to the meter → atomic Firestore transaction, never double-spend or double-allow
- **LH-04** Clock skew between client and server → server-authoritative time for daily reset
- **LH-05** Negative token values (Azure edge case returning 0 or undefined) → floor at 0, log, never crash
- **LH-06** Image gen call fails after charge → **refund tokens** (reverse the charge)
- **LH-07** User on Free cancels request client-side mid-call → still charged for what Azure used
- **LH-08** Daily reset at midnight UTC while user mid-session → reset cleanly, no partial double-reset

### Subscription / upgrade loopholes
- **LH-09** User buys Pro, immediately upgrades to Pro Max → credit from unused Pro applied; no double-charge. **Not a refund** — credit stays on account if chargeNow ≤ 0.
- **LH-10** User on annual Pro upgrades to Pro Max → credit computed from remaining annual days at daily Pro rate; applied to Pro Max charge; any leftover becomes forward credit against next Pro Max renewal. Forward credits **never refund, never expire.**
- **LH-11** User downgrades mid-cycle → no refund ever; downgrade effective at period end
- **LH-12** User downgrades, then before period end upgrades again → cancel the scheduled downgrade cleanly, no new charge
- **LH-13** User on Pro Max cancels, resubscribes next day → fresh period, no credit games (they cancelled; they forfeited nothing; fresh charge applies)
- **LH-14** User tries to buy Pro while already on Pro → backend 409, frontend never shows the button (double-defense)
- **LH-15** User payment succeeds but webhook is delayed → poll `/payment/verify` from frontend as a fallback; grant tier once verified
- **LH-16** User's subscription renews automatically on annual plan → new invoice, tokens reset, no user action needed
- **LH-17** User's card fails on renewal → **immediate drop to Free.** No grace period. **Data retained in full.** Reminders continue firing (they were created under paid tier). User can re-subscribe any time. Point-to-point, straightforward.
- **LH-18** User demands refund citing "I didn't use it" → denied per no-refund policy. Support points to §6.5 of ToS.
- **LH-19** User charges back via card issuer → evidence pack: token-meter usage log + PayU receipt + ToS acknowledgement. Admin may issue manual reversal via PayU dashboard to avoid dispute fee; never automated.

### Guest loopholes
- **LH-20** Guest clears cookies repeatedly → IP-hash + ASN dedupe slows them; accept some leakage
- **LH-21** Guest uses private browsing → new guestId, counters reset; intentional leakage (industry standard)
- **LH-22** Guest sends 10 messages in <10 seconds → behavioral flag: "too fast" → soft captcha or temp block
- **LH-23** Guest tries to call `/reminders/create` directly → 401, not 200 with silent no-op
- **LH-24** Guest attempts to set a large history array in request body → server-side truncation to 10 messages (current limit)

### Payment / PayU-specific
- **LH-25** User tampers with price in the PayU form → server-side validation: reject if amount ≠ server's expected amount
- **LH-26** User replays a successful webhook → idempotency key on `txnid`; second replay is no-op
- **LH-27** PayU returns unexpected status codes → documented mapping; unknown status → manual review queue
- **LH-28** User closes tab during PayU redirect → recovery flow: `/payment/verify?txnid=` resolves state
- **LH-29** Hash collision / tampered hash → reject with 400, log security event
- **LH-30** Invoice PDF generation fails → payment still succeeds; queue retry for invoice; never block tier grant on invoice

### Currency / geolocation
- **LH-31** User changes VPN between page load and checkout → server re-fetches rate at `/payment/initiate` using their *current* IP; if currency switches, new rate locks; no arbitrage
- **LH-32** User races the exchange rate — opens page when rate is good, pays when rate has moved → server uses rate at `/payment/initiate` moment, not at page load. No stale-quote honoring.
- **LH-33** Exchange rate API returns zero or negative or absurd value → server-side sanity check: reject if `rate ≤ 0` or `rate > 1000× expected`. Fallback: 503.
- **LH-34** Exchange rate API rate-limits us under load → per-minute server-side cache (1 entry per currency); all users in the same minute share a rate
- **LH-35** Geolocation API mis-resolves (e.g., satellite ISP) → user sees unexpected currency; they can click "Change currency" dropdown on pricing page to pick manually. Their manual choice is persisted in localStorage and sent to `/payment/initiate`.
- **LH-36** User manipulates frontend to send `currency=INR` while server geolocation shows `US` → server trusts its own geolocation for the *rate*, but uses the user's currency *choice* for display. Amount charged is always the locked rate × local currency × plan USD price. No arbitrage.
- **LH-37** Invoice rounding drift — e.g., ₹1,299 locally × reverse rate ≠ exactly $14.99 USD → accepted; invoice shows both lines honestly ("₹1,299 = approx $14.85 at 1 USD = ₹87.48"). Users understand currency math.

### UI / frontend loopholes
- **LH-38** User on tiny mobile (320px) → pricing page must still be readable and scrollable
- **LH-39** User with slow connection → skeleton states, no infinite spinners
- **LH-40** User with dark mode → every new component styled
- **LH-41** User with accessibility tools → focus order, aria labels, 44px touch targets
- **LH-42** Usage meter shows stale data → SWR revalidation on focus, always trust server on payment events

### Data / state loopholes
- **LH-43** Firebase custom claim stale after upgrade → force `getIdToken(true)` on frontend after payment success
- **LH-44** User with two browser tabs — upgrades in tab A, tab B still shows old tier → tab B revalidates on visibility change
- **LH-45** User deletes account mid-subscription → cancel subscription first, then delete; never orphan an active billing relationship
- **LH-46** Downgraded user tries to create 4th reminder (had 10 on Pro) → new-creation blocked at 3; **existing 10 continue to fire**; UI makes the split clear ("You have 10 active reminders; Free tier allows 3 new")
- **LH-47** Downgraded user tries to view old Pro-era image → succeeds (read access retained indefinitely)

---

## 7. Subscription State Machine (Architect's spec summary)

### 7.1 States
```
  guest
    ↓ (signup)
  free ──────────────┐
    ↓ (buy pro)      │
  pro ──────────┐    │
    ↓ (upgrade) │    │
  pro_max       │    │
    ↓ (cancel)  │    │
  pro_max_cancel_scheduled
    ↓ (period end)
  free
```

### 7.2 Upgrade rules (the "already has a plan" logic)

| User's current plan | What pricing page shows |
|---|---|
| **Guest** | All 4 cards; "Sign up for free" CTA on Free; "Sign up & subscribe" on Pro / Pro Max |
| **Free** | "Current plan: Free" badge on Free card (no button); "Upgrade to Pro" / "Upgrade to Pro Max" on the other two |
| **Pro (monthly)** | "Current plan" on Pro; "Upgrade to Pro Max" on Pro Max (**prorated**, see below); "Downgrade" link on Free |
| **Pro (annual)** | Same as monthly, but upgrade converts remaining days to Pro Max days |
| **Pro Max** | "Current plan" on Pro Max; "Downgrade to Pro" (scheduled for period end); "Cancel subscription" |

**Critical rule:** The buy button is **never** shown for a plan the user already has. Backend enforces this with a 409 Conflict if someone bypasses the UI. This is double-defense — UC-37 tests both layers.

### 7.3 Proration formula (upgrade Pro → Pro Max)

```
daysRemaining = daysBetween(today, currentPeriodEnd)
periodLength  = daysBetween(currentPeriodStart, currentPeriodEnd)
unusedFraction = daysRemaining / periodLength

proCredit     = proPrice * unusedFraction
proMaxFull    = proMaxPrice
chargeNow     = proMaxFull - proCredit   // floor at 0
```

**LOCKED decision (new period starts now):** On upgrade, the new Pro Max period starts today with a fresh 30-day or 365-day clock. The unused Pro credit is computed by the formula above and applied to the Pro Max charge (never as a refund — refunds don't exist). If `chargeNow ≤ 0` (unusual but possible on annual → monthly mismatches), the upgrade is free and no payment is initiated; just a subscription state transition.

**Annual Pro → Pro Max (resolves prior Q7):** Same rule. Remaining annual days are valued at the annual Pro daily rate, converted to a credit, subtracted from the Pro Max price. A user 6 months into annual Pro ($119) upgrading to monthly Pro Max ($39) gets ~$59.50 credit against the $39 → upgrade is free for 1 month and ~$20.50 sits on the account as a **forward credit** applied to the next Pro Max renewal. Forward credits never expire, never refund.

Token pool on upgrade: **reset to Pro Max limits immediately.** Any unused Pro token pool is *not* transferred — the user wanted more tokens, they now have them.

### 7.4 Cancel / reactivate / renew-fail (per §6.5 of PRD — no refunds, no grace)

- **Cancel at any time:** sets `cancel_at_period_end=true`. **No refund ever.**
- **Access until period end:** user keeps their tier and full token pool until the period ends.
- **Reactivate before period end:** flip `cancel_at_period_end=false`. No new charge.
- **Period end:** tier → free, tokens reset to free limits. **Data retained indefinitely.** Existing reminders created on the paid tier continue to fire (not paused, not deleted). New reminders are subject to Free limits.
- **Renewal card fails:** tier → free **immediately** on the failed-charge event. No 3-day grace, no dunning retries. Point-to-point. User can re-subscribe any time; re-subscription is a fresh `purchase`, new period, new invoice. Data retained indefinitely; old reminders keep firing (LH-17).

---

## 8. PayU Integration Spec (Payment Master's domain)

### 8.1 Why PayU (user's choice)
PayU is a major Indian gateway with global reach, supports INR + multi-currency, supports subscriptions via "PayU Money SI" (Standing Instructions) mandate flow, and has a well-documented hash-based integrity model.

### 8.2 Environment variables (`.env.example` only — never commit real keys)
```
# PayU
PAYU_MERCHANT_KEY=
PAYU_MERCHANT_SALT=
PAYU_BASE_URL=https://test.payu.in   # sandbox
PAYU_WEBHOOK_SECRET=
PAYU_RETURN_URL=http://localhost:5173/payment/return
PAYU_FAILURE_URL=http://localhost:5173/payment/failure

# Currency / geolocation (frontend — Vite)
VITE_EXCHANGE_RATE_API_KEY=
VITE_IP_GEOLOCATION_API_KEY=f92eea25a17246a09563543976ca23d7  # placeholder default; replace in prod

# Backend-side rate lock (server fetches USD→local rate at /payment/initiate)
EXCHANGE_RATE_API_KEY=        # server-side mirror of VITE_ key, scoped to backend

# Easebot legal entity — printed on every invoice as the seller
LEGAL_ENTITY_NAME=            # e.g. "Easebot Technologies Pvt Ltd"
LEGAL_ENTITY_ADDRESS_LINE_1=
LEGAL_ENTITY_ADDRESS_LINE_2=
LEGAL_ENTITY_CITY=
LEGAL_ENTITY_STATE=
LEGAL_ENTITY_POSTAL_CODE=
LEGAL_ENTITY_COUNTRY=         # ISO 2-letter, e.g. IN, US
LEGAL_ENTITY_GSTIN=           # only if Indian entity, else leave blank
LEGAL_ENTITY_PAN=             # optional
LEGAL_ENTITY_SUPPORT_EMAIL=   # printed on invoice footer
LEGAL_ENTITY_WEBSITE=         # e.g. https://easebot.app
```

**Policy:** `invoiceTemplate.ts` reads these at startup. If `LEGAL_ENTITY_NAME` is empty, invoice generation throws a startup error — we never emit an invoice with a missing seller block. This is enforced in code, not docs.

### 8.3 Routes (backend — Payment Master agent only)
| Route | Method | Purpose |
|---|---|---|
| `/payment/initiate` | POST | Auth required. Body: `{ plan, billingCycle, companyName?, gstin? }`. **Fetches live USD→local rate, locks it, stores on `payments/{txnid}`**, returns PayU form params + hash. |
| `/payment/return` | POST | PayU → backend. Verifies hash. Updates subscription. Redirects to frontend success page. |
| `/payment/webhook` | POST | Out-of-band confirmation. Idempotent on `txnid`. Final source of truth. |
| `/payment/verify` | GET | Frontend polls this with `txnid` if webhook is delayed. |
| `/payment/subscription/cancel` | POST | Sets `cancel_at_period_end=true`. **No refund.** |
| `/payment/subscription/reactivate` | POST | Flips cancel flag off. |
| `/payment/subscription/upgrade` | POST | Initiates upgrade flow with credit calculation (§7.3). |
| `/payment/topup` | POST | One-shot $10 / +2M tokens purchase. Cap: max 10 successful top-ups per user per calendar month. |

**Intentionally absent:** `/payment/refund`. User-facing refund does not exist. If a chargeback dispute requires refunding, an admin performs it manually via PayU dashboard — no automation, no code path the frontend can call.

### 8.4 Hash generation (MUST match PayU's formula exactly)
```
hash = sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
```
- Generated server-side only. Never in the browser.
- `udf1` = `uid`, `udf2` = `plan`, `udf3` = `billingCycle`, `udf4` = `upgradeFromPlan` (or empty), `udf5` = reserved.
- On return, recompute the reverse hash and **reject on mismatch** (LH-28).

### 8.5 Webhook idempotency
- Every webhook payload has `txnid`. Backend keeps a `payments/{txnid}` Firestore doc.
- If doc exists AND state is final → no-op, return 200.
- If doc exists but state is pending → update.
- If doc does not exist → create, update subscription, emit invoice.

### 8.6 Security checklist (QA verifies)
- Server-side amount verification (LH-25): never trust the amount posted back
- Hash signature verification on both return AND webhook (LH-29)
- HTTPS only (enforced at framework level — no code change needed)
- Webhook IP allowlist (document PayU's IPs in `.env.example`)
- Rate limiting on all payment routes (extend existing `express-rate-limit`)
- No sensitive data in logs — redact `email`, `txnid` partial

### 8.7 Geolocation & Currency Services (Frontend + Backend)

Two thin service classes. Frontend renders localized; backend is authoritative at checkout.

**`src/services/GeolocationService.ts`** (Frontend, Vite)
```ts
class GeolocationService {
  private static readonly API_BASE_URL = 'https://api.ipgeolocation.io/ipgeo';
  private static readonly API_KEY = import.meta.env.VITE_IP_GEOLOCATION_API_KEY || 'f92eea25a17246a09563543976ca23d7';

  static async detect(): Promise<{ countryCode: string; currencyCode: string }> {
    // fetch, cache in localStorage for 24h, fall back to 'US' / 'USD' on error
  }
}
```

**`src/services/ExchangeRateService.ts`** (Frontend, Vite)
```ts
class ExchangeRateService {
  private static readonly API_BASE_URL = 'https://v6.exchangerate-api.com/v6';
  private static readonly API_KEY = import.meta.env.VITE_EXCHANGE_RATE_API_KEY || '';

  static async getRate(from: 'USD', to: string): Promise<number> {
    // GET {BASE}/{KEY}/pair/{from}/{to}, cache for 1h in localStorage
  }
  static convert(amountUSD: number, rate: number): number { /* round per §8.8 */ }
}
```

**`easebot-backend/src/services/exchangeRateService.ts`** (Backend — authoritative)
- Mirrors the frontend call using `EXCHANGE_RATE_API_KEY` (server env).
- Called **only** from `/payment/initiate`. Rate is stamped on `payments/{txnid}` and never recomputed for that transaction.
- If the API is down, **fail the checkout** with a 503 — do not silently fall back to a stale rate. Better to fail than to charge wrong.

### 8.8 Rounding table (Architect owns `services/currencyFormat.ts`)

| Currency | Rule | Example ($14.99 Pro) |
|---|---|---|
| USD | keep `.99` endings | $14.99 |
| INR | nearest ₹49 / ₹99 | ₹1,299 |
| EUR | nearest €0.99 | €13.99 |
| GBP | nearest £0.99 | £11.99 |
| AUD | nearest $0.99 | AU$22.99 |
| CAD | nearest $0.99 | CA$20.99 |
| JPY | nearest ¥100 | ¥2,300 |
| AED | nearest 1 | د.إ 55 |
| SGD | nearest $0.99 | S$19.99 |
| default | `.99` ending in local | — |

Token pool is **identical** across currencies — a Pro user in India gets the same 3M tokens as a Pro user in the US. Localization is display-only; product entitlement is currency-blind.

### 8.9 Checkout form — GST / company fields

Buyer-side tax info, collected on the checkout modal **before** `/payment/initiate` is called:
| Field | Required? | Purpose |
|---|---|---|
| `companyName` | optional | If provided, printed on invoice as "Bill to: {companyName}" (otherwise `displayName`) |
| `gstin` | optional | If provided AND user is in India, invoice shows GST breakdown and GSTIN. Validated against the standard 15-char GSTIN regex |
| `billingAddress` | required | Country, state/region, postal code. Used for tax computation and PayU's KYC |

These fields are stored on the `payments/{txnid}` doc and copied into the resulting `invoices/{invoiceId}` doc. They are **not** stored on the user profile — a user might buy for themselves one month and for a client the next. Each checkout is its own billing entity.

**Easebot's own legal entity** (name + GSTIN + registered address) is hard-coded in `services/invoiceTemplate.ts` and appears on every invoice as the **seller**. This is a one-time config set by the human operator; the agents do not invent or guess this information. Open to-do for human: provide the legal entity details.

---

## 9. Invoicing Spec

### 9.1 Generated when
- Purchase success (new subscription)
- Renewal success (auto)
- Upgrade success (separate invoice with credit line from §7.3)
- Top-up purchase ($10 / +2M tokens)

**Not generated for refunds** — refunds don't exist. Admin-issued chargeback reversals (§8.3) are handled manually, out-of-band.

### 9.2 Fields
```
Invoice #:          EB-YYYYMM-NNNNNN  (monotonic per month)
Date:               ISO date
Seller:             {Easebot legal entity, address, GSTIN}  ← hard-coded config
Bill to:            companyName OR displayName
                    billingAddress (country, state, postal)
                    email
Buyer GSTIN:        (shown only if provided at checkout)
Plan:               Pro | Pro Max | Top-up
Period:             startDate → endDate (blank for top-ups)
Subtotal (local):   {amount in user's local currency}
USD equivalent:     ${amount in USD, as an FYI line}
Exchange rate:      1 USD = X LOCAL (captured at checkout)
Tax:                - IF buyer in India AND GSTIN provided → GST 18% with CGST/SGST or IGST split
                    - IF buyer in India AND no GSTIN → GST 18% as consolidated B2C
                    - ELSE → "Tax: N/A" (user's jurisdiction, not Easebot's problem)
Total:              subtotal + tax in local currency
Payment method:     PayU — last 4 digits (from gateway response, if available)
Transaction ID:     txnid
Status:             PAID
Notes:              (credit line if upgrade; "Top-up tokens never expire" for top-ups)
```

**Tax disclaimer:** Tax handling beyond Indian GST is out of scope for v1. The plan does not compute VAT, sales tax, or any jurisdictional tax outside India. The invoice shows "Tax: N/A" for non-India and notes that the buyer is responsible for their own jurisdiction. This is a product decision to avoid over-scoping — a real tax engine (Stripe Tax, TaxJar, Quaderno) is v2 work.

### 9.3 Format
- PDF generated server-side (e.g., `pdfkit` or `puppeteer-core` — Architect picks)
- Stored in Firestore `invoices/{invoiceId}` with a signed URL for download
- Emailed via existing `emailService.ts` on generation
- Accessible from frontend: `/settings/billing` → "Download invoice"

### 9.4 Invoice ≠ payment gate
**Rule:** Invoice generation is async and MUST NOT block tier grant. If PDF fails, tier is still granted; invoice is queued for retry (LH-30).

---

## 10. Responsive Matrix (UI Agent owns)

Every page / component must pass on:

| Breakpoint | Width | Primary device | Test |
|---|---|---|---|
| Mobile S | 320 px | iPhone SE 1st gen | Pricing page scrollable, buttons tappable |
| Mobile M | 375 px | iPhone SE 2/3, 13 mini | Chat composer + usage meter readable |
| Mobile L | 414 px | iPhone 14/15 Pro | All above |
| Tablet | 768 px | iPad Mini portrait | Pricing cards 2-col |
| Laptop | 1024 px | small laptop | Pricing cards 3-col |
| Desktop | 1280 px | default | 4-col (if 4 tiers shown) or 3-col with guest promo |
| Large | 1920 px | large monitor | Max-width container; no stretching |

Per-component checks:
- **Pricing page** — no horizontal scroll; CTA buttons min 44px tall; all 4 tiers visible above the fold on desktop
- **Usage meter** — visible in chat header on all breakpoints; compact on mobile
- **Upgrade modal** — closable, focus-trapped, scrollable
- **Invoice download page** — table responsive (stacks on mobile)
- **Dark mode** — every new component has both themes

---

## 11. Definition of Done (zero-bug gate)

A ticket / sprint / feature is **Done** only when all are true:

1. Code compiles with zero TypeScript errors and zero warnings in touched files
2. Backend unit + integration tests pass for every new module (QA writes tests alongside features)
3. Every UC-## in §5 relevant to the ticket is PASS in the test matrix
4. Every LH-## in §6 relevant to the ticket is VERIFIED (hand-written note of "how I tried to break it and couldn't")
5. Responsive matrix §10 passed on all 7 breakpoints
6. No hardcoded secrets (grep confirms)
7. No Firebase rules / deploy config touched (grep confirms)
8. CEO Agent has not vetoed
9. Architect Agent has signed off on any schema change
10. PM Agent closes the ticket

---

## 12. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| PayU sandbox differs from prod in edge cases | Medium | High | Payment Master writes contract tests; human does final smoke test in prod sandbox before go-live |
| Token meter race condition under load | Medium | High | Firestore transactions + idempotency keys; QA load test |
| Azure cost model changes mid-sprint | Low | Medium | Conversion table in §3.2 of PRD is a single source of truth; update in one place |
| Invoice PDF generation slow / hangs | Medium | Low | Async queue, never blocks tier grant (LH-29) |
| Custom-claim refresh lag on frontend | High | Medium | Force `getIdToken(true)` after payment success |
| WhatsApp reminder cost spike | Low | Medium | Per-send token charge (2,000 tokens) naturally caps abuse |
| Users on unsupported region | Medium | Low | Graceful "not available in your region" message, fallback email support |
| Guest abuse via cookie clearing | High | Low | Accept; industry standard; IP hash slows it |

---

## 13. Go-to-Market Checklist (human runs on deploy day)

Not an agent task — listed here for the human:
- [ ] PayU production keys placed in production `.env`
- [ ] Firebase project has prod + staging separated (already assumed)
- [ ] Stripe/PayU webhook URL registered with correct secret
- [ ] Email sending domain SPF/DKIM verified (for invoice delivery)
- [ ] GST / tax configured in invoice template for correct jurisdiction
- [ ] Terms of Service + Privacy Policy updated to mention token pool + refund policy
- [ ] Pricing page meta tags for SEO (title, description, OG image)
- [ ] Analytics events wired: `guest_signup`, `free_upgrade_pro`, `pro_upgrade_promax`, `payment_success`, `payment_failure`, `cap_hit_monthly`, `cap_hit_daily`
- [ ] Monitoring alert: "Azure cost anomaly" (guards against LH-03 catastrophic failure)
- [ ] Customer-support email / help doc mentioning cap behavior + top-up

---

## 13.5 Architect Decisions — Locked (Sprint 1 close-out)

Four items were deferred to the architect during Sprint 1 planning. All four are now locked.

| # | Decision | Chosen path | Why |
|---|---|---|---|
| **D1** | `authMiddleware.ts` tier read path | **Firestore tier mirror** (`users/{uid}.tierMirror`). Written by the state machine transactionally. Middleware reads it with a 60s in-process cache. Custom claim remains an optional fast-path for later. | Removes IAM dependency (Firebase Auth Admin role) from the Sprint 1–3 critical path. Keeps ship unblocked by Guardrail 2. |
| **D2** | Legacy `usageService.ts` | **Delete.** It was the per-request-count scaffolding from the pre-pricing era. Token meter replaces it wholesale. Backend agent removes the file and any imports in Sprint 2 CLN-003. | No caller survives the token-meter migration. Leaving it in risks double-counting during Sprint 2 wiring. |
| **D3** | GST handling when seller entity is not Indian | **Fall through to `INTL_NA` invoice branch** unconditionally. The `LEGAL_ENTITY_COUNTRY` env var is the switch: if `!= 'IN'`, every invoice uses the international (no-GST) template regardless of buyer location. | Honest reflection of legal reality — a non-Indian entity cannot collect GST. Buyer's INR locale does not change the seller's tax obligation. Invoice spec §9 already handles this branch. |
| **D4** | Guest cleanup mechanism | **Default to native Firestore TTL** on `guests/{guestId}.ttlExpiresAt` (listed 🟡 in `FIREBASE_CONSOLE_CHECKLIST.md` §3.1). **Fallback:** Sprint 2 adds an in-process `guestCleanupCron.ts` that runs every 6 hours and deletes docs where `lastSeenAt < now - 7d`. The fallback ships regardless — TTL is additive and zero-cost when both are active (TTL runs first, cron scans an already-clean collection). | TTL is free and Firestore-native but requires a console click. The fallback cron guarantees ship even if the console step slips. |

**Grace period:** explicitly removed from every spec (PRD §6.5, EXECUTION_PLAN §7.4, subscription-state.md §8). Point-to-point: renew fails → immediate drop to free, data retained, old reminders keep firing. See LH-17.

---

## 14. What Happens Next (the moment after you approve this plan)

1. **Human (you) approves this plan** or requests amendments.
2. **Orchestrator creates `.orchestrator/` folder structure.**
3. **PM Agent writes `backlog.md`** from PRD + this plan's §4 sprint list.
4. **Architect Agent writes all 5 specs** into `.orchestrator/specs/`. **Sprint 1 begins.**
5. **No code is shipped, no Firebase is touched, nothing is deployed.** Every sprint gate passes through you.

**You say "go" — I spawn the agents.**

---

**End of plan.**
