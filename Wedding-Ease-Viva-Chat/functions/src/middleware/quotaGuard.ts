// ─────────────────────────────────────────────────────────────────────────────
// Quota guard middleware — checks token pool before processing requests.
// Returns 402 Payment Required when daily or monthly cap is exceeded.
// The 402 payload matches the QuotaExceededPayload type on the frontend.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import { checkQuota } from '../services/tokenMeter'

// Conservative cost estimates for pre-call check (actual cost charged post-call)
const ESTIMATED_COSTS: Record<string, number> = {
  chat: 1_500,      // ~1,200 avg + buffer
  image: 16_000,    // standard 1024×1024
  transcribe: 7_000, // ~1 minute of STT
}

/**
 * Factory that returns middleware for a specific service type.
 * Skips guests (uid is null) — guest limits are handled client-side.
 */
export function quotaGuard(service: 'chat' | 'image' | 'transcribe') {
  const estimatedCost = ESTIMATED_COSTS[service] ?? 1_500

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const uid = req.user?.uid
    if (!uid) {
      // Guest — no server-side quota enforcement (client-side counters)
      next()
      return
    }

    try {
      const result = await checkQuota(uid, estimatedCost)

      if (!result.allowed) {
        res.status(402).json({
          error: 'quota_exceeded',
          reason: result.reason,
          message: result.message,
          resetAt: result.resetAt ?? null,
          upgradeUrl: '/pricing',
          remaining: {
            used: result.used,
            limit: result.limit,
          },
        })
        return
      }

      // Attach usage info to request for downstream logging
      ;(req as any).quotaUsed = result.used
      ;(req as any).quotaLimit = result.limit

      next()
    } catch (err) {
      console.error('[quotaGuard] error checking quota:', err)
      // Fail open — don't block users if the meter is temporarily unavailable
      next()
    }
  }
}
