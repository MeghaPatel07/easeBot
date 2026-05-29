// WE-20260528-002 — unit tests for the TTS controller's request validation
// + error-handling, focused on the SSML-injection fix.
//
// Strategy: stub `services/azureTTS` in require.cache BEFORE importing the
// controller, so we can assert what `voiceName` (if any) the controller
// forwards to generateSpeech for each input. Mirrors the mocking pattern used
// in transcribeController.test.ts.
//
// Run: npm run test:tts

import { test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from 'path'

// ── 1. Stub azureTTS BEFORE importing the controller ───────────────────────
type GenerateSpeechCall = { text: string; voiceName?: string; language?: string }
const azureCalls: GenerateSpeechCall[] = []
let azureImpl: (opts: GenerateSpeechCall) => Promise<Buffer> =
  async () => Buffer.from('RIFFwav-mock-bytes')

const azurePath = path.resolve(__dirname, '..', '..', 'services', 'azureTTS.ts')
require.cache[azurePath] = {
  id: azurePath,
  filename: azurePath,
  loaded: true,
  children: [],
  exports: {
    generateSpeech: async (opts: GenerateSpeechCall) => {
      azureCalls.push(opts)
      return azureImpl(opts)
    },
  },
} as any

// Stub posthog too — controller calls capture() on error paths.
const posthogPath = path.resolve(__dirname, '..', '..', 'lib', 'posthog.ts')
require.cache[posthogPath] = {
  id: posthogPath,
  filename: posthogPath,
  loaded: true,
  children: [],
  exports: { capture: () => { /* noop */ } },
} as any

// Swallow controller's console.error so the test output stays readable.
const origErr = console.error
console.error = () => { /* noop */ }

import { handleTTS } from '../ttsController'

// ── 2. Minimal Express req/res fakes ──────────────────────────────────────
interface FakeRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  sent: Buffer | null
  status(n: number): FakeRes
  json(x: unknown): FakeRes
  set(k: string, v: string): FakeRes
  send(b: any): FakeRes
}
function mkRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200,
    body: null,
    headers: {},
    sent: null,
    status(n) { this.statusCode = n; return this },
    json(x) { this.body = x; return this },
    set(k, v) { this.headers[k] = v; return this },
    send(b) { this.sent = b as Buffer; return this },
  }
  return r
}
function mkReq(body: any): any {
  return { body, user: undefined, headers: {} }
}

beforeEach(() => {
  azureCalls.length = 0
  azureImpl = async () => Buffer.from('RIFFwav-mock-bytes')
})

// ── 3. Validation tests ────────────────────────────────────────────────────

test('WE-20260528-002: SSML voice-swap injection (closes <voice>, opens new one) → 400, no Azure call', async () => {
  const res = mkRes()
  await handleTTS(
    mkReq({ text: 'hello', voiceName: 'x"></voice><voice name="en-US-JennyNeural' }),
    res as any,
  )
  assert.equal(res.statusCode, 400, 'must reject malicious voiceName with 400')
  assert.equal(azureCalls.length, 0, 'must NOT call Azure with injected SSML')
  assert.match(JSON.stringify(res.body), /Validation failed/)
})

test('WE-20260528-002: SSML prosody injection → 400, no Azure call (no vendor leak)', async () => {
  const res = mkRes()
  await handleTTS(
    mkReq({
      text: 'hi',
      voiceName: 'en-US-AriaNeural"/><prosody rate="slow"/><voice name="en-US-JennyNeural',
    }),
    res as any,
  )
  assert.equal(res.statusCode, 400)
  assert.equal(azureCalls.length, 0)
  // Critical: the vendor error string from Azure must NOT appear in the body
  const bodyJson = JSON.stringify(res.body)
  assert.doesNotMatch(bodyJson, /websocket error code/i)
  assert.doesNotMatch(bodyJson, /RootSpeak/i)
})

test('legitimate Gemini preset voiceName ("Kore") is accepted', async () => {
  const res = mkRes()
  await handleTTS(mkReq({ text: 'hello there', voiceName: 'Kore' }), res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(azureCalls.length, 1)
  assert.equal(azureCalls[0].voiceName, 'Kore')
})

test('legitimate Azure voice ID ("en-US-AriaNeural") is accepted', async () => {
  const res = mkRes()
  await handleTTS(mkReq({ text: 'hi there', voiceName: 'en-US-AriaNeural' }), res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(azureCalls.length, 1)
  assert.equal(azureCalls[0].voiceName, 'en-US-AriaNeural')
})

test('missing voiceName is allowed (defaults applied downstream)', async () => {
  const res = mkRes()
  await handleTTS(mkReq({ text: 'hello' }), res as any)
  assert.equal(res.statusCode, 200)
  assert.equal(azureCalls.length, 1)
  assert.equal(azureCalls[0].voiceName, undefined)
})

test('unknown but plausible Azure voice ID (not in our map) → 400', async () => {
  // An attacker can no longer get a free pass just by appending "Neural" to
  // an arbitrary string — the allowlist requires an exact match.
  const res = mkRes()
  await handleTTS(
    mkReq({ text: 'hello', voiceName: 'en-US-MadeUpVoiceNeural' }),
    res as any,
  )
  assert.equal(res.statusCode, 400)
  assert.equal(azureCalls.length, 0)
})

test('missing text → 400, no Azure call', async () => {
  const res = mkRes()
  await handleTTS(mkReq({ voiceName: 'Kore' }), res as any)
  assert.equal(res.statusCode, 400)
  assert.equal(azureCalls.length, 0)
})

test('empty text → 400, no Azure call', async () => {
  const res = mkRes()
  await handleTTS(mkReq({ text: '', voiceName: 'Kore' }), res as any)
  assert.equal(res.statusCode, 400)
  assert.equal(azureCalls.length, 0)
})

// ── 4. Vendor-error-leak tests (mirrors WE-20260527-353 pattern) ──────────

test('Azure SDK error → 500 with canned message, NO err.message leak', async () => {
  azureImpl = async () => {
    throw new Error(
      'Azure TTS cancelled: Node [speak] with type [RootSpeak] should not contain node [prosody] with type [Others]. websocket error code: 1007',
    )
  }
  const res = mkRes()
  await handleTTS(mkReq({ text: 'hi', voiceName: 'Kore' }), res as any)
  assert.equal(res.statusCode, 500)
  const bodyJson = JSON.stringify(res.body)
  // The canned safe message
  assert.match(bodyJson, /TTS generation failed/)
  // The vendor-internal details MUST NOT leak
  assert.doesNotMatch(bodyJson, /websocket error code/i)
  assert.doesNotMatch(bodyJson, /RootSpeak/i)
  assert.doesNotMatch(bodyJson, /Azure TTS cancelled/i)
})

test('Azure SDK error with Microsoft URL → no URL leak', async () => {
  azureImpl = async () => {
    throw new Error(
      'Azure TTS error: see https://go.microsoft.com/fwlink/?linkid=2198766 for details',
    )
  }
  const res = mkRes()
  await handleTTS(mkReq({ text: 'hi', voiceName: 'Kore' }), res as any)
  assert.equal(res.statusCode, 500)
  const bodyJson = JSON.stringify(res.body)
  assert.doesNotMatch(bodyJson, /microsoft\.com/i)
  assert.doesNotMatch(bodyJson, /https?:\/\//)
})

// ── 5. Cleanup ─────────────────────────────────────────────────────────────
test('teardown: restore console.error', () => {
  console.error = origErr
})
