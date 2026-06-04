/**
 * paymentConfig — single switch (`PAYMENT_FOR`) that selects which credential
 * SET both payment gateways use. One change flips sandbox ↔ live for PayU AND
 * Razorpay at once, with no per-deploy .env surgery.
 *
 *   PAYMENT_FOR=dev   → use *_DEV creds  (sandbox / test gateways)   [default]
 *   PAYMENT_FOR=prod  → use *_PROD creds (live gateways)
 *
 * Resolution for every credential: try the env-suffixed name first
 * (e.g. PAYU_MERCHANT_KEY_DEV / _PROD), then fall back to the legacy flat name
 * (e.g. PAYU_MERCHANT_KEY). The flat fallback keeps the existing PayU-only
 * setup working untouched — no .env changes are required until the _DEV/_PROD
 * pairs (and the Razorpay keys) are added.
 *
 * Pure config resolution: no Firestore, no network, no SDK construction.
 */

export type PaymentEnv = 'dev' | 'prod'

/** Active credential set. Anything other than the literal "prod" is treated as dev. */
export function getPaymentEnv(): PaymentEnv {
  return (process.env.PAYMENT_FOR || '').trim().toLowerCase() === 'prod' ? 'prod' : 'dev'
}

/** Suffixed (..._DEV / ..._PROD) lookup, falling back to the flat var name. */
function resolve(base: string, env: PaymentEnv): string | undefined {
  const suffixed = process.env[`${base}_${env.toUpperCase()}`]
  if (suffixed && suffixed.trim() !== '') return suffixed.trim()
  const flat = process.env[base]
  return flat && flat.trim() !== '' ? flat.trim() : undefined
}

function required(base: string, env: PaymentEnv): string {
  const v = resolve(base, env)
  if (!v) {
    throw new Error(
      `missing payment config: ${base} (PAYMENT_FOR=${env}; set ${base}_${env.toUpperCase()} or ${base})`,
    )
  }
  return v
}

// --- PayU ------------------------------------------------------------------

export interface PayuConfig {
  merchantKey: string
  salt: string
  baseUrl: string
  returnUrl: string
  failureUrl: string
}

export function getPayuConfig(): PayuConfig {
  const env = getPaymentEnv()
  // baseUrl has a sensible env-aware default so it need not be set explicitly.
  const baseUrl =
    resolve('PAYU_BASE_URL', env) ??
    (env === 'prod' ? 'https://secure.payu.in' : 'https://test.payu.in')
  return {
    merchantKey: required('PAYU_MERCHANT_KEY', env),
    salt: required('PAYU_MERCHANT_SALT', env),
    baseUrl,
    returnUrl: required('PAYU_RETURN_URL', env),
    failureUrl: required('PAYU_FAILURE_URL', env),
  }
}

// --- Razorpay --------------------------------------------------------------

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  /** Optional in dev (Razorpay can't reach localhost); REQUIRED for prod webhooks. */
  webhookSecret: string | null
}

export function getRazorpayConfig(): RazorpayConfig {
  const env = getPaymentEnv()
  return {
    keyId: required('RAZORPAY_KEY_ID', env),
    keySecret: required('RAZORPAY_KEY_SECRET', env),
    webhookSecret: resolve('RAZORPAY_WEBHOOK_SECRET', env) ?? null,
  }
}

// --- Boot validation -------------------------------------------------------

/**
 * Names that must resolve for the active PAYMENT_FOR env. Returned with both
 * the flat and suffixed spellings so the boot error message is actionable.
 * Used by validatePaymentConfig() in paymentController.
 */
export function missingPaymentConfig(): string[] {
  const env = getPaymentEnv()
  const requiredBases = [
    'PAYU_MERCHANT_KEY',
    'PAYU_MERCHANT_SALT',
    'PAYU_RETURN_URL',
    'PAYU_FAILURE_URL',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ]
  return requiredBases
    .filter((b) => !resolve(b, env))
    .map((b) => `${b} (or ${b}_${env.toUpperCase()})`)
}
