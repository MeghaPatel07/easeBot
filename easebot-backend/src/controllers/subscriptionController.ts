/**
 * subscriptionController — user-facing subscription mutations.
 *
 * Sprint 1 SKELETON: handler signatures only. Sprint 3 (PAY-013..PAY-015)
 * wires these to `/api/payment/subscription/*` routes and calls into
 * subscriptionStateMachine.applyTransition.
 *
 * Route binding lives in `routes/payment.ts`, which this file does NOT
 * touch in Sprint 1 — that's Sprint 2/3 wiring.
 *
 * Grounded in: .orchestrator/specs/payu-contract.md §1-§2,
 *              .orchestrator/specs/subscription-state.md §3.
 */

import type { Request, Response, NextFunction } from 'express'

const NOT_IMPLEMENTED = 'not_implemented_sprint_3'

/**
 * POST /api/payment/subscription/cancel — mark the current sub as
 * `cancel_at_period_end = true`. No refund, no immediate drop.
 * Maps to the `cancel` state-machine trigger.
 */
export async function cancel(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * POST /api/payment/subscription/reactivate — clear the cancel flag and
 * (if present) the `downgradeToOnPeriodEnd` side field. Returns the user
 * to the underlying paid state. Maps to the `reactivate` trigger.
 */
export async function reactivate(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * POST /api/payment/subscription/upgrade — Pro → Pro Max.
 * Computes proration credit per subscription-state.md §6. Returns either a
 * PayU redirect payload (charge > 0) or a "free upgrade" confirmation
 * (charge == 0). Maps to the `upgrade` trigger.
 */
export async function upgrade(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * POST /api/payment/subscription/downgrade — schedule Pro Max → Pro at
 * period end. NEVER immediate. Sets `downgradeToOnPeriodEnd='pro_monthly'`
 * on the current sub doc. Maps to the `downgrade_schedule` trigger.
 */
export async function downgrade(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}

/**
 * GET /api/account/subscription — read-only view of the current
 * subscription doc plus derived fields (days remaining, next renewal, etc).
 *
 * Note: the URL prefix will likely live under /account, not /payment. Sprint
 * 2 router wiring makes the final call — this file only exports the handler.
 */
export async function getCurrentSubscription(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  next(new Error(NOT_IMPLEMENTED))
}
