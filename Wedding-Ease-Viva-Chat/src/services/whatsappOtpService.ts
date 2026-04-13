import { WhatsAppService } from './whatsappService'

export type OtpPurpose = 'signup' | 'login' | 'reset'

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 3

interface StoredOtp {
  hash: string
  expiresAt: number
  attempts: number
}

// ── Web Crypto helpers ────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function generateOtpCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  const n = arr[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

async function storageKey(e164: string, purpose: OtpPurpose): Promise<string> {
  const h = await sha256Hex(e164)
  return `wa_otp_${purpose}_${h}`
}

function readRecord(key: string): StoredOtp | null {
  const raw = sessionStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredOtp
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

function writeRecord(key: string, rec: StoredOtp): void {
  sessionStorage.setItem(key, JSON.stringify(rec))
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendWhatsAppOtp(e164: string, purpose: OtpPurpose): Promise<void> {
  const code = generateOtpCode()
  const hash = await sha256Hex(code)
  const key = await storageKey(e164, purpose)
  const record: StoredOtp = {
    hash,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  }
  writeRecord(key, record)

  const formatted = WhatsAppService.formatPhoneNumber(e164)
  const message = `Your The Wedding Bot verification code is: ${code}\n\n. Do not share it with anyone.`
  await WhatsAppService.sendWhatsAppMessage(formatted, message)
}

export async function verifyWhatsAppOtp(
  e164: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const key = await storageKey(e164, purpose)
  const record = readRecord(key)
  if (!record) return false

  if (Date.now() > record.expiresAt) {
    sessionStorage.removeItem(key)
    return false
  }

  const candidateHash = await sha256Hex(code)
  const ok = constantTimeEqual(candidateHash, record.hash)
  if (ok) {
    sessionStorage.removeItem(key)
    return true
  }

  record.attempts += 1
  if (record.attempts >= MAX_ATTEMPTS) {
    sessionStorage.removeItem(key)
  } else {
    writeRecord(key, record)
  }
  return false
}

/** Seconds remaining before OTP expiry, or 0 if no record / expired. */
export async function getOtpExpiry(e164: string, purpose: OtpPurpose): Promise<number> {
  const key = await storageKey(e164, purpose)
  const record = readRecord(key)
  if (!record) return 0
  const remaining = Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
  return remaining
}
