/**
 * exchangeRateService — USD → local currency conversion for PayU initiate.
 *
 * Sprint 1 SKELETON: public surface + empty per-minute cache Map. Sprint 3
 * (PAY-011) wires the real exchangerate-api fetch, sanity checks, and the
 * 60-second in-memory cache per currency (LH-34).
 *
 * Grounded in: .orchestrator/specs/payu-contract.md §4 & §4.1.
 *
 * Only caller: paymentController.initiate. No other module reads rates
 * from here — display-side conversion is a frontend concern.
 */

export interface LockedRate {
  rate: number
  fetchedAt: string
  source: 'live' | 'cache'
}

/**
 * Process-local 60-second cache. Keyed by `${from}->${to}` (e.g.
 * "USD->INR"). Empty in Sprint 1; the real implementation in Sprint 3
 * prunes entries older than 60s on each access.
 */
const rateCache: Map<string, { rate: number; fetchedAt: number }> = new Map()
// Keep the reference alive so tsc doesn't flag it as unused once we start
// implementing. Sprint 3 will actually read/write through this Map.
void rateCache

/**
 * Lock an exchange rate for a single `/payment/initiate` call. The returned
 * rate is stamped onto `payments/{txnid}` and used for the entire lifecycle
 * of that transaction (no re-fetching on webhook / return).
 *
 * Sanity rules (spec §4 step 3):
 *   - rate must be > 0 and < 10000 — reject otherwise
 *   - API response must be fresher than 24h
 *   - process-local 60s cache; multiple requests in the same minute reuse
 *
 * Sprint 1: stub.
 */
export async function getLockedRate(
  _fromCurrency: 'USD',
  _toCurrency: string,
): Promise<LockedRate> {
  throw new Error('not_implemented_sprint_3')
}

/**
 * Direct live fetch, bypassing the cache. Exposed for a future admin
 * reconciliation script and for tests; NOT called from the initiate path
 * (use `getLockedRate` — it respects the cache).
 *
 * Sprint 1: stub.
 */
export async function fetchLiveRate(
  _fromCurrency: 'USD',
  _toCurrency: string,
): Promise<LockedRate> {
  throw new Error('not_implemented_sprint_3')
}
