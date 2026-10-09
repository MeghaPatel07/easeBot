import type { AppUser } from '@/services/authService'

/**
 * Synchronous view of the signed-in user for code outside React (pages that used `auth.currentUser` /
 * `onAuthStateChanged`). `AuthProvider` is the only writer.
 */
let current: AppUser | null = null
let ready = false
const subs = new Set<(u: AppUser | null) => void>()

export const getCurrentUser = (): AppUser | null => current

export function setCurrentUser(u: AppUser | null, markReady = false): void {
  current = u
  if (markReady) ready = true
  if (ready) subs.forEach((fn) => fn(u))
}

/** Calls `cb` once the initial session restore has finished (immediately if it already has), then on every change. */
export function onAuthChange(cb: (u: AppUser | null) => void): () => void {
  subs.add(cb)
  if (ready) cb(current)
  return () => { subs.delete(cb) }
}
