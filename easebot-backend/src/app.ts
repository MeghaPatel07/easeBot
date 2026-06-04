import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import chatRouter from './routes/chat'
import transcribeRouter from './routes/transcribe'
import imageRouter from './routes/image'
import checklistsRouter from './routes/checklists'
import notesRouter from './routes/notes'
import accountRouter from './routes/account'
import authRouter from './routes/auth'
import ttsRouter from './routes/tts'
import paymentRouter from './routes/payment'
import feedbackRouter from './routes/feedbackRoutes'
import healthRouter from './routes/health'
import ingestRouter from './routes/ingest'
import { getSpeechToken } from './controllers/speechTokenController'
import { apiRateLimiter, imageRateLimiter } from './middleware/rateLimiter'
import { inputSanitizer } from './middleware/inputSanitizer'
import { promptGuard } from './middleware/promptGuard'
import { posthogContext } from './middleware/posthogContext'
import { errorHandler } from './middleware/errorHandler'
import { requireAuth } from './middleware/auth'
import { quotaCheck } from './middleware/quotaMiddleware'

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
)

// Capture the raw JSON bytes so the Razorpay webhook can HMAC the exact body
// (express.json otherwise discards the buffer after parsing). PayU posts
// form-urlencoded, so this only affects application/json requests.
app.use(express.json({
  limit: '20mb',
  verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf },
}))
// PayU posts back to /api/payment/return and /webhook as application/x-www-form-urlencoded.
// Without this parser those bodies arrive empty and handleReturn falls through to bad_payload.
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// --- PostHog ingestion reverse proxy (must be before rate limiter / sanitizer) ---
// The browser SDK hits /ingest/* on this origin; we forward to PostHog.
// Mounting before input sanitizer because event payloads are JSON we shouldn't mutate.
app.use('/ingest', ingestRouter)

// --- Input sanitization & prompt injection guard ---
app.use(inputSanitizer)
app.use('/api/chat', promptGuard())
app.use('/api/v1/chat', promptGuard())

// --- PostHog distinct_id context (reads x-ph-distinct-id header) ---
app.use(posthogContext)

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
  app.use(`${prefix}/account`, accountRouter)
  app.use(`${prefix}/auth`, authRouter)
  app.use(`${prefix}/tts`, ttsRouter)
  app.use(`${prefix}/payment`, paymentRouter)
  app.use(`${prefix}/feedback`, feedbackRouter)
  // /speech-token issues a 10-minute Azure Speech JWT. Each token is
  // cost-bearing (paid STT minutes), so gate it like /transcribe — guest
  // pass-through via requireAuth, then quotaCheck('stt') so each issuance
  // counts against the caller's STT bucket. See BUG-BE-20260525-006.
  app.get(`${prefix}/speech-token`, requireAuth, quotaCheck('stt'), getSpeechToken)
}

mountRoutes('/api')
mountRoutes('/api/v1')

// --- Global error handler (must be last) ---
app.use(errorHandler)

export { app }
