import * as admin from 'firebase-admin'
import { Request, Response, NextFunction } from 'express'

/**
 * Like requireAuth but non-blocking.
 * Sets req.user if a valid Bearer token is present; proceeds as guest otherwise.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]
    try {
      req.user = await admin.auth().verifyIdToken(token)
    } catch {
      // Invalid or expired token — treat as guest, don't block
    }
  }
  next()
}
