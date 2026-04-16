/**
 * Server-side exchange rate lock utility (payu-contract.md §4, §4.1, §8.4).
 *
 * Wraps exchange rate lookup with a per-currency 60-second in-process cache
 * so two users in the same minute get an identical rate and we don't burst
 * the upstream API under load (LH-34).
 *
 * Sprint 1 (PAY-002): `exchangeRateService.ts` does not exist yet — BE-003
 * will scaffold it as a stub later. Until PAY-011 wires real fetching, this
 * utility logs a warning and returns 1.0 for any non-USD request. Calls
 * still pass through the cache so the cache semantics can be tested today.
 *
 * Sanity guards (LH-33): any rate outside (0, 10_000] is rejected with
 * `ExchangeRateOutOfRangeError`, regardless of source.
 */

export interface LockedRate {
  rate: number
  fetchedAt: number // ms since epoch
  currency: string
  source: 'live' | 'cache' | 'stub'
}

export class ExchangeRateOutOfRangeError extends Error {
  constructor(currency: string, rate: number) {
    super(`Exchange rate for ${currency} out of sane range (got ${rate})`)
    this.name = 'ExchangeRateOutOfRangeError'
  }
}

const TTL_MS = 60_000
const cache = new Map<string, LockedRate>()

/**
 * Time source is injected so tests can control expiry without real sleeps.
 * Production callers use the default (Date.now).
 */
let now: () => number = () => Date.now()

/** @internal Test-only hook. */
export function __setNowForTesting(fn: () => number): void {
  now = fn
}

/** @internal Test-only hook. */
export function __clearCacheForTesting(): void {
  cache.clear()
}

function assertSaneRate(currency: string, rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000) {
    throw new ExchangeRateOutOfRangeError(currency, rate)
  }
}

/**
 * Sprint 1 stub fetcher. Returns 1.0 and logs a one-line warning. Sprint 2
 * (PAY-011) will replace this body with a call to
 * `exchangeRateService.fetchLiveRate('USD', target)`.
 */
async function fetchRateStub(target: string): Promise<number> {
  // eslint-disable-next-line no-console
  console.warn(
    `[rateLock] exchangeRateService not wired yet (PAY-011); returning stub rate 1.0 for USD→${target}`,
  )
  return 1.0
}

/**
 * Returns a USD→targetCurrency rate, locked for 60 seconds per currency.
 *
 * - `USD` short-circuits to a literal 1.0 with source='cache'-equivalent.
 * - Cache hits return the stored LockedRate with `source: 'cache'`.
 * - Cache misses call the stub (Sprint 1) or live fetch (Sprint 2+),
 *   validate the rate, cache it, and return it with `source: 'stub'`
 *   (Sprint 1) or `'live'` (Sprint 2+).
 */
export async function getLockedRate(targetCurrency: string): Promise<LockedRate> {
  const currency = targetCurrency.toUpperCase()

  if (currency === 'USD') {
    return { rate: 1.0, fetchedAt: now(), currency, source: 'cache' }
  }

  const cached = cache.get(currency)
  if (cached && now() - cached.fetchedAt < TTL_MS) {
    return { ...cached, source: 'cache' }
  }

  const rate = await fetchRateStub(currency)
  assertSaneRate(currency, rate)

  const entry: LockedRate = {
    rate,
    fetchedAt: now(),
    currency,
    source: 'stub',
  }
  cache.set(currency, entry)
  return entry
}
