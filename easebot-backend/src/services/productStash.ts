import type { ProductResult } from './products'

interface StashEntry {
  remaining: ProductResult[]
  expiresAt: number
  query: string
}

const TTL_MS = 15 * 60 * 1000
const stash = new Map<string, StashEntry>()

function now(): number {
  return Date.now()
}

export function stashRemaining(threadId: string, remaining: ProductResult[], query: string): void {
  if (!threadId || remaining.length === 0) return
  stash.set(threadId, { remaining, expiresAt: now() + TTL_MS, query })
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
    stash.set(threadId, { remaining: left, expiresAt: now() + TTL_MS, query: entry.query })
  }
  return batch
}

// The original resolved search query behind the stashed batch — used so a
// "show more" follow-up (and the frontend's "See more options" outbound
// link) can still report which query produced these results.
export function getStashQuery(threadId: string): string | undefined {
  if (!threadId) return undefined
  const entry = stash.get(threadId)
  if (!entry) return undefined
  if (entry.expiresAt < now()) {
    stash.delete(threadId)
    return undefined
  }
  return entry.query
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
