import crypto from 'crypto'

/**
 * PayU hash generation and verification utilities.
 *
 * Pure functions — no I/O, no env reads, no logging. Caller supplies all
 * inputs (including the salt) and receives a lowercase hex SHA-512 digest.
 *
 * Canonical forward formula (payu-contract.md §5, EXECUTION_PLAN §8.3):
 *   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *
 * The six empty fields between udf5 and SALT represent udf6–udf10 + the
 * trailing separator before SALT; they MUST appear as literal empty strings
 * between pipes. Missing UDFs become empty strings — never "undefined",
 * never omitted.
 */

export interface PayuHashInput {
  key: string
  txnid: string
  /**
   * ALWAYS a string, ALWAYS 2-decimal (e.g. "1299.00"). PayU is byte-sensitive
   * about the amount representation — the form submission and the hash input
   * must match exactly. Do NOT pass a number; format with `.toFixed(2)` first.
   */
  amount: string
  productinfo: string
  firstname: string
  email: string
  udf1?: string // uid
  udf2?: string // plan
  udf3?: string // billingCycle
  udf4?: string // upgradeFromPlan
  udf5?: string // reserved
  salt: string
}

/** Build the canonical pre-hash string. Exported for test visibility. */
export function buildPayuHashString(input: PayuHashInput): string {
  const {
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = '',
    salt,
  } = input
  // udf1..udf5 then six literal empty pipe-separated fields (udf6..udf10 + salt separator)
  return `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`
}

/**
 * Returns lowercase hex SHA-512 of the canonical PayU pre-hash string.
 * Pure — no side effects.
 */
export function generatePayuHash(input: PayuHashInput): string {
  const preHash = buildPayuHashString(input)
  return crypto.createHash('sha512').update(preHash, 'utf8').digest('hex')
}

/**
 * Reverse-hash formula used on return / webhook callbacks (payu-contract.md §5.1):
 *   sha512(SALT|status|||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 *
 * Note the FIVE empty fields between `status` and `udf5` (udf10..udf6 padding
 * in reverse) — not six. This matches PayU's published formula exactly.
 *
 * IMPORTANT: if the response payload includes a non-empty `additionalCharges`
 * field, PayU prepends it to the pre-hash string:
 *   sha512(additionalCharges|SALT|status|...|key)
 * This is a well-known PayU quirk and the #1 cause of hash_mismatch on test
 * transactions. We handle it automatically.
 */
export function buildPayuResponseHashString(
  payload: Record<string, string>,
  salt: string,
): string {
  const {
    status = '',
    key = '',
    txnid = '',
    amount = '',
    productinfo = '',
    firstname = '',
    email = '',
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = '',
    additionalCharges = '',
  } = payload
  // Six pipes between `status` and `udf5` = five empty fields (udf10..udf6
  // reversed). PayU's canonical reverse formula, not a typo.
  const base = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`
  return additionalCharges ? `${additionalCharges}|${base}` : base
}

/**
 * Verifies a PayU return/webhook response hash. Timing-safe comparison.
 * Returns true iff `expectedHash` (the `hash` field from PayU) matches the
 * reverse-hash formula computed from `payload` + `salt`.
 */
export function verifyPayuResponseHash(
  payload: Record<string, string>,
  expectedHash: string,
  salt: string,
): boolean {
  const preHash = buildPayuResponseHashString(payload, salt)
  const computed = crypto.createHash('sha512').update(preHash, 'utf8').digest('hex')
  if (computed.length !== expectedHash.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(expectedHash.toLowerCase(), 'utf8'),
    )
  } catch {
    return false
  }
}
