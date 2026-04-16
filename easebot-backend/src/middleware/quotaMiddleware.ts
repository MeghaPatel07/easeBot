/**
 * quotaMiddleware — pre-call quota gate for cost-bearing routes.
 *
 * Sprint 2 live implementation. Runs AFTER requireAuth, resolves principal
 * (user via tierMirror or guest via X-Guest-Id header), pessimistically
 * estimates the raw cost, returns 402 on over-limit, otherwise attaches
 * req.quotaContext with a reconcile closure.
 *
 * Spec: .orchestrator/specs/quota-middleware.md
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import crypto from 'crypto'
import {
  estimateCost,
  chargeTokens,
  getTier,
} from '../services/tokenMeter'
import type {
  Principal,
  Subject,
  Service,
  RawCost,
  EstimateResult,
  QuotaExceededResponse,
  Tier,
} from '../types/billing'

export type { QuotaExceededResponse }

// ---------------------------------------------------------------------------
// Request augmentation
// ---------------------------------------------------------------------------

export interface QuotaContext {
  principal: Principal
  subject: Subject
  service: Service
  estimate: EstimateResult
  estimated: number
  _reconciled: boolean
  reconcile: (actual: RawCost | { skip: true }) => Promise<void>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quotaContext?: QuotaContext
    }
  }
}

// ---------------------------------------------------------------------------
// Guest-id helpers
// ---------------------------------------------------------------------------

/**
 * Resolve or mint a guestId. Frontend sends `X-Guest-Id` header (uuid persisted
 * in localStorage). If absent, we generate one and return it via `X-Guest-Id`
 * on the response so the frontend can capture + persist.
 *
 * Simple — no HMAC signing. Guest id is low-stakes: it only gates 10 chats /
 * 3 images. A malicious actor who swaps ids just gets a fresh 10+3 bucket,
 * which is already accepted per LH-21 in the spec.
 */
function resolveOrMintGuestId(req: Request, res: Response): string {
  const header = (req.headers['x-guest-id'] ?? '') as string
  if (header && /^[a-f0-9-]{20,}$/i.test(header)) return header
  const fresh = crypto.randomUUID()
  res.setHeader('X-Guest-Id', fresh)
  return fresh
}

function guestIpHash(req: Request): string {
  const secret = process.env.GUEST_IP_SALT ?? 'easebot-default-salt'
  const ip = (req.ip ?? req.socket?.remoteAddress ?? '') as string
  return crypto.createHash('sha256').update(ip + secret).digest('hex').slice(0, 32)
}

// ---------------------------------------------------------------------------
// Pessimistic raw-cost skeleton builders
// ---------------------------------------------------------------------------

const MAX_COMPLETION_TOKENS_BY_DEFAULT = 2_000

/**
 * P0-4: explicit next-UTC-midnight. `setUTCHours(24, 0, 0, 0)` mutates in place
 * and, per the spec, is fragile around DST-adjacent Date arithmetic. This form
 * uses `Date.UTC(...+1)` which is unambiguous.
 */
function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  )
}

function nextUtcMonthStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  )
}

function roughTokenCount(s: string | undefined): number {
  if (!s) return 0
  // 1 token ≈ 4 chars English. Fast and good enough for the pessimistic path.
  return Math.ceil(s.length / 4)
}

function buildRawSkeleton(service: Service, body: Record<string, unknown>): RawCost {
  switch (service) {
    case 'chat': {
      const message = String(body.message ?? '')
      const history = Array.isArray(body.history) ? body.history : []
      const historyText = history
        .map((m) => {
          if (!m || typeof m !== 'object') return ''
          return String((m as Record<string, unknown>).content ?? '')
        })
        .join('\n')
      const hasVision = !!(body.imageBase64 && body.imageMimeType)
      // P0-2: stylist mode fires one algolia query per chat turn via
      // buildSystemPrompt. We don't know the mode here (it's detected inside
      // the controller), so bake one pessimistic algolia query (50 tokens at
      // current rate — see rawToTokens) into every chat estimate. Cheap
      // enough that non-stylist turns don't care, but guarantees that if a
      // turn routes to stylist the estimate still covers reconcile.
      const ALGOLIA_PESSIMISTIC_TOKENS = 50
      const promptTokens =
        roughTokenCount(message) +
        roughTokenCount(historyText) +
        500 + // system-prompt budget
        ALGOLIA_PESSIMISTIC_TOKENS
      return {
        kind: 'chat',
        promptTokens: promptTokens + (hasVision ? 1_000 : 0),
        completionTokens: MAX_COMPLETION_TOKENS_BY_DEFAULT,
      }
    }
    case 'image': {
      const aspect = String(body.preferredAspectRatio ?? body.aspectRatio ?? '')
      const quality: 'standard' | 'hd' = aspect.includes('1536') ? 'hd' : 'standard'
      return { kind: 'image', quality, count: 1 }
    }
    case 'tts': {
      const text = String(body.text ?? '')
      return { kind: 'tts', characters: text.length }
    }
    case 'stt': {
      // Pessimistic: if the caller declares duration use it, else assume 60s ceiling.
      const seconds = Number(body.durationSeconds ?? 60)
      return { kind: 'stt', seconds: Number.isFinite(seconds) ? seconds : 60 }
    }
    case 'vision': {
      const count = Number(body.imageCount ?? 1)
      return { kind: 'vision', imageCount: Math.max(1, count) }
    }
    case 'algolia':
      return { kind: 'algolia', queries: 1 }
    case 'whatsapp':
      return { kind: 'whatsapp', messages: 1 }
  }
}

// ---------------------------------------------------------------------------
// 402 writer
// ---------------------------------------------------------------------------

function sendQuotaExceeded(
  res: Response,
  principal: Principal,
  estimate: EstimateResult,
  reason: QuotaExceededResponse['reason'],
  resetAt: string | null,
): void {
  const upgradeUrl =
    principal.kind === 'guest'
      ? '/signup?from=guest-cap'
      : principal.tier === 'free'
        ? '/pricing?from=free-cap'
        : '/pricing?from=pro-cap'

  const body: QuotaExceededResponse =
    principal.kind === 'guest'
      ? {
          error: 'quota_exceeded',
          reason,
          message:
            reason === 'guest_limit_exceeded'
              ? 'Guest limit reached. Sign up for a free account to keep chatting.'
              : 'Quota exceeded.',
          resetAt,
          upgradeUrl,
          remaining: {
            guest: { msgCount: 10, imgCount: 3, voiceCount: 3, visionCount: 3 },
            used: { msgCount: 0, imgCount: 0, voiceCount: 0, visionCount: 0 },
          },
        }
      : {
          error: 'quota_exceeded',
          reason,
          message:
            reason === 'daily_cap_exceeded'
              ? 'Daily token limit reached. Resets at midnight UTC.'
              : reason === 'monthly_cap_exceeded'
                ? 'Monthly token limit reached. Upgrade or wait for the next renewal.'
                : 'Quota exceeded.',
          resetAt,
          upgradeUrl,
          remaining: {
            daily: estimate.remainingDaily,
            monthly: estimate.remainingMonthly,
            extras: estimate.remainingExtras,
          },
        }

  res.status(402).json(body)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function quotaCheck(service: Service): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // --- 1. Resolve principal --------------------------------------------
      let principal: Principal
      if (req.user?.uid) {
        const tier: Tier = await getTier(req.user.uid)
        principal = { kind: 'user', id: req.user.uid, tier }
      } else {
        const guestId = resolveOrMintGuestId(req, res)
        principal = {
          kind: 'guest',
          id: guestId,
          tier: 'guest',
          ipHash: guestIpHash(req),
        }
      }

      // --- 2. Build pessimistic skeleton ------------------------------------
      const raw = buildRawSkeleton(service, (req.body ?? {}) as Record<string, unknown>)

      // --- 3. Estimate ------------------------------------------------------
      let estimate: EstimateResult
      try {
        estimate = await estimateCost({ principal, raw })
      } catch (err) {
        console.error('[quotaMiddleware] estimateCost threw', err)
        res.status(503).json({ error: 'service_unavailable', reason: 'firestore_unreachable' })
        return
      }

      // --- 4. Enforce -------------------------------------------------------
      if (principal.kind === 'guest' && estimate.wouldExceedGuestLimit) {
        sendQuotaExceeded(res, principal, estimate, 'guest_limit_exceeded', null)
        return
      }
      if (estimate.wouldExceedDaily) {
        const resetAt = nextUtcMidnight(new Date())
        sendQuotaExceeded(res, principal, estimate, 'daily_cap_exceeded', resetAt.toISOString())
        return
      }
      if (estimate.wouldExceedMonthly) {
        const end = nextUtcMonthStart(new Date())
        sendQuotaExceeded(res, principal, estimate, 'monthly_cap_exceeded', end.toISOString())
        return
      }

      // --- 5. Attach reconcile closure -------------------------------------
      const subject: Subject = principal
      const ctx: QuotaContext = {
        principal,
        subject,
        service,
        estimate,
        estimated: estimate.estimatedTokens,
        _reconciled: false,
        reconcile: async (actual) => {
          if (ctx._reconciled) {
            console.warn('[quotaMiddleware] reconcile called twice', {
              uid: principal.id,
              service,
            })
            return
          }
          ctx._reconciled = true
          if ('skip' in actual) return
          const result = await chargeTokens(subject, actual)
          if (!result.allowed) {
            console.warn('[quotaMiddleware] reconcile denied post-call (race or firestore)', {
              uid: principal.id,
              reason: result.reason,
              service,
            })
            return
          }
          try {
            if (!res.headersSent) {
              res.setHeader('X-Easebot-Tokens-Charged', String(result.tokensCharged))
              res.setHeader('X-Easebot-Remaining-Monthly', String(result.remainingMonthly))
              res.setHeader('X-Easebot-Remaining-Daily', String(result.remainingDaily))
            }
          } catch {
            // headers already sent is fine — reconcile is fire-and-forget from the controller's POV
          }
        },
      }
      req.quotaContext = ctx
      next()
    } catch (err) {
      console.error('[quotaMiddleware] unexpected error', err)
      res.status(500).json({ error: 'quota_middleware_error' })
    }
  }
}
