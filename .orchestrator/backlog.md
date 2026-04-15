# Easebot Pricing & Billing — Sprint Backlog

This file is the single source of truth for Easebot pricing & billing sprint tickets. It is owned by the PM Agent. Updated only via handoffs from the Orchestrator.

---

## Sprint 1 — Foundation (spec + scaffolding + cleanup)

### CLN-001: Comment out therapist + consultant references across the repo
**Sprint:** 1
**Owner:** Backend Engineer
**Depends on:** (none)
**Blocks:** BE-001, BE-002, BE-010, FE-001
**Acceptance criteria:**
- Grep for `therapist` and `consultant` (case-insensitive) across /Users/krish/Desktop/easebot returns only commented lines or markdown references in PRICING_PRD.md / EXECUTION_PLAN.md
- `easebot-backend/src/types.ts` Mode union is exactly `'planner' | 'stylist' | 'knowledge' | 'assistant'`
- `modeRouter.ts` routing table has therapist + consultant branches commented (not deleted) with `// DO NOT re-enable without product decision — see EXECUTION_PLAN §0 guardrail #7`
- `prompts/therapist.ts` and `prompts/consultant.ts` are fully commented out file-wide but files still exist on disk
- Any frontend mode picker array in Wedding-Ease-Viva-Chat no longer renders therapist/consultant options
- `tsc --noEmit` passes in both `easebot-backend` and `Wedding-Ease-Viva-Chat`
- Existing chat flow (planner/stylist/knowledge/assistant) still resolves correctly in local smoke run
**Files touched:** easebot-backend/src/services/modeRouter.ts, easebot-backend/src/types.ts, easebot-backend/src/controllers/chatController.ts, easebot-backend/src/prompts/therapist.ts, easebot-backend/src/prompts/consultant.ts, Wedding-Ease-Viva-Chat/src/components/chat/* (mode picker), Wedding-Ease-Viva-Chat/src/types/index.ts
**References:** EXECUTION_PLAN.md §0 guardrail #7, §4 Sprint 1 cleanup ticket

---

### CLN-002: Verify no MINI / GPT_4O_MINI / fallback-model references exist
**Sprint:** 1
**Owner:** Backend Engineer
**Depends on:** (none)
**Blocks:** BE-001
**Acceptance criteria:**
- Grep (case-insensitive) for `MINI`, `GPT_4O_MINI`, `AZURE_DEPLOYMENT_NAME_MINI`, `fallbackModel`, `degradedMode` across the repo returns zero live code references
- `easebot-backend/src/services/azureAI.ts` has a single deployment path (no mini branch)
- `.env.example` contains no `*_MINI` variables
- Written note added to `.orchestrator/handoffs/` confirming grep output and files inspected
**Files touched:** easebot-backend/src/services/azureAI.ts (verify only), easebot-backend/.env.example (verify only)
**References:** EXECUTION_PLAN.md §0 guardrail #8, §4 Sprint 1 cleanup ticket

---

### ARCH-001: Produce token-meter, quota-middleware, subscription-state, payu-contract, invoice-format specs
**Sprint:** 1
**Owner:** Architect
**Depends on:** CLN-001, CLN-002
**Blocks:** BE-001, BE-002, BE-003, PAY-001, PAY-002, FE-002
**Acceptance criteria:**
- `.orchestrator/specs/token-meter.md` documents §3.2 conversion table, `chargeTokens` signature, two-bucket (monthlyPool + extrasBucket) consumption order, daily+monthly dual enforcement
- `.orchestrator/specs/quota-middleware.md` documents pre-call estimate → post-call reconcile, 402 response shape `{ reason, resetAt, upgradeUrl }`
- `.orchestrator/specs/subscription-state.md` documents the state machine from §7.1, proration formula §7.3, cancel/reactivate §7.4
- `.orchestrator/specs/payu-contract.md` documents all routes in §8.3, hash formula §8.4, idempotency §8.5
- `.orchestrator/specs/invoice-format.md` documents fields §9.2, tax rules, async non-blocking generation
- All specs cross-reference the relevant UC-## and LH-## ids
**Files touched:** .orchestrator/specs/*.md
**References:** EXECUTION_PLAN.md §4 Sprint 1, §7, §8, §9

---

### BE-001: Scaffold tokenMeter.ts (skeleton, no enforcement)
**Sprint:** 1
**Owner:** Backend Engineer
**Depends on:** CLN-001, CLN-002, ARCH-001
**Blocks:** BE-010, BE-011
**Acceptance criteria:**
- New file `easebot-backend/src/services/tokenMeter.ts` exports `chargeTokens(identity, service, rawCost)` with the signature in PRD §6.1
- Conversion table from PRD §3.2 encoded as a typed constant (chat in 1x, chat out 4x, image 1024 16000, image HD 32000, tts 0.3/char, stt 7000/min, algolia 50, whatsapp 2000, vision 2000)
- Function reads usage doc, returns `{ allowed, remainingDaily, remainingMonthly, remainingExtras, consumedFrom }` but does NOT yet block calls (skeleton mode — logs would-be decisions)
- Floors negative / undefined raw costs at 0 (LH-05)
- `tsc --noEmit` passes
**Files touched:** easebot-backend/src/services/tokenMeter.ts (new)
**References:** PRD §3.2, §6.1, EXECUTION_PLAN.md §4 Sprint 1, LH-05

---

### BE-002: Scaffold quotaMiddleware.ts (skeleton, no enforcement)
**Sprint:** 1
**Owner:** Backend Engineer
**Depends on:** BE-001, ARCH-001
**Blocks:** BE-010, BE-011, BE-012, BE-013
**Acceptance criteria:**
- New file `easebot-backend/src/middleware/quotaMiddleware.ts` exports an Express middleware factory that accepts a service id
- Middleware calls `tokenMeter.chargeTokens` in pre-call mode; on over-limit returns HTTP 402 with `{ reason, resetAt, upgradeUrl }` (log-only in Sprint 1)
- Skeleton supports both authenticated users (req.uid) and guests (req.guestId)
- `tsc --noEmit` passes
**Files touched:** easebot-backend/src/middleware/quotaMiddleware.ts (new)
**References:** PRD §6.2, EXECUTION_PLAN.md §4 Sprint 1

---

### BE-003: Scaffold subscriptionController, paymentController, invoiceService, exchangeRateService
**Sprint:** 1
**Owner:** Backend Engineer
**Depends on:** ARCH-001
**Blocks:** BE-020, BE-021, PAY-001, PAY-002, PAY-010
**Acceptance criteria:**
- New files created as empty-but-typed skeletons: `easebot-backend/src/controllers/subscriptionController.ts`, `easebot-backend/src/controllers/paymentController.ts`, `easebot-backend/src/services/invoiceService.ts`, `easebot-backend/src/services/exchangeRateService.ts`
- Each exports function stubs matching the spec (routes in §8.3, invoice fields in §9.2)
- `exchangeRateService.ts` stub reads `EXCHANGE_RATE_API_KEY` from env (never hardcodes)
- All files compile under `tsc --noEmit`
- No route is registered yet; this is scaffold only
**Files touched:** easebot-backend/src/controllers/subscriptionController.ts (new), easebot-backend/src/controllers/paymentController.ts (new), easebot-backend/src/services/invoiceService.ts (new), easebot-backend/src/services/exchangeRateService.ts (new)
**References:** EXECUTION_PLAN.md §8.3, §8.7, §9, Sprint 1

---

### FE-001: Scaffold PricingPage, UsageMeter, UpgradeFlow, CheckoutModal, BillingSettingsPage
**Sprint:** 1
**Owner:** Frontend Engineer
**Depends on:** CLN-001, UI-001
**Blocks:** FE-010, FE-011, FE-020
**Acceptance criteria:**
- `Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx` rewritten as a typed skeleton rendering 4 tier cards (Guest / Free / Pro / Pro Max) with placeholder copy matching PRD §8 summary table
- New components created as typed skeletons: `src/components/UsageMeter.tsx`, `src/components/UpgradeFlow.tsx`, `src/components/CheckoutModal.tsx`, `src/pages/settings/BillingSettingsPage.tsx`
- No therapist/consultant references anywhere
- `vite build` and `tsc --noEmit` pass
- No buy/upgrade wiring yet — buttons are inert placeholders
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/components/UsageMeter.tsx (new), Wedding-Ease-Viva-Chat/src/components/UpgradeFlow.tsx (new), Wedding-Ease-Viva-Chat/src/components/CheckoutModal.tsx (new), Wedding-Ease-Viva-Chat/src/pages/settings/BillingSettingsPage.tsx (new)
**References:** PRD §8, EXECUTION_PLAN.md Sprint 1

---

### FE-002: Scaffold GeolocationService, ExchangeRateService, currencyFormat.ts
**Sprint:** 1
**Owner:** Frontend Engineer
**Depends on:** ARCH-001
**Blocks:** FE-012, FE-013
**Acceptance criteria:**
- New file `src/services/GeolocationService.ts` implements `detect()` per §8.7 returning `{ countryCode, currencyCode }`, caches 24h in localStorage, falls back to `{ US, USD }` on error
- New file `src/services/ExchangeRateService.ts` implements `getRate('USD', target)` per §8.7, caches 1h in localStorage
- New file `src/services/currencyFormat.ts` implements rounding table §8.8 for USD/INR/EUR/GBP/AUD/CAD/JPY/AED/SGD plus default
- Reads API keys from `import.meta.env.VITE_IP_GEOLOCATION_API_KEY` and `VITE_EXCHANGE_RATE_API_KEY` — no hardcoded secrets
- Unit-level smoke: calling `currencyFormat.format(14.99, 'INR', rate)` returns a string ending in `₹49` or `₹99`
**Files touched:** Wedding-Ease-Viva-Chat/src/services/GeolocationService.ts (new), Wedding-Ease-Viva-Chat/src/services/ExchangeRateService.ts (new), Wedding-Ease-Viva-Chat/src/services/currencyFormat.ts (new)
**References:** EXECUTION_PLAN.md §8.7, §8.8

---

### PAY-001: Populate .env.example with PayU + currency + legal entity blocks
**Sprint:** 1
**Owner:** Payment Gateway Master
**Depends on:** ARCH-001
**Blocks:** PAY-010, PAY-011
**Acceptance criteria:**
- `easebot-backend/.env.example` contains the exact PAYU_* block from EXECUTION_PLAN §8.2: PAYU_MERCHANT_KEY, PAYU_MERCHANT_SALT, PAYU_BASE_URL (default sandbox), PAYU_WEBHOOK_SECRET, PAYU_RETURN_URL, PAYU_FAILURE_URL
- `.env.example` contains EXCHANGE_RATE_API_KEY (backend-side)
- `.env.example` contains full LEGAL_ENTITY_* block (NAME, ADDRESS_LINE_1/2, CITY, STATE, POSTAL_CODE, COUNTRY, GSTIN, PAN, SUPPORT_EMAIL, WEBSITE)
- `Wedding-Ease-Viva-Chat/.env.example` contains VITE_EXCHANGE_RATE_API_KEY and VITE_IP_GEOLOCATION_API_KEY (placeholder only, no real secrets)
- No real keys anywhere in git
**Files touched:** easebot-backend/.env.example, Wedding-Ease-Viva-Chat/.env.example
**References:** EXECUTION_PLAN.md §8.2

---

### PAY-002: Implement PayU hash generation utility + server-side rate lock utility (no routes yet)
**Sprint:** 1
**Owner:** Payment Gateway Master
**Depends on:** PAY-001, BE-003
**Blocks:** PAY-010
**Acceptance criteria:**
- New file `easebot-backend/src/services/payuHash.ts` exports `generateHash(params, salt)` computing `sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)` per §8.4
- Unit test (co-located) verifies known fixture matches PayU's reference hash
- Reverse hash verification function `verifyResponseHash(params, salt)` also exported
- `exchangeRateService.ts` `lockRate(currency)` function implemented — fetches from exchangerate-api, returns `{ rate, fetchedAt }`, throws on rate ≤ 0 or >1000× expected (LH-33)
- No PayU route is mounted yet
**Files touched:** easebot-backend/src/services/payuHash.ts (new), easebot-backend/src/services/exchangeRateService.ts
**References:** EXECUTION_PLAN.md §8.4, LH-33

---

### UI-001: Responsive audit + token system prep for pricing flow
**Sprint:** 1
**Owner:** UI/UX Designer
**Depends on:** (none)
**Blocks:** FE-001, FE-010
**Acceptance criteria:**
- `.orchestrator/specs/responsive-tokens.md` written, listing the 7 breakpoints from EXECUTION_PLAN §10 (320, 375, 414, 768, 1024, 1280, 1920) and their column grids for the pricing page
- Existing Tailwind tokens audited in `Wedding-Ease-Viva-Chat/tailwind.config.*` — note spacing, color, and font-size scales available
- Usage-meter visual states defined for normal / 75% / 90% / 100% (colors, aria labels, copy)
- Touch-target minimum (44px) confirmed for all interactive elements in the pricing flow
- Dark mode color pairs documented for each new component
- Currency rounding table §8.8 approved in writing
**Files touched:** .orchestrator/specs/responsive-tokens.md (new)
**References:** EXECUTION_PLAN.md §10, §8.8

---

### QA-001: Build test-matrix.md from EXECUTION_PLAN §5 and §6
**Sprint:** 1
**Owner:** QA
**Depends on:** ARCH-001
**Blocks:** QA-010, QA-020, QA-030
**Acceptance criteria:**
- `.orchestrator/test-matrix.md` contains one row per UC-01 through UC-48 with columns: id, actor, trigger, expected, tier coverage (guest/free/pro/promax), breakpoints, status
- Matrix contains one row per LH-01 through LH-47 with attack description and verification method
- Matrix currency/geolocation UCs (UC-38..UC-48) include per-currency expected formatted strings
- Status column initialized to "NOT RUN"
- File compiles as valid markdown
**Files touched:** .orchestrator/test-matrix.md (new)
**References:** EXECUTION_PLAN.md §5, §6

---

### QA-002: Sprint 1 exit gate
**Sprint:** 1
**Owner:** QA
**Depends on:** CLN-001, CLN-002, ARCH-001, BE-001, BE-002, BE-003, FE-001, FE-002, PAY-001, PAY-002, UI-001, QA-001
**Blocks:** (Sprint 2 start)
**Acceptance criteria:**
- All Sprint 1 tickets closed
- `tsc --noEmit` passes in both backend and frontend
- `vite build` succeeds for frontend
- Grep confirms zero live therapist/consultant/MINI references
- Grep confirms zero hardcoded secrets
- No firestore.rules / storage.rules / firebase.json deploy config files modified in this sprint
- Sprint 1 summary written to `.orchestrator/sprint-1.md`
**Files touched:** .orchestrator/sprint-1.md (new)
**References:** EXECUTION_PLAN.md §4 Sprint 1 exit gate, §11

---

## Sprint 2 — Wiring (meter live on backend, pricing page live on frontend)

### BE-010: Wire chatController.ts to tokenMeter (input 1x, output 4x)
**Sprint:** 2
**Owner:** Backend Engineer
**Depends on:** QA-002, BE-001, BE-002
**Blocks:** BE-014, QA-010
**Acceptance criteria:**
- Every Azure chat completion call inside `chatController.ts` is wrapped: pre-call estimate via conservative prompt token count, post-call reconcile with actual `prompt_tokens` + `completion_tokens * 4`
- Streaming case (LH-02): if client disconnects mid-stream, charge is reconciled with the tokens actually generated up to that point
- Atomic Firestore transaction used for every `chargeTokens` increment (LH-03)
- Image-gen failure path refunds tokens (LH-06)
- All existing chat tests still pass; new tests cover streaming disconnect and over-limit rejection (UC-12, UC-15, UC-22)
**Files touched:** easebot-backend/src/controllers/chatController.ts, easebot-backend/src/services/tokenMeter.ts
**References:** PRD §3.2, §6.3, UC-12, UC-15, UC-22, LH-02, LH-03, LH-06

---

### BE-011: Wire image generation route to tokenMeter (16k std / 32k HD per 1024)
**Sprint:** 2
**Owner:** Backend Engineer
**Depends on:** BE-010
**Blocks:** QA-010
**Acceptance criteria:**
- Image generation route wraps call with `chargeTokens('image', 16000)` for 1024×1024 standard and `32000` for HD / 1536
- Pre-call estimate blocks request if `remainingMonthly + remainingExtras < cost` with 402 response
- On Azure failure, tokens are not charged (refund path)
- Guest image counter (3 lifetime) enforced in addition to token meter
- UC-03, UC-04, UC-20 pass
**Files touched:** easebot-backend/src/controllers/imageController.ts (or equivalent)
**References:** PRD §3.2, UC-03, UC-04, UC-20, LH-06

---

### BE-012: Wire TTS, STT, vision, Algolia, WhatsApp cost sites to tokenMeter
**Sprint:** 2
**Owner:** Backend Engineer
**Depends on:** BE-010
**Blocks:** QA-010
**Acceptance criteria:**
- TTS route charges `0.3 tokens × character_count`
- STT route charges `7000 tokens × audio_minutes`
- Vision (GPT-4o multimodal) charges `2000 tokens` per image input in addition to chat tokens
- `algoliaProducts.ts` charges `50 tokens` per query
- `whatsappReminderService.ts` charges `2000 tokens` per message on send
- Each cost site has a unit/integration test proving the charge is recorded
**Files touched:** easebot-backend/src/controllers/ttsController.ts, sttController.ts, visionController.ts, easebot-backend/src/services/algoliaProducts.ts, easebot-backend/src/services/whatsappReminderService.ts
**References:** PRD §3.2, §6.6

---

### BE-013: Implement guest counter (IP hash + fingerprint + cookie, 7d TTL)
**Sprint:** 2
**Owner:** Backend Engineer
**Depends on:** BE-002
**Blocks:** QA-010
**Acceptance criteria:**
- New file `easebot-backend/src/services/guestCounter.ts` reads/writes `guests/{guestId}` Firestore doc with `{ msgCount, imgCount, ttsCount, sttCount, visionCount, firstSeenAt, ipHash, lastActivityAt, ttl: 7d }`
- `guestId` derivation: SHA-256 of (signed cookie uuid + ip + user-agent fingerprint hash)
- Middleware attaches `req.guestId` when no auth token present
- Hard caps: 10 messages, 3 images, 3 TTS, 3 STT, 3 vision (per PRD §4.1)
- LH-22: reject if 10 messages sent in <10s (behavioral flag returns 429)
- LH-24: server-side truncation of history array to 10 messages
- UC-01 through UC-11 all pass
**Files touched:** easebot-backend/src/services/guestCounter.ts (new), easebot-backend/src/middleware/guestMiddleware.ts (new)
**References:** PRD §4.1, §6.3, UC-01..UC-11, LH-20, LH-22, LH-23, LH-24

---

### BE-014: Enforce daily + monthly caps with two-bucket consumption order
**Sprint:** 2
**Owner:** Backend Engineer
**Depends on:** BE-010, BE-011, BE-012
**Blocks:** QA-010, BE-020
**Acceptance criteria:**
- `tokenMeter` now blocks (not just logs) on over-limit: returns 402 with `{ reason, resetAt, upgradeUrl }`
- Consumption order: `monthlyPool` drained first, then `extrasBucket`; a single call may split across the boundary
- Daily cap evaluated against combined monthly+extras consumption (top-ups do not bypass daily cap)
- Daily reset at midnight UTC using server-authoritative time (LH-04, LH-08)
- Usage doc schema matches PRD §6.4 exactly
- UC-13, UC-14, UC-15, UC-16, UC-22, UC-25, UC-25b pass
**Files touched:** easebot-backend/src/services/tokenMeter.ts, easebot-backend/src/middleware/quotaMiddleware.ts
**References:** PRD §3.3, §6.1, §6.4, UC-13..UC-16, UC-22, UC-25, UC-25b, LH-04, LH-08

---

### FE-010: Complete PricingPage with Guest/Free/Pro/Pro Max cards matching PRD
**Sprint:** 2
**Owner:** Frontend Engineer
**Depends on:** QA-002, UI-001
**Blocks:** FE-011, FE-012, QA-010
**Acceptance criteria:**
- Pricing.tsx renders exactly 4 cards in order: Guest, Free, Pro ($14.99/mo or $119/yr), Pro Max ($39/mo or $299/yr)
- Every feature row from PRD §8 summary table is present with correct copy
- Monthly/annual billing toggle works for Pro and Pro Max
- "6-month pack" upsell copy present on Pro card per PRD §4.3
- Dark mode supported
- No horizontal scroll at 320px
- Zero references to therapist/consultant/mini
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx
**References:** PRD §8, §4.1..§4.4, UC-19, UC-24, UC-36

---

### FE-011: "Already has a plan" logic on pricing page
**Sprint:** 2
**Owner:** Frontend Engineer
**Depends on:** FE-010
**Blocks:** QA-010
**Acceptance criteria:**
- Guest sees: 4 cards, Sign-up CTAs
- Free user sees: "Current plan: Free" badge on Free card (no button), "Upgrade to Pro" / "Upgrade to Pro Max" on the others
- Pro user sees: "Current plan" badge on Pro, "Upgrade to Pro Max" on Pro Max, "Cancel subscription" link
- Pro Max user sees: "Current plan" on Pro Max, no upgrade CTA, "Cancel subscription" link, no refund messaging
- Buy-same-plan buttons are never rendered (double-defense with backend 409)
- UC-19, UC-24, UC-36, UC-37 pass
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/hooks/useSubscription.ts (new or existing)
**References:** EXECUTION_PLAN.md §7.2, UC-19, UC-24, UC-36, UC-37, LH-14

---

### FE-012: Wire GeolocationService + ExchangeRateService into pricing page
**Sprint:** 2
**Owner:** Frontend Engineer
**Depends on:** FE-002, FE-010
**Blocks:** QA-010
**Acceptance criteria:**
- On pricing page mount, `GeolocationService.detect()` runs, result cached in localStorage 24h
- `ExchangeRateService.getRate('USD', currencyCode)` fetches rate, caches 1h
- Prices rendered using `currencyFormat.format(usdBase, currency, rate)`
- "Change currency" dropdown present; manual choice persisted to localStorage (LH-35)
- If exchange API down, fall back to USD display with banner "Prices shown in USD" (UC-41)
- UC-38, UC-39, UC-40, UC-41, UC-44 pass
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/services/GeolocationService.ts, Wedding-Ease-Viva-Chat/src/services/ExchangeRateService.ts
**References:** PRD §4.5, EXECUTION_PLAN.md §8.7, UC-38..UC-41, UC-44, LH-35

---

### FE-013: UsageMeter component with 4 states (normal / 75% / 90% / 100%)
**Sprint:** 2
**Owner:** Frontend Engineer
**Depends on:** UI-001, FE-001
**Blocks:** QA-010
**Acceptance criteria:**
- Component reads tier + usage from `/account/me` response `{ tier, limits, usage: { daily, monthly, extras, byService, remaining } }`
- Renders progress bar of `monthlyTokensUsed / monthlyTokensCap`
- State 0–74%: compact, no banner
- State 75–89%: soft banner "You've used 75% of your monthly Easebot tokens"
- State 90–99%: amber banner + inline confirm dialog wrapper for expensive actions showing "This will use 16,000 tokens. Continue?"
- State 100% (paid): modal offering top-up or reset date
- State 100% (free): modal offering Pro upgrade
- Daily cap hit: "You've hit today's limit. Resets at midnight UTC." (no upgrade push)
- Mounted in chat header and settings
- Dark mode + 44px touch targets
- UC-13, UC-14, UC-15, UC-20, UC-21, UC-22, UC-25 pass
**Files touched:** Wedding-Ease-Viva-Chat/src/components/UsageMeter.tsx, Wedding-Ease-Viva-Chat/src/components/chat/ChatHeader.tsx, Wedding-Ease-Viva-Chat/src/pages/settings/SettingsShell.tsx
**References:** PRD §5, §6.7, §6.11, UC-13..UC-16, UC-20..UC-25

---

### PAY-010: Implement /payment/initiate, /payment/return, /payment/webhook (sandbox)
**Sprint:** 2
**Owner:** Payment Gateway Master
**Depends on:** PAY-002, BE-003
**Blocks:** QA-010, PAY-020
**Acceptance criteria:**
- `POST /payment/initiate` requires auth, body `{ plan, billingCycle, currency, companyName?, gstin? }`, calls `exchangeRateService.lockRate`, stores `payments/{txnid}` with `{ uid, plan, amountUsd, amountLocal, currency, rate, fetchedAt, status: 'pending', companyName, gstin }`, returns PayU form params + server-generated hash
- `POST /payment/return` verifies reverse hash; on mismatch 400 + security log (LH-29); on success updates `payments/{txnid}`, redirects frontend
- `POST /payment/webhook` verifies signature, idempotent on txnid (LH-26), is final source of truth
- Server-side amount verification: reject if posted amount ≠ stored amount (LH-25)
- All routes rate-limited via existing `express-rate-limit`
- Sandbox PayU creds only — never real keys
- UC-26, UC-27, UC-28, UC-34, UC-35 pass
**Files touched:** easebot-backend/src/controllers/paymentController.ts, easebot-backend/src/routes/payment.ts (new)
**References:** EXECUTION_PLAN.md §8.3, §8.4, §8.5, §8.6, UC-26..UC-28, UC-34, UC-35, LH-25, LH-26, LH-29

---

### PAY-011: Server-side rate lock at /payment/initiate (LH-31, LH-32, LH-33, LH-34)
**Sprint:** 2
**Owner:** Payment Gateway Master
**Depends on:** PAY-010
**Blocks:** QA-010
**Acceptance criteria:**
- `exchangeRateService.lockRate(currency)` is called only from `/payment/initiate`; result is stamped on `payments/{txnid}` and never recomputed for that txn
- Per-minute server-side in-memory cache (1 entry per currency) shared across users (LH-34)
- Rate sanity check: reject if ≤0 or >1000× expected (LH-33)
- API down → 503 "Payment temporarily unavailable"; no partial state (UC-42)
- VPN / page-load arbitrage: rate re-fetched at initiate time, not at page load (LH-31, LH-32, UC-43)
- UC-42, UC-43 pass
**Files touched:** easebot-backend/src/services/exchangeRateService.ts, easebot-backend/src/controllers/paymentController.ts
**References:** EXECUTION_PLAN.md §8.7, UC-42, UC-43, LH-31..LH-34

---

### QA-010: Walk UC-01 through UC-25 and UC-38 through UC-48
**Sprint:** 2
**Owner:** QA
**Depends on:** BE-010..BE-014, FE-010..FE-013, PAY-010, PAY-011
**Blocks:** QA-011
**Acceptance criteria:**
- Every UC-01 through UC-25 ticked PASS/FAIL in `.orchestrator/test-matrix.md`
- Every UC-38 through UC-48 ticked PASS/FAIL (currency / GST flows — UC-45/46/47/48 noted as "pending invoice impl" acceptable in Sprint 2 if tax breakdown ships in Sprint 3)
- Each failure filed as a P0/P1/P2/P3 bug in `.orchestrator/bugs/`
- Token meter verified enforced on chat, image, TTS, STT, vision, Algolia, WhatsApp via synthetic over-cap tests
**Files touched:** .orchestrator/test-matrix.md, .orchestrator/bugs/*.md
**References:** EXECUTION_PLAN.md §5, Sprint 2 exit gate

---

### QA-011: Sprint 2 exit gate
**Sprint:** 2
**Owner:** QA
**Depends on:** QA-010
**Blocks:** (Sprint 3 start)
**Acceptance criteria:**
- 0 P0 bugs open
- Token meter provably enforced on all seven cost sites
- Pricing page live on localhost with correct prices in at least 3 currencies (USD, INR, EUR)
- Sprint 2 summary written to `.orchestrator/sprint-2.md`
**Files touched:** .orchestrator/sprint-2.md (new)
**References:** EXECUTION_PLAN.md §4 Sprint 2 exit gate

---

## Sprint 3 — Subscription lifecycle + invoicing

### BE-020: Subscription state machine per ARCH spec
**Sprint:** 3
**Owner:** Backend Engineer
**Depends on:** QA-011, ARCH-001, PAY-010
**Blocks:** BE-021, BE-022, BE-023, QA-020
**Acceptance criteria:**
- `subscriptionController.ts` implements state transitions: guest → free → pro → pro_max → pro_max_cancel_scheduled → free
- Firebase Auth custom claim `tier` written on every transition (read from claim in middleware per PRD §6.10)
- `/subscription/cancel` sets `cancel_at_period_end=true`, returns new period end date (UC-31)
- `/subscription/reactivate` flips flag off, no new charge (UC-32)
- Downgrade is scheduled for period end, never immediate; data retained (UC-30, LH-11, LH-12)
- Delete-account flow cancels subscription first (LH-45)
- UC-30, UC-31, UC-32, UC-33 pass
**Files touched:** easebot-backend/src/controllers/subscriptionController.ts, easebot-backend/src/routes/subscription.ts (new)
**References:** EXECUTION_PLAN.md §7, PRD §6.5, UC-30..UC-33, LH-11, LH-12, LH-45

---

### BE-021: Upgrade flow with credit calculation (no refunds)
**Sprint:** 3
**Owner:** Backend Engineer
**Depends on:** BE-020
**Blocks:** QA-020
**Acceptance criteria:**
- `/payment/subscription/upgrade` implements proration formula from §7.3: `daysRemaining / periodLength × proPrice = proCredit`; `chargeNow = proMaxFull - proCredit` floored at 0
- If chargeNow ≤ 0: free upgrade, state transition only, no PayU call (UC-29, LH-09)
- Leftover credit after upgrade stored as `forwardCredit` on user doc; applied to next Pro Max renewal; never refunded, never expires (LH-10)
- Annual Pro → monthly Pro Max works (remaining annual days × Pro daily rate → credit)
- Token pool resets to Pro Max limits immediately on upgrade; old Pro pool not transferred
- UC-29 passes
**Files touched:** easebot-backend/src/controllers/paymentController.ts, easebot-backend/src/controllers/subscriptionController.ts
**References:** EXECUTION_PLAN.md §7.3, UC-29, LH-09, LH-10

---

### BE-022: Top-up route with 10/month cap and extrasBucket ledger
**Sprint:** 3
**Owner:** Backend Engineer
**Depends on:** BE-020, PAY-010
**Blocks:** QA-020
**Acceptance criteria:**
- `POST /payment/topup` implements the $10 / +2M tokens one-shot purchase (Pro Max only)
- Enforces `extrasPurchasedThisMonth < 10` — 11th attempt returns 409 "Monthly top-up limit reached" (UC-25a)
- On success, increments `extrasBucket` by 2,000,000; never resets at monthly boundary (UC-25b)
- Ledger entry written for audit
- UC-23, UC-25, UC-25a, UC-25b pass
**Files touched:** easebot-backend/src/controllers/paymentController.ts, easebot-backend/src/services/tokenMeter.ts
**References:** PRD §4.4, §6.5, EXECUTION_PLAN.md §8.3, UC-23, UC-25a, UC-25b

---

### BE-023: Webhook idempotency + renew-fail handling (point-to-point)
**Sprint:** 3
**Owner:** Backend Engineer
**Depends on:** BE-020, PAY-010
**Blocks:** QA-020
**Acceptance criteria:**
- Webhook idempotency proven by unit test: second delivery of same txnid is no-op (LH-25, LH-26)
- Renewal failure triggers **immediate** drop to Free in the same webhook handler transaction — no grace period, no dunning retry (LH-17). Data retained. Existing reminders continue firing (LH-46, LH-47). `tierMirror` flipped to `'free'`, token meter reset to Free caps.
- `/payment/verify` endpoint lets frontend poll if webhook delayed (LH-15, UC-34)
- Downgraded user: new-reminder creation blocked at 3; existing reminders keep firing; UI split message (LH-46)
- UC-34, UC-35, LH-17, LH-46, LH-47 verified
**Files touched:** easebot-backend/src/controllers/paymentController.ts, easebot-backend/src/services/reminderService.ts
**References:** EXECUTION_PLAN.md §8.5, UC-34, UC-35, LH-15, LH-17, LH-25, LH-26, LH-46, LH-47

---

### PAY-020: Invoice PDF generation with pdfkit (async, non-blocking)
**Sprint:** 3
**Owner:** Payment Gateway Master
**Depends on:** BE-020, BE-021, BE-022
**Blocks:** PAY-021, QA-020
**Acceptance criteria:**
- `invoiceService.ts` uses `pdfkit` to generate PDFs matching §9.2 fields: Invoice#, Date, Seller (from LEGAL_ENTITY_*), Bill to, Buyer GSTIN, Plan, Period, Subtotal local, USD equivalent, Exchange rate, Tax, Total, Payment method, Txn ID, Status, Notes
- Invoice # format `EB-YYYYMM-NNNNNN` monotonic per month
- Generation is async + queued; never blocks tier grant (LH-30)
- On PDF failure, tier is still granted; invoice queued for retry
- Startup check: if `LEGAL_ENTITY_NAME` env is empty, throw "Cannot emit invoices without legal entity"
- Credit line shown for upgrade invoices (from §7.3)
- "Top-up tokens never expire" note on top-up invoices
**Files touched:** easebot-backend/src/services/invoiceService.ts, easebot-backend/src/services/invoiceTemplate.ts (new)
**References:** EXECUTION_PLAN.md §9.2, §9.3, §9.4, LH-30

---

### PAY-021: Invoice email delivery via existing emailService + GST fields in checkout
**Sprint:** 3
**Owner:** Payment Gateway Master
**Depends on:** PAY-020
**Blocks:** QA-020
**Acceptance criteria:**
- On successful invoice PDF generation, invoice is emailed via existing `emailService.ts` to the user's auth email
- Invoice also stored in Firestore `invoices/{invoiceId}` with signed URL
- Checkout modal collects optional `companyName` + optional `gstin` + required `billingAddress` (country, state, postal) per §8.9
- GSTIN validated with 15-char regex; invalid → inline error, cannot proceed (UC-46)
- India + GSTIN → invoice shows CGST/SGST or IGST 18% split (UC-45)
- India + no GSTIN → consolidated 18% B2C GST line (UC-47)
- Non-India + companyName → "Bill to: {companyName}", tax line "N/A" (UC-48)
- UC-45, UC-46, UC-47, UC-48 pass
**Files touched:** easebot-backend/src/services/invoiceService.ts, easebot-backend/src/services/emailService.ts, Wedding-Ease-Viva-Chat/src/components/CheckoutModal.tsx
**References:** EXECUTION_PLAN.md §8.9, §9.2, UC-45..UC-48

---

### FE-020: BillingSettingsPage with invoice history + download
**Sprint:** 3
**Owner:** Frontend Engineer
**Depends on:** PAY-020, PAY-021, BE-020
**Blocks:** QA-020
**Acceptance criteria:**
- `/settings/billing` renders: current plan, renewal date, cancel/reactivate button, token usage summary, invoice history table
- Invoice history table lists each invoice with date / plan / amount / status / Download link (signed URL)
- Table is responsive — stacks on mobile (320–414px)
- Dark mode supported
- Empty state when no invoices yet
- UC-31, UC-32 verified
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/settings/BillingSettingsPage.tsx, Wedding-Ease-Viva-Chat/src/pages/settings/SettingsShell.tsx
**References:** EXECUTION_PLAN.md §9.3, UC-31, UC-32, LH-38

---

### FE-021: Cancel subscription flow with no-refund messaging
**Sprint:** 3
**Owner:** Frontend Engineer
**Depends on:** FE-020, BE-020
**Blocks:** QA-020
**Acceptance criteria:**
- Cancel button opens confirm dialog: "All sales are final. Your access continues until {periodEnd}; no refund will be issued. Data and reminders are retained."
- On confirm, calls `/subscription/cancel`, shows success toast, updates UI to "Cancelling at {periodEnd}"
- Reactivate button visible while `cancel_at_period_end=true` and before period end
- No refund CTA anywhere in the UI
- UC-31, UC-32, UC-33 pass
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/settings/BillingSettingsPage.tsx
**References:** PRD §6.5, EXECUTION_PLAN.md §7.4, UC-31, UC-32, UC-33, LH-18

---

### QA-020: Execute full loophole catalog LH-01 through LH-47
**Sprint:** 3
**Owner:** QA
**Depends on:** BE-020..BE-023, PAY-020, PAY-021, FE-020, FE-021
**Blocks:** QA-021
**Acceptance criteria:**
- Every LH-01 through LH-47 has a "how I tried to break it and couldn't" note in `.orchestrator/test-matrix.md`
- UC-26 through UC-37 walked on both mobile and desktop
- Any broken loophole filed as a P0 or P1 bug
- Concurrent-call race test run under synthetic load (LH-03)
- Streaming disconnect test passes (LH-02)
- Webhook replay test passes (LH-25/26)
**Files touched:** .orchestrator/test-matrix.md, .orchestrator/bugs/*.md
**References:** EXECUTION_PLAN.md §6, UC-26..UC-37

---

### QA-021: Sprint 3 exit gate (0 P0 + 0 P1)
**Sprint:** 3
**Owner:** QA
**Depends on:** QA-020
**Blocks:** (Sprint 4 start)
**Acceptance criteria:**
- 0 P0 bugs open
- 0 P1 bugs open
- Every subscription state transition (buy, upgrade, cancel, reactivate, renew, renew-fail, downgrade) tested end-to-end in sandbox
- Invoice PDFs generated for 4 sample scenarios (new sub, renewal, upgrade with credit, top-up) and manually inspected
- Sprint 3 summary written to `.orchestrator/sprint-3.md`
**Files touched:** .orchestrator/sprint-3.md (new)
**References:** EXECUTION_PLAN.md §4 Sprint 3 exit gate, §11

---

## Sprint 4 — Polish + responsive + final QA

### UI-040: Responsive sweep across all 7 breakpoints
**Sprint:** 4
**Owner:** UI/UX Designer
**Depends on:** QA-021
**Blocks:** QA-040
**Acceptance criteria:**
- Every new/modified page (Pricing, BillingSettingsPage, CheckoutModal, UsageMeter, UpgradeFlow, ChatHeader) verified on 320, 375, 414, 768, 1024, 1280, 1920 px
- No horizontal scroll on any page at any breakpoint
- CTA buttons min 44px tall on every breakpoint
- Screenshots captured for each breakpoint × page combo and filed under `.orchestrator/qa/screenshots/`
- Any failure filed as a P1 bug
- LH-38, LH-39 verified
**Files touched:** .orchestrator/qa/screenshots/* (new)
**References:** EXECUTION_PLAN.md §10, LH-38, LH-39

---

### UI-041: Dark mode pass on every new component
**Sprint:** 4
**Owner:** UI/UX Designer
**Depends on:** UI-040
**Blocks:** QA-040
**Acceptance criteria:**
- Pricing, BillingSettingsPage, CheckoutModal, UsageMeter, UpgradeFlow, GST/company fields, upgrade modal all verified in dark mode
- Color contrast ratio ≥ 4.5:1 for text on all backgrounds
- No invisible-on-dark-bg bugs
- LH-40 verified
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/pages/settings/BillingSettingsPage.tsx, Wedding-Ease-Viva-Chat/src/components/UsageMeter.tsx, Wedding-Ease-Viva-Chat/src/components/CheckoutModal.tsx, Wedding-Ease-Viva-Chat/src/components/UpgradeFlow.tsx
**References:** EXECUTION_PLAN.md §10, LH-40

---

### UI-042: Accessibility sweep (44px touch targets, aria labels, focus order)
**Sprint:** 4
**Owner:** UI/UX Designer
**Depends on:** UI-041
**Blocks:** QA-040
**Acceptance criteria:**
- Every interactive element in the new flows has an aria-label or aria-labelledby
- Focus order is logical on Pricing page, CheckoutModal, BillingSettingsPage (tabbed through manually)
- All touch targets ≥ 44×44 px
- Modals are focus-trapped and closable via Escape
- LH-41 verified
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/components/CheckoutModal.tsx, Wedding-Ease-Viva-Chat/src/components/UpgradeFlow.tsx
**References:** EXECUTION_PLAN.md §10, LH-41

---

### FE-040: Toast / banner / error / empty / loading states
**Sprint:** 4
**Owner:** Frontend Engineer
**Depends on:** QA-021
**Blocks:** QA-040
**Acceptance criteria:**
- Every async action (initiate payment, cancel, reactivate, top-up, download invoice) shows a loading state
- Errors surface via toast with actionable copy
- Empty states for: no invoices yet, no reminders, no projects
- Loading skeletons for Pricing, BillingSettingsPage, UsageMeter
- No infinite spinners (timeout + retry prompt) (LH-39)
**Files touched:** Wedding-Ease-Viva-Chat/src/pages/Pricing.tsx, Wedding-Ease-Viva-Chat/src/pages/settings/BillingSettingsPage.tsx, Wedding-Ease-Viva-Chat/src/components/UsageMeter.tsx, Wedding-Ease-Viva-Chat/src/components/CheckoutModal.tsx
**References:** EXECUTION_PLAN.md §4 Sprint 4, LH-39

---

### FE-041: Force getIdToken(true) after payment success + tab-visibility revalidation
**Sprint:** 4
**Owner:** Frontend Engineer
**Depends on:** FE-040
**Blocks:** QA-040
**Acceptance criteria:**
- On `/payment/return` success, frontend calls `auth.currentUser.getIdToken(true)` to refresh the custom claim (LH-43)
- Tier is re-read from the refreshed token; UI reflects new tier within 2 seconds of return
- On `document.visibilitychange` → "visible", frontend revalidates subscription state from `/account/me` (LH-44)
- Two-tab test: upgrade in tab A, focus tab B, tab B shows new tier without manual reload
- LH-42, LH-43, LH-44 verified
**Files touched:** Wedding-Ease-Viva-Chat/src/hooks/useSubscription.ts, Wedding-Ease-Viva-Chat/src/services/authService.ts, Wedding-Ease-Viva-Chat/src/App.tsx
**References:** LH-42, LH-43, LH-44

---

### BE-040: Observability events for GTM metrics
**Sprint:** 4
**Owner:** Backend Engineer
**Depends on:** QA-021
**Blocks:** QA-040
**Acceptance criteria:**
- `tokenMeter` and `subscriptionController` emit structured log events for: `guest_signup`, `free_upgrade_pro`, `pro_upgrade_promax`, `payment_success`, `payment_failure`, `cap_hit_monthly`, `cap_hit_daily`
- Each event includes uid (or guestId), timestamp, tier, relevant numeric fields
- Events go through existing logger (no new external service, no deploy)
- Synthetic test: trigger each path, verify event present in log
**Files touched:** easebot-backend/src/services/tokenMeter.ts, easebot-backend/src/controllers/subscriptionController.ts, easebot-backend/src/controllers/paymentController.ts
**References:** EXECUTION_PLAN.md §13 GTM checklist (analytics events)

---

### QA-040: Full regression — 48 UCs × 4 tiers × 4 breakpoints, random order
**Sprint:** 4
**Owner:** QA
**Depends on:** UI-040, UI-041, UI-042, FE-040, FE-041, BE-040
**Blocks:** QA-041
**Acceptance criteria:**
- Every UC-01 through UC-48 re-executed across guest / free / pro / pro_max tiers where applicable
- Executed on 4 representative breakpoints: 375, 768, 1280, 1920
- Execution order randomized to surface state-leakage bugs
- Every row in `.orchestrator/test-matrix.md` ticked PASS
- Any new bug filed with severity
**Files touched:** .orchestrator/test-matrix.md, .orchestrator/bugs/*.md
**References:** EXECUTION_PLAN.md §4 Sprint 4, §5

---

### QA-041: Adversarial loophole re-verification
**Sprint:** 4
**Owner:** QA
**Depends on:** QA-040
**Blocks:** ARCH-040
**Acceptance criteria:**
- Every LH-01 through LH-47 re-attacked in sequence
- Written "could not break" note for each, or filed bug
- Concurrent-call load test repeated (LH-03)
- VPN / rate-arbitrage attempt repeated (LH-31, LH-32)
- Zero known loopholes open
**Files touched:** .orchestrator/test-matrix.md
**References:** EXECUTION_PLAN.md §6

---

### ARCH-040: Architect sign-off gate
**Sprint:** 4
**Owner:** Architect
**Depends on:** QA-041
**Blocks:** CEO-040
**Acceptance criteria:**
- Architect reviews final state of tokenMeter, quotaMiddleware, subscriptionController, paymentController, invoiceService against the 5 specs in `.orchestrator/specs/`
- Written sign-off in `.orchestrator/decisions.log` with `APPROVE` verdict or list of required fixes
- No schema drift from the specs
- No Firebase rules / deploy configs touched
**Files touched:** .orchestrator/decisions.log
**References:** EXECUTION_PLAN.md §1.3, §11

---

### CEO-040: CEO Agent final approval gate
**Sprint:** 4
**Owner:** CEO Agent
**Depends on:** ARCH-040
**Blocks:** QA-042
**Acceptance criteria:**
- CEO verifies price anchors are live: $14.99 Pro, $39 Pro Max, $119 Pro annual, $299 Pro Max annual, $10 top-up for +2M
- CEO verifies token pool model is intact (no feature gating added)
- CEO verifies the "all 3 modes open to every tier" principle has not been violated
- Written `APPROVE` or `REJECT` in `.orchestrator/decisions.log`
**Files touched:** .orchestrator/decisions.log
**References:** EXECUTION_PLAN.md §1.1

---

### QA-042: Sprint 4 exit gate (0 P0 + 0 P1 + <5 P2, handoff to human)
**Sprint:** 4
**Owner:** QA
**Depends on:** CEO-040
**Blocks:** (none — final)
**Acceptance criteria:**
- 0 P0 bugs open
- 0 P1 bugs open
- Fewer than 5 P2 bugs open; each has a written note on why it is deferred
- Zero known loopholes
- Responsive matrix §10 green across all 7 breakpoints
- Grep confirms zero hardcoded secrets, zero firebase.rules / deploy config changes in the entire sprint cycle
- `.orchestrator/sprint-4.md` contains the handoff summary for the human operator
- Handoff explicitly notes: the human is the only entity that deploys; this backlog delivered a local + preview-build-ready system
**Files touched:** .orchestrator/sprint-4.md (new)
**References:** EXECUTION_PLAN.md §4 Sprint 4 exit gate, §11, §13
