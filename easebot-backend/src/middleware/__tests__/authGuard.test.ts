// Security-hardening regression tests (consolidated PR, 2026-06-01).
//
// Covers:
//   WE-20260527-202   requireAuth / requireAuthOrGuest — reject anonymous on
//                     burn routes, KEEP guest-session flow working.
//   WE-20260527-1007  fail CLOSED on token-verify error (no null-user pass).
//   WE-20260527-001   speech-token / guest session admission (same predicate).
//   requireUser       user-only routes reject guest + anonymous + bad token.
//
// Technique: seed require.cache with a fake `lib/firebaseAdmin` BEFORE importing
// the auth middleware, so verifyIdToken is fully controllable and no Firebase
// network / credentials are needed. Zero new deps (node:test + assert).
//
// Run:  npx ts-node --transpile-only src/middleware/__tests__/authGuard.test.ts

import { test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from 'path'

// ── Mock firebaseAdmin BEFORE importing the middleware under test ───────────
type VerifyImpl = (token: string, checkRevoked?: boolean) => Promise<Record<string, unknown>>
let verifyImpl: VerifyImpl = async () => {
  throw new Error('verifyImpl not set by test')
}

const adminPath = path.resolve(__dirname, '..', '..', 'lib', 'firebaseAdmin.ts')
require.cache[adminPath] = {
  id: adminPath,
  filename: adminPath,
  loaded: true,
  children: [],
  exports: {
    adminAuth: {
      verifyIdToken: (token: string, checkRevoked?: boolean) => verifyImpl(token, checkRevoked),
    },
    adminDb: {},
    adminApp: {},
  },
} as unknown as NodeModule

// Silence the middleware's console.warn on rejected tokens during negative tests.
const origWarn = console.warn
console.warn = () => {}

// Import after the cache is seeded.
import {
  requireAuth,
  requireAuthOrGuest,
  requireUser,
  hasValidGuestSession,
} from '../auth'

// ── Fake Express req/res ────────────────────────────────────────────────────
interface FakeRes {
  statusCode: number | null
  body: unknown
  status(code: number): FakeRes
  json(b: unknown): FakeRes
}
function makeRes(): FakeRes {
  return {
    statusCode: null,
    body: undefined,
    status(code: number) { this.statusCode = code; return this },
    json(b: unknown) { this.body = b; return this },
  }
}
function makeReq(headers: Record<string, string> = {}): any {
  // Express lowercases header keys; mirror that.
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  return { headers: lower }
}

const VALID_GUEST = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789' // matches /^[a-f0-9-]{20,}$/i

beforeEach(() => {
  verifyImpl = async () => { throw new Error('verifyImpl not set by test') }
})

// ── hasValidGuestSession ────────────────────────────────────────────────────
test('hasValidGuestSession: accepts a well-formed X-Guest-Id, rejects junk', () => {
  assert.equal(hasValidGuestSession(makeReq({ 'X-Guest-Id': VALID_GUEST })), true)
  assert.equal(hasValidGuestSession(makeReq({ 'X-Guest-Id': 'short' })), false)
  assert.equal(hasValidGuestSession(makeReq({ 'X-Guest-Id': '<script>alert(1)</script>' })), false)
  assert.equal(hasValidGuestSession(makeReq({})), false)
})

// ── requireAuth (token-optional, anonymous pass-through) ────────────────────
test('requireAuth: no token → anonymous pass-through (next, no user)', async () => {
  const req = makeReq(); const res = makeRes(); let nexted = false
  await requireAuth(req, res as any, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(res.statusCode, null)
  assert.equal(req.user, undefined)
})

test('requireAuth: valid token → attaches user', async () => {
  verifyImpl = async () => ({ uid: 'u-1', email: 'a@b.com', email_verified: true, auth_time: 1 })
  const req = makeReq({ Authorization: 'Bearer good' }); const res = makeRes(); let nexted = false
  await requireAuth(req, res as any, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.user.uid, 'u-1')
})

test('requireAuth: INVALID token → 401, FAILS CLOSED (no pass-through, no user)', async () => {
  verifyImpl = async () => { throw new Error('Firebase ID token has expired') }
  const req = makeReq({ Authorization: 'Bearer bad' }); const res = makeRes(); let nexted = false
  await requireAuth(req, res as any, () => { nexted = true })
  assert.equal(nexted, false, 'must NOT fall through on a supplied-but-invalid token')
  assert.equal(res.statusCode, 401)
  assert.equal(req.user, undefined)
  assert.equal((res.body as any).code, 'UNAUTHORIZED')
})

test('requireAuth: 401 body does not leak the upstream Firebase error text', async () => {
  verifyImpl = async () => { throw new Error('see https://firebase.google.com/docs/auth ... JWT') }
  const req = makeReq({ Authorization: 'Bearer bad' }); const res = makeRes()
  await requireAuth(req, res as any, () => {})
  assert.equal(res.statusCode, 401)
  assert.ok(!JSON.stringify(res.body).includes('firebase.google.com'))
})

// ── requireAuthOrGuest (guest-allowed burn routes) ──────────────────────────
test('requireAuthOrGuest: GUEST FLOW — valid guest session admitted (next, no user)', async () => {
  const req = makeReq({ 'X-Guest-Id': VALID_GUEST }); const res = makeRes(); let nexted = false
  await requireAuthOrGuest(req, res as any, () => { nexted = true })
  assert.equal(nexted, true, 'valid guest session must keep working')
  assert.equal(res.statusCode, null)
  assert.equal(req.user, undefined)
  assert.equal(req.guest.id, VALID_GUEST)
})

test('requireAuthOrGuest: valid token admitted (attaches user, ignores guest)', async () => {
  verifyImpl = async () => ({ uid: 'u-2', email: 'c@d.com' })
  const req = makeReq({ Authorization: 'Bearer good' }); const res = makeRes(); let nexted = false
  await requireAuthOrGuest(req, res as any, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.user.uid, 'u-2')
})

test('requireAuthOrGuest: ANONYMOUS (no token, no guest session) → 401', async () => {
  const req = makeReq(); const res = makeRes(); let nexted = false
  await requireAuthOrGuest(req, res as any, () => { nexted = true })
  assert.equal(nexted, false)
  assert.equal(res.statusCode, 401, 'fully-anonymous burn-route call must be rejected')
  assert.equal((res.body as any).code, 'UNAUTHORIZED')
})

test('requireAuthOrGuest: malformed guest id (not a session) → 401', async () => {
  const req = makeReq({ 'X-Guest-Id': 'nope' }); const res = makeRes(); let nexted = false
  await requireAuthOrGuest(req, res as any, () => { nexted = true })
  assert.equal(nexted, false)
  assert.equal(res.statusCode, 401)
})

test('requireAuthOrGuest: INVALID token → 401 even if a guest id is also present (fail closed)', async () => {
  verifyImpl = async () => { throw new Error('invalid signature') }
  const req = makeReq({ Authorization: 'Bearer bad', 'X-Guest-Id': VALID_GUEST }); const res = makeRes(); let nexted = false
  await requireAuthOrGuest(req, res as any, () => { nexted = true })
  assert.equal(nexted, false, 'a supplied bad token must reject, not silently downgrade to guest')
  assert.equal(res.statusCode, 401)
})

// ── requireUser (user-only routes: payment/account) ─────────────────────────
test('requireUser: valid token → next + user', async () => {
  verifyImpl = async () => ({ uid: 'u-3' })
  const req = makeReq({ Authorization: 'Bearer good' }); const res = makeRes(); let nexted = false
  await requireUser(req, res as any, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.user.uid, 'u-3')
})

test('requireUser: no token → 401 (no guest path)', async () => {
  const req = makeReq(); const res = makeRes(); let nexted = false
  await requireUser(req, res as any, () => { nexted = true })
  assert.equal(nexted, false)
  assert.equal(res.statusCode, 401)
})

test('requireUser: valid guest session is NOT enough → 401', async () => {
  const req = makeReq({ 'X-Guest-Id': VALID_GUEST }); const res = makeRes(); let nexted = false
  await requireUser(req, res as any, () => { nexted = true })
  assert.equal(nexted, false, 'guests must never reach payment/account routes')
  assert.equal(res.statusCode, 401)
})

test('requireUser: invalid token → 401 (fails closed)', async () => {
  verifyImpl = async () => { throw new Error('expired') }
  const req = makeReq({ Authorization: 'Bearer bad' }); const res = makeRes(); let nexted = false
  await requireUser(req, res as any, () => { nexted = true })
  assert.equal(nexted, false)
  assert.equal(res.statusCode, 401)
})

// restore console.warn at the very end (after all sync test registration)
process.on('exit', () => { console.warn = origWarn })
