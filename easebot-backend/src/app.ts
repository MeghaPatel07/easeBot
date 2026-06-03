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
import { requireAuthOrGuest } from './middleware/auth'
import { apiRateLimiter, imageRateLimiter } from './middleware/rateLimiter'
import { inputSanitizer } from './middleware/inputSanitizer'
import { promptGuard } from './middleware/promptGuard'
import { posthogContext } from './middleware/posthogContext'
import { errorHandler } from './middleware/errorHandler'

const app = express()

// --- Trust proxy (WE-20260527-1004) ---
// We must NOT trust X-Forwarded-For blindly (Express default `trust proxy: true`
// would let any client spoof req.ip and defeat IP-based rate limiting). Set the
// number of proxy hops we actually run behind via TRUST_PROXY_HOPS (default 1 —
// one reverse proxy, the typical PaaS setup). For local dev without a proxy set
// TRUST_PROXY_HOPS=0.
//
// TRUST_PROXY (legacy, richer form) is still honoured for backward compat when
// TRUST_PROXY_HOPS is unset, so existing deploy configs don't break:
//   - "true"  → trust all proxies (NOT recommended)
//   - "false"/"0" → disable
//   - integer → that many hops
//   - other   → verbatim (e.g. a subnet like "10.0.0.0/8")
const trustProxyHops = process.env.TRUST_PROXY_HOPS
const trustProxyLegacy = process.env.TRUST_PROXY
let trustProxyValue: boolean | number | string
if (trustProxyHops !== undefined && /^\d+$/.test(trustProxyHops)) {
  trustProxyValue = Number(trustProxyHops)
} else if (trustProxyLegacy !== undefined) {
  trustProxyValue =
    trustProxyLegacy === 'true' ? true
    : trustProxyLegacy === 'false' ? false
    : /^\d+$/.test(trustProxyLegacy) ? Number(trustProxyLegacy)
    : trustProxyLegacy
} else {
  trustProxyValue = 1 // default: one proxy hop
}
app.set('trust proxy', trustProxyValue)

// --- Security Headers (helmet) ---
// Disable contentSecurityPolicy so SSE / EventSource connections are not blocked
app.use(helmet({ contentSecurityPolicy: false }))

// --- CORS allowlist (WE-20260527-248 / -1008) ---
// Replace the previous `Access-Control-Allow-Origin: *` wildcard with a strict
// allowlist sourced from env ALLOWED_ORIGINS (comma-separated). Unknown origins
// — including reflective OPTIONS preflights — are rejected (the response simply
// carries no Access-Control-Allow-Origin header, so the browser blocks it).
// Requests with no Origin header (curl, server-to-server, same-origin, health
// probes) are allowed through so non-browser clients keep working.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:8081,http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header → non-browser / same-origin request. Allow.
      if (!origin) {
        callback(null, true)
        return
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }
      // Unknown origin: do not reflect it. Signal a CORS error (mapped to 403
      // by the global error handler) so preflight + actual requests are blocked.
      callback(new Error('Origin not allowed by CORS'))
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Guest-Id', 'x-ph-distinct-id', 'Last-Event-ID'],
    exposedHeaders: ['X-Guest-Id'],
  }),
)

app.use(express.json({ limit: '20mb' }))
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
  // Speech token mints an Azure STS token (short TTL, ~10 min) that the
  // browser uses for STT. It is quota-relevant, so it must NOT be anonymous
  // (WE-20260527-001): require a valid Firebase user OR a valid guest session.
  app.get(`${prefix}/speech-token`, requireAuthOrGuest, getSpeechToken)
}

mountRoutes('/api')
mountRoutes('/api/v1')

// JSON 404 for unknown API routes — keep the client error contract consistent
// with the rest of /api/* (which returns JSON). Without this, Express falls
// through to its default HTML error page and JSON consumers can't parse it.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path })
})

// --- Global error handler (must be last) ---
app.use(errorHandler)

export { app }
