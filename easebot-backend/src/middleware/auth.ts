import { Request, Response, NextFunction } from 'express'
import { adminAuth } from '../lib/firebaseAdmin'

declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; [key: string]: any }
      // Set by guest-session validation when a well-formed X-Guest-Id is
      // presented on a guest-allowed route and no authenticated user exists.
      guest?: { id: string }
    }
  }
}

// ---------------------------------------------------------------------------
// Guest-session validation
// ---------------------------------------------------------------------------
// The guest "session" in this codebase is the `X-Guest-Id` header: a UUID the
// frontend mints and persists in localStorage. It scopes a capped guest quota
// (10 chats / 3 images / 3 voice) inside quotaMiddleware. It is intentionally
// low-stakes (LH-21 in the quota spec) — a malicious actor who swaps ids just
// gets a fresh capped bucket. We treat a *well-formed* guest id as a valid
// guest session for the purpose of admitting anonymous traffic onto
// guest-allowed burn routes (chat, image, tts, transcribe, feedback). This
// mirrors the validation already in quotaMiddleware.resolveOrMintGuestId so
// the two stay in lockstep.
const GUEST_ID_RE = /^[a-f0-9-]{20,}$/i

export function hasValidGuestSession(req: Request): boolean {
  const header = (req.headers['x-guest-id'] ?? '') as string
  return typeof header === 'string' && GUEST_ID_RE.test(header)
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------
// Revocation check requires real Admin credentials (it calls getUser under the
// hood). Without a service account, basic signature verification still works —
// it only needs Google's public signing keys + FIREBASE_PROJECT_ID to validate
// the aud claim. Opt-in via env so prod with creds keeps the stronger check.
const checkRevoked = (): boolean => process.env.FIREBASE_CHECK_REVOKED === 'true'

type TokenOutcome =
  | { ok: true; user: { uid: string; email?: string; emailVerified?: boolean; authTime?: number } }
  | { ok: false }

/**
 * Verify a Bearer token. Returns ok:false on missing/invalid/expired tokens.
 * Never throws — the diagnostic is kept server-side; callers decide the
 * response. SECURITY (WE-20260527-1007): this FAILS CLOSED — any verification
 * error resolves to ok:false, never a pass-through with a null user.
 */
async function verifyBearer(req: Request): Promise<TokenOutcome> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return { ok: false }
  const token = authHeader.split('Bearer ')[1]?.trim()
  if (!token) return { ok: false }
  try {
    const decoded = await adminAuth.verifyIdToken(token, checkRevoked())
    return {
      ok: true,
      user: {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
        authTime: decoded.auth_time,
      },
    }
  } catch (err) {
    // BUG-BE-20260525-014: never echo the Firebase Admin SDK error verbatim —
    // it discloses our upstream IdP + JWT format. Log server-side, return a
    // generic failure to the caller.
    const message = err instanceof Error ? err.message : 'token verification failed'
    console.warn('[auth] token verification failed:', message)
    return { ok: false }
  }
}

// ---------------------------------------------------------------------------
// requireAuth — token-optional middleware (guest pass-through)
// ---------------------------------------------------------------------------
/**
 * requireAuth — attaches `req.user` when a VALID Bearer token is present.
 *
 * Behavior contract:
 *  - No Bearer token  → `req.user` stays undefined and we call next()
 *    (anonymous pass-through; downstream handlers self-guard on req.user.uid,
 *    e.g. notes/checklists return 401 when uid is missing).
 *  - Invalid/expired token  → 401 (FAILS CLOSED — WE-20260527-1007). We do NOT
 *    fall through with req.user=null when a token was supplied but rejected.
 *  - Valid token  → attach req.user and call next().
 *
 * Use this only on routes that legitimately serve anonymous traffic AND
 * self-enforce authorization in the handler. For quota-burning guest-allowed
 * routes use `requireAuthOrGuest`; for user-only routes use `requireUser`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    // No token → anonymous pass-through (preserved behavior).
    next()
    return
  }
  const outcome = await verifyBearer(req)
  if (!outcome.ok) {
    res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
    return
  }
  req.user = outcome.user
  next()
}

// ---------------------------------------------------------------------------
// requireAuthOrGuest — guest-allowed quota-burning routes
// ---------------------------------------------------------------------------
/**
 * For chat/stream, image-gen, tts, transcribe, feedback. Admits:
 *  - a request with a VALID Firebase token (attaches req.user), OR
 *  - an anonymous request that presents a VALID guest session (well-formed
 *    X-Guest-Id header) — preserves the legitimate guest flow.
 *
 * Rejects with 401:
 *  - a request with an invalid/expired token (FAILS CLOSED), OR
 *  - a fully anonymous request with no valid guest session.
 *
 * This is the WE-20260527-202 fix: requireAuth used to fail OPEN, letting any
 * anonymous caller burn quota. Now anonymous callers MUST carry a guest
 * session, and broken tokens are rejected outright.
 */
export async function requireAuthOrGuest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const outcome = await verifyBearer(req)
    if (!outcome.ok) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
      return
    }
    req.user = outcome.user
    next()
    return
  }
  // No token: only a valid guest session may proceed.
  if (hasValidGuestSession(req)) {
    req.guest = { id: (req.headers['x-guest-id'] as string) }
    next()
    return
  }
  res.status(401).json({ error: 'Authentication or guest session required', code: 'UNAUTHORIZED' })
}

// ---------------------------------------------------------------------------
// requireUser — strict, user-only routes (no guest path)
// ---------------------------------------------------------------------------
/**
 * For payment / subscription burn routes and anything that must NEVER serve
 * guests. Requires a VALID Firebase token; missing OR invalid token => 401.
 * FAILS CLOSED.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const outcome = await verifyBearer(req)
  if (!outcome.ok) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' })
    return
  }
  req.user = outcome.user
  next()
}
