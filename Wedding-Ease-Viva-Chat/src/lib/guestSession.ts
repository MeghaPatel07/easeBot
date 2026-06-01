// Guest session id (WE-20260527-202 / -001).
//
// Anonymous (not-signed-in) users still need access to the cost-bearing,
// guest-allowed backend routes (chat, image, tts, transcribe, speech-token).
// The backend now REJECTS fully-anonymous callers on those routes — a request
// must carry either a valid Firebase token OR a valid guest session. The guest
// session is a stable UUID minted on the client and persisted in localStorage;
// the backend uses the same id to scope the capped guest quota.
//
// This mirrors easebot-backend `quotaMiddleware.resolveOrMintGuestId` /
// `auth.hasValidGuestSession` (regex /^[a-f0-9-]{20,}$/i).

const STORAGE_KEY = 'easebot:guestSessionId'

function isWellFormed(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^[a-f0-9-]{20,}$/i.test(id)
}

function mint(): string {
  // crypto.randomUUID is available in all browsers we target; fall back to a
  // hex string if it's somehow missing (older embedded webviews).
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Return the persisted guest session id, minting + persisting one on first use.
 * Safe to call repeatedly — it's idempotent within a browser profile.
 */
export function getGuestSessionId(): string {
  if (typeof window === 'undefined') return mint()
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (isWellFormed(existing)) return existing
    const fresh = mint()
    window.localStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    // localStorage unavailable (private mode, blocked) — return an ephemeral id.
    // The request still authorizes; the guest quota just won't persist across
    // reloads, which is acceptable for a blocked-storage edge case.
    return mint()
  }
}

/**
 * Build the auth/guest headers for a backend call. When a Firebase token is
 * present we send only Authorization (the backend resolves the user and ignores
 * the guest id). When anonymous we send X-Guest-Id so the request authorizes as
 * a valid guest session.
 */
export function buildAuthHeaders(token: string | null): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` }
  return { 'X-Guest-Id': getGuestSessionId() }
}
