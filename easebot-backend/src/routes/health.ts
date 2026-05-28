import { Router, Request, Response } from 'express'
import { adminDb } from '../lib/firebaseAdmin'

const healthRouter = Router()

/** GET /api/health — liveness probe */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /api/ready — readiness probe.
 *
 * Previous implementation used the client SDK against `__health_check__`,
 * which always failed because (a) the client SDK has no auth at this entry
 * point so Firestore rules deny the read, and (b) Firestore reserves
 * `__*__` collection names (3 INVALID_ARGUMENT: "Collection id is invalid
 * because it is reserved"). The probe was therefore stuck at 503 forever
 * and any LB/K8s readiness gating would never let traffic through.
 *
 * Fix: use the Admin SDK (bypasses rules) against the existing `users`
 * collection limited to 1 document. Connectivity + auth verified, cost is
 * one tiny query.
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  let firestoreStatus: 'ok' | 'error' = 'error'

  try {
    await adminDb.collection('users').limit(1).get()
    firestoreStatus = 'ok'
  } catch (err) {
    console.warn('[health/ready] firestore probe failed:', err instanceof Error ? err.message : err)
    firestoreStatus = 'error'
  }

  const overallStatus = firestoreStatus === 'ok' ? 'ready' : 'degraded'
  const statusCode = overallStatus === 'ready' ? 200 : 503

  res.status(statusCode).json({
    status: overallStatus,
    checks: {
      firestore: firestoreStatus,
    },
  })
})

export default healthRouter
