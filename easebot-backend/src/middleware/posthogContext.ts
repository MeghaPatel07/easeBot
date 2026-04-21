import type { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      /** PostHog distinct_id resolved from Firebase uid or x-ph-distinct-id header. */
      phDistinctId?: string
    }
  }
}

/**
 * Resolves a PostHog distinct_id for the current request.
 * Priority: authenticated user id (set by auth middleware) > x-ph-distinct-id header > undefined.
 * Captures never fire without a distinct_id, so unknown requests are simply untracked.
 */
export function posthogContext(req: Request, _res: Response, next: NextFunction): void {
  const authed = (req as unknown as { user?: { uid?: string } }).user?.uid
  const headerId = req.header('x-ph-distinct-id')?.trim()
  req.phDistinctId = authed || headerId || undefined
  next()
}
