// WE-20260527-1010 — central error envelope regression tests.
//
// Asserts:
//   - 5xx responses NEVER echo raw err.message (generic only), in ALL envs.
//   - envelope carries { code, message } AND legacy `error` (same text).
//   - known 4xx branches keep their sanitised, actionable messages.
//
// Run: npx ts-node --transpile-only src/middleware/__tests__/errorEnvelope.test.ts

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { ZodError } from 'zod'

// errorHandler only imports `zod` — safe to import directly (no Firebase).
import { errorHandler } from '../errorHandler'

const origErr = console.error
console.error = () => {}

function makeReqRes() {
  const res: any = {
    statusCode: null,
    body: undefined,
    headersSent: false,
    writableEnded: false,
    writable: true,
    status(c: number) { this.statusCode = c; return this },
    json(b: unknown) { this.body = b; return this },
    end() { return this },
  }
  const req: any = { method: 'POST', originalUrl: '/api/x', aborted: false }
  return { req, res }
}

test('500 with a leaky message → generic text, no leak (even in non-production)', () => {
  const prev = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  const { req, res } = makeReqRes()
  const err: any = new Error('ECONNREFUSED firestore.googleapis.com 10.0.0.5:443 at QueryEngine.run')
  errorHandler(err, req, res, () => {})
  process.env.NODE_ENV = prev

  assert.equal(res.statusCode, 500)
  assert.equal(res.body.code, 'INTERNAL_ERROR')
  assert.equal(res.body.message, 'An internal error occurred')
  assert.equal(res.body.error, 'An internal error occurred', 'legacy field must mirror message')
  const serialized = JSON.stringify(res.body)
  assert.ok(!serialized.includes('firestore'), 'must not leak dependency host')
  assert.ok(!serialized.includes('10.0.0.5'), 'must not leak internal IP')
  assert.ok(!serialized.includes('QueryEngine'), 'must not leak stack hint')
})

test('explicit 502 also gets generic message', () => {
  const { req, res } = makeReqRes()
  const err: any = new Error('upstream Azure OpenAI returned secret-laden body')
  err.status = 502
  errorHandler(err, req, res, () => {})
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.message, 'An internal error occurred')
})

test('ZodError → 400 VALIDATION_ERROR with stable message + both fields', () => {
  const { req, res } = makeReqRes()
  const err = new ZodError([])
  errorHandler(err as any, req, res, () => {})
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.code, 'VALIDATION_ERROR')
  assert.equal(res.body.message, 'Request validation failed')
  assert.equal(res.body.error, res.body.message)
})

test('401 branch → generic auth message, both fields present', () => {
  const { req, res } = makeReqRes()
  const err: any = new Error('Unauthorized: token xyz')
  errorHandler(err, req, res, () => {})
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.code, 'UNAUTHORIZED')
  assert.equal(res.body.message, 'Authentication required')
})

test('every envelope has code + message + error keys', () => {
  const { req, res } = makeReqRes()
  errorHandler(new Error('boom') as any, req, res, () => {})
  assert.ok('code' in res.body && 'message' in res.body && 'error' in res.body)
})

process.on('exit', () => { console.error = origErr })
