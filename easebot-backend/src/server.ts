import 'dotenv/config'
import http from 'http'
import { app } from './app'
import { startReminderScheduler, stopReminderScheduler } from './services/reminderScheduler'
import { startGuestCleanupCron, stopGuestCleanupCron } from './services/guestCleanupCron'
import { startSubscriptionScheduler, stopSubscriptionScheduler } from './services/subscriptionScheduler'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = '0.0.0.0'

const server = http.createServer(app)

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
    startReminderScheduler()
  } else {
    console.log('[easebot] Reminder scheduler disabled via env')
  }
  if (process.env.ENABLE_GUEST_CLEANUP !== 'false') {
    startGuestCleanupCron()
  } else {
    console.log('[easebot] Guest cleanup cron disabled via env')
  }
  if (process.env.ENABLE_SUBSCRIPTION_SCHEDULER !== 'false') {
    startSubscriptionScheduler()
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
