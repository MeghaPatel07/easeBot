/**
 * phoneCredentialStore
 * --------------------
 * Stores the machine-generated Firebase Auth credential for phone sign-up users
 * in localStorage, keyed by a SHA-256 hash of the E.164 phone number.
 *
 * This is NOT a secret store — it holds random passwords generated on the client
 * for derived `phone_*@phone.weddingease.local` accounts. localStorage is
 * same-origin sandboxed, which is acceptable for a device-local "remember me"
 * pattern. Cross-device phone login is intentionally unsupported — users must
 * fall back to email sign-in on new devices.
 */

export interface PhoneCredential {
  derivedEmail: string
  password: string
  realEmail: string
  uid: string
  name: string
}

const KEY_PREFIX = 'wedding_ease_phone_cred_'

export async function hashE164(e164: string): Promise<string> {
  const buf = new TextEncoder().encode(e164)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function keyFor(e164: string): Promise<string> {
  return KEY_PREFIX + (await hashE164(e164))
}

export async function storePhoneCredential(e164: string, cred: PhoneCredential): Promise<void> {
  const key = await keyFor(e164)
  localStorage.setItem(key, JSON.stringify(cred))
}

export async function getPhoneCredential(e164: string): Promise<PhoneCredential | null> {
  const key = await keyFor(e164)
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PhoneCredential
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export async function removePhoneCredential(e164: string): Promise<void> {
  const key = await keyFor(e164)
  localStorage.removeItem(key)
}
