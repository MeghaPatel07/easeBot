// Account service — Sprint 1 of Settings & Profile redesign (PRD §8/§9).
// Wraps the (yet-to-land) /api/account/* backend endpoints. All calls attach
// the Firebase ID token using the same pattern as functionsService.ts so the
// auth surface stays consistent across the frontend.
//
// Endpoints owned by Rohan (backend). They may return 501 while stubbed —
// callers MUST tolerate that; useAccount.ts converts it to a soft state.

import { auth } from '@/lib/firebase'
import type { UserProfile, UserPreferences } from '@/types'

// Same env var as ttsService / functionsService / notesSharingService.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccountUsage {
  messagesUsed: number
  messagesAllowed: number
  periodStart?: string
  periodEnd?: string
}

export interface AccountPlan {
  tier: 'free' | 'pro' | 'premium'
  renewsAt?: string
  trialEndsAt?: string
}

export interface AccountMeResponse {
  profile: UserProfile
  plan: AccountPlan
  usage: AccountUsage
}

export interface AccountServiceError extends Error {
  status: number
  code: 'unauthenticated' | 'not_implemented' | 'network' | 'server'
}

function makeError(status: number, code: AccountServiceError['code'], message: string): AccountServiceError {
  const err = new Error(message) as AccountServiceError
  err.status = status
  err.code = code
  return err
}

// ── Auth helper ──────────────────────────────────────────────────────────────
// Mirrors functionsService.getAuthToken pattern.
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getAuthToken()
  if (!token) {
    throw makeError(401, 'unauthenticated', 'Not signed in')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw makeError(0, 'network', (e as Error).message || 'Network error')
  }

  if (res.status === 401) throw makeError(401, 'unauthenticated', 'Not signed in')
  if (res.status === 501) throw makeError(501, 'not_implemented', 'Backend not yet available')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw makeError(res.status, 'server', text || `Request failed (${res.status})`)
  }
  // Allow empty bodies on 204
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

async function requestBlob(path: string): Promise<Blob> {
  const token = await getAuthToken()
  if (!token) throw makeError(401, 'unauthenticated', 'Not signed in')
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (e) {
    throw makeError(0, 'network', (e as Error).message || 'Network error')
  }
  if (res.status === 401) throw makeError(401, 'unauthenticated', 'Not signed in')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw makeError(res.status, 'server', text || `Request failed (${res.status})`)
  }
  return res.blob()
}

// ── Endpoints (PRD §8) ───────────────────────────────────────────────────────

export function getAccountMe(): Promise<AccountMeResponse> {
  return request<AccountMeResponse>('GET', '/api/account/me')
}

export interface ProfilePatch {
  name?: string
  nickname?: string
  phone?: string | null
  weddingDate?: string | null
  partnerName?: string | null
  budget?: number | null
  role?: string | null
  about?: string | null
  responseStyle?: string | null
  // Phone-created accounts only — patches the Firestore display email without
  // touching the derived Firebase Auth identity. Backend rejects with
  // EMAIL_LOCKED when the caller's account was created with email.
  email?: string
}

export function patchAccountProfile(patch: ProfilePatch): Promise<UserProfile> {
  return request<UserProfile>('PATCH', '/api/account/profile', patch)
}

export function patchAccountPreferences(patch: UserPreferences): Promise<UserPreferences> {
  return request<UserPreferences>('PATCH', '/api/account/preferences', patch)
}

export function getAccountPlan(): Promise<{ plan: AccountPlan; usage: AccountUsage }> {
  return request<{ plan: AccountPlan; usage: AccountUsage }>('GET', '/api/account/plan')
}

export interface SwitchPlanResponse {
  ok: true
  plan: 'free' | 'pro' | 'premium'
  planRenewsAt: string | null
  usage: AccountUsage
}

export function switchPlan(tier: 'free' | 'pro' | 'premium'): Promise<SwitchPlanResponse> {
  return request<SwitchPlanResponse>('POST', '/api/account/plan/switch', { tier })
}

export function exportAccountData(): Promise<Blob> {
  return requestBlob('/api/account/export')
}

export function clearChatHistory(): Promise<{ ok: true; deletedThreads: number; deletedMessages: number }> {
  return request<{ ok: true; deletedThreads: number; deletedMessages: number }>('DELETE', '/api/account/history')
}

// ── Sprint 4 (Kenji) — C-1 delete account & sign-out-everywhere ──────────────

/**
 * Permanently delete the signed-in user's account.
 * Backend: DELETE /api/account/delete (PRD §6.7). Caller is responsible for
 * calling auth.signOut() and redirecting on success.
 */
export function deleteAccount(): Promise<void> {
  return request<void>('POST', '/api/account/delete')
}

/**
 * Revoke refresh tokens on every device (server-side). Ravi is adding the
 * endpoint POST /api/account/sign-out-everywhere in parallel with this PR.
 * Caller is responsible for calling auth.signOut() and redirecting on success.
 */
export function signOutEverywhere(): Promise<void> {
  return request<void>('POST', '/api/account/sign-out-everywhere')
}

