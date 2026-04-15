/**
 * tokenMeter — single source of truth for every cost-bearing call.
 *
 * Sprint 1 SKELETON: type signatures + JSDoc only. All function bodies throw
 * `Error('not_implemented_sprint_2')`. Sprint 2 wires real Firestore
 * transactions per the spec.
 *
 * Grounded in: .orchestrator/specs/token-meter.md (authoritative).
 *
 * Public surface (per §1 of the spec):
 *   - rawToTokens       pure conversion
 *   - estimateCost      pre-call read-only estimate (quotaMiddleware caller)
 *   - chargeTokens      post-call atomic debit
 *   - getUsage          read-only snapshot for /account/me
 *   - addExtras         top-up webhook path
 *   - resetMonthly      called by subscriptionStateMachine on renew/purchase
 *   - refundTokens      reverse a debit (LH-06)
 *
 * Everything else (helpers, caps tables, guest branch) lives inside the
 * module and is not re-exported.
 */

import type {
  Principal,
  Subject,
  Service,
  Tier,
  RawCost,
  ChargeResult,
  UsageSnapshot,
  EstimateInput,
  EstimateResult,
} from '../types/billing'

// Re-export the shared types so existing spec prose ("import from tokenMeter")
// continues to resolve. The canonical home is ../types/billing.
export type {
  Principal,
  Subject,
  Service,
  Tier,
  RawCost,
  ChargeResult,
  UsageSnapshot,
  EstimateInput,
  EstimateResult,
}

const NOT_IMPLEMENTED = 'not_implemented_sprint_2'

// ---------------------------------------------------------------------------
// Pure conversion (spec §3)
// ---------------------------------------------------------------------------

/**
 * Convert a RawCost into Easebot Tokens using the PRD §3.2 conversion table.
 *
 * Pure — no I/O. Clamps negative inputs to 0 (LH-05). Always Math.ceil.
 *
 * Sprint 1: stub.
 */
export function rawToTokens(_raw: RawCost): number {
  throw new Error(NOT_IMPLEMENTED)
}

// ---------------------------------------------------------------------------
// Pre-call estimate (spec §4.2)
// ---------------------------------------------------------------------------

/**
 * Pre-call estimate. Called from quotaMiddleware BEFORE the expensive call.
 * Non-transactional read of the usage doc; reports whether the call would
 * fit against daily + monthly + extras. Does NOT mutate state.
 *
 * Sprint 1: stub.
 */
export function estimateCost(_input: EstimateInput): Promise<EstimateResult> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

// ---------------------------------------------------------------------------
// Post-call atomic debit (spec §4.1)
// ---------------------------------------------------------------------------

/**
 * Post-call reconciliation. Called by controllers (via
 * req.quotaContext.reconcile) after the downstream Azure/Algolia/WhatsApp
 * call returns. Atomically debits monthly pool first, then extras bucket,
 * inside a single Firestore transaction.
 *
 * Guest branch: bypasses the token ledger and increments the relevant hard
 * counter on `guests/{guestId}`.
 *
 * Sprint 1: stub.
 */
export function chargeTokens(
  _subject: Subject,
  _service: Service,
  _raw: RawCost,
  _opts?: { idempotencyKey?: string },
): Promise<ChargeResult> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

// ---------------------------------------------------------------------------
// Read-only snapshot (spec §1, /account/me consumer)
// ---------------------------------------------------------------------------

/**
 * Read-only usage snapshot. Never mutates. Used by GET /account/me.
 *
 * Sprint 1: stub.
 */
export function getUsage(_subject: Subject): Promise<UsageSnapshot> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

// ---------------------------------------------------------------------------
// Top-up extras (spec §1, paymentController consumer)
// ---------------------------------------------------------------------------

/**
 * Add tokens to the extras bucket after a successful top-up webhook.
 * Enforces the "max 10 top-ups per calendar month" cap inside the same
 * transaction. Idempotent on `txnid`.
 *
 * Called exclusively from paymentController's webhook handler.
 *
 * Sprint 1: stub.
 */
export function addExtras(
  _uid: string,
  _tokens: number,
  _txnid: string,
): Promise<void> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

// ---------------------------------------------------------------------------
// Monthly reset (spec §1, subscriptionStateMachine consumer)
// ---------------------------------------------------------------------------

/**
 * Reset the monthly pool to the given tier's cap. Called by
 * subscriptionStateMachine on `purchase`, `upgrade`, `renew_success`, and
 * `renew_fail` transitions.
 *
 * Sprint 1: stub.
 */
export function resetMonthly(_uid: string, _tier: Tier): Promise<void> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}

// ---------------------------------------------------------------------------
// Refund (spec §1, LH-06)
// ---------------------------------------------------------------------------

/**
 * Refund a charge whose downstream call failed AFTER the meter was debited.
 * Adds `amount` back in the opposite order to the original drain
 * (extras first, then monthly). Caller is imageController / similar on
 * post-charge Azure failures.
 *
 * Sprint 1: stub.
 */
export function refundTokens(
  _subject: Subject,
  _service: Service,
  _amount: number,
  _reason: string,
): Promise<void> {
  return Promise.reject(new Error(NOT_IMPLEMENTED))
}
