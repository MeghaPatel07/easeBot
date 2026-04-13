import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import chatRouter from './routes/chat'
import transcribeRouter from './routes/transcribe'
import imageRouter from './routes/image'
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

// --- Trust proxy ---
// When deployed behind a reverse proxy (Railway, Render, Fly, Cloud Run, nginx, etc.)
// Express needs this so req.ip and the X-Forwarded-For header are honoured by
// downstream middleware like express-rate-limit. Configurable via TRUST_PROXY env:
//   - unset / "1"    → trust first proxy hop (typical PaaS setup)
//   - "true"         → trust all proxies
//   - "false" / "0"  → disable (local dev without a proxy)
//   - any other value → passed through verbatim (e.g. a subnet like "10.0.0.0/8")
const trustProxyEnv = process.env.TRUST_PROXY ?? '1'
const trustProxyValue: boolean | number | string =
  trustProxyEnv === 'true' ? true
  : trustProxyEnv === 'false' ? false
  : /^\d+$/.test(trustProxyEnv) ? Number(trustProxyEnv)
  : trustProxyEnv
app.set('trust proxy', trustProxyValue)

// --- Security Headers (helmet) ---
// Disable contentSecurityPolicy so SSE / EventSource connections are not blocked
app.use(helmet({ contentSecurityPolicy: false }))

// --- CORS: allow all origins ---
// NOTE: `Access-Control-Allow-Origin: *` is incompatible with
// `Access-Control-Allow-Credentials: true` per the CORS spec — browsers reject
// credentialed requests to a wildcard origin. Since auth flows here use bearer
// tokens in the Authorization header (not cookies), `credentials: false` is
// safe and lets us use a true wildcard.
app.use(
  cors({
    origin: '*',
    credentials: false,
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
