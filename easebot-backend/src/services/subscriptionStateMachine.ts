/**
 * subscriptionStateMachine — the ONLY code path that writes to
 * `users/{uid}/subscription/current`.
 *
 * Sprint 1 SKELETON: `applyTransition` signature + re-exported state union.
 * Sprint 3 (PAY-012..PAY-015) wires the real Firestore transaction, side
 * effects, and idempotency history log.
 *
 * Grounded in: .orchestrator/specs/subscription-state.md (authoritative).
 *
 * Non-goals (per spec §1 and EXECUTION_PLAN.md §0):
 *   - No refund trigger
 *   - No grace state (renew_fail drops immediately to free)
 *   - No dunning / retry orchestration
 *   - No mini-model downgrade
 */

import type {
  SubscriptionState,
  SubscriptionTrigger,
  SubscriptionTransitionPayload,
  TransitionResult,
} from '../types/billing'

// Re-export so payment / webhook callers can `import { SubscriptionState }
// from '../services/subscriptionStateMachine'` as the spec prose suggests.
export type {
  SubscriptionState,
  SubscriptionTrigger,
  SubscriptionTransitionPayload,
  TransitionResult,
}

/**
 * Apply a transition to the user's subscription doc.
 *
 * Contract:
 *   - Computes a deterministic `transitionId` from (uid, trigger, payload)
 *     per spec §7.
 *   - Reads `users/{uid}/subscription/history/{transitionId}` inside the
 *     same transaction; if present, returns `{ applied: false, state }` —
 *     idempotent no-op (LH-26, UC-34).
 *   - On new transitions: validates `from` matches current state, computes
 *     `to`, writes both `current` and `history/{transitionId}` atomically.
 *   - Side effects (Firebase custom claim, tokenMeter.resetMonthly, invoice
 *     queue) fire AFTER the transaction commits. Failures in side effects
 *     do NOT unwind the state change — they retry via their own mechanisms.
 *
 * Sprint 1: stub.
 */
export function applyTransition(
  _uid: string,
  _from: SubscriptionState,
  _to: SubscriptionState,
  _trigger: SubscriptionTrigger,
  _payload: SubscriptionTransitionPayload,
): Promise<TransitionResult> {
  return Promise.reject(new Error('not_implemented_sprint_3'))
}
