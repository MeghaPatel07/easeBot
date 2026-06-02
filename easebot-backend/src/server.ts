import 'dotenv/config'
import http from 'http'
import { app } from './app'
import { startReminderScheduler, stopReminderScheduler } from './services/reminderScheduler'
import { startGuestCleanupCron, stopGuestCleanupCron } from './services/guestCleanupCron'
import { startSubscriptionScheduler, stopSubscriptionScheduler } from './services/subscriptionScheduler'
import { validatePaymentConfig } from './controllers/paymentController'
import { initPostHog, shutdownPostHog } from './lib/posthog'

// Fail fast on missing payment env vars before binding the port.
validatePaymentConfig()

initPostHog()

const PORT = Number(process.env.PORT ?? 3001)
const HOST = '0.0.0.0'

const server = http.createServer(app)

// Stagger scheduler start-up to avoid first-request contention (WE-20260528-1514).
// Each scheduler runs an immediate initial sweep on start; three concurrent
// Firestore queries on a cold Admin SDK plus an incoming request landed in
// the same ~100ms window. Spreading them across the first 5s of listen()
// gives real user traffic the cold-boot warm-up window.
const SCHEDULER_DELAYS_MS = {
  reminder: 0, // first event-loop tick
  guestCleanup: 2_000, // +2s
  subscription: 5_000, // +5s
} as const

function scheduleDeferred(name: string, delayMs: number, start: () => void): void {
  console.log(`[easebot] scheduling ${name} scheduler in ${delayMs}ms`)
  const t = setTimeout(start, delayMs)
  // Never keep the event loop alive purely for a pending scheduler start.
  t.unref?.()
}

server.listen(PORT, HOST, () => {
  console.log(`[easebot] Server running on http://${HOST}:${PORT}`)
  console.log(
    `[easebot] Speech & Translation pipeline: ${
      process.env.ENABLE_SPEECH_TRANSLATION === 'true' ? 'ON' : 'OFF'
    }`,
  )
  // Start the in-process reminder scheduler unless explicitly disabled
  // (tests / one-off scripts can set ENABLE_REMINDER_SCHEDULER=false).
  if (process.env.ENABLE_REMINDER_SCHEDULER !== 'false') {
    scheduleDeferred('reminder', SCHEDULER_DELAYS_MS.reminder, startReminderScheduler)
  } else {
    console.log('[easebot] Reminder scheduler disabled via env')
  }
  if (process.env.ENABLE_GUEST_CLEANUP !== 'false') {
    scheduleDeferred('guestCleanup', SCHEDULER_DELAYS_MS.guestCleanup, startGuestCleanupCron)
  } else {
    console.log('[easebot] Guest cleanup cron disabled via env')
  }
  if (process.env.ENABLE_SUBSCRIPTION_SCHEDULER !== 'false') {
    scheduleDeferred('subscription', SCHEDULER_DELAYS_MS.subscription, startSubscriptionScheduler)
  } else {
    console.log('[easebot] Subscription scheduler disabled via env')
  }
})

// --------------- Graceful Shutdown ---------------

const SHUTDOWN_TIMEOUT_MS = 10_000

function gracefulShutdown(signal: string): void {
  console.log(`[easebot] Received ${signal}. Starting graceful shutdown…`)
  stopReminderScheduler()
  stopGuestCleanupCron()
  stopSubscriptionScheduler()
  // Flush PostHog buffered events before process exit.
  void shutdownPostHog()

  // Stop accepting new connections
  server.close(() => {
    console.log('[easebot] All in-flight requests completed. Exiting.')
    process.exit(0)
  })

  // Force exit after timeout so we don't hang forever
  setTimeout(() => {
    console.error(
      `[easebot] Could not close connections within ${SHUTDOWN_TIMEOUT_MS}ms. Forcing exit.`,
    )
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
