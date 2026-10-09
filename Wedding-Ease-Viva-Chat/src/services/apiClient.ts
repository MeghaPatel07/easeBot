/**
 * Single fetch helper for the Next.js backend (`/api/easebot/*`). Auth = the customer session token issued by
 * `/auth/*` (kept in localStorage); guests are identified by an `X-Guest-Id` the backend mints and we echo back.
 */
import { revive } from '@/lib/timestamp'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const TOKEN_KEY = 'easebot_token'
const GUEST_KEY = 'easebot_guest_id'

const read = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null): void => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* private mode */ } }

export const getToken = (): string | null => read(TOKEN_KEY)
export const setToken = (t: string | null): void => write(TOKEN_KEY, t)
export const getGuestId = (): string | null => read(GUEST_KEY)

/** Absolute URL for a legacy `/api/<x>` path (these now live under `/api/easebot/<x>`). */
export const apiUrl = (path: string): string => `${BASE}/api/easebot${path.replace(/^\/api/, '')}`

/** Auth (or guest) headers for hand-rolled `fetch` calls such as SSE. */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  if (token) return { Authorization: `Bearer ${token}` }
  const g = getGuestId()
  return g ? { 'X-Guest-Id': g } : {}
}

/** Remember a guest id the backend minted on a hand-rolled response. */
export function rememberGuestId(res: Response): void {
  const minted = res.headers.get('X-Guest-Id')
  if (minted) write(GUEST_KEY, minted)
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public body?: unknown) {
    super(message)
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  else { const g = getGuestId(); if (g) headers.set('X-Guest-Id', g) }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${BASE}/api/easebot${path}`, { ...init, headers, credentials: 'include' })
  const minted = res.headers.get('X-Guest-Id')
  if (minted) write(GUEST_KEY, minted)
  return res
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await apiFetch(path, json !== undefined ? { ...rest, method: rest.method ?? 'POST', body: JSON.stringify(json) } : rest)
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? res.statusText, (body as { code?: string } | null)?.code, body)
  return revive(body) as T
}

/** Follows `nextCursor` until exhausted (or `maxPages`), for lists the UI renders whole (sidebar data). */
export async function apiAll<T>(path: string, maxPages = 10): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxPages; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const page: { items: T[]; nextCursor: string | null } = await api(`${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    out.push(...page.items)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return out
}

// ── Live queries (replace Firestore onSnapshot) ──────────────────────────────────────────────
const topicListeners = new Map<string, Set<() => void>>()

/** Mutations call this so every subscriber of the topic refetches immediately. */
export function invalidate(...topics: string[]): void {
  for (const t of topics) topicListeners.get(t)?.forEach((fn) => fn())
}

/**
 * Subscribes `cb` to `fetcher()`'s result: immediate fetch, refetch on `invalidate(topic)`, on tab focus, and every
 * `intervalMs` while the tab is visible. In-flight requests are aborted on unsubscribe; concurrent refetches coalesce.
 */
export function liveQuery<T>(topics: string | string[], fetcher: (signal: AbortSignal) => Promise<T>, cb: (v: T) => void, opts: { intervalMs?: number; onError?: (e: unknown) => void } = {}): () => void {
  const list = Array.isArray(topics) ? topics : [topics]
  const intervalMs = opts.intervalMs ?? 30_000
  let ctrl: AbortController | null = null
  let pending = false
  let alive = true

  const run = async () => {
    if (!alive) return
    if (ctrl) { pending = true; return }
    ctrl = new AbortController()
    try {
      const v = await fetcher(ctrl.signal)
      if (alive) cb(v)
    } catch (e) {
      if (alive && (e as Error).name !== 'AbortError') { opts.onError ? opts.onError(e) : console.error('[liveQuery]', (e as Error).message) }
    } finally {
      ctrl = null
      if (pending && alive) { pending = false; void run() }
    }
  }
  list.forEach((t) => { (topicListeners.get(t) ?? topicListeners.set(t, new Set()).get(t)!).add(run) })
  const onVisible = () => { if (document.visibilityState === 'visible') void run() }
  document.addEventListener('visibilitychange', onVisible)
  const timer = intervalMs > 0 ? window.setInterval(() => { if (document.visibilityState === 'visible') void run() }, intervalMs) : 0
  void run()

  return () => {
    alive = false
    ctrl?.abort()
    list.forEach((t) => topicListeners.get(t)?.delete(run))
    document.removeEventListener('visibilitychange', onVisible)
    if (timer) window.clearInterval(timer)
  }
}
