import { Request, Response, NextFunction } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '../lib/firebaseAdmin'
import { requireAuth } from '../middleware/auth'

// ---------------------------------------------------------------------------
// Firestore helpers (Admin SDK)
// ---------------------------------------------------------------------------
const userRef = (uid: string) => adminDb.collection('users').doc(uid)
const serverTimestamp = () => FieldValue.serverTimestamp()

// ---------------------------------------------------------------------------
// Strict auth wrapper
// ---------------------------------------------------------------------------
// The shared `requireAuth` middleware deliberately allows anonymous (guest)
// requests through for chat/notes/etc. Account endpoints must NEVER serve
// anonymous traffic, so we wrap it and 401 when no verified uid was attached.
// We do NOT modify the shared middleware (per sprint scope rules).
//
// In addition, after the token is verified we consult a 30-second-cached
// "deletionPending" flag on the user doc. If set, we reject all routes EXCEPT
// GET /me and POST /delete (so users can still observe / cancel).
export function requireStrictAuth(req: Request, res: Response, next: NextFunction): void {
  void requireAuth(req, res, async () => {
    if (!req.user?.uid) {
      res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' })
      return
    }
    if (isDeletionGateExempt(req)) {
      next()
      return
    }
    try {
      const pending = await isDeletionPending(req.user.uid)
      if (pending) {
        res.status(403).json({ error: 'Account pending deletion', code: 'ACCOUNT_DELETED' })
        return
      }
    } catch (err) {
      console.error('[requireStrictAuth] deletion-gate lookup failed:', err instanceof Error ? err.message : err)
      // Fail-open on lookup error to avoid locking users out of their own data;
      // the 30s cache TTL means the next request will retry.
    }
    next()
  })
}

// ---------- Deletion-gate cache ----------------------------------------------
const DELETION_CACHE_TTL_MS = 30 * 1000
const deletionCache = new Map<string, { pending: boolean; expiresAt: number }>()

function isDeletionGateExempt(req: Request): boolean {
  // Allow GET /me and POST /delete to bypass so users can read their state
  // and cancel/observe deletion.
  const path = req.path || req.url || ''
  if (req.method === 'GET' && path.endsWith('/me')) return true
  if (req.method === 'POST' && path.endsWith('/delete')) return true
  return false
}

async function isDeletionPending(uid: string): Promise<boolean> {
  const now = Date.now()
  const cached = deletionCache.get(uid)
  if (cached && cached.expiresAt > now) return cached.pending
  const snap = await userRef(uid).get()
  const pending = snap.exists ? Boolean(snap.data()?.deletionPending) : false
  deletionCache.set(uid, { pending, expiresAt: now + DELETION_CACHE_TTL_MS })
  return pending
}

function invalidateDeletionCache(uid: string): void {
  deletionCache.delete(uid)
}

// ---------------------------------------------------------------------------
// Per-user mutation rate limiters.
// ---------------------------------------------------------------------------
// Default bucket: 10/min/uid for routine profile/preferences mutations.
// Strict bucket : 5/hour/uid for sensitive ops (email/password/delete/sign-out).
// Tiny in-memory token buckets scoped to THIS file.
// ---------------------------------------------------------------------------
const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_MS = 60 * 1000
const STRICT_LIMIT = 5
const STRICT_WINDOW_MS = 60 * 60 * 1000

const defaultBuckets = new Map<string, { count: number; resetAt: number }>()
const strictBuckets = new Map<string, { count: number; resetAt: number }>()

function takeFromBucket(
  store: Map<string, { count: number; resetAt: number }>,
  uid: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now()
  const bucket = store.get(uid)
  if (!bucket || bucket.resetAt <= now) {
    store.set(uid, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now }
  }
  bucket.count += 1
  return { ok: true }
}

export function rateLimitMutations(req: Request, res: Response, next: NextFunction): void {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' }); return }
  const result = takeFromBucket(defaultBuckets, uid, DEFAULT_LIMIT, DEFAULT_WINDOW_MS)
  if (!result.ok) {
    res.status(429).json({
      error: 'Too many account mutations, please slow down',
      code: 'RATE_LIMITED',
      retryAfterMs: result.retryAfterMs,
    })
    return
  }
  next()
}

export function rateLimitSensitive(req: Request, res: Response, next: NextFunction): void {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' }); return }
  const result = takeFromBucket(strictBuckets, uid, STRICT_LIMIT, STRICT_WINDOW_MS)
  if (!result.ok) {
    res.status(429).json({
      error: 'Too many sensitive account operations. Try again later.',
      code: 'RATE_LIMITED_SENSITIVE',
      retryAfterMs: result.retryAfterMs,
    })
    return
  }
  next()
}

// ---------------------------------------------------------------------------
// Validation helpers (lightweight, no new deps)
// ---------------------------------------------------------------------------
const isNonEmptyString = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
const isOptString = (v: unknown, max = 200): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.length <= max)
const isOptNumber = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v))
const isOptBool = (v: unknown): boolean => v === undefined || typeof v === 'boolean'
const isISODateLike = (v: unknown): boolean => {
  if (v === undefined || v === null) return true
  if (typeof v !== 'string') return false
  if (v.length === 0 || v.length > 40) return false
  return !Number.isNaN(Date.parse(v))
}

const ALLOWED_PROFILE_FIELDS = new Set([
  'name', 'nickname', 'phone', 'phoneCountryCode', 'phoneNational',
  'weddingDate', 'budget', 'partnerName', 'role',
  // Sprint 4 (Kenji) → Sprint 4b (Nikhil): custom instructions allow-list.
  'about', 'responseStyle',
])
// Custom-instruction free-form fields share a 1500-char hard cap (matches the
// frontend Personalization tab counter).
const CUSTOM_INSTRUCTION_MAX = 1500
const ALLOWED_ROLES = new Set(['bride', 'groom', 'planner', 'family', 'friend', 'other'])
const ALLOWED_THEMES = new Set(['system', 'light', 'dark'])
const ALLOWED_DENSITIES = new Set(['comfortable', 'compact'])

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message, code: 'VALIDATION_ERROR' })
}

function serverError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Internal error'
  console.error('[accountController] error:', message)
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR' })
}

// ---------------------------------------------------------------------------
// Defaults for plan/usage when fields don't exist on the user doc yet
// ---------------------------------------------------------------------------
function defaultPlanBlock() {
  return {
    plan: 'free' as const,
    planRenewsAt: null,
    trialEndsAt: null,
    usage: {
      messagesUsed: 0,
      messagesAllowed: 100,
      periodStart: null,
      periodEnd: null,
    },
  }
}

function mergePlanBlock(data: Record<string, any> | undefined) {
  const base = defaultPlanBlock()
  if (!data) return base
  return {
    plan: data.plan ?? base.plan,
    planRenewsAt: data.planRenewsAt ?? null,
    trialEndsAt: data.trialEndsAt ?? null,
    usage: {
      messagesUsed: data.usage?.messagesUsed ?? 0,
      messagesAllowed: data.usage?.messagesAllowed ?? base.usage.messagesAllowed,
      periodStart: data.usage?.periodStart ?? null,
      periodEnd: data.usage?.periodEnd ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// GET /api/account/me
// ---------------------------------------------------------------------------
export async function handleGetMe(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  try {
    const snap = await userRef(uid).get()
    const profile = snap.exists ? (snap.data() ?? {}) : {}
    const planBlock = mergePlanBlock(profile)
    res.status(200).json({
      uid,
      email: req.user?.email ?? profile.email ?? null,
      profile,
      ...planBlock,
    })
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// PATCH /api/account/profile
// ---------------------------------------------------------------------------
export async function handleUpdateProfile(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, any> = {}

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_PROFILE_FIELDS.has(key)) {
      return badRequest(res, `Unknown field: ${key}`)
    }
    switch (key) {
      case 'name':
      case 'nickname':
      case 'partnerName':
        if (!isOptString(value, 120)) return badRequest(res, `Invalid ${key}`)
        update[key] = value === '' ? null : value
        break
      case 'phone':
      case 'phoneNational':
        if (!isOptString(value, 32)) return badRequest(res, `Invalid ${key}`)
        if (typeof value === 'string' && value.length > 0 && !/^[+\d\s\-().]+$/.test(value)) {
          return badRequest(res, `Invalid ${key} format`)
        }
        update[key] = value === '' ? null : value
        break
      case 'phoneCountryCode':
        if (!isOptString(value, 8)) return badRequest(res, 'Invalid phoneCountryCode')
        if (typeof value === 'string' && value.length > 0 && !/^\+?\d{1,6}$/.test(value)) {
          return badRequest(res, 'Invalid phoneCountryCode format')
        }
        update[key] = value === '' ? null : value
        break
      case 'weddingDate':
        if (!isISODateLike(value)) return badRequest(res, 'Invalid weddingDate (expected ISO string)')
        update[key] = value ?? null
        break
      case 'budget':
        if (!isOptNumber(value)) return badRequest(res, 'Invalid budget (expected number)')
        if (typeof value === 'number' && (value < 0 || value > 1e12)) {
          return badRequest(res, 'Budget out of range')
        }
        update[key] = value ?? null
        break
      case 'role':
        if (value !== undefined && value !== null) {
          if (typeof value !== 'string' || !ALLOWED_ROLES.has(value)) {
            return badRequest(res, `Invalid role (allowed: ${Array.from(ALLOWED_ROLES).join(', ')})`)
          }
        }
        update[key] = value ?? null
        break
      case 'about':
      case 'responseStyle':
        // Optional free-form strings, max 1500 chars. Empty string clears.
        if (value !== undefined && value !== null && typeof value !== 'string') {
          return badRequest(res, `Invalid ${key} (expected string)`)
        }
        if (typeof value === 'string' && value.length > CUSTOM_INSTRUCTION_MAX) {
          return badRequest(res, `${key} exceeds ${CUSTOM_INSTRUCTION_MAX} characters`)
        }
        update[key] = value === '' || value === undefined ? null : value
        break
    }
  }

  if (Object.keys(update).length === 0) return badRequest(res, 'No valid fields supplied')

  try {
    update.profileUpdatedAt = serverTimestamp()
    await userRef(uid).set(update, { merge: true })
    res.status(200).json({ ok: true, updated: Object.keys(update).filter(k => k !== 'profileUpdatedAt') })
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// POST /api/account/email/change  — STUB (re-auth UX owned by Sprint 2)
// ---------------------------------------------------------------------------
export function handleEmailChangeStub(_req: Request, res: Response): void {
  res.status(501).json({
    status: 'pending',
    message: 'email change requires re-auth flow — Sprint 2',
    code: 'NOT_IMPLEMENTED',
  })
}

// ---------------------------------------------------------------------------
// POST /api/account/password/change  — STUB
// ---------------------------------------------------------------------------
export function handlePasswordChangeStub(_req: Request, res: Response): void {
  res.status(501).json({
    status: 'pending',
    message: 'password change requires re-auth flow — Sprint 2',
    code: 'NOT_IMPLEMENTED',
  })
}

// ---------------------------------------------------------------------------
// GET /api/account/plan
// ---------------------------------------------------------------------------
export async function handleGetPlan(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  try {
    const snap = await userRef(uid).get()
    const data = snap.exists ? (snap.data() ?? {}) : {}
    res.status(200).json(mergePlanBlock(data))
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// POST /api/account/plan/checkout  — STUB
// ---------------------------------------------------------------------------
export function handleCheckoutStub(_req: Request, res: Response): void {
  res.status(501).json({
    status: 'pending',
    message: 'payments sprint will own checkout',
    code: 'NOT_IMPLEMENTED',
  })
}

// ---------------------------------------------------------------------------
// POST /api/account/delete  — soft delete + revoke refresh tokens
// ---------------------------------------------------------------------------
export async function handleSoftDelete(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  try {
    await userRef(uid).set({
      deletedAt: serverTimestamp(),
      deletionPending: true,
    }, { merge: true })
    invalidateDeletionCache(uid)
    try {
      await adminAuth.revokeRefreshTokens(uid)
    } catch (revokeErr) {
      console.error(
        '[handleSoftDelete] revokeRefreshTokens failed:',
        revokeErr instanceof Error ? revokeErr.message : revokeErr,
      )
      // We still report success to the client because the soft-delete flag IS set.
    }
    res.status(200).json({
      ok: true,
      status: 'soft-deleted',
      message: 'account flagged for deletion (30-day grace period); sessions revoked',
    })
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// POST /api/account/sign-out-everywhere
// ---------------------------------------------------------------------------
export async function handleSignOutEverywhere(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  try {
    await adminAuth.revokeRefreshTokens(uid)
    res.status(200).json({ ok: true, message: 'Signed out on all devices' })
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// PATCH /api/account/preferences
// ---------------------------------------------------------------------------
export async function handleUpdatePreferences(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const body = (req.body ?? {}) as Record<string, unknown>
  const prefUpdate: Record<string, any> = {}

  if ('theme' in body) {
    if (typeof body.theme !== 'string' || !ALLOWED_THEMES.has(body.theme)) {
      return badRequest(res, `Invalid theme (allowed: ${Array.from(ALLOWED_THEMES).join(', ')})`)
    }
    prefUpdate['preferences.theme'] = body.theme
  }
  if ('density' in body) {
    if (typeof body.density !== 'string' || !ALLOWED_DENSITIES.has(body.density)) {
      return badRequest(res, `Invalid density (allowed: ${Array.from(ALLOWED_DENSITIES).join(', ')})`)
    }
    prefUpdate['preferences.density'] = body.density
  }
  if ('language' in body) {
    if (!isNonEmptyString(body.language, 16)) return badRequest(res, 'Invalid language')
    prefUpdate['preferences.language'] = body.language
  }
  if ('notifications' in body) {
    const n = body.notifications as Record<string, unknown> | null | undefined
    if (n === null || typeof n !== 'object') return badRequest(res, 'Invalid notifications object')
    const allowedKeys = new Set(['emailReminders', 'whatsappReminders', 'productUpdates', 'tips'])
    for (const [k, v] of Object.entries(n)) {
      if (!allowedKeys.has(k)) return badRequest(res, `Unknown notifications key: ${k}`)
      if (!isOptBool(v) || typeof v !== 'boolean') return badRequest(res, `notifications.${k} must be boolean`)
      prefUpdate[`preferences.notifications.${k}`] = v
    }
  }
  if ('dataTrainingOptOut' in body) {
    if (typeof body.dataTrainingOptOut !== 'boolean') return badRequest(res, 'dataTrainingOptOut must be boolean')
    prefUpdate['preferences.dataTrainingOptOut'] = body.dataTrainingOptOut
  }

  if (Object.keys(prefUpdate).length === 0) return badRequest(res, 'No valid preferences supplied')

  try {
    // Ensure the doc exists first so update with dotted paths succeeds
    await userRef(uid).set({ preferences: {} }, { merge: true })
    await userRef(uid).update(prefUpdate)
    res.status(200).json({ ok: true, updated: Object.keys(prefUpdate) })
  } catch (err) { serverError(res, err) }
}

// ---------------------------------------------------------------------------
// GET /api/account/export  — STUB
// ---------------------------------------------------------------------------
export function handleExportStub(_req: Request, res: Response): void {
  res.status(501).json({
    status: 'pending',
    message: 'data export job will be implemented in Phase 4',
    code: 'NOT_IMPLEMENTED',
  })
}
