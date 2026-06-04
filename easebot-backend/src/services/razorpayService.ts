/**
 * razorpayService — Razorpay Standard Checkout: order creation + signature
 * verification + webhook signature verification.
 *
 * This is the second production payment gateway alongside PayU. Credentials are
 * resolved through `lib/paymentConfig` (PAYMENT_FOR=dev|prod), so the same code
 * runs against test or live keys with a single env switch. The Firestore /
 * subscription / invoice side effects live in paymentController's shared
 * finalizer — this module stays a thin, side-effect-free SDK + crypto wrapper.
 *
 * Credentials (via paymentConfig, _DEV/_PROD with flat fallback):
 *   RAZORPAY_KEY_ID      (public key id — also returned to the client modal)
 *   RAZORPAY_KEY_SECRET  (SECRET — stays server-side, signs/verifies)
 *   RAZORPAY_WEBHOOK_SECRET (SECRET — verifies inbound webhook HMAC)
 * Missing key id/secret throws `razorpay_not_configured` → HTTP 500.
 */

import crypto from 'crypto'
import Razorpay from 'razorpay'
import { getRazorpayConfig, type RazorpayConfig } from '../lib/paymentConfig'

export interface CreateOrderInput {
  amount: number // integer, in the currency's smallest subunit (>= 100)
  currency?: string // ISO 4217, default 'INR'
  receipt?: string // caller reference id (we pass the txnid)
  notes?: Record<string, string> // echoed back on the order + webhook events
}

export interface CreatedOrder {
  orderId: string
  amount: number
  currency: string
  keyId: string // public key id for the checkout modal
}

export interface VerifyInput {
  orderId: string
  paymentId: string
  signature: string
}

/**
 * ISO 4217 zero-decimal currencies — charged in whole units, NOT ×100.
 * Of WeddingEase's supported set only JPY qualifies; the rest are included so
 * the helper is correct if the catalogue ever widens.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'XPF',
  'BIF', 'DJF', 'GNF', 'KMF', 'PYG', 'RWF', 'UGX', 'VUV',
])

/**
 * Convert a major-unit amount (e.g. "830.00" or 14.99) to the Razorpay subunit
 * integer (paise/cents). Zero-decimal currencies are passed through ×1.
 */
export function toSubunit(amountMajor: string | number, currency: string): number {
  const major = typeof amountMajor === 'number' ? amountMajor : Number(amountMajor)
  if (!Number.isFinite(major)) {
    const err = new Error(`invalid amount: ${String(amountMajor)}`) as Error & { code?: string }
    err.code = 'invalid_amount'
    throw err
  }
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100
  return Math.round(major * factor)
}

function getConfig(): RazorpayConfig {
  try {
    return getRazorpayConfig()
  } catch {
    const err = new Error('razorpay_not_configured') as Error & { code?: string }
    err.code = 'razorpay_not_configured'
    throw err
  }
}

// One SDK client per process, rebuilt only if the resolved key id changes.
let client: Razorpay | null = null
let clientKeyId: string | null = null
function getClient(cfg: RazorpayConfig): Razorpay {
  if (!client || clientKeyId !== cfg.keyId) {
    client = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret })
    clientKeyId = cfg.keyId
  }
  return client
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const cfg = getConfig()

  const amount = Math.trunc(input.amount)
  if (!Number.isFinite(amount) || amount < 100) {
    const err = new Error('amount must be an integer >= 100 (subunit)') as Error & { code?: string }
    err.code = 'invalid_amount'
    throw err
  }
  const currency = (input.currency ?? 'INR').toUpperCase()
  const receipt = input.receipt ?? `rcpt_${Date.now()}`

  try {
    const order = await getClient(cfg).orders.create({
      amount,
      currency,
      receipt,
      ...(input.notes ? { notes: input.notes } : {}),
    })
    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      keyId: cfg.keyId,
    }
  } catch (e) {
    // The SDK surfaces API failures with a numeric statusCode (e.g. 401 for bad
    // credentials). Tag auth failures distinctly so the controller can react.
    const status = (e as { statusCode?: number })?.statusCode
    const err = new Error('razorpay_order_failed') as Error & {
      code?: string
      statusCode?: number
      cause?: unknown
    }
    err.code = status === 401 ? 'razorpay_auth_failed' : 'razorpay_order_failed'
    err.statusCode = status
    err.cause = e
    throw err
  }
}

/**
 * Verifies the checkout signature returned to the browser: the client posts
 * razorpay_order_id / razorpay_payment_id / razorpay_signature, and we recompute
 * HMAC-SHA256(order_id + "|" + payment_id) keyed by the SECRET, comparing in
 * constant time. This cryptographically binds the payment to OUR order.
 */
export function verifyPaymentSignature(input: VerifyInput): boolean {
  const { keySecret } = getConfig()
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(input.signature ?? '', 'utf8')
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Verifies an inbound Razorpay webhook: HMAC-SHA256 of the RAW request body
 * keyed by RAZORPAY_WEBHOOK_SECRET, compared in constant time against the
 * `x-razorpay-signature` header. Returns false (never throws) when the secret
 * is unset or the signature is malformed, so the controller can answer 400.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  let webhookSecret: string | null
  try {
    webhookSecret = getRazorpayConfig().webhookSecret
  } catch {
    return false
  }
  if (!webhookSecret) return false

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature ?? '', 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
