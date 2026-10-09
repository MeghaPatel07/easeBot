/**
 * Firestore `Timestamp` look-alike. Components were written against `ts.toDate()` / `ts.toMillis()`; the Mongo-backed API
 * sends ISO strings, which `revive()` turns back into this class for the known date fields, so no component changes.
 */
export class Timestamp {
  constructor(readonly ms: number) {}
  static fromDate(d: Date): Timestamp { return new Timestamp(d.getTime()) }
  static fromMillis(ms: number): Timestamp { return new Timestamp(ms) }
  static now(): Timestamp { return new Timestamp(Date.now()) }
  toDate(): Date { return new Date(this.ms) }
  toMillis(): number { return this.ms }
  get seconds(): number { return Math.floor(this.ms / 1000) }
  get nanoseconds(): number { return (this.ms % 1000) * 1e6 }
  toJSON(): string { return new Date(this.ms).toISOString() }
}

/** Only these keys are dates; other ISO-looking strings (e.g. `weddingDate`, `planRenewsAt`) stay strings, as they were in Firestore. */
const DATE_KEYS = new Set([
  'createdAt', 'updatedAt', 'likedAt', 'timestamp', 'sentAt', 'eventAt', 'notifyAt', 'resolvedAt', 'deletedAt',
  'sharedAt', 'expiresAt', 'setAt', 'lastLoginAt', 'verifiedAt', 'lastErrorAt', 'paidAt', 'creditedAt', 'dailyResetAt',
])
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

export function revive<T>(value: T, key?: string): T {
  if (typeof value === 'string' && key && DATE_KEYS.has(key) && ISO.test(value)) return Timestamp.fromDate(new Date(value)) as unknown as T
  if (Array.isArray(value)) return value.map((v) => revive(v)) as unknown as T
  if (value && typeof value === 'object' && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = revive(v, k)
    return out as T
  }
  return value
}
