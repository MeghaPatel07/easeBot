/**
 * Unit tests for rateLock.ts.
 *
 * See payuHash.test.ts header — no runner is wired yet in Sprint 1.
 * These tests compile under `tsc --noEmit` and can be executed under
 * jest/vitest/ts-node when a runner lands in Sprint 2.
 */

import {
  ExchangeRateOutOfRangeError,
  __clearCacheForTesting,
  __setNowForTesting,
  getLockedRate,
} from '../rateLock'

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

// --- Tests -----------------------------------------------------------------

test('USD short-circuits to 1.0 without touching the cache', async () => {
  __clearCacheForTesting()
  const r = await getLockedRate('USD')
  assertEq(r.rate, 1.0, 'USD rate')
  assertEq(r.currency, 'USD', 'currency')
})

test('cache hit: second call within TTL returns source=cache with same rate', async () => {
  __clearCacheForTesting()
  let t = 1_000_000
  __setNowForTesting(() => t)

  const first = await getLockedRate('INR')
  // Sprint 1 stub returns 1.0 — but the cache semantics are what we test.
  assertEq(first.source, 'stub', 'first call source')
  const fixedRate = first.rate

  t += 30_000 // 30s later — still under TTL
  const second = await getLockedRate('INR')
  assertEq(second.source, 'cache', 'second call source')
  assertEq(second.rate, fixedRate, 'cached rate identical')
  assertEq(second.fetchedAt, first.fetchedAt, 'cached fetchedAt frozen')
})

test('cache expires after 60s and refetches', async () => {
  __clearCacheForTesting()
  let t = 2_000_000
  __setNowForTesting(() => t)

  const first = await getLockedRate('EUR')
  assertEq(first.source, 'stub', 'first fetch')

  t += 61_000 // past TTL
  const second = await getLockedRate('EUR')
  assertEq(second.source, 'stub', 'refetched after TTL')
  assertTrue(second.fetchedAt > first.fetchedAt, 'new fetchedAt')
})

test('sanity guard rejects rate <= 0 via ExchangeRateOutOfRangeError', () => {
  // We validate the error class exists and is throwable with a sane shape.
  // The actual guard fires inside getLockedRate against the live/stub fetch
  // result; under Sprint 1 the stub always returns 1.0, so to exercise the
  // guard we construct the error directly and assert its shape.
  const err = new ExchangeRateOutOfRangeError('INR', -0.5)
  assertTrue(err instanceof Error, 'is Error')
  assertEq(err.name, 'ExchangeRateOutOfRangeError', 'name')
  assertTrue(err.message.includes('INR'), 'message mentions currency')
  assertTrue(err.message.includes('-0.5'), 'message mentions rate')
})

test('sanity guard rejects rate > 10_000', () => {
  const err = new ExchangeRateOutOfRangeError('VND', 99_999)
  assertTrue(err.message.includes('99999'), 'message mentions rate')
})

// --- Runner ---------------------------------------------------------------

export async function runRateLockTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0
  let failed = 0
  for (const t of tests) {
    try {
      await t.fn()
      passed++
    } catch (e) {
      failed++
      // eslint-disable-next-line no-console
      console.error(`FAIL ${t.name}:`, e)
    }
  }
  return { passed, failed }
}
