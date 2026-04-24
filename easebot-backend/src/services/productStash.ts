import type { ProductResult } from './products'

interface StashEntry {
  remaining: ProductResult[]
  expiresAt: number
}

const TTL_MS = 15 * 60 * 1000
const stash = new Map<string, StashEntry>()

function now(): number {
  return Date.now()
}

export function stashRemaining(threadId: string, remaining: ProductResult[]): void {
  if (!threadId || remaining.length === 0) return
  stash.set(threadId, { remaining, expiresAt: now() + TTL_MS })
}

export function popNextBatch(threadId: string, batchSize: number): ProductResult[] {
  if (!threadId) return []
  const entry = stash.get(threadId)
  if (!entry) return []
  if (entry.expiresAt < now()) {
    stash.delete(threadId)
    return []
  }
  const batch = entry.remaining.slice(0, batchSize)
  const left = entry.remaining.slice(batchSize)
  if (left.length === 0) {
    stash.delete(threadId)
  } else {
    stash.set(threadId, { remaining: left, expiresAt: now() + TTL_MS })
  }
  return batch
}

export function hasStash(threadId: string): boolean {
  if (!threadId) return false
  const entry = stash.get(threadId)
  if (!entry) return false
  if (entry.expiresAt < now()) {
    stash.delete(threadId)
    return false
  }
  return entry.remaining.length > 0
}

export function clearStash(threadId: string): void {
  if (!threadId) return
  stash.delete(threadId)
}
