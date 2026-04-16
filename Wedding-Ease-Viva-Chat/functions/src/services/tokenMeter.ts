// ─────────────────────────────────────────────────────────────────────────────
// Token Meter — unified usage tracking + enforcement.
// PRICING_PRD.md §3: "One meter, not five." Every Azure/Algolia/Twilio call
// charges into a single pool. Pre-call check blocks when either daily or
// monthly cap is exceeded.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin'
import { resolveTier, getLimits, formatTokenCount, type PlanTier } from '../config/tierConfig'

const db = admin.firestore()

// ── Firestore schema ────────────────────────────────────────────────────────
// users/{uid}/usage/current  ← single document, atomically updated
//
// {
//   monthlyUsed:    number,
//   dailyUsed:      number,
//   topUpBalance:   number,   // purchased top-up tokens (never expire)
//   monthlyResetAt: Timestamp,
//   dailyResetAt:   Timestamp,
//   updatedAt:      Timestamp,
// }

export interface UsageDoc {
  monthlyUsed: number
  dailyUsed: number
  topUpBalance: number
  monthlyResetAt: admin.firestore.Timestamp
  dailyResetAt: admin.firestore.Timestamp
  updatedAt: admin.firestore.Timestamp
}

export interface QuotaCheckResult {
  allowed: boolean
  reason?: 'daily_cap_exceeded' | 'monthly_cap_exceeded'
  message?: string
  resetAt?: string
  used?: number
  limit?: number
}

function usageRef(uid: string) {
  return db.collection('users').doc(uid).collection('usage').doc('current')
}

/** Get the start of the next UTC day. */
function nextDayUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/** Get the start of the next calendar month in UTC. */
function nextMonthUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/** Ensure a usage doc exists with valid reset windows. Resets counters if past the window. */
async function getOrCreateUsage(uid: string): Promise<UsageDoc> {
  const ref = usageRef(uid)
  const snap = await ref.get()
  const now = admin.firestore.Timestamp.now()

  if (!snap.exists) {
    const doc: UsageDoc = {
      monthlyUsed: 0,
      dailyUsed: 0,
      topUpBalance: 0,
      monthlyResetAt: admin.firestore.Timestamp.fromDate(nextMonthUTC()),
      dailyResetAt: admin.firestore.Timestamp.fromDate(nextDayUTC()),
      updatedAt: now,
    }
    await ref.set(doc)
    return doc
  }

  const data = snap.data() as UsageDoc
  const updates: Partial<UsageDoc> = {}

  // Auto-reset daily counter if past the reset window
  if (data.dailyResetAt && now.toMillis() >= data.dailyResetAt.toMillis()) {
    updates.dailyUsed = 0
    updates.dailyResetAt = admin.firestore.Timestamp.fromDate(nextDayUTC())
  }

  // Auto-reset monthly counter if past the reset window
  if (data.monthlyResetAt && now.toMillis() >= data.monthlyResetAt.toMillis()) {
    updates.monthlyUsed = 0
    updates.monthlyResetAt = admin.firestore.Timestamp.fromDate(nextMonthUTC())
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = now
    await ref.update(updates)
    return { ...data, ...updates }
  }

  return data
}

/**
 * Pre-call quota check. Returns whether the request is allowed.
 * estimatedCost is a conservative estimate of how many tokens the call will use.
 */
export async function checkQuota(uid: string, estimatedCost: number): Promise<QuotaCheckResult> {
  const profileSnap = await db.collection('users').doc(uid).get()
  const tier = resolveTier(profileSnap.exists ? profileSnap.data() as any : null)
  const limits = getLimits(tier)

  // Guests don't use the token meter (they have per-session counters)
  if (tier === 'guest') return { allowed: true }

  const usage = await getOrCreateUsage(uid)

  // Daily cap check
  if (usage.dailyUsed + estimatedCost > limits.dailyTokenCap) {
    return {
      allowed: false,
      reason: 'daily_cap_exceeded',
      message: `You've reached today's limit (${formatTokenCount(usage.dailyUsed)}/${formatTokenCount(limits.dailyTokenCap)} tokens). Resets at midnight UTC.`,
      resetAt: usage.dailyResetAt?.toDate?.()?.toISOString() ?? null as any,
      used: usage.dailyUsed,
      limit: limits.dailyTokenCap,
    }
  }

  // Monthly cap check — top-up balance extends the monthly pool
  const effectiveMonthlyPool = limits.monthlyTokenPool + (usage.topUpBalance ?? 0)
  if (usage.monthlyUsed + estimatedCost > effectiveMonthlyPool) {
    const topUpHint = limits.topUpAvailable
      ? ' Add a token top-up pack to continue, or wait until your pool resets.'
      : ' Upgrade your plan for a larger token pool.'
    return {
      allowed: false,
      reason: 'monthly_cap_exceeded',
      message: `You've used your monthly token pool (${formatTokenCount(usage.monthlyUsed)}/${formatTokenCount(effectiveMonthlyPool)} tokens).${topUpHint}`,
      resetAt: usage.monthlyResetAt?.toDate?.()?.toISOString() ?? null as any,
      used: usage.monthlyUsed,
      limit: effectiveMonthlyPool,
    }
  }

  return { allowed: true, used: usage.monthlyUsed, limit: effectiveMonthlyPool }
}

/**
 * Post-call charge. Atomically increments both daily and monthly counters.
 * If monthly pool is exceeded and top-up balance exists, drains top-up first.
 */
export async function chargeTokens(uid: string, actualCost: number): Promise<void> {
  const ref = usageRef(uid)

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref)
    if (!snap.exists) {
      // Shouldn't happen if checkQuota was called first, but handle gracefully
      txn.set(ref, {
        monthlyUsed: actualCost,
        dailyUsed: actualCost,
        topUpBalance: 0,
        monthlyResetAt: admin.firestore.Timestamp.fromDate(nextMonthUTC()),
        dailyResetAt: admin.firestore.Timestamp.fromDate(nextDayUTC()),
        updatedAt: admin.firestore.Timestamp.now(),
      })
      return
    }

    const data = snap.data() as UsageDoc
    const profileSnap = await txn.get(db.collection('users').doc(uid))
    const tier = resolveTier(profileSnap.exists ? profileSnap.data() as any : null)
    const limits = getLimits(tier)

    let monthlyUsed = (data.monthlyUsed ?? 0) + actualCost
    let topUpBalance = data.topUpBalance ?? 0

    // If monthly pool exceeded, drain from top-up balance
    if (monthlyUsed > limits.monthlyTokenPool && topUpBalance > 0) {
      const overage = monthlyUsed - limits.monthlyTokenPool
      const drain = Math.min(overage, topUpBalance)
      topUpBalance -= drain
      // Don't reduce monthlyUsed — it tracks total consumption. Top-up extends the effective cap.
    }

    txn.update(ref, {
      monthlyUsed,
      dailyUsed: (data.dailyUsed ?? 0) + actualCost,
      topUpBalance,
      updatedAt: admin.firestore.Timestamp.now(),
    })
  })
}

/**
 * Add purchased top-up tokens to the user's balance.
 */
export async function addTopUpTokens(uid: string, amount: number): Promise<void> {
  const ref = usageRef(uid)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      monthlyUsed: 0,
      dailyUsed: 0,
      topUpBalance: amount,
      monthlyResetAt: admin.firestore.Timestamp.fromDate(nextMonthUTC()),
      dailyResetAt: admin.firestore.Timestamp.fromDate(nextDayUTC()),
      updatedAt: admin.firestore.Timestamp.now(),
    })
  } else {
    await ref.update({
      topUpBalance: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.Timestamp.now(),
    })
  }
}

/**
 * Get current usage snapshot for the user (for API responses / UI display).
 */
export async function getUsageSnapshot(uid: string): Promise<{
  tier: PlanTier
  monthlyUsed: number
  monthlyPool: number
  dailyUsed: number
  dailyCap: number
  topUpBalance: number
  dailyResetAt: string
  monthlyResetAt: string
}> {
  const profileSnap = await db.collection('users').doc(uid).get()
  const tier = resolveTier(profileSnap.exists ? profileSnap.data() as any : null)
  const limits = getLimits(tier)
  const usage = await getOrCreateUsage(uid)

  return {
    tier,
    monthlyUsed: usage.monthlyUsed,
    monthlyPool: limits.monthlyTokenPool + (usage.topUpBalance ?? 0),
    dailyUsed: usage.dailyUsed,
    dailyCap: limits.dailyTokenCap,
    topUpBalance: usage.topUpBalance ?? 0,
    dailyResetAt: usage.dailyResetAt?.toDate?.()?.toISOString() ?? '',
    monthlyResetAt: usage.monthlyResetAt?.toDate?.()?.toISOString() ?? '',
  }
}
