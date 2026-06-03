import rateLimit, { type Options, type RateLimitInfo } from 'express-rate-limit'
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { emit } from '../lib/observability'

// express-rate-limit attaches `req.rateLimit` (the default requestPropertyName).
// Declare it here so the typed handlers can read `resetTime` without `any`.
declare global {
  namespace Express {
    interface Request {
      rateLimit?: RateLimitInfo
    }
  }
}

// ---------------------------------------------------------------------------
// Rate-limit middlewares (WE-20260527-047)
//
// Clients (web, mobile, server-to-server) need machine-readable back-off info
// when we 429 them. Per IETF RFC 6585 + the ratelimit-headers draft we emit:
//
//   Retry-After:        <seconds>
//   RateLimit-Policy:   <limit>;w=<window-seconds>
//   RateLimit:          limit=<n>, remaining=<n>, reset=<seconds>   (draft-7)
//
// `standardHeaders: 'draft-7'` opts into the modern combined `RateLimit`
// header (RFC-bound) while still emitting `Retry-After` (always written by
// express-rate-limit on 429 when `standardHeaders` or `legacyHeaders` is set).
//
// The handler body is normalized to:
//   { "error": "rate_limited", "retry_after": <seconds>, "limit": <n>, "window_seconds": <n>, "scope": "<api|chat_burst|image>" }
// so clients can render a "slow down" UX without parsing free-form text.
//
// NOTE: per-process limiter across pm2 cluster (backlog item -1009) is a
// separate Krish-blocked decision (Redis adoption). This middleware fixes the
// header contract on whatever per-process limit is currently configured.
// ---------------------------------------------------------------------------

const getRetryAfterSeconds = (req: Request, fallbackMs: number): number => {
  const info = req.rateLimit
  if (info?.resetTime instanceof Date) {
    const diffMs = info.resetTime.getTime() - Date.now()
    return Math.max(1, Math.ceil(diffMs / 1000))
  }
  return Math.max(1, Math.ceil(fallbackMs / 1000))
}

const buildRateLimitedBody = (
  scope: string,
  retryAfter: number,
  limit: number,
  windowMs: number,
): Record<string, unknown> => ({
  error: 'rate_limited',
  retry_after: retryAfter,
  limit,
  window_seconds: Math.ceil(windowMs / 1000),
  scope,
})

const makeHandler =
  (scope: string, limit: number, windowMs: number): Options['handler'] =>
  (req: Request, res: Response) => {
    // express-rate-limit has already called setRetryAfterHeader + the draft
    // header writers before invoking this handler, so the standard headers
    // are already in place. We only need to emit the structured body.
    const retryAfter = getRetryAfterSeconds(req, windowMs)
    res.status(429).json(buildRateLimitedBody(scope, retryAfter, limit, windowMs))
  }

// --- General API rate limiter: 30 requests per minute per IP ---
const API_LIMIT = 30
const API_WINDOW_MS = 60 * 1000
export const apiRateLimiter = rateLimit({
  windowMs: API_WINDOW_MS,
  max: API_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: makeHandler('api', API_LIMIT, API_WINDOW_MS),
})

/**
 * Chat burst rate flag (LH-22): 10 messages per 10 seconds per uid (or guest
 * UA fingerprint). Emits `chat_burst_flag` observability event and returns
 * 429. Guests are identified by a SHA256(user-agent + accept-language + ip)
 * fingerprint — hashed, never stored raw.
 */
function guestFingerprint(req: Request): string {
  const ua = req.headers['user-agent'] || ''
  const al = req.headers['accept-language'] || ''
  const ip = (req.ip || req.socket.remoteAddress || '').toString()
  return 'g:' + crypto.createHash('sha256').update(`${ua}|${al}|${ip}`).digest('hex').slice(0, 16)
}

const CHAT_BURST_LIMIT = 10
const CHAT_BURST_WINDOW_MS = 10 * 1000
export const chatBurstRateLimiter = rateLimit({
  windowMs: CHAT_BURST_WINDOW_MS,
  max: CHAT_BURST_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.uid || guestFingerprint(req),
  handler: (req, res) => {
    const key = req.user?.uid || guestFingerprint(req)
    emit('chat_burst_flag', { key, path: req.path })
    const retryAfter = getRetryAfterSeconds(req, CHAT_BURST_WINDOW_MS)
    res.status(429).json({
      ...buildRateLimitedBody('chat_burst', retryAfter, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_MS),
      // Preserve the original error code for downstream observability + any
      // existing alerts keyed on it. Frontend should switch to the canonical
      // `error: "rate_limited"` field; `code` remains for backward-compat.
      code: 'chat_burst_limit',
    })
  },
})

// --- Image generation rate limiter: 5 requests per minute per IP ---
const IMAGE_LIMIT = 5
const IMAGE_WINDOW_MS = 60 * 1000
export const imageRateLimiter = rateLimit({
  windowMs: IMAGE_WINDOW_MS,
  max: IMAGE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: makeHandler('image', IMAGE_LIMIT, IMAGE_WINDOW_MS),
})
