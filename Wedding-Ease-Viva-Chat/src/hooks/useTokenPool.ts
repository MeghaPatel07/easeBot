// useTokenPool — wraps useUsageStats to provide x/y counts + percentage
// for the TokenPoolBar component in the ProfileMenu dropdown.

import { useAuth } from '@/contexts/AuthContext'
import { useUsageStats } from '@/hooks/useUsageStats'
import { formatTokenCount, getLimits, resolveTier } from '@/config/tierConfig'

export interface TokenPoolState {
  /** Raw snapshot from the backend */
  snapshot: ReturnType<typeof useUsageStats>['snapshot']
  isLoading: boolean
  error: Error | null
  /** Monthly usage as percentage (0–100) */
  monthlyPct: number
  /** Daily usage as percentage (0–100) */
  dailyPct: number
  /** Formatted strings for display */
  monthlyLabel: string   // e.g. "250K / 3M"
  dailyLabel: string     // e.g. "12K / 300K"
  /** Warning level based on monthly usage */
  level: 'ok' | 'warning' | 'critical' | 'exceeded'
  /** Whether the user can refetch */
  refetch: () => void
}

export function useTokenPool(): TokenPoolState {
  const { user, profile } = useAuth()
  const tier = resolveTier(profile)
  const limits = getLimits(tier)
  const { snapshot, isLoading, isError, error, refetch } = useUsageStats()

  const enabled = !!user && tier !== 'guest'

  if (!enabled || !snapshot) {
    return {
      snapshot: null,
      isLoading,
      error: error as Error | null,
      monthlyPct: 0,
      dailyPct: 0,
      monthlyLabel: `0 / ${formatTokenCount(limits.monthlyTokenPool)}`,
      dailyLabel: `0 / ${formatTokenCount(limits.dailyTokenCap)}`,
      level: 'ok',
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

  const monthlyPct = monthlyPool > 0
    ? Math.min(100, Math.round((monthlyUsed / monthlyPool) * 100))
    : 0
  const dailyPct = dailyCap > 0
    ? Math.min(100, Math.round((dailyUsed / dailyCap) * 100))
    : 0

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
    monthlyLabel: `${formatTokenCount(monthlyUsed)} / ${formatTokenCount(monthlyPool)}`,
    dailyLabel: `${formatTokenCount(dailyUsed)} / ${formatTokenCount(dailyCap)}`,
    level,
    refetch,
  }
}
