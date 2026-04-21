import { useEffect, useState } from 'react'
import { posthog } from '@/lib/analytics'

/**
 * Subscribe to a PostHog feature flag. Re-renders when the flag value changes
 * (e.g. after bootstrap resolves). Returns `defaultValue` when disabled.
 */
export function useFeatureFlag(flagKey: string, defaultValue = false): boolean {
  const [enabled, setEnabled] = useState<boolean>(defaultValue)

  useEffect(() => {
    let active = true
    const current = posthog.isFeatureEnabled?.(flagKey)
    if (current !== undefined) setEnabled(current)

    const unsubscribe = posthog.onFeatureFlags?.(() => {
      if (!active) return
      const v = posthog.isFeatureEnabled?.(flagKey)
      setEnabled(v === undefined ? defaultValue : v)
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [flagKey, defaultValue])

  return enabled
}
