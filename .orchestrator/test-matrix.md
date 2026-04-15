# QA Test Matrix — Easebot Sprint Program

This is the QA test matrix. Every sprint close requires each relevant row marked [PASS] or [FAIL]. Failures become bug tickets under `.orchestrator/bugs/`. Rows are drawn verbatim from `EXECUTION_PLAN.md` §5 (use cases), §6 (loopholes), and §10 (responsive matrix), plus `PRICING_PRD.md` §8 tier constraints. Status values: `PENDING`, `PASS`, `FAIL`, `BLOCKED`, `N/A`.

---

## Section 2 — Use Case Checklist

### Acquisition / Guest

- [ ] **UC-01** Guest opens site, sends first chat message → counter 1/10
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-02** Guest sends 10th message → succeeds; 11th blocked with signup CTA
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-03** Guest generates image → counter 1/3, watermark visible, correct EXIF
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-04** Guest generates 4th image → blocked with signup CTA; partial charge NOT recorded
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-05** Guest uses voice TTS 3 times → 4th blocked (session limit)
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-06** Guest uses voice STT 3 times → 4th blocked
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-07** Guest uploads vision image 3 times → 4th blocked
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-08** Guest closes tab, reopens → session cleared, counters persist via guestId
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-09** Guest clears cookies → new guestId; IP-hash ASN dedupe catches repeat abuse
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-10** Guest hits `/reminders`, `/notes`, `/settings/notifications` → redirect to signup
  - Tiers: Guest
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-11** Guest signs up mid-session → in-flight chat persists, tier=Free, guest counters archived
  - Tiers: Guest → Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -

### Free tier (logged in)

- [ ] **UC-12** Free user sends chat → tokens charged (input 1×, output 4×)
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-13** Free user at 74% monthly pool → no banner
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-14** Free user at 75% monthly pool → soft banner appears
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-15** Free user at 100% monthly → chat disabled, upsell-to-Pro modal
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-16** Free user hits daily 50k cap at 60% monthly → "resets at midnight UTC" message; monthly still has room
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-17** Free user creates 4th reminder → blocked (3 active limit)
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-18** Free user tries to edit Notes → read-only enforced
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-19** Free user views pricing page → "Current plan: Free" + "Upgrade to Pro" CTA (no "Buy Free")
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-20** Free user at 90% pool generates image → confirm modal ("This will use 16,000 tokens")
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -

### Pro / Pro Max tier

- [ ] **UC-21** Pro user sends chat → tokens charged; meter updates real-time on frontend
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-22** Pro user at 100% monthly → chat stops cleanly (no mini fallback); top-up / wait modal; image+voice disabled; history readable
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-23** Pro user buys $10 / +2M top-up → tokens added instantly; chat resumes full quality; no model change
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-24** Pro user views pricing page → "Current plan: Pro" + "Upgrade to Pro Max" + "Cancel subscription"
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-25** Pro Max user at 100% monthly → chat/image/voice stop cleanly; top-up modal (max 10/month)
  - Tiers: Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-25a** Pro Max user buys 10th top-up same month → success; 11th → 409 "Monthly top-up limit reached"
  - Tiers: Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-25b** Pro Max user with unused top-up spanning monthly reset → top-up persists; monthly pool resets
  - Tiers: Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -

### Payment / lifecycle

- [ ] **UC-26** User buys Pro → PayU success → webhook → tier=pro within 5s → invoice emailed
  - Tiers: Free → Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-27** User buys Pro → PayU cancel → tier stays free; no charge
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-28** User buys Pro → PayU failure → tier stays free; error banner with retry
  - Tiers: Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-29** Pro user upgrades to Pro Max mid-cycle → prorated charge per §7.2 → new invoice with proration line
  - Tiers: Pro → Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-30** Pro Max user downgrades to Pro → scheduled for period end; cancellation prevents reversal
  - Tiers: Pro Max → Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-31** Pro user cancels → `cancel_at_period_end=true`; access until period end; reverts to Free; data retained
  - Tiers: Pro → Free
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-32** Pro user cancels then reactivates before period end → `cancel_at_period_end=false`; no new charge
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-33** Pro user requests refund → denied with standard message; access until {periodEnd}
  - Tiers: Pro
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-34** Webhook arrives twice for same txn → idempotent; no double-credit
  - Tiers: any
  - Devices: backend-only
  - Status: PENDING
  - Bug: -
- [ ] **UC-35** Webhook signature invalid → rejected, logged, no state change
  - Tiers: any
  - Devices: backend-only
  - Status: PENDING
  - Bug: -
- [ ] **UC-36** Pro Max user views pricing → "Current plan: Pro Max" + "Cancel subscription" only
  - Tiers: Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-37** User tries to buy same plan they already have → 409 Conflict + "You're already on this plan"
  - Tiers: Pro / Pro Max
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -

### Currency / geolocation

- [ ] **UC-38** India user opens pricing → Pro ₹1,299, Pro Max ₹3,299 (rounded per §8.8)
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-39** US user opens pricing → USD verbatim
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-40** Germany user opens pricing → EUR "€13.99/mo" for Pro
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-41** Exchange rate API down on pricing load → fallback USD + banner "Prices shown in USD"
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-42** Exchange rate API down on `/payment/initiate` → 503; "Payment temporarily unavailable"; no charge
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-43** User opens pricing 10am, pays 11am → server fetches fresh rate at 11am
  - Tiers: any
  - Devices: desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-44** VPN spoofing country → IP-resolved currency shown; accepted behavior
  - Tiers: any
  - Devices: desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-45** India user provides GSTIN at checkout → invoice CGST/SGST split; GSTIN printed
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-46** Invalid GSTIN → inline validation error; cannot proceed
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-47** India user leaves GSTIN blank → invoice B2C; consolidated 18% GST line; no split
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -
- [ ] **UC-48** Non-India user provides company name but no GSTIN → invoice "Bill to: {companyName}"; tax line "N/A"
  - Tiers: any
  - Devices: mobile (375px), desktop (1280px)
  - Status: PENDING
  - Bug: -

---

## Section 3 — Loophole Checklist

### Token meter

- [ ] **LH-01** Single 100k-token prompt rejected pre-call
  - How to test: send a prompt with 100k tokens of context as a Free user
  - Status: PENDING
  - Bug: -
- [ ] **LH-02** Streaming disconnect mid-response → charged for tokens actually generated
  - How to test: start a long stream and kill the TCP socket halfway
  - Status: PENDING
  - Bug: -
- [ ] **LH-03** Concurrent calls race to the meter → atomic Firestore transaction; no double-spend
  - How to test: fire 20 parallel chat requests for the same user at 99% of pool
  - Status: PENDING
  - Bug: -
- [ ] **LH-04** Clock skew between client and server → server-authoritative time for daily reset
  - How to test: set client clock forward 24h and confirm reset does not trigger early
  - Status: PENDING
  - Bug: -
- [ ] **LH-05** Azure returns 0/undefined token count → floor at 0; log; never crash
  - How to test: mock Azure usage field as undefined and verify graceful handling
  - Status: PENDING
  - Bug: -
- [ ] **LH-06** Image gen fails after charge → tokens refunded
  - How to test: mock image provider 500 post-charge; verify tokens reversed
  - Status: PENDING
  - Bug: -
- [ ] **LH-07** Free user cancels request client-side mid-call → still charged for Azure usage
  - How to test: abort fetch mid-stream; verify backend still debits
  - Status: PENDING
  - Bug: -
- [ ] **LH-08** Daily reset at midnight UTC mid-session → clean reset; no double-reset
  - How to test: mock clock to 23:59:58 with active session; verify single reset
  - Status: PENDING
  - Bug: -

### Subscription / upgrade

- [ ] **LH-09** Pro → Pro Max same day → credit applied; no double-charge; credit stays if chargeNow ≤ 0
  - How to test: upgrade within minutes of Pro purchase
  - Status: PENDING
  - Bug: -
- [ ] **LH-10** Annual Pro → Pro Max → daily-Pro credit applied; leftover becomes non-refundable forward credit
  - How to test: upgrade an annual Pro account; verify credit ledger entry
  - Status: PENDING
  - Bug: -
- [ ] **LH-11** Downgrade mid-cycle → no refund; effective at period end
  - How to test: downgrade Pro Max → Pro mid-cycle; verify effective date
  - Status: PENDING
  - Bug: -
- [ ] **LH-12** Downgrade then upgrade again before period end → scheduled downgrade cancelled; no new charge
  - How to test: schedule downgrade then re-select higher tier
  - Status: PENDING
  - Bug: -
- [ ] **LH-13** Pro Max cancel then resubscribe next day → fresh period; fresh charge
  - How to test: cancel, wait past access end, resubscribe
  - Status: PENDING
  - Bug: -
- [ ] **LH-14** Buy Pro while already on Pro → backend 409; frontend hides button
  - How to test: call `/payment/initiate` with current plan
  - Status: PENDING
  - Bug: -
- [ ] **LH-15** Payment succeeded but webhook delayed → frontend poll `/payment/verify` grants tier
  - How to test: block webhook; verify poll-based grant
  - Status: PENDING
  - Bug: -
- [ ] **LH-16** Annual subscription auto-renews → new invoice, tokens reset
  - How to test: fast-forward subscription period end
  - Status: PENDING
  - Bug: -
- [ ] **LH-17** Card fails on renewal → **immediate** drop to Free (no grace, point-to-point); data retained; reminders fire
  - How to test: simulate renewal failure webhook; verify tierMirror flips to 'free' in the same transaction, token meter resets to Free caps, existing reminders still fire
  - Status: PENDING
  - Bug: -
- [ ] **LH-18** User demands refund "I didn't use it" → denied per policy
  - How to test: support process check
  - Status: PENDING
  - Bug: -
- [ ] **LH-19** Chargeback evidence pack → usage log + PayU receipt + ToS ack; manual reversal only
  - How to test: verify admin evidence export route
  - Status: PENDING
  - Bug: -

### Guest

- [ ] **LH-20** Guest clears cookies repeatedly → IP-hash + ASN dedupe limits abuse
  - How to test: clear cookies 5× in same ASN
  - Status: PENDING
  - Bug: -
- [ ] **LH-21** Guest private browsing → new guestId; counters reset (intentional)
  - How to test: private window session
  - Status: PENDING
  - Bug: -
- [ ] **LH-22** Guest sends 10 messages in <10s → behavioral flag → soft captcha / temp block
  - How to test: scripted burst from single guestId
  - Status: PENDING
  - Bug: -
- [ ] **LH-23** Guest calls `/reminders/create` directly → 401
  - How to test: unauthenticated curl to endpoint
  - Status: PENDING
  - Bug: -
- [ ] **LH-24** Guest sends large history array → server truncates to 10 messages
  - How to test: send 100-message history in body
  - Status: PENDING
  - Bug: -

### Payment / PayU

- [ ] **LH-25** User tampers with PayU form price → server validates; rejects mismatch
  - How to test: intercept form and change `amount`
  - Status: PENDING
  - Bug: -
- [ ] **LH-26** Replay successful webhook → idempotency on `txnid`; no-op
  - How to test: replay same webhook body
  - Status: PENDING
  - Bug: -
- [ ] **LH-27** PayU returns unexpected status → manual review queue
  - How to test: mock unknown status code from PayU
  - Status: PENDING
  - Bug: -
- [ ] **LH-28** Tab closed during PayU redirect → `/payment/verify?txnid=` resolves state
  - How to test: close tab mid-redirect then revisit verify route
  - Status: PENDING
  - Bug: -
- [ ] **LH-29** Hash collision / tampered hash → 400; security event logged
  - How to test: submit webhook with bad hash
  - Status: PENDING
  - Bug: -
- [ ] **LH-30** Invoice PDF generation fails → payment still succeeds; invoice queued for retry
  - How to test: mock PDF service 500; verify tier grant not blocked
  - Status: PENDING
  - Bug: -

### Currency / geolocation

- [ ] **LH-31** VPN change between load and checkout → `/payment/initiate` re-fetches rate with current IP
  - How to test: toggle VPN between page load and checkout
  - Status: PENDING
  - Bug: -
- [ ] **LH-32** User races exchange rate → server uses rate at `/payment/initiate`, not page load
  - How to test: force rate change between load and pay
  - Status: PENDING
  - Bug: -
- [ ] **LH-33** FX API returns zero/negative/absurd → server sanity-check; 503 fallback
  - How to test: mock FX to return 0 and 100000
  - Status: PENDING
  - Bug: -
- [ ] **LH-34** FX API rate-limits under load → per-minute server cache; shared rate
  - How to test: fire 1000 rps; verify single upstream call per minute per currency
  - Status: PENDING
  - Bug: -
- [ ] **LH-35** Geolocation mis-resolves → user can manually change currency; choice persisted in localStorage
  - How to test: force satellite-ISP mock geolocation
  - Status: PENDING
  - Bug: -
- [ ] **LH-36** Frontend sends currency=INR while server geolocates US → server uses its own geolocation for rate
  - How to test: tamper frontend currency post-geolocate
  - Status: PENDING
  - Bug: -
- [ ] **LH-37** Invoice rounding drift → both lines shown honestly
  - How to test: inspect invoice PDF for dual-currency line
  - Status: PENDING
  - Bug: -

### UI / frontend

- [ ] **LH-38** 320px mobile → pricing page readable and scrollable
  - How to test: emulate 320px viewport
  - Status: PENDING
  - Bug: -
- [ ] **LH-39** Slow connection → skeleton states; no infinite spinners
  - How to test: throttle to Slow 3G in DevTools
  - Status: PENDING
  - Bug: -
- [ ] **LH-40** Dark mode → every new component styled
  - How to test: toggle theme on every new screen
  - Status: PENDING
  - Bug: -
- [ ] **LH-41** Accessibility → focus order, aria labels, 44px touch targets
  - How to test: axe scan + keyboard traversal
  - Status: PENDING
  - Bug: -
- [ ] **LH-42** Stale usage meter → SWR revalidation on focus; always trust server on payment events
  - How to test: blur/focus window after token spend elsewhere
  - Status: PENDING
  - Bug: -

### Data / state

- [ ] **LH-43** Firebase custom claim stale after upgrade → frontend `getIdToken(true)` on payment success
  - How to test: verify tier claim refresh post-upgrade
  - Status: PENDING
  - Bug: -
- [ ] **LH-44** Two tabs — upgrade in A, tab B shows old tier → tab B revalidates on visibility change
  - How to test: open two tabs; upgrade in one
  - Status: PENDING
  - Bug: -
- [ ] **LH-45** Delete account mid-subscription → cancel first, then delete; no orphan billing
  - How to test: attempt delete while Pro active
  - Status: PENDING
  - Bug: -
- [ ] **LH-46** Downgraded user with 10 reminders → new-creation blocked at 3; existing 10 keep firing
  - How to test: downgrade Pro with 10 reminders; attempt 4th create
  - Status: PENDING
  - Bug: -
- [ ] **LH-47** Downgraded user views old Pro-era image → succeeds (indefinite read)
  - How to test: downgrade then open past image
  - Status: PENDING
  - Bug: -

---

## Section 4 — Responsive Matrix

Breakpoints: 320, 375, 414, 768, 1024, 1280, 1920.

### Pricing page

- [ ] Pricing page @ 320px — no horizontal scroll; CTAs ≥44px; all 4 tiers visible (scroll ok)
- [ ] Pricing page @ 375px — no horizontal scroll; CTAs ≥44px; card stack clean
- [ ] Pricing page @ 414px — no horizontal scroll; CTAs ≥44px; hero readable
- [ ] Pricing page @ 768px — 2-col tier cards; no overlap
- [ ] Pricing page @ 1024px — 3-col tier cards; CTAs aligned
- [ ] Pricing page @ 1280px — 4-col (or 3-col with guest promo); all tiers above the fold
- [ ] Pricing page @ 1920px — max-width container; no stretching

### Chat screen with usage meter

- [ ] Chat + usage meter @ 320px — meter compact, composer usable
- [ ] Chat + usage meter @ 375px — meter readable in header
- [ ] Chat + usage meter @ 414px — meter readable in header
- [ ] Chat + usage meter @ 768px — full meter w/ label
- [ ] Chat + usage meter @ 1024px — full meter w/ label
- [ ] Chat + usage meter @ 1280px — full meter w/ label
- [ ] Chat + usage meter @ 1920px — no stretching; meter aligned

### Checkout modal

- [ ] Checkout modal @ 320px — scrollable, focus-trapped, closable
- [ ] Checkout modal @ 375px — scrollable, focus-trapped, closable
- [ ] Checkout modal @ 414px — scrollable, focus-trapped, closable
- [ ] Checkout modal @ 768px — centered, GST fields visible
- [ ] Checkout modal @ 1024px — centered, GST fields visible
- [ ] Checkout modal @ 1280px — centered, GST fields visible
- [ ] Checkout modal @ 1920px — max-width; not stretched

### Billing settings / invoice download

- [ ] Billing/invoice @ 320px — table stacks to cards; download button tappable
- [ ] Billing/invoice @ 375px — table stacks to cards; download button tappable
- [ ] Billing/invoice @ 414px — table stacks to cards; download button tappable
- [ ] Billing/invoice @ 768px — table readable; columns fit
- [ ] Billing/invoice @ 1024px — full table
- [ ] Billing/invoice @ 1280px — full table
- [ ] Billing/invoice @ 1920px — max-width container

### Upgrade confirmation modal

- [ ] Upgrade confirm @ 320px — scrollable; CTAs ≥44px; proration line visible
- [ ] Upgrade confirm @ 375px — scrollable; CTAs ≥44px; proration line visible
- [ ] Upgrade confirm @ 414px — scrollable; CTAs ≥44px; proration line visible
- [ ] Upgrade confirm @ 768px — centered; focus-trapped
- [ ] Upgrade confirm @ 1024px — centered; focus-trapped
- [ ] Upgrade confirm @ 1280px — centered; focus-trapped
- [ ] Upgrade confirm @ 1920px — max-width; not stretched

### Cap-hit modal

- [ ] Cap-hit modal @ 320px — readable; top-up CTA ≥44px; wait-until-reset copy visible
- [ ] Cap-hit modal @ 375px — readable; top-up CTA ≥44px; wait-until-reset copy visible
- [ ] Cap-hit modal @ 414px — readable; top-up CTA ≥44px; wait-until-reset copy visible
- [ ] Cap-hit modal @ 768px — centered; focus-trapped
- [ ] Cap-hit modal @ 1024px — centered; focus-trapped
- [ ] Cap-hit modal @ 1280px — centered; focus-trapped
- [ ] Cap-hit modal @ 1920px — max-width; not stretched

---

## Section 5 — Cross-cutting checks

- [ ] `tsc --noEmit` passes in backend
- [ ] `tsc --noEmit` passes in frontend
- [ ] No hardcoded secrets (`grep -r "PAYU_" src/` returns only `process.env.`)
- [ ] No `therapist|consultant` live references (per CLN-001)
- [ ] No `MINI|mini-model|gpt-4o-mini` references anywhere in backend source
- [ ] No Firebase rules files modified (`git status firestore.rules storage.rules`)
- [ ] Dark mode pass on every new component
- [ ] a11y: aria labels on usage meter, plan cards, currency selector
- [ ] Legal entity env vars present in `.env.example` (LEGAL_ENTITY_NAME etc.)

---

## Section 6 — Sprint exit gates

- [ ] **Sprint 1** — specs reviewed, skeletons compile, 0 TS errors, 0 live `therapist`/`consultant`/`mini` refs
- [ ] **Sprint 2** — 0 P0 bugs; token meter provably enforced on all services (chat, image, voice, vision)
- [ ] **Sprint 3** — 0 P0 + 0 P1 bugs; every subscription transition tested (Free↔Pro↔ProMax, cancel, reactivate, renewal, renew_fail→immediate free)
- [ ] **Sprint 4** — 0 P0 + 0 P1 + <5 P2 bugs; zero known loopholes (LH-01..LH-47 all PASS)
