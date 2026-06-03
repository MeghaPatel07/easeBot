// Phase 1 QA — combined tests for:
//   #9 observability envelope harness (all 3 stt.* event schemas)
//   #10 mock-run of handleTranscribe across the language-priority matrix
//
// Technique: seed require.cache with a mock `services/stt` BEFORE importing
// the controller. Then exercise handleTranscribe with fake Express req/res.
// No prod code changes, no Firebase network, no Azure network.

import { test, before, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from 'path'

// ── 1. Observability capture ────────────────────────────────────────────────
const capturedEvents: Array<Record<string, unknown>> = []
const origLog = console.log
const origErr = console.error
console.log = (line: unknown) => {
  if (typeof line === 'string' && line.startsWith('{')) {
    try {
      const parsed = JSON.parse(line)
      if (parsed?.kind === 'obs') {
        capturedEvents.push(parsed)
        return
      }
    } catch { /* passthrough */ }
  }
  origLog(line as string)
}
console.error = () => { /* swallow controller's console.error noise during negative tests */ }

// ── 2. Seed require.cache with a fake stt module ────────────────────────────
// Any call the controller makes to transcribeAudio goes to `sttMock`.
type TranscribeCall = { audioBase64: string; preferredLanguage: string | undefined }
const sttCalls: TranscribeCall[] = []
let sttImpl: (audioBase64: string, lang?: string) => Promise<{ text: string; detectedLanguageCode: string }> =
  async (_b, lang) => ({ text: 'mocked transcript', detectedLanguageCode: lang ?? 'en-US' })

const sttPath = path.resolve(__dirname, '..', '..', 'services', 'stt.ts')
require.cache[sttPath] = {
  id: sttPath,
  filename: sttPath,
  loaded: true,
  children: [],
  exports: {
    transcribeAudio: async (audioBase64: string, lang?: string) => {
      sttCalls.push({ audioBase64, preferredLanguage: lang })
      return sttImpl(audioBase64, lang)
    },
  },
} as any

// ── 3. Seed a fake Firestore fetcher into userPrefsCache ────────────────────
import {
  __setFirestoreFetcherForTests,
  __clearCacheForTests,
  type FirestoreFetcher,
  type UserLangSnapshot,
} from '../../lib/userPrefsCache'

// ── 4. Now import the controller — its `import sttTranscribe` resolves to our mock
import { handleTranscribe } from '../transcribeController'

// ── 5. Minimal Express req/res fakes ────────────────────────────────────────
interface FakeRes {
  statusCode: number
  body: unknown
  status(n: number): FakeRes
  json(x: unknown): FakeRes
}
function mkRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 0,
    body: null,
    status(n) { this.statusCode = n; return this },
    json(x) { this.body = x; return this },
  }
  return r
}
function mkReq(opts: {
  audioBase64?: string
  durationSeconds?: number
  language?: string
  uid?: string
} = {}): any {
  return {
    body: {
      audioBase64: opts.audioBase64 ?? 'AAAA',
      durationSeconds: opts.durationSeconds,
      language: opts.language,
    },
    user: opts.uid ? { uid: opts.uid } : undefined,
    quotaContext: undefined,
  }
}

function fetcher(snap: UserLangSnapshot): FirestoreFetcher {
  return async (_uid: string) => snap
}

before(() => { /* log capture already installed */ })

beforeEach(() => {
  capturedEvents.length = 0
  sttCalls.length = 0
  sttImpl = async (_b, lang) => ({ text: 'mocked transcript', detectedLanguageCode: lang ?? 'en-US' })
  __clearCacheForTests()
  __setFirestoreFetcherForTests(async () => { throw new Error('fetcher not set by test') })
})

function eventsOf(name: string): Record<string, unknown>[] {
  return capturedEvents.filter((e) => e.event === name)
}

// ────────────────────────────────────────────────────────────────────────────
// Controller scenarios — exercises the language-priority matrix and cache flow
// ────────────────────────────────────────────────────────────────────────────

test('anonymous user: no pref lookup, passes undefined to STT, returns 200', async () => {
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: undefined }), res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(sttCalls.length, 1)
  assert.equal(sttCalls[0].preferredLanguage, undefined, 'anonymous must pass undefined')
  assert.equal(eventsOf('stt.pref_cache').length, 0, 'no pref_cache event for anonymous')
})

test('signed-in user with DB lang: cache MISS then STT called with that lang', async () => {
  __setFirestoreFetcherForTests(
    fetcher({ exists: true, data: { preferences: { language: 'hi' } } }),
  )
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'user-hi' }), res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(sttCalls[0].preferredLanguage, 'hi')
  const ev = eventsOf('stt.pref_cache').pop()
  assert.equal(ev?.result, 'MISS')
  assert.equal(ev?.lang, 'hi')
})

test('body language override wins over DB lang', async () => {
  __setFirestoreFetcherForTests(
    fetcher({ exists: true, data: { preferences: { language: 'hi' } } }),
  )
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'user-hi', language: 'gu' }), res as any)
  assert.equal(sttCalls[0].preferredLanguage, 'gu', 'body override must win')
})

test("body language === 'auto' falls back to DB lang", async () => {
  __setFirestoreFetcherForTests(
    fetcher({ exists: true, data: { preferences: { language: 'hi' } } }),
  )
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'user-hi', language: 'auto' }), res as any)
  assert.equal(sttCalls[0].preferredLanguage, 'hi')
})

test("DB lang === 'auto' resolves to undefined → legacy 4-lang autodetect", async () => {
  __setFirestoreFetcherForTests(
    fetcher({ exists: true, data: { preferences: { language: 'auto' } } }),
  )
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'user-auto' }), res as any)
  assert.equal(sttCalls[0].preferredLanguage, undefined)
})

test('signed-in user with no user doc: STT called with undefined', async () => {
  __setFirestoreFetcherForTests(fetcher({ exists: false }))
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'ghost-user' }), res as any)
  assert.equal(sttCalls[0].preferredLanguage, undefined)
  assert.equal(res.statusCode, 200)
  const ev = eventsOf('stt.pref_cache').pop()
  assert.equal(ev?.result, 'MISS')
  assert.equal(ev?.reason, 'no_doc')
})

test('Firestore error: STT still runs with undefined, request succeeds', async () => {
  __setFirestoreFetcherForTests(async () => { throw new Error('network down') })
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'err-user' }), res as any)
  assert.equal(res.statusCode, 200, 'Firestore failure must not 500 the request')
  assert.equal(sttCalls[0].preferredLanguage, undefined, 'falls back to legacy 4-lang autodetect')
  const ev = eventsOf('stt.pref_cache').pop()
  assert.equal(ev?.result, 'ERROR')
})

test('second request same user within TTL: HIT, no Firestore call', async () => {
  let fetches = 0
  __setFirestoreFetcherForTests(async () => {
    fetches += 1
    return { exists: true, data: { preferences: { language: 'gu' } } }
  })
  const r1 = mkRes()
  const r2 = mkRes()
  await handleTranscribe(mkReq({ uid: 'warm-user' }), r1 as any)
  await handleTranscribe(mkReq({ uid: 'warm-user' }), r2 as any)
  assert.equal(fetches, 1, 'second call must not touch Firestore')
  assert.equal(sttCalls.length, 2)
  assert.equal(sttCalls[0].preferredLanguage, 'gu')
  assert.equal(sttCalls[1].preferredLanguage, 'gu')
  const prefEvents = eventsOf('stt.pref_cache')
  assert.equal(prefEvents.length, 2)
  assert.equal(prefEvents[0].result, 'MISS')
  assert.equal(prefEvents[1].result, 'HIT')
})

test('missing audioBase64 → 400, no STT call, no pref lookup', async () => {
  const res = mkRes()
  await handleTranscribe({ body: {}, user: { uid: 'u' } } as any, res as any)
  assert.equal(res.statusCode, 400)
  assert.equal(sttCalls.length, 0)
  assert.equal(eventsOf('stt.pref_cache').length, 0)
})

test('STT throws → 500 with scrubbed body (no internal error message leaked)', async () => {
  __setFirestoreFetcherForTests(fetcher({ exists: false }))
  // WE-20260527-209 (CWE-209): the controller must NEVER echo the underlying
  // err.message — ffmpeg stderr leaks server temp paths through this path.
  // Simulate an ffmpeg-style failure carrying an absolute path; verify the
  // client payload is the generic shape and the leak string is absent.
  sttImpl = async () => {
    throw new Error(
      'Audio conversion failed: /var/folders/gd/p3q5gbvd1cl4gn1p8j1t9c4r0000gn/T/viva-input-1779875900921.webm: Invalid data',
    )
  }
  const res = mkRes()
  await handleTranscribe(mkReq({ uid: 'u' }), res as any)
  assert.equal(res.statusCode, 500)
  const bodyStr = JSON.stringify(res.body)
  assert.ok(!bodyStr.includes('/var/folders'), 'response must not leak absolute temp paths')
  assert.ok(!bodyStr.includes('viva-input-'), 'response must not leak temp file names')
  assert.ok(!bodyStr.includes('Invalid data'), 'response must not leak ffmpeg stderr')
  assert.deepEqual(res.body, { error: 'Audio could not be processed', code: 'TRANSCRIBE_FAILED' })
})

// ────────────────────────────────────────────────────────────────────────────
// Observability envelope — verify wire shape for every event type
// ────────────────────────────────────────────────────────────────────────────

test('observability: every captured event has kind=obs, event, ts, and a parsable JSON line', async () => {
  __setFirestoreFetcherForTests(
    fetcher({ exists: true, data: { preferences: { language: 'hi' } } }),
  )
  await handleTranscribe(mkReq({ uid: 'envelope-check' }), mkRes() as any)
  assert.ok(capturedEvents.length >= 1)
  for (const ev of capturedEvents) {
    assert.equal(ev.kind, 'obs', 'kind must be "obs"')
    assert.equal(typeof ev.event, 'string')
    assert.ok(typeof ev.ts === 'string' && ev.ts.includes('T'), 'ts must be ISO')
  }
})

test('observability: stt.timing and stt.error emits have stable required fields', async () => {
  // Emit directly via the real observability module — same emit() the stt.ts uses.
  const { emit } = await import('../../lib/observability')
  capturedEvents.length = 0
  emit('stt.timing', {
    ffmpeg_ms: 200,
    azure_ms: 800,
    total_ms: 1100,
    is_wav_fast_path: false,
    payload_bytes: 48000,
    candidate_count: 2,
    candidates: ['hi-IN', 'en-US'],
    preferred_locale: 'hi',
    detected_locale: 'hi-IN',
    text_length: 24,
    retries_used: 0,
  })
  emit('stt.error', {
    stage: 'azure',
    ffmpeg_ms: 0,
    azure_ms: 0,
    total_ms: 0,
    is_wav_fast_path: true,
    payload_bytes: 480,
    candidate_count: 1,
    preferred_locale: 'en',
    retries_used: 1,
    error: 'simulated',
  })
  assert.equal(capturedEvents.length, 2)
  const timing = capturedEvents[0]
  const errEvt = capturedEvents[1]
  assert.equal(timing.event, 'stt.timing')
  assert.ok(typeof timing.total_ms === 'number')
  assert.ok(Array.isArray(timing.candidates))
  assert.equal(errEvt.event, 'stt.error')
  assert.equal(errEvt.stage, 'azure')
  assert.equal(typeof errEvt.error, 'string')
})
