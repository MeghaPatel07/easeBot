import rateLimit from 'express-rate-limit'
import type { Request } from 'express'
import crypto from 'crypto'
import { emit } from '../lib/observability'

/** General API rate limiter: 30 requests per minute per IP */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
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

export const chatBurstRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.uid || guestFingerprint(req),
  handler: (req, res) => {
    const key = req.user?.uid || guestFingerprint(req)
    emit('chat_burst_flag', { key, path: req.path })
    res.status(429).json({ error: 'chat_burst_limit', retryAfter: 10 })
  },
})

/** Image generation rate limiter: 5 requests per minute per IP */
export const imageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})
