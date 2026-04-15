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

const TICK_MS = 60_000

let handle: NodeJS.Timeout | null = null

export function startSubscriptionScheduler(): void {
  if (handle) return
  handle = setInterval(() => {
    scanForPeriodEnd()
      .then((n) => {
        if (n > 0) console.log('[subscriptionScheduler] ticked', { count: n })
      })
      .catch((err) => console.error('[subscriptionScheduler] tick error', err))
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
