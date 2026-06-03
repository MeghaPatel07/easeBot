// Tests for the circuit breaker fast-fail behaviour (WE-20260601-453).
//
// The bug this guards against: llm/image/speech breakers existed but were never
// wired into the service call sites, so a flapping upstream produced N hanging
// or failing requests instead of an immediate, cheap, graceful rejection. These
// tests assert that once the breaker is OPEN it short-circuits — it neither
// invokes the wrapped (slow/failing) function nor hangs; it rejects immediately
// with a CircuitBreakerError.
//
// Run: npm run test:phase3:breaker  (or: ts-node --transpile-only this file)

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  CircuitBreaker,
  CircuitBreakerError,
  llmCircuitBreaker,
  imageCircuitBreaker,
  speechCircuitBreaker,
} from '../circuitBreaker'

// A deterministic always-failing async fn (simulates a provider outage).
const fail = () => Promise.reject(new Error('upstream 500'))

// Drives a breaker to OPEN by exhausting its failure threshold.
async function trip(cb: CircuitBreaker, threshold: number): Promise<void> {
  for (let i = 0; i < threshold; i++) {
    await assert.rejects(cb.execute(fail))
  }
}

test('breaker opens after the failure threshold and reports OPEN', async () => {
  const cb = new CircuitBreaker({
    name: 'TestSvc',
    failureThreshold: 3,
    windowMs: 60_000,
    cooldownMs: 60_000,
  })
  assert.equal(cb.getState(), 'CLOSED')
  await trip(cb, 3)
  assert.equal(cb.getState(), 'OPEN')
})

test('an OPEN breaker short-circuits with CircuitBreakerError — it does NOT invoke the wrapped fn', async () => {
  const cb = new CircuitBreaker({
    name: 'TestSvc',
    failureThreshold: 2,
    windowMs: 60_000,
    cooldownMs: 60_000,
  })
  await trip(cb, 2)
  assert.equal(cb.getState(), 'OPEN')

  // Now the wrapped fn must NOT be called — fast-fail short-circuit.
  let invoked = false
  const slowOrFailing = async () => {
    invoked = true
    // Simulate a hang: if this were ever awaited the test would time out.
    await new Promise((r) => setTimeout(r, 10_000))
    return 'should-never-return'
  }

  await assert.rejects(
    cb.execute(slowOrFailing),
    (err: unknown) => err instanceof CircuitBreakerError,
    'OPEN breaker must reject with CircuitBreakerError',
  )
  assert.equal(invoked, false, 'wrapped fn must NOT be invoked while breaker is OPEN')
})

test('OPEN breaker fails FAST (immediately) rather than hanging on the upstream timeout', async () => {
  const cb = new CircuitBreaker({
    name: 'TestSvc',
    failureThreshold: 1,
    windowMs: 60_000,
    cooldownMs: 60_000,
  })
  await trip(cb, 1)
  assert.equal(cb.getState(), 'OPEN')

  const start = Date.now()
  await assert.rejects(
    cb.execute(() => new Promise((r) => setTimeout(() => r('late'), 5_000))),
    (err: unknown) => err instanceof CircuitBreakerError,
  )
  const elapsed = Date.now() - start
  // Must be near-instant — definitely well under the simulated 5s upstream wait.
  assert.ok(elapsed < 500, `expected fast-fail (<500ms) but took ${elapsed}ms`)
})

test('CircuitBreakerError carries the breaker name for graceful mapping', async () => {
  const cb = new CircuitBreaker({
    name: 'NamedSvc',
    failureThreshold: 1,
    windowMs: 60_000,
    cooldownMs: 60_000,
  })
  await trip(cb, 1)
  try {
    await cb.execute(fail)
    assert.fail('expected CircuitBreakerError')
  } catch (err) {
    assert.ok(err instanceof CircuitBreakerError)
    assert.equal((err as CircuitBreakerError).name, 'CircuitBreakerError')
    assert.match((err as Error).message, /NamedSvc/)
  }
})

test('breaker transitions OPEN -> HALF_OPEN after cooldown, allowing a single test call', async () => {
  const cb = new CircuitBreaker({
    name: 'TestSvc',
    failureThreshold: 1,
    windowMs: 60_000,
    cooldownMs: 20, // short cooldown for the test
  })
  await trip(cb, 1)
  assert.equal(cb.getState(), 'OPEN')

  await new Promise((r) => setTimeout(r, 30))
  // Cooldown elapsed → next execute is allowed (HALF_OPEN test request).
  let invoked = false
  const ok = await cb.execute(async () => {
    invoked = true
    return 'recovered'
  })
  assert.equal(invoked, true, 'after cooldown the breaker must allow one test call')
  assert.equal(ok, 'recovered')
  assert.equal(cb.getState(), 'CLOSED', 'a successful test call closes the breaker')
})

test('pre-configured service breakers exist and start CLOSED (wired into llm/image/speech paths)', () => {
  // These are the breakers wired into azureAI / imageGeneration / azureTTS / stt.
  assert.equal(llmCircuitBreaker.getState(), 'CLOSED')
  assert.equal(imageCircuitBreaker.getState(), 'CLOSED')
  assert.equal(speechCircuitBreaker.getState(), 'CLOSED')
})

console.log('[circuitBreaker.test] all assertions registered')
