/**
 * Unit tests for rateLimiter.ts (WE-20260527-047).
 *
 * Verifies the 429 contract:
 *   - `Retry-After` header is set (RFC 6585)
 *   - `RateLimit`, `RateLimit-Policy` headers are set (draft-7)
 *   - Body shape is `{ error: "rate_limited", retry_after, limit, window_seconds, scope }`
 *
 * Follows the same minimal-runner pattern as payuHash.test.ts / rateLock.test.ts:
 * compiles under `tsc --noEmit` and runs under ts-node. Wire into a real
 * runner (jest/vitest) when Sprint 2 lands.
 */

import http from 'http'
import { AddressInfo } from 'net'
import express from 'express'
import { apiRateLimiter, chatBurstRateLimiter, imageRateLimiter } from '../rateLimiter'

type TestFn = () => Promise<void> | void
const tests: Array<{ name: string; fn: TestFn }> = []
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn })
}
function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}
function assertTrue(cond: boolean, label: string): void {
  if (!cond) throw new Error(`${label}: expected true`)
}

interface FetchResult {
  status: number
  headers: Record<string, string>
  body: any
}

async function fetchJson(url: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let body: any = text
          try {
            body = JSON.parse(text)
          } catch {
            /* keep as string */
          }
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(',')
            else if (typeof v === 'string') headers[k.toLowerCase()] = v
          }
          resolve({ status: res.statusCode ?? 0, headers, body })
        })
      })
      .on('error', reject)
  })
}

async function withTestServer(
  build: (app: express.Application) => void,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express()
  build(app)
  const server = app.listen(0)
  await new Promise<void>((r) => server.on('listening', () => r()))
  const port = (server.address() as AddressInfo).port
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

// --- Tests -----------------------------------------------------------------

test('apiRateLimiter: 429 emits Retry-After + draft-7 RateLimit headers + structured body', async () => {
  await withTestServer(
    (app) => {
      app.use(apiRateLimiter)
      app.get('/probe', (_req, res) => res.json({ ok: true }))
    },
    async (base) => {
      // First 30 hits should pass (limit = 30/min).
      let last: FetchResult | null = null
      for (let i = 0; i < 32; i++) {
        last = await fetchJson(`${base}/probe`)
        if (last.status === 429) break
      }
      if (!last) throw new Error('no responses captured')
      assertEq(last.status, 429, 'final response status')

      // Standard headers.
      assertTrue(
        typeof last.headers['retry-after'] === 'string',
        'Retry-After header present',
      )
      const retryAfter = Number(last.headers['retry-after'])
      assertTrue(retryAfter > 0 && retryAfter <= 60, 'Retry-After within window')

      assertTrue(
        typeof last.headers['ratelimit-policy'] === 'string',
        'RateLimit-Policy header present',
      )
      assertTrue(
        last.headers['ratelimit-policy'].includes('30;w=60'),
        'RateLimit-Policy reflects 30/60s config',
      )
      assertTrue(
        typeof last.headers['ratelimit'] === 'string',
        'RateLimit (draft-7 combined) header present',
      )
      assertTrue(
        last.headers['ratelimit'].includes('limit=30'),
        'RateLimit advertises limit=30',
      )

      // Legacy headers should be off.
      assertEq(last.headers['x-ratelimit-limit'], undefined as any, 'no legacy X-RateLimit-Limit')

      // Body contract.
      assertEq(last.body.error, 'rate_limited', 'body.error')
      assertEq(last.body.scope, 'api', 'body.scope')
      assertEq(last.body.limit, 30, 'body.limit')
      assertEq(last.body.window_seconds, 60, 'body.window_seconds')
      assertTrue(
        typeof last.body.retry_after === 'number' && last.body.retry_after > 0,
        'body.retry_after positive number',
      )
    },
  )
})

test('imageRateLimiter: 429 has identical header + body contract scoped "image"', async () => {
  await withTestServer(
    (app) => {
      app.use(imageRateLimiter)
      app.get('/probe', (_req, res) => res.json({ ok: true }))
    },
    async (base) => {
      let last: FetchResult | null = null
      for (let i = 0; i < 7; i++) {
        last = await fetchJson(`${base}/probe`)
        if (last.status === 429) break
      }
      if (!last) throw new Error('no responses captured')
      assertEq(last.status, 429, 'final response status')

      assertTrue(typeof last.headers['retry-after'] === 'string', 'Retry-After present')
      assertEq(last.body.error, 'rate_limited', 'body.error')
      assertEq(last.body.scope, 'image', 'body.scope')
      assertEq(last.body.limit, 5, 'body.limit')
    },
  )
})

test('chatBurstRateLimiter: 429 has draft-7 headers + body preserves code "chat_burst_limit"', async () => {
  await withTestServer(
    (app) => {
      app.use(chatBurstRateLimiter)
      app.get('/probe', (_req, res) => res.json({ ok: true }))
    },
    async (base) => {
      let last: FetchResult | null = null
      for (let i = 0; i < 12; i++) {
        last = await fetchJson(`${base}/probe`)
        if (last.status === 429) break
      }
      if (!last) throw new Error('no responses captured')
      assertEq(last.status, 429, 'final response status')

      // Standard headers still present despite the custom handler.
      assertTrue(typeof last.headers['retry-after'] === 'string', 'Retry-After present')
      assertTrue(typeof last.headers['ratelimit'] === 'string', 'RateLimit header present')

      // Body has BOTH the new canonical error AND the legacy code for back-compat.
      assertEq(last.body.error, 'rate_limited', 'body.error normalized')
      assertEq(last.body.code, 'chat_burst_limit', 'body.code preserved for observability')
      assertEq(last.body.scope, 'chat_burst', 'body.scope')
      assertEq(last.body.limit, 10, 'body.limit')
      assertTrue(
        typeof last.body.retry_after === 'number' && last.body.retry_after > 0,
        'body.retry_after positive',
      )
    },
  )
})

// --- Runner ----------------------------------------------------------------

void (async () => {
  let failed = 0
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`ok - ${name}`)
    } catch (err) {
      failed++
      console.log(`not ok - ${name}`)
      console.log(`  ${(err as Error).message}`)
    }
  }
  console.log(`1..${tests.length}`)
  console.log(`# tests ${tests.length}`)
  console.log(`# pass ${tests.length - failed}`)
  console.log(`# fail ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
})()
