// geolocationService — Sprint 2 (FE-012).
//
// Real implementation. Detects the user's country + currency via
// the backend (ipgeolocation.io), caches the result in localStorage for 24h, and
// supports a manual override (LH-35) that always beats auto-detection.
//
// The hook `usePricingCurrency` wraps this service; components should
// consume the hook, not this class directly.

import { api } from './apiClient'

export interface GeolocationResult {
  countryCode: string
  currencyCode: string
}

interface CachedGeolocation extends GeolocationResult {
  fetchedAt: number
}

const STORAGE_KEY = 'eb_user_currency'
const OVERRIDE_KEY = 'eb_currency_override'
const TTL_MS = 24 * 60 * 60 * 1000 // 24h
const FALLBACK: GeolocationResult = { countryCode: 'US', currencyCode: 'USD' }

export class GeolocationService {
  /**
   * Returns the user's display currency. Resolution order:
   *   1. Explicit user override in localStorage (`eb_currency_override`)
   *   2. Cached auto-detected value in localStorage (`eb_user_currency`, 24h TTL)
   *   3. Fresh server-side lookup (/api/easebot/geolocation)
   *   4. Fallback `{ US, USD }`
   */
  public static async getUserCurrency(): Promise<GeolocationResult> {
    // 1. Manual override always wins (LH-35).
    const override = this.readOverride()
    if (override) return override

    // 2. Cache (24h).
    const cached = this.readCache()
    if (cached) return cached

    // 3. Fresh fetch.
    try {
      const data = await api<Partial<GeolocationResult>>('/geolocation')
      const result: GeolocationResult = {
        countryCode: data.countryCode || FALLBACK.countryCode,
        currencyCode: data.currencyCode || FALLBACK.currencyCode,
      }
      this.writeCache(result)
      return result
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[geolocationService] detect failed, using fallback', err)
      return FALLBACK
    }
  }

  /**
   * Manual override — e.g. user-driven currency dropdown (LH-35).
   * Writes to localStorage under `eb_currency_override`, which beats the
   * auto-detected cache. Pass `null` to clear.
   */
  public static setCurrencyOverride(currencyCode: string | null): void {
    if (typeof localStorage === 'undefined') return
    if (!currencyCode) {
      localStorage.removeItem(OVERRIDE_KEY)
      return
    }
    localStorage.setItem(OVERRIDE_KEY, currencyCode.toUpperCase())
  }

  public static readOverride(): GeolocationResult | null {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(OVERRIDE_KEY)
    if (!raw) return null
    // Country unknown on override; use currency for both.
    return { countryCode: raw, currencyCode: raw }
  }

  private static readCache(): GeolocationResult | null {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as CachedGeolocation
      if (!parsed || typeof parsed.fetchedAt !== 'number') return null
      if (Date.now() - parsed.fetchedAt > TTL_MS) return null
      return {
        countryCode: parsed.countryCode,
        currencyCode: parsed.currencyCode,
      }
    } catch {
      return null
    }
  }

  private static writeCache(result: GeolocationResult): void {
    if (typeof localStorage === 'undefined') return
    const payload: CachedGeolocation = { ...result, fetchedAt: Date.now() }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // quota / private mode — silently ignore, next call refetches.
    }
  }
}

export default GeolocationService
