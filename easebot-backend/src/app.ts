import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import chatRouter from './routes/chat'
import transcribeRouter from './routes/transcribe'
import imageRouter from './routes/image'
import calendarRouter from './routes/calendar'
import checklistsRouter from './routes/checklists'
import notesRouter from './routes/notes'
import ttsRouter from './routes/tts'
import healthRouter from './routes/health'
import { getSpeechToken } from './controllers/speechTokenController'
import { apiRateLimiter, imageRateLimiter } from './middleware/rateLimiter'
import { inputSanitizer } from './middleware/inputSanitizer'
import { promptGuard } from './middleware/promptGuard'
import { errorHandler } from './middleware/errorHandler'

const app = express()

// --- Security Headers (helmet) ---
// Disable contentSecurityPolicy so SSE / EventSource connections are not blocked
app.use(helmet({ contentSecurityPolicy: false }))

// --- CORS whitelist ---
const allowedOrigins: string[] = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:8080,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (curl, server-to-server, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

app.use(express.json({ limit: '20mb' }))

// --- Input sanitization & prompt injection guard ---
app.use(inputSanitizer)
app.use('/api/chat', promptGuard())
app.use('/api/v1/chat', promptGuard())

// --- Health & readiness (no rate limit) ---
app.use('/api', healthRouter)
app.use('/api/v1', healthRouter)

// --- Rate limiters ---
app.use('/api/generate-image', imageRateLimiter)
app.use('/api/v1/generate-image', imageRateLimiter)
app.use('/api/', apiRateLimiter)

// --- Application routes (current /api/ + versioned /api/v1/) ---
const mountRoutes = (prefix: string): void => {
  app.use(`${prefix}/chat`, chatRouter)
  app.use(`${prefix}/transcribe`, transcribeRouter)
  app.use(`${prefix}/generate-image`, imageRouter)
  app.use(`${prefix}/calendar`, calendarRouter)
  app.use(`${prefix}/checklists`, checklistsRouter)
  app.use(`${prefix}/notes`, notesRouter)
  app.use(`${prefix}/tts`, ttsRouter)
  app.get(`${prefix}/speech-token`, getSpeechToken)
}

mountRoutes('/api')
mountRoutes('/api/v1')

// --- Global error handler (must be last) ---
app.use(errorHandler)

export { app }
