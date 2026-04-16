import { useQuery } from '@tanstack/react-query'
import { getAccountUsage, type UsageSnapshot } from '@/services/accountService'

export type { UsageSnapshot }

const STALE_MS = 30_000
const REFETCH_MS = 60_000

export function useUsageStats() {
  const query = useQuery<UsageSnapshot, Error>({
    queryKey: ['account', 'usage'],
    queryFn: getAccountUsage,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    retry: (failureCount, err) => {
      const e = err as Error & { status?: number; code?: string }
      if (e.status === 401 || e.code === 'unauthenticated') return false
      return failureCount < 2
    },
  })

  const snapshot = query.data
  const monthlyPct = snapshot && snapshot.monthlyPoolMax > 0
    ? Math.min(100, Math.round((snapshot.monthlyTokensUsed / snapshot.monthlyPoolMax) * 100))
    : 0

  let state: 'ok' | 'warn' | 'crit' | 'daily_hit' | 'depleted' = 'ok'
  if (snapshot) {
    if (snapshot.monthlyPool <= 0 && snapshot.extrasBucket <= 0) state = 'depleted'
    else if (monthlyPct >= 90) state = 'crit'
    else if (monthlyPct >= 70) state = 'warn'
  }

  return {
    snapshot,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    monthlyPct,
    state,
  }
}

export default useUsageStats
