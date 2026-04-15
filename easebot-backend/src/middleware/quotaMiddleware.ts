/**
 * quotaMiddleware — pre-call quota gate for cost-bearing routes.
 *
 * Sprint 1 SKELETON: type signatures and the req.quotaContext augmentation
 * are final. The factory body throws `not_implemented_sprint_2`. Sprint 2
 * PAY-001 wires the real estimate + reconcile closures.
 *
 * Grounded in: .orchestrator/specs/quota-middleware.md (authoritative).
 *
 * Usage (Sprint 2):
 *   router.post('/chat',  requireAuth, quotaCheck('chat'),  handleChat)
 *   router.post('/image', requireAuth, quotaCheck('image'), handleImage)
 *
 * Guardrail 8 (EXECUTION_PLAN.md §0): NO MINI MODEL FALLBACK. When the pool
 * is empty we return 402. No `req.quotaContext.useMiniModel` flag. Ever.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type {
  Principal,
  Subject,
  Service,
  RawCost,
  EstimateResult,
  QuotaExceededResponse,
} from '../types/billing'

// Re-export the 402 shape so Sprint 2 handlers can import it from here if
// they prefer (the canonical home is ../types/billing).
export type { QuotaExceededResponse }

// ---------------------------------------------------------------------------
// Request augmentation — what the middleware attaches.
// ---------------------------------------------------------------------------

/**
 * Attached to `req.quotaContext` after a successful pre-call estimate.
 * The controller MUST call `reconcile(actual)` exactly once before
 * returning — success path with the real RawCost, failure path with
 * `{ skip: true }`. See spec §5 for the contract.
 */
export interface QuotaContext {
  principal: Principal
  subject: Subject
  service: Service
  /** Pessimistic upper-bound from tokenMeter.estimateCost. */
  estimate: EstimateResult
  /** Convenience: `estimate.estimatedTokens` — matches backlog naming. */
  estimated: number
  /**
   * Post-call reconciliation closure. Call exactly once.
   * - Pass the measured RawCost on success.
   * - Pass `{ skip: true }` if the downstream call never ran.
   */
  reconcile: (actual: RawCost | { skip: true }) => Promise<void>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quotaContext?: QuotaContext
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Factory — one middleware per Service. The service arg drives the raw-cost
 * skeleton shape used for the pre-call estimate.
 *
 * Pre-call flow (Sprint 2):
 *   1. Resolve principal (user vs guest, tier from claim/Firestore mirror)
 *   2. Build pessimistic RawCost skeleton from req.body
 *   3. tokenMeter.estimateCost(...)
 *   4. On over-limit → 402 with QuotaExceededResponse body, short-circuit
 *   5. Attach req.quotaContext = { ..., reconcile }
 *   6. next()
 *
 * Sprint 1: stub — throws at runtime so no route accidentally picks it up.
 */
export function quotaCheck(service: Service): RequestHandler {
  return async (
    _req: Request,
    _res: Response,
    _next: NextFunction,
  ): Promise<void> => {
    // Silence "declared but never read" for the captured arg. Sprint 2
    // replaces this whole body with the real estimate + reconcile flow.
    void service
    throw new Error('not_implemented_sprint_2')
  }
}
