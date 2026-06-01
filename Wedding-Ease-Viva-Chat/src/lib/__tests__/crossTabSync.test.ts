// Unit tests for crossTabSync.ts (BroadcastChannel wrapper + storage fallback).
// Zero new deps — uses node:test, like src/services/__tests__/audioUtils.test.ts.
//
// Run from Wedding-Ease-Viva-Chat:
//   node --experimental-strip-types --test src/lib/__tests__/crossTabSync.test.ts
//
// Node has no DOM, so we install minimal in-process fakes for BroadcastChannel,
// window and localStorage that faithfully model CROSS-TAB semantics (a sender
// does NOT receive its own message; sibling listeners do). Each test fully
// owns/cleans these globals so the import is re-evaluated against the right env.

import { test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

// ── Fakes ────────────────────────────────────────────────────────────────────

type Listener = (e: any) => void

/**
 * Fake BroadcastChannel hub: instances on the same name form a "bus". A
 * postMessage from one instance is delivered to all OTHER instances, matching
 * the spec (the sender never hears itself). This lets one test simulate two
 * tabs by creating two channels with the same name.
 */
function installFakeBroadcastChannel() {
  const buses = new Map<string, Set<FakeBroadcastChannel>>()

  class FakeBroadcastChannel {
    name: string
    private listeners = new Set<Listener>()
    private closed = false
    constructor(name: string) {
      this.name = name
      let set = buses.get(name)
      if (!set) {
        set = new Set()
        buses.set(name, set)
      }
      set.add(this)
    }
    addEventListener(_type: 'message', cb: Listener) {
      this.listeners.add(cb)
    }
    removeEventListener(_type: 'message', cb: Listener) {
      this.listeners.delete(cb)
    }
    postMessage(data: unknown) {
      if (this.closed) throw new Error('channel closed')
      const peers = buses.get(this.name)
      if (!peers) return
      for (const peer of peers) {
        if (peer === this) continue // sender doesn't hear itself
        for (const cb of Array.from(peer.listeners)) cb({ data })
      }
    }
    close() {
      this.closed = true
      this.listeners.clear()
      buses.get(this.name)?.delete(this)
    }
  }

  const prev = (globalThis as any).BroadcastChannel
  ;(globalThis as any).BroadcastChannel = FakeBroadcastChannel
  return () => {
    if (prev === undefined) delete (globalThis as any).BroadcastChannel
    else (globalThis as any).BroadcastChannel = prev
    buses.clear()
  }
}

/**
 * Remove any ambient BroadcastChannel (Node 20+ ships one globally) so that the
 * storage-fallback / no-op transports can be exercised. Restores on teardown.
 */
function removeBroadcastChannel() {
  const prev = (globalThis as any).BroadcastChannel
  delete (globalThis as any).BroadcastChannel
  return () => {
    if (prev !== undefined) (globalThis as any).BroadcastChannel = prev
  }
}

/**
 * Fake window + localStorage modelling the cross-tab "storage" event: a write
 * in one logical tab dispatches a StorageEvent-like object to listeners that
 * represent OTHER tabs. We expose a `dispatchStorage` so a test can simulate
 * "another tab wrote this key".
 */
function installFakeStorage() {
  const storageListeners = new Set<Listener>()
  const store = new Map<string, string>()

  const fakeWindow = {
    addEventListener(type: string, cb: Listener) {
      if (type === 'storage') storageListeners.add(cb)
    },
    removeEventListener(type: string, cb: Listener) {
      if (type === 'storage') storageListeners.delete(cb)
    },
    localStorage: {
      setItem(key: string, value: string) {
        store.set(key, value)
        // Simulate the OTHER tab receiving the change.
        for (const cb of Array.from(storageListeners)) {
          cb({ key, newValue: value, oldValue: null })
        }
      },
      removeItem(key: string) {
        store.delete(key)
        for (const cb of Array.from(storageListeners)) {
          cb({ key, newValue: null, oldValue: 'x' })
        }
      },
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null
      },
    },
  }

  ;(globalThis as any).window = fakeWindow
  // Some feature detects read bare localStorage too.
  ;(globalThis as any).localStorage = fakeWindow.localStorage
  return () => {
    delete (globalThis as any).window
    delete (globalThis as any).localStorage
    storageListeners.clear()
    store.clear()
  }
}

// Fresh module instance per test so transport selection re-runs against the
// currently-installed globals (the module caches no env at import time, but a
// fresh copy keeps the internal storage-nonce counter isolated too).
async function loadModule() {
  const url = new URL('../crossTabSync.ts', import.meta.url).href
  return import(`${url}?t=${Date.now()}-${Math.random()}`)
}

let teardown: Array<() => void> = []
beforeEach(() => {
  teardown = []
})
afterEach(() => {
  for (const fn of teardown.reverse()) fn()
  teardown = []
})

// ── BroadcastChannel transport ───────────────────────────────────────────────

test('selects broadcast-channel transport when BroadcastChannel exists', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()
  const ch = createCrossTabChannel('user-state')
  assert.equal(ch.transport, 'broadcast-channel')
  ch.close()
})

test('publish -> subscribe roundtrip across two tabs (broadcast)', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()

  const tabA = createCrossTabChannel<{ type: string; n: number }>('user-state')
  const tabB = createCrossTabChannel<{ type: string; n: number }>('user-state')

  const received: Array<{ type: string; n: number }> = []
  tabB.subscribe((m) => received.push(m))

  tabA.publish({ type: 'user-updated', n: 7 })

  assert.equal(received.length, 1)
  assert.deepEqual(received[0], { type: 'user-updated', n: 7 })
  tabA.close()
  tabB.close()
})

test('sender does NOT receive its own broadcast message', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()

  const tab = createCrossTabChannel<string>('user-state')
  const seen: string[] = []
  tab.subscribe((m) => seen.push(m))
  tab.publish('hello')
  assert.equal(seen.length, 0, 'publisher tab must not hear itself')
  tab.close()
})

test('unsubscribe stops delivery (broadcast)', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()

  const tabA = createCrossTabChannel<number>('c')
  const tabB = createCrossTabChannel<number>('c')
  const seen: number[] = []
  const unsub = tabB.subscribe((m) => seen.push(m))

  tabA.publish(1)
  unsub()
  tabA.publish(2)

  assert.deepEqual(seen, [1])
  tabA.close()
  tabB.close()
})

test('channel isolation: different names do not cross talk (broadcast)', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()

  const userA = createCrossTabChannel<string>('user-state')
  const userB = createCrossTabChannel<string>('user-state')
  const convB = createCrossTabChannel<string>('conversations')

  const userSeen: string[] = []
  const convSeen: string[] = []
  userB.subscribe((m) => userSeen.push(m))
  convB.subscribe((m) => convSeen.push(m))

  userA.publish('only-users')

  assert.deepEqual(userSeen, ['only-users'])
  assert.deepEqual(convSeen, [], 'conversations channel must not see user-state traffic')
  userA.close()
  userB.close()
  convB.close()
})

test('a throwing subscriber does not break sibling subscribers (broadcast)', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()

  const tabA = createCrossTabChannel<string>('c')
  const tabB = createCrossTabChannel<string>('c')
  const good: string[] = []
  tabB.subscribe(() => {
    throw new Error('boom')
  })
  tabB.subscribe((m) => good.push(m))

  assert.doesNotThrow(() => tabA.publish('x'))
  assert.deepEqual(good, ['x'])
  tabA.close()
  tabB.close()
})

test('publish after close is a safe no-op (broadcast)', async () => {
  teardown.push(installFakeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()
  const ch = createCrossTabChannel<string>('c')
  ch.close()
  assert.doesNotThrow(() => ch.publish('after-close'))
})

// ── Storage fallback transport ───────────────────────────────────────────────

test('falls back to storage-event transport when BroadcastChannel is absent', async () => {
  // Only storage available, no BroadcastChannel.
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()
  const ch = createCrossTabChannel('user-state')
  assert.equal(ch.transport, 'storage-event')
  ch.close()
})

test('publish -> subscribe roundtrip via storage fallback', async () => {
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()

  // Two channels share the same fake window/localStorage, modelling two tabs.
  const tabA = createCrossTabChannel<{ type: string }>('user-state')
  const tabB = createCrossTabChannel<{ type: string }>('user-state')

  const received: Array<{ type: string }> = []
  tabB.subscribe((m) => received.push(m))

  tabA.publish({ type: 'user-updated' })

  // Both tabs listen on the same fake bus; with our fake, the sender's own
  // listener would also fire — but tabA has no subscriber, so only tabB counts.
  const forB = received.filter((m) => m.type === 'user-updated')
  assert.ok(forB.length >= 1, `tab B should receive at least one message, got ${received.length}`)
  assert.equal(received[0].type, 'user-updated')
  tabA.close()
  tabB.close()
})

test('storage fallback ignores removeItem (null newValue) events', async () => {
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()

  const ch = createCrossTabChannel<string>('user-state')
  const seen: string[] = []
  ch.subscribe((m) => seen.push(m))

  // publish() does setItem (delivers) then removeItem (null newValue, ignored).
  ch.publish('payload')
  // Exactly one delivery from the setItem; the removeItem must be ignored.
  assert.equal(seen.filter((m) => m === 'payload').length, 1)
  ch.close()
})

test('storage fallback: channel isolation by key', async () => {
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()

  const user = createCrossTabChannel<string>('user-state')
  const conv = createCrossTabChannel<string>('conversations')
  const userSeen: string[] = []
  const convSeen: string[] = []
  user.subscribe((m) => userSeen.push(m))
  conv.subscribe((m) => convSeen.push(m))

  user.publish('u1')

  assert.ok(userSeen.includes('u1'))
  assert.deepEqual(convSeen, [], 'different storage key must not cross talk')
  user.close()
  conv.close()
})

test('storage fallback: repeated identical payloads each fire (unique nonce)', async () => {
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()

  const tabA = createCrossTabChannel<string>('c')
  const tabB = createCrossTabChannel<string>('c')
  const seen: string[] = []
  tabB.subscribe((m) => seen.push(m))

  tabA.publish('same')
  tabA.publish('same')

  assert.equal(seen.filter((m) => m === 'same').length, 2, 'identical payloads must each deliver')
  tabA.close()
  tabB.close()
})

test('storage fallback: unsubscribe + close stop delivery', async () => {
  teardown.push(removeBroadcastChannel())
  teardown.push(installFakeStorage())
  const { createCrossTabChannel } = await loadModule()

  const ch = createCrossTabChannel<string>('c')
  const seen: string[] = []
  const unsub = ch.subscribe((m) => seen.push(m))
  ch.publish('a')
  unsub()
  ch.publish('b')
  assert.deepEqual(seen.filter((m) => m === 'a' || m === 'b'), ['a'])
  ch.close()
})

// ── No-op transport (SSR / no APIs) ──────────────────────────────────────────

test('degrades to noop transport when neither API is present', async () => {
  // Strip the ambient BroadcastChannel and install no window/storage.
  teardown.push(removeBroadcastChannel())
  const { createCrossTabChannel } = await loadModule()
  const ch = createCrossTabChannel<string>('c')
  assert.equal(ch.transport, 'noop')
  const seen: string[] = []
  const unsub = ch.subscribe((m) => seen.push(m))
  assert.doesNotThrow(() => ch.publish('x'))
  assert.deepEqual(seen, [], 'noop transport never delivers')
  unsub()
  ch.close()
})
