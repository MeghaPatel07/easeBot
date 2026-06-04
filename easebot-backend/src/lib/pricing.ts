/**
 * pricing — single source of truth for subscription + top-up prices (USD).
 *
 * Amounts come from env so the catalog can change without a code edit; each
 * one falls back to its current shipped price when the var is unset or invalid,
 * so behaviour is identical until you actually set the env values.
 *
 * These are the *authoritative* amounts the gateways charge. The frontend
 * mirrors them via VITE_* twins in `Wedding-Ease-Viva-Chat/src/config/pricing.ts`
 * — keep the two .env files in sync, or the displayed price won't match the
 * charged price.
 *
 * Prices are gateway-independent, so (unlike paymentConfig) they are NOT
 * suffixed by PAYMENT_FOR (dev/prod) — a flat var name is used.
 *
 * Safe to evaluate at module load: server.ts imports `dotenv/config` on its
 * first line (CommonJS, synchronous), so process.env is populated before any
 * controller — and therefore this module — is required.
 */

/** Parse a non-negative USD amount from env, falling back when unset/invalid. */
function usd(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    console.warn(
      `[pricing] env ${name}="${raw}" is not a valid non-negative number; using fallback ${fallback}`,
    )
    return fallback
  }
  return n
}

export const PRICING = {
  pro: {
    monthly: usd('PRO', 10),
    annual: usd('PRO_ANNUAL', 79),
  },
  promax: {
    monthly: usd('PRO_MAX', 39),
    annual: usd('PRO_MAX_ANNUAL', 299),
  },
  /** One-time 2M-token top-up pack. */
  topup: usd('TOPUP', 10),
} as const
