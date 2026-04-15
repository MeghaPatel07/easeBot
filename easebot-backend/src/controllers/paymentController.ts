/**
 * paymentController — PayU integration surface.
 *
 * Sprint 1 SKELETON: handler signatures only. No route wiring — that's
 * Sprint 2 PAY-010. Sprint 3 fills the bodies per the PayU contract spec.
 *
 * Grounded in: .orchestrator/specs/payu-contract.md (authoritative).
 *
 * Intentionally absent (Guardrail 9):
 *   - handleRefund — no /api/payment/refund route exists. Chargeback
 *     reversals happen out-of-band in the PayU dashboard.
 */

import type { Request, Response, NextFunction } from 'express'

const NOT_IMPLEMENTED = 'not_implemented_sprint_3'

/**
 * POST /api/payment/initiate — lock exchange rate, compute local amount,
 * stamp `payments/{txnid}` with state='pending', return PayU form params
 * plus the SHA-512 hash computed server-side.
 *
 * Flow: see payu-contract.md §4 (rate lock) and §5 (hash generation).
 *
 * Validations before PayU is contacted:
 *   - Plan/cycle combo is in PRICES_USD (§3) — reject 400 otherwise
 *   - GSTIN matches regex if provided (§6) — reject 400 otherwise
 *   - User is on `free` state — reject 409 if already subscribed (§10)
 *   - LEGAL_ENTITY_* env preflight (§14 concern 6)
 */
export async function initiate(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * POST /api/payment/return — PayU server-to-server post-back.
 *
 * PayU is the HTTP client here; no requireAuth. Security gate is the
 * reverse-hash check (§5.1). On valid hash, updates `payments/{txnid}`
 * (idempotent with the webhook via §8 state machine) and issues a 302
 * to the frontend `/payment/success` or `/payment/failure`.
 *
 * Does NOT grant tier directly — the webhook is the canonical path.
 */
export async function handleReturn(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * POST /api/payment/webhook — authoritative tier-grant path.
 *
 * Steps (§8):
 *   1. PayU IP allowlist check (small middleware upstream)
 *   2. Reverse-hash verify → 400 on mismatch
 *   3. Load `payments/{txnid}`; if already `paid`/`failed`, return 200
 *      `{ ok:true, duplicate:true }` — idempotent (LH-26)
 *   4. Amount verify vs stored `amountLocal` (LH-25) → 'unknown' on mismatch
 *   5. Fire subscriptionStateMachine.applyTransition with `txnid` as the
 *      idempotency key (purchase | upgrade | renew_success | topup)
 *   6. For top-ups, call tokenMeter.addExtras(uid, 2_000_000, txnid)
 *   7. Enqueue invoice job (non-blocking; LH-30)
 *   8. Write `payments/{txnid}.state='paid'`
 *   9. Return 200 to PayU
 */
export async function handleWebhook(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * GET /api/payment/verify?txnid=EB-... — frontend polling fallback when
 * the webhook lags (LH-15). Strict auth; uid must match
 * `payments/{txnid}.uid`. Read-only — NEVER triggers a state transition,
 * only reports the current state.
 */
export async function verify(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}
