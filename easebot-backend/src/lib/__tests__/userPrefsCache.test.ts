// Phase 1 QA — unit tests for userPrefsCache.ts
// Run from easebot-backend/:
//   npx ts-node --transpile-only --test src/lib/__tests__/userPrefsCache.test.ts
// or:
//   npm run test:phase1   (if added to package.json scripts)
//
// Uses Node's built-in node:test runner + assert — zero new deps.

import { test, before, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'

// Capture observability events BEFORE importing userPrefsCache so the emit
// function still uses the real console.log override below.
const capturedEvents: Array<{ event: string; attrs: Record<string, unknown> }> = []
const origLog = console.log
function installLogCapture(): void {
  console.log = (line: unknown) => {
    if (typeof line === 'string' && line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line)
        if (parsed?.kind === 'obs') {
          capturedEvents.push({ event: parsed.event, attrs: parsed })
          return
        }
      } catch { /* not our JSON line, pass through */ }
    }
    origLog(line as string)
  }
}
function uninstallLogCapture(): void {
  console.log = origLog
}

// Import after log capture is installed. The module loads firebase/firestore
// but defaultFirestoreFetcher is never called when tests inject a fake.
import {
  getCachedUserLanguage,
  invalidateUserLanguage,
  __setFirestoreFetcherForTests,
  __clearCacheForTests,
  __cacheSizeForTests,
  type FirestoreFetcher,
  type UserLangSnapshot,
} from '../userPrefsCache'

before(() => {
  installLogCapture()
})

beforeEach(() => {
  __clearCacheForTests()
  capturedEvents.length = 0
  // Reset to a do-nothing fetcher; each test installs its own.
  __setFirestoreFetcherForTests(async () => { throw new Error('fetcher not set by test') })
})

function fetcherReturning(snap: UserLangSnapshot, counter?: { calls: number }): FirestoreFetcher {
  return async (_uid: string) => {
    if (counter) counter.calls += 1
    return snap
  }
}

function lastEvent(name: string): Record<string, unknown> | undefined {
  for (let i = capturedEvents.length - 1; i >= 0; i--) {
    if (capturedEvents[i].event === name) return capturedEvents[i].attrs
  }
  return undefined
}

// ────────────────────────────────────────────────────────────────────────────

test('anonymous: empty/undefined uid short-circuits with no Firestore call and no event', async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(fetcherReturning({ exists: false }, counter))
  const r1 = await getCachedUserLanguage('')
  assert.equal(r1, undefined)
  assert.equal(counter.calls, 0, 'fetcher must not run for empty uid')
  assert.equal(capturedEvents.length, 0, 'no events for anonymous short-circuit')
})

test('cold MISS: fetcher called, MISS event emitted, value cached', async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: 'hi' } } }, counter),
  )
  const r = await getCachedUserLanguage('user-1')
  assert.equal(r, 'hi')
  assert.equal(counter.calls, 1)
  const ev = lastEvent('stt.pref_cache')
  assert.equal(ev?.result, 'MISS')
  assert.equal(ev?.lang, 'hi')
  assert.equal(__cacheSizeForTests(), 1)
})

test('warm HIT: second call within TTL skips fetcher, emits HIT', async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: 'gu' } } }, counter),
  )
  await getCachedUserLanguage('user-2')
  capturedEvents.length = 0
  const r2 = await getCachedUserLanguage('user-2')
  assert.equal(r2, 'gu')
  assert.equal(counter.calls, 1, 'fetcher must not run on HIT')
  assert.equal(lastEvent('stt.pref_cache')?.result, 'HIT')
})

test('no doc: caches null sentinel; subsequent calls HIT without fetcher', async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(fetcherReturning({ exists: false }, counter))
  const r1 = await getCachedUserLanguage('ghost-user')
  assert.equal(r1, undefined)
  const miss = lastEvent('stt.pref_cache')
  assert.equal(miss?.result, 'MISS')
  assert.equal(miss?.lang, 'none')
  assert.equal(miss?.reason, 'no_doc')

  const r2 = await getCachedUserLanguage('ghost-user')
  assert.equal(r2, undefined)
  assert.equal(counter.calls, 1, 'fetcher must not re-run for cached-missing doc')
  assert.equal(lastEvent('stt.pref_cache')?.result, 'HIT')
})

test("'auto' preference resolves to undefined and is cached as null", async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: 'auto' } } }, counter),
  )
  const r = await getCachedUserLanguage('auto-user')
  assert.equal(r, undefined)
  assert.equal(lastEvent('stt.pref_cache')?.lang, 'none')

  capturedEvents.length = 0
  const r2 = await getCachedUserLanguage('auto-user')
  assert.equal(r2, undefined)
  assert.equal(counter.calls, 1)
  assert.equal(lastEvent('stt.pref_cache')?.result, 'HIT')
})

test('legacy preferredLanguage field still works when preferences.language absent', async () => {
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferredLanguage: 'es' } }),
  )
  const r = await getCachedUserLanguage('legacy-user')
  assert.equal(r, 'es')
})

test('preferences.language wins over legacy preferredLanguage', async () => {
  __setFirestoreFetcherForTests(
    fetcherReturning({
      exists: true,
      data: { preferences: { language: 'hi' }, preferredLanguage: 'gu' },
    }),
  )
  const r = await getCachedUserLanguage('both-fields-user')
  assert.equal(r, 'hi', 'new field must win')
})

test('empty string preference resolves to undefined (not cached as the string)', async () => {
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: '' } } }),
  )
  const r = await getCachedUserLanguage('empty-pref-user')
  assert.equal(r, undefined)
})

test('fetcher throws: ERROR event emitted, returns undefined, does NOT cache', async () => {
  let calls = 0
  __setFirestoreFetcherForTests(async () => {
    calls += 1
    throw new Error('simulated Firestore outage')
  })
  const r = await getCachedUserLanguage('err-user')
  assert.equal(r, undefined)
  const ev = lastEvent('stt.pref_cache')
  assert.equal(ev?.result, 'ERROR')
  assert.ok(String(ev?.error).includes('simulated Firestore outage'))
  assert.equal(__cacheSizeForTests(), 0, 'errors must not poison the cache')

  // Next call retries the fetcher — verifies no negative-caching on errors.
  const r2 = await getCachedUserLanguage('err-user')
  assert.equal(r2, undefined)
  assert.equal(calls, 2, 'fetcher re-runs after error (no negative cache)')
})

test('invalidate: forces next call to re-fetch', async () => {
  const counter = { calls: 0 }
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: 'hi' } } }, counter),
  )
  await getCachedUserLanguage('inv-user')          // MISS, cached
  await getCachedUserLanguage('inv-user')          // HIT
  assert.equal(counter.calls, 1)

  invalidateUserLanguage('inv-user')
  const ev = lastEvent('stt.pref_cache')
  assert.equal(ev?.result, 'INVALIDATE')

  await getCachedUserLanguage('inv-user')          // MISS again
  assert.equal(counter.calls, 2)
  assert.equal(lastEvent('stt.pref_cache')?.result, 'MISS')
})

test('invalidate with empty uid is a no-op', () => {
  const sizeBefore = __cacheSizeForTests()
  invalidateUserLanguage('')
  assert.equal(__cacheSizeForTests(), sizeBefore)
  assert.equal(lastEvent('stt.pref_cache'), undefined, 'no event for empty uid invalidate')
})

test('different uids cached independently', async () => {
  __setFirestoreFetcherForTests(async (uid) => {
    if (uid === 'u-hi') return { exists: true, data: { preferences: { language: 'hi' } } }
    if (uid === 'u-gu') return { exists: true, data: { preferences: { language: 'gu' } } }
    return { exists: false }
  })
  const r1 = await getCachedUserLanguage('u-hi')
  const r2 = await getCachedUserLanguage('u-gu')
  const r3 = await getCachedUserLanguage('u-none')
  assert.equal(r1, 'hi')
  assert.equal(r2, 'gu')
  assert.equal(r3, undefined)
  assert.equal(__cacheSizeForTests(), 3)
})

test('observability envelope shape is stable for downstream parsers', async () => {
  __setFirestoreFetcherForTests(
    fetcherReturning({ exists: true, data: { preferences: { language: 'hi' } } }),
  )
  await getCachedUserLanguage('envelope-user')
  const ev = lastEvent('stt.pref_cache')
  assert.ok(ev, 'event must be emitted')
  // observability.ts `emit()` stamps kind + event + ts + ...attrs
  assert.equal(ev?.kind, 'obs')
  assert.equal(ev?.event, 'stt.pref_cache')
  assert.ok(typeof ev?.ts === 'string' && ev?.ts.includes('T'))
  assert.equal(ev?.uid, 'envelope-user')
  assert.equal(ev?.result, 'MISS')
})
