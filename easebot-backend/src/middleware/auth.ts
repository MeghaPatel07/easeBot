import { Request, Response, NextFunction } from 'express'
import { adminAuth } from '../lib/firebaseAdmin'

declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; [key: string]: any }
    }
  }
}

/**
 * requireAuth — verifies a Firebase ID token via the Admin SDK.
 *
 * Behavior contract (UNCHANGED — other routes depend on it):
 *  - If no Bearer token is present, `req.user` stays undefined and we call
 *    next() (anonymous / guest pass-through for chat, notes, etc.).
 *  - If a Bearer token is present but invalid/expired, respond 401.
 *  - If valid, attach `req.user = { uid, email, ... }` and call next().
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    // No token → guest pass-through (preserved behavior)
    next()
    return
  }
  const token = authHeader.split('Bearer ')[1]?.trim()
  if (!token) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  // Revocation check requires real Admin credentials (it calls getUser under the hood).
  // Without a service account, basic signature verification still works — it only needs
  // Google's public signing keys + FIREBASE_PROJECT_ID to validate the aud claim.
  // Opt-in via env so prod with creds keeps the stronger check.
  const checkRevoked = process.env.FIREBASE_CHECK_REVOKED === 'true'
  try {
    const decoded = await adminAuth.verifyIdToken(token, checkRevoked)
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      authTime: decoded.auth_time,
    }
    next()
  } catch (err) {
    // BUG-BE-20260525-014: the previous `detail: message` field echoed the
    // full Firebase Admin SDK error verbatim — including the firebase.google.com
    // docs URL and JWT format hint — which discloses our upstream IdP and gives
    // an attacker a roadmap. Keep the diagnostic in the server log; return a
    // generic 401 to the client.
    const message = err instanceof Error ? err.message : 'token verification failed'
    console.warn('[requireAuth] token verification failed:', message)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
