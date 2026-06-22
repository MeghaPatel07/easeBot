// useTokenPool — wraps useUsageStats to provide x/y counts + percentage
// for the TokenPoolBar component in the ProfileMenu dropdown.

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsageStats } from '@/hooks/useUsageStats'
import { getLimits, resolveTier } from '@/config/tierConfig'
import { onQuotaExceeded, type QuotaExceededPayload } from '@/services/accountService'

export interface TokenPoolState {
  /** Raw snapshot from the backend */
  snapshot: ReturnType<typeof useUsageStats>['snapshot']
  isLoading: boolean
  error: Error | null
  /** Monthly usage as percentage (0–100) */
  monthlyPct: number
  /** Daily usage as percentage (0–100) */
  dailyPct: number
  /** Formatted strings for display — percentage only, no raw token counts */
  monthlyLabel: string   // e.g. "62%"
  dailyLabel: string     // e.g. "40%"
  /** Warning level based on monthly usage */
  level: 'ok' | 'warning' | 'critical' | 'exceeded'
  /** Set when the most recent backend call returned 402 — pins the relevant bar to 100% */
  cappedReason: 'daily_cap_exceeded' | 'monthly_cap_exceeded' | null
  /** Whether the user can refetch */
  refetch: () => void
}

export function useTokenPool(): TokenPoolState {
  const { user, profile } = useAuth()
  const tier = resolveTier(profile)
  const limits = getLimits(tier)
  const { snapshot, isLoading, isError, error, refetch } = useUsageStats()

  // Track the most recent 402 from the backend. Pins the relevant bar to 100%
  // until either the reset time passes or a refetch shows usage actually
  // dropped below the cap (e.g. midnight UTC roll-over).
  const [capped, setCapped] = useState<QuotaExceededPayload | null>(null)
  useEffect(() => {
    return onQuotaExceeded((payload) => {
      setCapped(payload)
      refetch()
    })
  }, [refetch])

  // Auto-clear the cap if the snapshot's resetAt has passed.
  useEffect(() => {
    if (!capped?.resetAt) return
    const ms = new Date(capped.resetAt).getTime() - Date.now()
    if (ms <= 0) { setCapped(null); return }
    const t = setTimeout(() => setCapped(null), ms + 1000)
    return () => clearTimeout(t)
  }, [capped])

  const enabled = !!user && tier !== 'guest'

  if (!enabled || !snapshot) {
    return {
      snapshot: null,
      isLoading,
      error: error as Error | null,
      monthlyPct: 0,
      dailyPct: 0,
      monthlyLabel: '0%',
      dailyLabel: '0%',
      level: 'ok',
      cappedReason: null,
      refetch,
    }
  }

  // Backend UsageSnapshot fields:
  //   monthlyTokensUsed, monthlyPoolMax, dailyUsed, dailyMax
  const monthlyUsed = snapshot.monthlyTokensUsed ?? 0
  const monthlyPool = snapshot.monthlyPoolMax ?? limits.monthlyTokenPool ?? 0
  const dailyUsed = snapshot.dailyUsed ?? 0
  // dailyMax can be null in backend response — fall back to tier config
  const dailyCap = snapshot.dailyMax ?? limits.dailyTokenCap ?? 0

  // Force the matching bar to 100% if the backend most recently returned 402
  // for that dimension — the pessimistic-estimate gate can lock the user out
  // before the bar mathematically reaches 100%.
  const cappedReason: TokenPoolState['cappedReason'] =
    capped?.reason === 'daily_cap_exceeded' || capped?.reason === 'monthly_cap_exceeded'
      ? capped.reason
      : null

  const rawMonthlyPct = monthlyPool > 0
    ? Math.min(100, Math.round((monthlyUsed / monthlyPool) * 100))
    : 0
  const rawDailyPct = dailyCap > 0
    ? Math.min(100, Math.round((dailyUsed / dailyCap) * 100))
    : 0

  const monthlyPct = cappedReason === 'monthly_cap_exceeded' ? 100 : rawMonthlyPct
  const dailyPct = cappedReason === 'daily_cap_exceeded' ? 100 : rawDailyPct

  const level: TokenPoolState['level'] =
    monthlyPct >= 100 ? 'exceeded'
      : monthlyPct >= 90 ? 'critical'
        : monthlyPct >= 75 ? 'warning'
          : 'ok'

  return {
    snapshot,
    isLoading,
    error: error as Error | null,
    monthlyPct,
    dailyPct,
    monthlyLabel: `${monthlyPct}%`,
    dailyLabel: `${dailyPct}%`,
    level,
    cappedReason,
    refetch,
  }
}
