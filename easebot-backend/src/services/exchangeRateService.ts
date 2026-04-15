/**
 * exchangeRateService — USD → local currency conversion for PayU initiate.
 *
 * Sprint 2 (PAY-011): real exchangerate-api.com v6 fetch with a 60-second
 * in-process cache per target currency. Single consumer: paymentController.
 *
 * Env:
 *   EXCHANGE_RATE_API_KEY (required in prod; absence triggers stub fallback)
 *   EXCHANGE_RATE_API_URL (optional override, defaults to v6.exchangerate-api.com)
 */

export interface LockedRate {
  rate: number
  fetchedAt: string
  source: 'live' | 'cache' | 'stub'
}

const DEFAULT_BASE_URL = 'https://v6.exchangerate-api.com/v6'
const TTL_MS = 60_000

interface CacheEntry {
  rate: number
  fetchedAtMs: number
}
const rateCache: Map<string, CacheEntry> = new Map()

function cacheKey(from: string, to: string): string {
  return `${from}->${to}`
}

function assertSane(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 10_000) {
    throw new Error(`exchange rate out of sane range: ${rate}`)
  }
}

export async function getLockedRate(
  fromCurrency: 'USD',
  toCurrency: string,
): Promise<LockedRate> {
  const to = toCurrency.toUpperCase()
  if (to === fromCurrency) {
    return { rate: 1.0, fetchedAt: new Date().toISOString(), source: 'cache' }
  }
  const key = cacheKey(fromCurrency, to)
  const cached = rateCache.get(key)
  const nowMs = Date.now()
  if (cached && nowMs - cached.fetchedAtMs < TTL_MS) {
    return {
      rate: cached.rate,
      fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
      source: 'cache',
    }
  }
  const fresh = await fetchLiveRate(fromCurrency, to)
  rateCache.set(key, { rate: fresh.rate, fetchedAtMs: nowMs })
  return fresh
}

export async function fetchLiveRate(
  fromCurrency: 'USD',
  toCurrency: string,
): Promise<LockedRate> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  const to = toCurrency.toUpperCase()
  if (!apiKey) {
    console.warn('[exchangeRateService] EXCHANGE_RATE_API_KEY unset, falling back to 1.0 stub')
    return { rate: 1.0, fetchedAt: new Date().toISOString(), source: 'stub' }
  }
  const base = process.env.EXCHANGE_RATE_API_URL || DEFAULT_BASE_URL
  const url = `${base}/${apiKey}/pair/${fromCurrency}/${to}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`exchangerate-api ${res.status}: ${res.statusText}`)
  }
  const data = (await res.json()) as {
    result?: string
    conversion_rate?: number
    'error-type'?: string
  }
  if (data.result !== 'success' || typeof data.conversion_rate !== 'number') {
    throw new Error(`exchangerate-api error: ${data['error-type'] ?? 'unknown'}`)
  }
  assertSane(data.conversion_rate)
  return {
    rate: data.conversion_rate,
    fetchedAt: new Date().toISOString(),
    source: 'live',
  }
}
