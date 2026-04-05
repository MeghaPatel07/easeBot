/**
 * Per-user image generation quota service.
 * Tracks daily and monthly usage, enforces tier limits.
 */
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ImageQuotaStatus {
  allowed: boolean
  remaining: number
  dailyUsed: number
  dailyLimit: number
  monthlyUsed: number
  monthlyLimit: number
  resetAt: string // ISO date string for daily reset
}

interface ImageUsageDoc {
  userId: string
  dailyCount: number
  monthlyCount: number
  lastDailyReset: string   // YYYY-MM-DD
  lastMonthlyReset: string // YYYY-MM
  lastImageAt: Timestamp | null
}

// ── Tier Limits ─────────────────────────────────────────────────────────────────

const LIMITS = {
  free:    { daily: 999999,  monthly: 999999  },
  premium: { daily: 999999, monthly: 999999 },
} as const

// ── Helpers ─────────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function thisMonthStr(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

function tomorrowMidnightISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ── Core Functions ──────────────────────────────────────────────────────────────

/**
 * Check whether a user is allowed to generate images and how many remain.
 * Automatically resets daily/monthly counters when the period rolls over.
 */
export async function checkImageQuota(
  userId: string,
  isPremium: boolean
): Promise<ImageQuotaStatus> {
  const tier = isPremium ? 'premium' : 'free'
  const { daily: dailyLimit, monthly: monthlyLimit } = LIMITS[tier]
  const today = todayStr()
  const thisMonth = thisMonthStr()

  try {
    const docRef = doc(db, 'imageUsage', userId)
    const snap = await getDoc(docRef)

    let usage: ImageUsageDoc

    if (!snap.exists()) {
      // First time — initialize
      usage = {
        userId,
        dailyCount: 0,
        monthlyCount: 0,
        lastDailyReset: today,
        lastMonthlyReset: thisMonth,
        lastImageAt: null,
      }
      await setDoc(docRef, usage)
    } else {
      usage = snap.data() as ImageUsageDoc

      let needsWrite = false

      // Auto-reset daily counter
      if (usage.lastDailyReset !== today) {
        usage.dailyCount = 0
        usage.lastDailyReset = today
        needsWrite = true
      }

      // Auto-reset monthly counter
      if (usage.lastMonthlyReset !== thisMonth) {
        usage.monthlyCount = 0
        usage.lastMonthlyReset = thisMonth
        needsWrite = true
      }

      if (needsWrite) {
        await setDoc(docRef, usage)
      }
    }

    const dailyRemaining = Math.max(0, dailyLimit - usage.dailyCount)
    const monthlyRemaining = Math.max(0, monthlyLimit - usage.monthlyCount)
    const remaining = Math.min(dailyRemaining, monthlyRemaining)

    return {
      allowed: remaining > 0,
      remaining,
      dailyUsed: usage.dailyCount,
      dailyLimit,
      monthlyUsed: usage.monthlyCount,
      monthlyLimit,
      resetAt: tomorrowMidnightISO(),
    }
  } catch (err) {
    console.error('[imageQuota] checkImageQuota error:', err)
    // On error, allow the request (fail open) to avoid blocking users
    return {
      allowed: true,
      remaining: dailyLimit,
      dailyUsed: 0,
      dailyLimit,
      monthlyUsed: 0,
      monthlyLimit,
      resetAt: tomorrowMidnightISO(),
    }
  }
}

/**
 * Increment the user's image usage counters after a successful generation.
 * @param userId Firebase Auth UID
 * @param count Number of images generated (for multi-variant)
 */
export async function incrementImageUsage(
  userId: string,
  count: number = 1
): Promise<void> {
  const today = todayStr()
  const thisMonth = thisMonthStr()

  try {
    const docRef = doc(db, 'imageUsage', userId)
    const snap = await getDoc(docRef)

    if (!snap.exists()) {
      await setDoc(docRef, {
        userId,
        dailyCount: count,
        monthlyCount: count,
        lastDailyReset: today,
        lastMonthlyReset: thisMonth,
        lastImageAt: Timestamp.now(),
      } as ImageUsageDoc)
      return
    }

    const usage = snap.data() as ImageUsageDoc

    // Reset if needed, then increment
    const dailyCount = (usage.lastDailyReset === today ? usage.dailyCount : 0) + count
    const monthlyCount = (usage.lastMonthlyReset === thisMonth ? usage.monthlyCount : 0) + count

    await setDoc(docRef, {
      ...usage,
      dailyCount,
      monthlyCount,
      lastDailyReset: today,
      lastMonthlyReset: thisMonth,
      lastImageAt: Timestamp.now(),
    } as ImageUsageDoc)
  } catch (err) {
    console.error('[imageQuota] incrementImageUsage error:', err)
    // Non-fatal — don't throw, just log
  }
}
