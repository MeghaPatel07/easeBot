// Tests for the chat send/stream error taxonomy (WE-20260601-300/303).
// Run from Wedding-Ease-Viva-Chat:
//   node --experimental-strip-types --test src/lib/__tests__/chatSendErrors.test.ts
// Uses node:test — zero new deps. The module under test is dependency-free.

import { test, mock } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  classifySendError,
  parseRetryAfterMs,
  OfflineError,
  StreamTimeoutError,
  NoStreamError,
  HttpStatusError,
  StreamWatchdog,
} from '../chatSendErrors.ts'

// ── offline / network-failure path (WE-20260601-300) ────────────────────────

test('offline: explicit OfflineError classifies as offline + recoverable', () => {
  const c = classifySendError(new OfflineError(), true /* navigator says online, but err wins */)
  assert.equal(c.kind, 'offline')
  assert.equal(c.recoverable, true)
  assert.match(c.message, /offline/i)
  assert.match(c.message, /retry/i)
})

test('offline: navigator.onLine=false classifies a plain error as offline', () => {
  const c = classifySendError(new Error('boom'), false /* offline */)
  assert.equal(c.kind, 'offline')
  assert.equal(c.recoverable, true)
})

test('offline: a fetch "Failed to fetch" TypeError classifies as offline even when nominally online', () => {
  const err = new TypeError('Failed to fetch')
  const c = classifySendError(err, true)
  assert.equal(c.kind, 'offline')
  assert.equal(c.recoverable, true)
})

test('offline: other network TypeError variants are recognised', () => {
  for (const msg of ['NetworkError when attempting to fetch resource', 'Load failed', 'Network request failed']) {
    const c = classifySendError(new TypeError(msg), true)
    assert.equal(c.kind, 'offline', `expected offline for "${msg}"`)
  }
})

// ── timeout / stalled-stream path (WE-20260601-303) ─────────────────────────

test('timeout: StreamTimeoutError classifies as timeout + recoverable with retry copy', () => {
  const c = classifySendError(new StreamTimeoutError(), true)
  assert.equal(c.kind, 'timeout')
  assert.equal(c.recoverable, true)
  assert.match(c.message, /stalled/i)
  assert.match(c.message, /retry/i)
})

test('timeout: takes priority over an online navigator and is not mislabelled offline', () => {
  const c = classifySendError(new StreamTimeoutError(), true)
  assert.equal(c.kind, 'timeout')
})

// ── no-stream path (adjacent WE-20260601-304) ───────────────────────────────

test('no-stream: NoStreamError classifies as no-stream + recoverable', () => {
  const c = classifySendError(new NoStreamError(), true)
  assert.equal(c.kind, 'no-stream')
  assert.equal(c.recoverable, true)
})

// ── HTTP status splitting: 429 vs 400/413 ───────────────────────────────────

test('rate-limited: 429 classifies as rate-limited + recoverable + carries retryAfterMs', () => {
  const c = classifySendError(new HttpStatusError(429, 'slow down', 5000), true)
  assert.equal(c.kind, 'rate-limited')
  assert.equal(c.recoverable, true)
  assert.equal(c.retryAfterMs, 5000)
})

test('too-long: 400 classifies as too-long + NOT recoverable', () => {
  const c = classifySendError(new HttpStatusError(400, 'too long'), true)
  assert.equal(c.kind, 'too-long')
  assert.equal(c.recoverable, false)
})

test('too-long: 413 (payload too large) also classifies as too-long', () => {
  const c = classifySendError(new HttpStatusError(413), true)
  assert.equal(c.kind, 'too-long')
  assert.equal(c.recoverable, false)
})

test('generic: an unrecognised 500 status falls through to generic', () => {
  const c = classifySendError(new HttpStatusError(500, 'server error'), true)
  assert.equal(c.kind, 'generic')
  assert.equal(c.recoverable, true)
})

// ── quota + aborted edges ────────────────────────────────────────────────────

test('quota: quota_exceeded code surfaces as quota + not recoverable', () => {
  const err = Object.assign(new Error('Quota exceeded.'), { code: 'quota_exceeded' })
  const c = classifySendError(err, true)
  assert.equal(c.kind, 'quota')
  assert.equal(c.recoverable, false)
})

test('aborted: an AbortError while online classifies as aborted (user Stop)', () => {
  const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
  const c = classifySendError(err, true)
  assert.equal(c.kind, 'aborted')
})

test('aborted while offline is treated as a network failure (offline), not a user stop', () => {
  const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
  const c = classifySendError(err, false)
  assert.equal(c.kind, 'offline')
})

test('generic: a bare unknown error is the generic fallback', () => {
  const c = classifySendError(new Error('???'), true)
  assert.equal(c.kind, 'generic')
  assert.equal(c.recoverable, true)
  assert.match(c.message, /something went wrong/i)
})

// ── parseRetryAfterMs ─────────────────────────────────────────────────────────

test('parseRetryAfterMs: numeric seconds → ms', () => {
  assert.equal(parseRetryAfterMs('5'), 5000)
  assert.equal(parseRetryAfterMs(' 12 '), 12000)
})

test('parseRetryAfterMs: absent / unparseable → undefined', () => {
  assert.equal(parseRetryAfterMs(null), undefined)
  assert.equal(parseRetryAfterMs(''), undefined)
  assert.equal(parseRetryAfterMs('not-a-date'), undefined)
})

test('parseRetryAfterMs: future HTTP-date → positive ms; past date → 0', () => {
  const future = new Date(Date.now() + 30_000).toUTCString()
  const ms = parseRetryAfterMs(future)
  assert.ok(typeof ms === 'number' && ms > 0 && ms <= 30_000, `expected ~30000, got ${ms}`)

  const past = new Date(Date.now() - 30_000).toUTCString()
  assert.equal(parseRetryAfterMs(past), 0)
})

// ── StreamWatchdog (WE-20260601-303) ─────────────────────────────────────────
// Uses node:test fake timers so we can advance time deterministically without
// real waits. The watchdog must abort + flag timedOut when the stream stalls,
// must NOT abort while chunks keep arriving (idle re-armed), and must
// distinguish a user-Stop (timedOut stays false) from an idle/overall trip.

test('watchdog: idle timeout aborts and flags timedOut when no chunk arrives', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const wd = new StreamWatchdog(45_000, 180_000)
    wd.armIdle()
    assert.equal(wd.signal.aborted, false)
    assert.equal(wd.timedOut, false)
    mock.timers.tick(45_000)
    assert.equal(wd.signal.aborted, true, 'idle expiry should abort')
    assert.equal(wd.timedOut, true, 'idle expiry should set timedOut')
    wd.clear()
  } finally {
    mock.timers.reset()
  }
})

test('watchdog: re-arming idle on each chunk prevents the idle timeout', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const wd = new StreamWatchdog(45_000, 180_000)
    wd.armIdle()
    // Three "chunks" arrive 40s apart — each re-arms the 45s idle timer.
    for (let i = 0; i < 3; i++) {
      mock.timers.tick(40_000)
      assert.equal(wd.signal.aborted, false, `should not abort at chunk ${i}`)
      wd.armIdle()
    }
    assert.equal(wd.timedOut, false)
    wd.clear()
  } finally {
    mock.timers.reset()
  }
})

test('watchdog: overall ceiling trips even while chunks keep the idle timer alive', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const wd = new StreamWatchdog(45_000, 180_000)
    wd.armIdle()
    // A chunk every 40s keeps idle alive, but the 180s hard ceiling must fire.
    for (let i = 0; i < 5; i++) {
      mock.timers.tick(40_000) // total 200s after loop
      wd.armIdle()
    }
    assert.equal(wd.signal.aborted, true, 'overall ceiling should abort')
    assert.equal(wd.timedOut, true)
    wd.clear()
  } finally {
    mock.timers.reset()
  }
})

test('watchdog: a user-Stop aborts the fetch but does NOT set timedOut', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const userController = new AbortController()
    const wd = new StreamWatchdog(45_000, 180_000, userController.signal)
    wd.armIdle()
    userController.abort() // user pressed Stop
    assert.equal(wd.signal.aborted, true, 'user Stop should abort the chained signal')
    assert.equal(wd.timedOut, false, 'user Stop must not be reported as a timeout')
    wd.clear()
  } finally {
    mock.timers.reset()
  }
})

test('watchdog: clear() stops the idle timer from firing later', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const wd = new StreamWatchdog(45_000, 180_000)
    wd.armIdle()
    wd.clear()
    mock.timers.tick(200_000)
    assert.equal(wd.signal.aborted, false, 'cleared watchdog must not abort')
    assert.equal(wd.timedOut, false)
  } finally {
    mock.timers.reset()
  }
})

test('watchdog: an already-aborted user signal aborts immediately on construct', () => {
  const userController = new AbortController()
  userController.abort()
  const wd = new StreamWatchdog(45_000, 180_000, userController.signal)
  assert.equal(wd.signal.aborted, true)
  assert.equal(wd.timedOut, false)
  wd.clear()
})
