// exchangeRateService — Sprint 2 (FE-012).
//
// Real implementation. Fetches a per-pair USD→target conversion rate from
// exchangerate-api.com v6 and caches it for 5 minutes in memory. On any
// network/parse/sanity failure, returns 1.0 so checkout UI can still show
// a price (checkout itself is authoritative and re-fetches server-side).

interface CachedRate {
  rate: number
  fetchedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min per pair
const MIN_RATE = 0
const MAX_RATE = 10_000 // LH-33 sanity — anything outside this is garbage

export class ExchangeRateService {
  private static readonly API_BASE_URL = 'https://v6.exchangerate-api.com/v6'
  private static readonly API_KEY =
    import.meta.env.VITE_EXCHANGE_RATE_API_KEY || ''

  private static cache = new Map<string, CachedRate>()

  /**
   * Returns the conversion rate from `from` → `to`.
   * Same-currency pairs return 1.0 instantly.
   * Malformed / out-of-band rates (LH-33) are rejected and return 1.0.
   * Network errors return 1.0 (graceful fallback).
   */
  public static async getRate(from: string, to: string): Promise<number> {
    const f = from.toUpperCase()
    const t = to.toUpperCase()
    if (f === t) return 1.0

    const key = `${f}->${t}`
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.rate
    }

    if (!this.API_KEY) {
      // No key configured — behave as if the service is down.
      return 1.0
    }

    try {
      const url = `${this.API_BASE_URL}/${this.API_KEY}/pair/${f}/${t}`
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) throw new Error(`exchangerate-api http ${res.status}`)
      const data = (await res.json()) as {
        result?: string
        conversion_rate?: number
      }
      const raw = data.conversion_rate
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new Error('conversion_rate missing or not a number')
      }
      if (raw <= MIN_RATE || raw >= MAX_RATE) {
         
        console.warn(
          `[exchangeRateService] rejecting sanity-failing rate ${key}=${raw} (LH-33)`,
        )
        return 1.0
      }
      this.cache.set(key, { rate: raw, fetchedAt: Date.now() })
      return raw
    } catch (err) {
       
      console.warn(`[exchangeRateService] getRate(${key}) failed`, err)
      return 1.0
    }
  }

  /** Test hook — clears in-memory cache. */
  public static _clearCache(): void {
    this.cache.clear()
  }
}

export default ExchangeRateService
