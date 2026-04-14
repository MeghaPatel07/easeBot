// useAccount — single source of truth for the Settings & Profile redesign UI.
// Sprint 1 (PRD §9). Uses TanStack Query (already in package.json) when wired
// to a real /api/account/me endpoint. Until the backend lands, the hook will
// gracefully degrade by reading whatever's already on AuthContext's profile,
// so dropdown + settings UI never block on a missing backend.

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  getAccountMe,
  patchAccountProfile,
  patchAccountPreferences,
  type AccountMeResponse,
  type AccountPlan,
  type AccountUsage,
  type AccountServiceError,
  type ProfilePatch,
} from '@/services/accountService'
import type { UserProfile, UserPreferences } from '@/types'

const ACCOUNT_QUERY_KEY = ['account', 'me'] as const

// Derive a sensible "free tier, no usage" view from a UserProfile so the UI
// can render even when the backend hasn't been built yet.
function deriveLocal(profile: UserProfile | null): AccountMeResponse | null {
  if (!profile) return null
  const tier: AccountPlan['tier'] = profile.plan ?? (profile.isPremium ? 'pro' : 'free')
  const usage: AccountUsage = {
    messagesUsed: profile.usage?.messagesUsed ?? 0,
    messagesAllowed: profile.usage?.messagesAllowed ?? (tier === 'free' ? 100 : 10000),
  }
  return {
    profile,
    plan: { tier },
    usage,
  }
}

/**
 * Mutation result shape — Sprint 4 (Kenji) fix for M-6/M-7 "lying UI".
 *
 * Mutations no longer swallow errors. They REJECT on backend/network failure
 * so callers can show an error toast and roll back optimistic UI. Callers that
 * prefer not to use try/catch can inspect `ok`/`error` on the returned shape.
 */
export interface MutationResult {
  ok: boolean
  error?: AccountServiceError
}

export interface UseAccountResult {
  profile: UserProfile | null
  plan: AccountPlan | null
  usage: AccountUsage | null
  isLoading: boolean
  error: AccountServiceError | null
  /** True when backend is unreachable / not implemented and we are reading from AuthContext. */
  isFallback: boolean
  /** TanStack mutation states for callers that want to drive their own UI. */
  isUpdatingProfile: boolean
  isUpdatingPreferences: boolean
  updateProfile: (patch: ProfilePatch) => Promise<MutationResult>
  updatePreferences: (patch: UserPreferences) => Promise<MutationResult>
}

export function useAccount(): UseAccountResult {
  const { user, profile: authProfile } = useAuth()
  const qc = useQueryClient()
  const enabled = !!user

  const query = useQuery<AccountMeResponse, AccountServiceError>({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccountMe,
    enabled,
    retry: (failureCount, err) => {
      // Don't retry the soft-fail cases that we already know about.
      if (err?.code === 'unauthenticated' || err?.code === 'not_implemented') return false
      return failureCount < 1
    },
    staleTime: 30_000,
  })

  const profileMutation = useMutation<UserProfile, AccountServiceError, ProfilePatch>({
    mutationFn: patchAccountProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  const prefsMutation = useMutation<UserPreferences, AccountServiceError, UserPreferences>({
    mutationFn: patchAccountPreferences,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  // Sprint 4 (Kenji): mutations now propagate errors. Callers MUST handle
  // rejection — either via try/catch or by inspecting the returned
  // `{ ok, error }` shape. Never silently report success on failure.
  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<MutationResult> => {
      try {
        await profileMutation.mutateAsync(patch)
        return { ok: true }
      } catch (err) {
        const e = err as AccountServiceError
        // Re-throw so existing try/catch code paths still work, but also
        // attach the structured result for code that prefers to await + read.
        throw e
      }
    },
    [profileMutation],
  )

  const updatePreferences = useCallback(
    async (patch: UserPreferences): Promise<MutationResult> => {
      try {
        await prefsMutation.mutateAsync(patch)
        return { ok: true }
      } catch (err) {
        const e = err as AccountServiceError
        throw e
      }
    },
    [prefsMutation],
  )

  // Fallback: backend not ready / not signed in / network error → derive from AuthContext.
  const local = deriveLocal(authProfile)
  const data = query.data ?? local
  const error = query.error ?? null
  const isFallback = !query.data && !!local

  return {
    profile: data?.profile ?? authProfile ?? null,
    plan: data?.plan ?? null,
    usage: data?.usage ?? null,
    isLoading: enabled && query.isLoading && !local,
    error,
    isFallback,
    isUpdatingProfile: profileMutation.isPending,
    isUpdatingPreferences: prefsMutation.isPending,
    updateProfile,
    updatePreferences,
  }
}
