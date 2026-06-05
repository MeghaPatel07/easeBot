/**
 * pricing — single source of truth for subscription + top-up prices (USD) on
 * the client.
 *
 * Values come from Vite env (VITE_PRO / VITE_PRO_ANNUAL / VITE_PRO_MAX /
 * VITE_PRO_MAX_ANNUAL / VITE_TOPUP), each falling back to the current shipped
 * price when its var is unset or invalid.
 *
 * These are the *display* prices. The backend recomputes the authoritative
 * charged amount from its own env twins (PRO / PRO_ANNUAL / … in
 * easebot-backend/src/lib/pricing.ts). Keep the two .env files in sync, or the
 * price the user sees won't match the price they're charged.
 *
 * NOTE: Vite statically replaces `import.meta.env.VITE_*` at build time, so
 * each var MUST be referenced by its literal name below (no dynamic indexing),
 * and the value is baked in at build — changing a price requires a rebuild.
 */

/** Parse a non-negative USD amount from an env value, falling back when unset/invalid. */
function usd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[pricing] env value "${raw}" is not a valid non-negative number; using fallback ${fallback}`)
    return fallback
  }
  return n
}

export const PRICING = {
  pro: {
    monthly: usd(import.meta.env.VITE_PRO, 10),
    annual: usd(import.meta.env.VITE_PRO_ANNUAL, 79),
  },
  promax: {
    monthly: usd(import.meta.env.VITE_PRO_MAX, 39),
    annual: usd(import.meta.env.VITE_PRO_MAX_ANNUAL, 299),
  },
  /** One-time 2M-token top-up pack. */
  topup: usd(import.meta.env.VITE_TOPUP, 10),
} as const
