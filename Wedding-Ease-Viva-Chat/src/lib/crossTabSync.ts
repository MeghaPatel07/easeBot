// crossTabSync.ts — dependency-free cross-tab messaging layer (TICKET BC-ARCH).
//
// WHY THIS EXISTS
// ---------------
// Several flows need a mutation in one browser tab to propagate to other open
// tabs of the same origin (e.g. profile/tier change in tab A should let tab B
// invalidate its TanStack Query cache). The native primitive for this is
// `BroadcastChannel`, but it's unavailable in some older Safari/WebView builds.
// This module provides a single typed wrapper that prefers `BroadcastChannel`
// and transparently falls back to the `localStorage` "storage" event (which
// already fires cross-tab) when the native API is missing.
//
// This is the REUSABLE FOUNDATION ONLY. It is intentionally NOT wired into
// AuthContext / Index yet — the ~25 child tickets that consume it are blocked
// on PR #32 (AuthContext) landing. Ship the layer + tests; wire later.
//
// PATTERN ALIGNMENT
// -----------------
//   - localStorage access is wrapped in try/catch, matching the guest-counter
//     code in src/pages/Index.tsx and the consent flag in
//     src/components/AnalyticsConsent.tsx (private-mode / quota safe).
//   - The fallback writes a uniquely-keyed value then removes it, so repeated
//     identical messages still fire a "storage" event in listening tabs.
//
// USAGE
// -----
//   // Define a typed channel once (often module-scope):
//   type UserStateMsg =
//     | { type: 'user-updated' }
//     | { type: 'signed-out'; uid: string }
//   const userChannel = createCrossTabChannel<UserStateMsg>('user-state')
//
//   // In a hook/effect — subscribe and clean up:
//   useEffect(() => {
//     const unsub = userChannel.subscribe((msg) => {
//       if (msg.type === 'user-updated') {
//         queryClient.invalidateQueries({ queryKey: ['user'] })
//       }
//     })
//     return unsub
//   }, [])
//
//   // After a mutation succeeds — broadcast to the other tabs:
//   userChannel.publish({ type: 'user-updated' })
//
// NOTES
//   - Messages are NOT delivered to the publishing tab itself (mirrors native
//     BroadcastChannel semantics on both transports). The publisher already
//     knows its own state; it should update locally and broadcast for others.
//   - Payloads must be structured-clone-able for the native path and
//     JSON-serialisable for the fallback path. Keep them to plain data.

/** The transport actually backing a channel — useful for tests and diagnostics. */
export type CrossTabTransport = 'broadcast-channel' | 'storage-event' | 'noop'

export interface CrossTabChannel<T> {
  /** The channel name (origin-scoped namespace). */
  readonly name: string
  /** Which underlying transport this channel resolved to. */
  readonly transport: CrossTabTransport
  /** Send a message to every OTHER tab subscribed to this channel name. */
  publish: (message: T) => void
  /**
   * Register a handler for messages from other tabs.
   * Returns an unsubscribe function (call it in an effect cleanup).
   */
  subscribe: (handler: (message: T) => void) => () => void
  /** Tear down the channel and all its subscribers. Idempotent. */
  close: () => void
}

const STORAGE_KEY_PREFIX = 'crosstab:'

/** Feature-detect a usable BroadcastChannel (guards SSR / older WebViews). */
function hasBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

/** Feature-detect a usable localStorage + window event target. */
function hasStorageFallback(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      typeof window.localStorage !== 'undefined'
    )
  } catch {
    // Accessing localStorage can throw in some sandboxed/private contexts.
    return false
  }
}

/** A monotonic-ish unique id so identical payloads still trigger storage events. */
let storageSeq = 0
function nextStorageNonce(): string {
  storageSeq += 1
  return `${Date.now()}-${storageSeq}-${Math.random().toString(36).slice(2)}`
}

/**
 * Create a typed cross-tab channel. Prefers `BroadcastChannel`; falls back to
 * a `localStorage` "storage"-event bridge; degrades to a no-op channel when
 * neither is available (e.g. SSR), so callers never need to null-check.
 */
export function createCrossTabChannel<T>(name: string): CrossTabChannel<T> {
  if (hasBroadcastChannel()) {
    return createBroadcastChannelImpl<T>(name)
  }
  if (hasStorageFallback()) {
    return createStorageChannelImpl<T>(name)
  }
  return createNoopChannelImpl<T>(name)
}

// ── BroadcastChannel transport ───────────────────────────────────────────────

function createBroadcastChannelImpl<T>(name: string): CrossTabChannel<T> {
  let bc: BroadcastChannel | null = new BroadcastChannel(name)
  const handlers = new Set<(message: T) => void>()

  const onMessage = (e: MessageEvent): void => {
    // Snapshot to tolerate unsubscribe-during-dispatch.
    for (const h of Array.from(handlers)) {
      try {
        h(e.data as T)
      } catch {
        // A throwing subscriber must not break sibling subscribers.
      }
    }
  }
  bc.addEventListener('message', onMessage)

  return {
    name,
    transport: 'broadcast-channel',
    publish: (message: T): void => {
      try {
        bc?.postMessage(message)
      } catch {
        // postMessage throws if the channel is closed or payload not cloneable.
      }
    },
    subscribe: (handler: (message: T) => void): (() => void) => {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    close: (): void => {
      if (!bc) return
      bc.removeEventListener('message', onMessage)
      try {
        bc.close()
      } catch {
        /* already closed */
      }
      bc = null
      handlers.clear()
    },
  }
}

// ── localStorage "storage"-event transport ───────────────────────────────────

interface StorageEnvelope<T> {
  /** Channel name, so one window listener can route to the right channel. */
  c: string
  /** Unique nonce so repeated identical payloads still change the value. */
  n: string
  /** The user payload. */
  d: T
}

function createStorageChannelImpl<T>(name: string): CrossTabChannel<T> {
  const storageKey = STORAGE_KEY_PREFIX + name
  const handlers = new Set<(message: T) => void>()

  const onStorage = (e: StorageEvent): void => {
    // `storage` fires for every key in the origin; filter to ours.
    // A removeItem produces newValue === null — ignore those.
    if (e.key !== storageKey || e.newValue == null) return
    let envelope: StorageEnvelope<T>
    try {
      envelope = JSON.parse(e.newValue) as StorageEnvelope<T>
    } catch {
      return
    }
    if (!envelope || envelope.c !== name) return
    for (const h of Array.from(handlers)) {
      try {
        h(envelope.d)
      } catch {
        /* isolate subscriber errors */
      }
    }
  }
  window.addEventListener('storage', onStorage)

  return {
    name,
    transport: 'storage-event',
    publish: (message: T): void => {
      const envelope: StorageEnvelope<T> = { c: name, n: nextStorageNonce(), d: message }
      try {
        // Write then remove: listeners in other tabs see the write; we don't
        // leave stale state behind. The remove (newValue === null) is ignored
        // by onStorage above.
        window.localStorage.setItem(storageKey, JSON.stringify(envelope))
        window.localStorage.removeItem(storageKey)
      } catch {
        // Quota / private-mode — drop the message rather than throw.
      }
    },
    subscribe: (handler: (message: T) => void): (() => void) => {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    close: (): void => {
      window.removeEventListener('storage', onStorage)
      handlers.clear()
    },
  }
}

// ── No-op transport (SSR / no APIs available) ────────────────────────────────

function createNoopChannelImpl<T>(name: string): CrossTabChannel<T> {
  return {
    name,
    transport: 'noop',
    publish: (): void => {},
    subscribe: (): (() => void) => () => {},
    close: (): void => {},
  }
}
