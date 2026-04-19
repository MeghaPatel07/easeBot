// userPrefsCache — in-process read-through cache for the authenticated user's
// language preference. Eliminates the Firestore round-trip on the hot path of
// /api/transcribe. Firestore remains the source of truth.
//
// Invalidation: TTL-only (5 min). A server-side Firestore snapshot listener per
// user would leak resources, so we accept a ≤5-minute stale window. If a write
// path mutates users/{uid}.preferences.language and needs immediate refresh,
// call invalidateUserLanguage(uid) from that code path.

import { LRUCache } from 'lru-cache'
import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import { emit } from './observability'

// We wrap in an object because LRUCache v10 rejects null values.
// entry.value === null means "user exists but no explicit preference" (auto / missing doc).
// Absence from the cache means "never looked up".
interface LangEntry { value: string | null }

const TTL_MS = 5 * 60 * 1000

const langCache = new LRUCache<string, LangEntry>({
  max: 10_000,
  ttl: TTL_MS,
})

// ── Test seam ──────────────────────────────────────────────────────────────
// Production uses `defaultFirestoreFetcher`. Tests can swap via
// `__setFirestoreFetcherForTests` to avoid network I/O. Pass `null` to reset.
export interface UserLangSnapshot {
  exists: boolean
  data?: {
    preferences?: { language?: string }
    preferredLanguage?: string
  }
}
export type FirestoreFetcher = (uid: string) => Promise<UserLangSnapshot>

async function defaultFirestoreFetcher(uid: string): Promise<UserLangSnapshot> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return { exists: false }
  return { exists: true, data: snap.data() as UserLangSnapshot['data'] }
}

let activeFetcher: FirestoreFetcher = defaultFirestoreFetcher

export function __setFirestoreFetcherForTests(fn: FirestoreFetcher | null): void {
  activeFetcher = fn ?? defaultFirestoreFetcher
}

export function __clearCacheForTests(): void {
  langCache.clear()
}
// ───────────────────────────────────────────────────────────────────────────

export async function getCachedUserLanguage(uid: string): Promise<string | undefined> {
  if (!uid) return undefined

  const cached = langCache.get(uid)
  if (cached !== undefined) {
    emit('stt.pref_cache', { uid, result: 'HIT', lang: cached.value ?? 'none' })
    return cached.value ?? undefined
  }

  try {
    const snap = await activeFetcher(uid)
    if (!snap.exists) {
      langCache.set(uid, { value: null })
      emit('stt.pref_cache', { uid, result: 'MISS', lang: 'none', reason: 'no_doc' })
      return undefined
    }
    const data = snap.data ?? {}
    const raw = data.preferences?.language ?? data.preferredLanguage
    const resolved: string | null = !raw || raw === 'auto' ? null : raw
    langCache.set(uid, { value: resolved })
    emit('stt.pref_cache', { uid, result: 'MISS', lang: resolved ?? 'none' })
    return resolved ?? undefined
  } catch (err) {
    // Never fail the request because of a cache/lookup error — fall back to
    // legacy 4-lang auto-detect (undefined preferred) just like the original
    // resolveUserPreferredLanguage did.
    emit('stt.pref_cache', {
      uid,
      result: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}

export function invalidateUserLanguage(uid: string): void {
  if (!uid) return
  langCache.delete(uid)
  emit('stt.pref_cache', { uid, result: 'INVALIDATE' })
}

// Exposed for diagnostics / integration tests only. Do not use in production paths.
export function __cacheSizeForTests(): number {
  return langCache.size
}
