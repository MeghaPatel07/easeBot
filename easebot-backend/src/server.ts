import 'dotenv/config'
import http from 'http'
import { app } from './app'

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
})

// --------------- Graceful Shutdown ---------------

const SHUTDOWN_TIMEOUT_MS = 10_000

function gracefulShutdown(signal: string): void {
  console.log(`[easebot] Received ${signal}. Starting graceful shutdown…`)

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
