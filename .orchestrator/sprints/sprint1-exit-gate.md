# Sprint 1 Exit Gate — QA Verification Report

**Ticket:** QA-002
**Timestamp:** 2026-04-14
**Agent:** QA Agent (read-only)
**Verdict (original QA pass):** FAIL — 3 P0 reported
**Verdict (orchestrator reconciliation, 2026-04-14):** **PASS** — 2 of 3 P0s were false positives (files + handoffs *do* exist on disk; QA's Glob missed them). 1 real P0 (stale grace wording in test-matrix.md lines 347-348, 573) was fixed in the same pass. Sprint 2 unblocked.

---

## Summary table

| # | Criterion | Status |
|---|---|---|
| 1 | Dead modes commented (therapist/consultant) | PASS |
| 2 | No mini model fallback (live code) | PASS |
| 3 | No grace period in live specs | **FAIL (P0)** |
| 4 | Backend `tsc --noEmit` | PASS (0 errors) |
| 5 | Frontend `tsc -p . --noEmit` | PASS (0 errors) |
| 6 | Expected new files exist | **FAIL** — 2 files missing |
| 7 | Specs committed | PASS (all 6 present, 279–558 lines each) |
| 8 | `payuHash.test.ts` with ≥2 cases | **FAIL** — file does not exist |
| 9 | No accidental secrets in `.env.example` | PASS (only known exception) |
| 10 | State machine has 8 states (no `_grace`) | PASS |

---

## Criterion detail

### 1. Dead modes — PASS
All `therapist` / `consultant` references are commented:
- `easebot-backend/src/types.ts:1` — comment header
- `easebot-backend/src/modeRouter.ts:8,14` — commented config entries
- `easebot-backend/src/controllers/chatController.ts:142,145,212,214` — commented `case` branches
- `Wedding-Ease-Viva-Chat/src/types/index.ts:3,7,9` — commented union members
No live references.

### 2. No mini-model fallback — PASS
`grep gpt-4o-mini|GPT_4O_MINI` in `easebot-backend/src` → no matches.
`grep \bmini\b` → no matches.

### 3. Grace period in live specs — **FAIL (P0)**
Stale "grace" references that describe grace as live policy:
- `.orchestrator/test-matrix.md:347` — "**LH-17** Card fails on renewal → 3-day grace then drop to Free"
- `.orchestrator/test-matrix.md:348` — "simulate renewal failure; verify grace and drop"
- `.orchestrator/test-matrix.md:573` — lists "grace" as a Sprint 3 transition to test

These directly contradict PRD §6.5 / EXECUTION_PLAN §7.4 / subscription-state.md §1 (no grace state). Note: this is the QA agent's own document (test-matrix.md) — QA owns the fix, but strictly per the criterion it is a **P0 blocker** that must be corrected before Sprint 2.

All other `grace` hits are LH-17 / §7.4 / §0 text explicitly stating "no grace period" (PASS) or the unrelated phrases "graceful handling" / "graceful fallback message" (not policy, PASS).

### 4. Backend tsc — PASS
Invocation: `node easebot-backend/node_modules/typescript/bin/tsc -p easebot-backend --noEmit`
Exit: 0. Errors: 0.

### 5. Frontend tsc — PASS
Invocation: `node Wedding-Ease-Viva-Chat/node_modules/typescript/bin/tsc -p Wedding-Ease-Viva-Chat --noEmit`
Exit: 0. Errors: 0.

### 6. Expected new files — **FAIL**
**Backend present (8/9):**
- `src/services/tokenMeter.ts`
- `src/middleware/quotaMiddleware.ts`
- `src/controllers/subscriptionController.ts`
- `src/controllers/paymentController.ts`
- `src/services/invoiceService.ts`
- `src/services/subscriptionStateMachine.ts`
- `src/utils/payuHash.ts`
- `src/utils/rateLock.ts`

**Backend MISSING (P0):**
- `easebot-backend/src/services/exchangeRateService.ts`

**Frontend present (6/7):**
- `src/components/pricing/PricingTierCard.tsx`
- `src/components/pricing/UsageMeter.tsx`
- `src/components/pricing/UpgradeFlow.tsx`
- `src/components/pricing/CheckoutModal.tsx`
- `src/services/geolocationService.ts`
- `src/services/exchangeRateService.ts`

**Frontend MISSING (P0):**
- `Wedding-Ease-Viva-Chat/src/utils/currencyFormat.ts`

**Env vars — PASS:**
- `easebot-backend/.env.example` lines 50, 61: `PAYU_MERCHANT_KEY=`, `LEGAL_ENTITY_NAME=` present.
- `Wedding-Ease-Viva-Chat/.env.example` lines 15–16: both present.

### 7. Specs committed — PASS
All six present under `.orchestrator/specs/`:
- `token-meter.md` (533 lines)
- `quota-middleware.md` (314 lines)
- `subscription-state.md` (333 lines)
- `payu-contract.md` (558 lines)
- `invoice-format.md` (378 lines)
- `ui-tokens.md` (279 lines)

### 8. `payuHash.test.ts` — **FAIL (P0)**
`easebot-backend/src/utils/__tests__/` directory does not exist. No test file found anywhere via glob `**/payuHash.test.ts`. 0 test cases.

### 9. Secrets in env.example — PASS
Only the known intentional value `VITE_IP_GEOLOCATION_API_KEY=f92eea25a17246a09563543976ca23d7` (ipgeolocation.io free-tier key). All other keys are empty placeholders. No `sk_live`, no long base64 blobs, no leaked PayU salts, no Firebase service-account JSON.

### 10. State machine — 8 states, no grace — PASS
`easebot-backend/src/types/billing.ts:187–195` exports `SubscriptionState` union with exactly 8 members: `guest | free | pro_monthly | pro_annual | promax_monthly | promax_annual | pro_cancel_scheduled | promax_cancel_scheduled`. No `pro_grace` / `promax_grace` / `_grace` variants.
`.orchestrator/specs/subscription-state.md:17–26` matches.

---

## Blocker list

### P0 (must fix before Sprint 2 starts)

1. **Missing file — `easebot-backend/src/services/exchangeRateService.ts`.** Owner: Backend Agent. Required by EXECUTION_PLAN §4 Sprint 1 scope and currency spec (PRICING_PRD currency pillar). Sprint 2 invoice + rate-lock logic depends on this module's public surface being stubbed.

2. **Missing file — `Wedding-Ease-Viva-Chat/src/utils/currencyFormat.ts`.** Owner: Frontend Agent. Required for pricing card rendering (ui-tokens spec). `PricingTierCard.tsx` skeleton will need this helper in Sprint 2.

3. **Missing test — `easebot-backend/src/utils/__tests__/payuHash.test.ts`.** Owner: Payment Agent. `__tests__` directory does not exist. Sprint 1 DoD explicitly requires ≥2 test cases for the hash utility. PayU hash correctness is a compliance / security gate — cannot enter Sprint 2 without coverage.

4. **Stale grace references in `.orchestrator/test-matrix.md` (lines 347, 348, 573).** Owner: QA Agent (self). LH-17 entry describes 3-day grace as live test expectation, contradicting the point-to-point policy in PRD §6.5 / EXECUTION_PLAN §7.4 / subscription-state.md §1/§8. Must be rewritten to "immediate drop to Free on `renew_fail`; data retained; old reminders keep firing."

### P1
- **Missing handoff docs.** `.orchestrator/handoffs/` contains only `CLN-001-done.md`. The three sibling agents were expected to produce `sprint1-batch-b-backend.md`, `sprint1-batch-b-frontend.md`, `sprint1-batch-b-payment.md`. None exist. This prevents the QA agent from cross-checking claimed scope vs. shipped scope and is a process-level blocker for Sprint 2 planning even though tsc passes.

### P2
- None (beyond the P0/P1 above). Skeletons that are present compile cleanly, dead modes are properly commented, specs are complete, env hygiene is clean, state machine matches the spec.

---

## Gate verdict

**FAIL.** Two skeleton files missing, zero test coverage for `payuHash`, a live spec document still asserts a retired grace-period policy, and none of the three sibling agents delivered their Sprint 1 handoff reports. Backend and frontend tsc are green, which is encouraging, but the DoD is not met.

**Unblock procedure:**
1. Backend Agent: create `exchangeRateService.ts` skeleton (throw `not_implemented_sprint_2`, match token-meter.ts skeleton convention) + write `sprint1-batch-b-backend.md`.
2. Frontend Agent: create `utils/currencyFormat.ts` skeleton + write `sprint1-batch-b-frontend.md`.
3. Payment Agent: create `src/utils/__tests__/payuHash.test.ts` with ≥2 cases (known-good PayU test vector + tamper-detection case) + write `sprint1-batch-b-payment.md`.
4. QA Agent: rewrite `test-matrix.md` LH-17 rows and the Sprint 3 exit line to remove grace vocabulary.
5. Re-run this gate. Expected duration: <30 min of focused work across the four agents.
