/**
 * In-memory registry of in-flight chat requests keyed by client-supplied
 * requestId. Lets the frontend cancel a request explicitly via POST /chat/cancel
 * when the proxy/LB in front of Node swallows the client-side TCP abort and
 * `req.on('close')` never fires.
 *
 * Single-process only. If we ever run multiple Node instances behind a shared
 * LB, replace this with Redis pub/sub (publish cancel → each instance checks
 * its local registry).
 */

interface Entry {
  controller: AbortController
  uid: string | null
  expiresAt: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes — safety net, normal flow unregisters on completion
const registry = new Map<string, Entry>()

// Sweep expired entries every minute so a crashed/hung handler doesn't leak.
// Interval is unref'd so it doesn't prevent process shutdown.
const sweep = setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of registry) {
    if (entry.expiresAt <= now) registry.delete(id)
  }
}, 60_000)
sweep.unref?.()

export function register(requestId: string, controller: AbortController, uid: string | null): void {
  if (!requestId) return
  registry.set(requestId, {
    controller,
    uid,
    expiresAt: Date.now() + TTL_MS,
  })
}

export function unregister(requestId: string): void {
  if (!requestId) return
  registry.delete(requestId)
}

/**
 * Cancel an in-flight request. Returns:
 *  - 'cancelled' — found + aborted
 *  - 'forbidden' — found but uid mismatch (caller is not the owner)
 *  - 'not_found' — unknown or already-completed requestId
 */
export function cancel(requestId: string, callerUid: string | null): 'cancelled' | 'forbidden' | 'not_found' {
  const entry = registry.get(requestId)
  if (!entry) return 'not_found'
  // Owner check: a logged-in request can only be cancelled by the same uid.
  // Guest requests (uid === null) can be cancelled by anyone with the requestId
  // since the id itself is the only capability the client has.
  if (entry.uid !== null && entry.uid !== callerUid) return 'forbidden'
  entry.controller.abort()
  registry.delete(requestId)
  return 'cancelled'
}
