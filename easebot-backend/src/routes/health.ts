import { Router, Request, Response } from 'express'
import { collection, getDocs, query, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'

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

  try {
    // Lightweight Firestore read to verify connectivity
    const q = query(collection(db, '__health_check__'), limit(1))
    await getDocs(q)
    firestoreStatus = 'ok'
  } catch {
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
