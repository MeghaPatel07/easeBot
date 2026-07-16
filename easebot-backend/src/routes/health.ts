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

/** GET /api/ready — readiness probe */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  let firestoreStatus: 'ok' | 'error' = 'error'
  let firestoreError: string | null = null

  try {
    // Lightweight Firestore read to verify connectivity (Admin SDK — matches
    // every other Firestore consumer in this backend). Collection name must
    // avoid the __.*__ pattern — Firestore reserves it and rejects the query
    // with INVALID_ARGUMENT before rules/auth are even evaluated.
    await adminDb.collection('_health_check').limit(1).get()
    firestoreStatus = 'ok'
  } catch (err) {
    firestoreStatus = 'error'
    firestoreError = err instanceof Error ? err.message : String(err)
  }

  const overallStatus = firestoreStatus === 'ok' ? 'ready' : 'degraded'
  const statusCode = overallStatus === 'ready' ? 200 : 503

  // Same firebaseEnv resolution as lib/firebase.ts / lib/firebaseAdmin.ts —
  // echoing the plain FIREBASE_PROJECT_ID unconditionally here previously
  // gave a wrong answer whenever FIREBASE_ENV=dev was active.
  const firebaseEnv = process.env.FIREBASE_ENV === 'dev' ? 'dev' : 'prod'
  const firebaseProjectId = firebaseEnv === 'dev'
    ? process.env.FIREBASE_PROJECT_ID_DEV
    : process.env.FIREBASE_PROJECT_ID

  res.status(statusCode).json({
    status: overallStatus,
    checks: {
      firestore: firestoreStatus,
      ...(firestoreError ? { firestoreError } : {}),
    },
    // Sanity check for which Firebase project this instance is pointed at —
    // deployed (Railway) instances should always read wedding-ease-dc99a;
    // only a local .env is expected to point at weddingease-1.
    firebaseProjectId: firebaseProjectId ?? null,
  })
})

export default healthRouter
