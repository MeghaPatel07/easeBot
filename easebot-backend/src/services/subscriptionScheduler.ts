/**
 * subscriptionScheduler — in-process period_end tick.
 *
 * Sprint 3: runs every minute. Scans for subscriptions with
 * `cancel_scheduled` state whose `currentPeriodEnd` has elapsed, and fires
 * the `period_end` trigger through the state machine.
 *
 * Simple setInterval; stopped in server.ts graceful shutdown.
 */

import { scanForPeriodEnd } from './subscriptionStateMachine'
import { emit } from '../lib/observability'

const TICK_MS = 60_000

let handle: NodeJS.Timeout | null = null

export function startSubscriptionScheduler(): void {
  if (handle) return
  handle = setInterval(() => {
    const started = Date.now()
    scanForPeriodEnd()
      .then((n) => {
        // P1-2: emit a structured event on EVERY tick so ops can confirm the
        // loop is alive even during zero-scan windows.
        emit('subscription.scheduler.tick', { scanned: n, ms: Date.now() - started })
        if (n > 0) console.log('[subscriptionScheduler] ticked', { count: n })
      })
      .catch((err) => {
        emit('subscription.scheduler.tick', {
          scanned: 0,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        })
        console.error('[subscriptionScheduler] tick error', err)
      })
  }, TICK_MS)
  // Ensure the interval never keeps the event loop alive during tests.
  if (typeof handle.unref === 'function') handle.unref()
  console.log('[subscriptionScheduler] started (60s tick)')
}

export function stopSubscriptionScheduler(): void {
  if (handle) {
    clearInterval(handle)
    handle = null
    console.log('[subscriptionScheduler] stopped')
  }
}
