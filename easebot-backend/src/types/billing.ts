/**
 * Shared billing / metering types.
 *
 * Imported by tokenMeter.ts, quotaMiddleware.ts, subscriptionStateMachine.ts,
 * paymentController.ts, and invoiceService.ts. Keeping the types here avoids
 * a circular import between the meter and the state machine.
 *
 * Sprint 1: type-only. Sprint 2 wires these into the pipeline.
 *
 * Grounded in:
 *   - .orchestrator/specs/token-meter.md §1
 *   - .orchestrator/specs/quota-middleware.md §1
 *   - .orchestrator/specs/subscription-state.md §1
 */

// ---------------------------------------------------------------------------
// Tier & service enums
// ---------------------------------------------------------------------------

export type Tier = 'guest' | 'free' | 'pro' | 'promax'

export type Service =
  | 'chat'
  | 'image'
  | 'tts'
  | 'stt'
  | 'vision'
  | 'algolia'
  | 'whatsapp'

// ---------------------------------------------------------------------------
// Raw cost shapes (per token-meter.md §1)
// ---------------------------------------------------------------------------

export interface ChatRawCost {
  kind: 'chat'
  promptTokens: number
  completionTokens: number
}

export interface ImageRawCost {
  kind: 'image'
  quality: 'standard' | 'hd'
  count?: number
}

export interface TtsRawCost {
  kind: 'tts'
  characters: number
}

export interface SttRawCost {
  kind: 'stt'
  seconds: number
}

export interface VisionRawCost {
  kind: 'vision'
  imageCount: number
}

export interface AlgoliaRawCost {
  kind: 'algolia'
  queries: number
}

export interface WhatsappRawCost {
  kind: 'whatsapp'
  messages: number
}

export type RawCost =
  | ChatRawCost
  | ImageRawCost
  | TtsRawCost
  | SttRawCost
  | VisionRawCost
  | AlgoliaRawCost
  | WhatsappRawCost

// ---------------------------------------------------------------------------
// Principal / subject of a charge
// ---------------------------------------------------------------------------

export interface Principal {
  kind: 'user' | 'guest'
  id: string
  tier: Tier
  /** sha256(ip + APP_SECRET); populated by quotaMiddleware for guests */
  ipHash?: string
}

/** Alias used throughout the spec text; keeps call sites readable. */
export type Subject = Principal

// ---------------------------------------------------------------------------
// Charge / estimate result shapes
// ---------------------------------------------------------------------------

export type ChargeReason =
  | 'ok'
  | 'daily_cap_exceeded'
  | 'monthly_cap_exceeded'
  | 'guest_limit_exceeded'
  | 'firestore_unreachable'
  | 'negative_raw_cost'

export interface ChargeResult {
  allowed: boolean
  tokensCharged: number
  consumedFrom: 'monthly' | 'extras' | 'both' | 'none'
  remainingDaily: number
  remainingMonthly: number
  remainingExtras: number
  reason?: ChargeReason
  /** ISO timestamp — when the blocking dimension resets. */
  resetAt?: string
}

export interface UsageSnapshot {
  tier: Tier
  monthlyTokensUsed: number
  monthlyTokensCap: number
  extrasBucket: number
  extrasPurchasedThisMonth: number
  dailyTokensUsed: number
  dailyResetAt: string
  byService: Record<Service, number>
  updatedAt: string
  guestCounters?: {
    msgCount: number
    imgCount: number
    voiceCount: number
    visionCount: number
  }
}

export interface EstimateInput {
  principal: Principal
  raw: RawCost
}

export interface EstimateResult {
  estimatedTokens: number
  wouldExceedDaily: boolean
  wouldExceedMonthly: boolean
  wouldExceedGuestLimit: boolean
  remainingDaily: number
  remainingMonthly: number
  remainingExtras: number
}

// ---------------------------------------------------------------------------
// 402 response shape (quota-middleware.md §7)
// ---------------------------------------------------------------------------

export interface QuotaExceededResponse {
  error: 'quota_exceeded'
  reason:
    | 'daily_cap_exceeded'
    | 'monthly_cap_exceeded'
    | 'guest_limit_exceeded'
    | 'firestore_unreachable'
  message: string
  resetAt: string | null
  upgradeUrl: string
  remaining:
    | {
        daily: number
        monthly: number
        extras: number
      }
    | {
        guest: { msgCount: number; imgCount: number; voiceCount: number; visionCount: number }
        used: { msgCount: number; imgCount: number; voiceCount: number; visionCount: number }
      }
}

// ---------------------------------------------------------------------------
// Subscription state machine (subscription-state.md §1)
// ---------------------------------------------------------------------------

/**
 * The 8 canonical subscription states. No grace states — renewal failures
 * drop immediately to `free` (point-to-point policy).
 */
export type SubscriptionState =
  | 'guest'
  | 'free'
  | 'pro_monthly'
  | 'pro_annual'
  | 'promax_monthly'
  | 'promax_annual'
  | 'pro_cancel_scheduled'
  | 'promax_cancel_scheduled'

export type Plan = 'pro' | 'promax'
export type BillingCycle = 'monthly' | 'annual' | '6mo'

export type SubscriptionTrigger =
  | 'signup'
  | 'purchase'
  | 'upgrade'
  | 'downgrade_schedule'
  | 'cancel'
  | 'reactivate'
  | 'renew_success'
  | 'renew_fail'
  | 'period_end'

export interface SubscriptionTransitionPayload {
  txnid?: string
  plan?: Plan
  billingCycle?: BillingCycle
  fromPlan?: Plan
  toPlan?: Plan
  clientRequestId?: string
  scheduledFor?: string
  creditApplied?: number
  amount?: number
  currency?: string
  newPeriodEnd?: string
  reason?: string
  [extra: string]: unknown
}

export interface TransitionResult {
  applied: boolean
  state: SubscriptionState
}
