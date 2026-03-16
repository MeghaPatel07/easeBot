import * as admin from 'firebase-admin'
import { Request, Response, NextFunction } from 'express'

// Extends Express Request to carry the decoded Firebase user
declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    req.user = await admin.auth().verifyIdToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
