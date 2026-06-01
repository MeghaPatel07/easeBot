import crypto from 'crypto'
import type { Request, Response } from 'express'
import { adminAuth, adminDb } from '../lib/firebaseAdmin'
import { sendOtpEmail } from '../services/emailService'
import { capture as phCapture } from '../lib/posthog'

const OTP_COLLECTION = 'passwordResetOtps'
const OTP_TTL_MS = 10 * 60 * 1000           // 10 minutes
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000    // 5 minutes
const MAX_ATTEMPTS = 5

const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 128
const SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/

function validatePasswordStrength(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (pw.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter'
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter'
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number'
  if (!SYMBOL_RE.test(pw)) return 'Password must contain at least one special character'
  return null
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString()
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

// POST /api/auth/forgot-password/send-otp  { email }
export async function handleSendOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: string }
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' })
    return
  }
  const normalized = email.trim().toLowerCase()

  // WE-20260527-1002: keep this response opaque. We must NOT let a caller
  // distinguish "no such account" from "account exists but uses Google" from
  // "code sent" — all three return the same 200 + generic body. Anything else
  // is an account-enumeration / provider-disclosure oracle.
  const OPAQUE_OK = { message: 'If an account exists, a code has been sent.' }

  try {
    let userRecord
    try {
      userRecord = await adminAuth.getUserByEmail(normalized)
    } catch {
      // Don't reveal whether the email exists.
      res.status(200).json(OPAQUE_OK)
      return
    }

    const hasPassword = userRecord.providerData.some(p => p.providerId === 'password')
    if (!hasPassword) {
      // Google-only account: silently skip sending an OTP but return the SAME
      // opaque 200 so the response is indistinguishable from the success path.
      res.status(200).json(OPAQUE_OK)
      return
    }

    const otp = generateOtp()
    await adminDb.collection(OTP_COLLECTION).doc(normalized).set({
      otpHash: sha256(otp),
      attempts: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      uid: userRecord.uid,
      verified: false,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    })

    await sendOtpEmail(normalized, otp)
    res.status(200).json(OPAQUE_OK)
  } catch (err) {
    console.error('[authController] handleSendOtp error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to process request. Please try again.' })
  }
}

// POST /api/auth/forgot-password/verify-otp  { email, otp }
export async function handleVerifyOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as { email?: string; otp?: string }
  if (!email || !otp) {
    res.status(400).json({ error: 'Email and OTP are required' })
    return
  }
  const normalized = email.trim().toLowerCase()

  try {
    const docRef = adminDb.collection(OTP_COLLECTION).doc(normalized)
    const doc = await docRef.get()
    if (!doc.exists) {
      res.status(400).json({ error: 'No reset request found. Please request a new code.' })
      return
    }
    const data = doc.data() as {
      otpHash: string
      attempts: number
      expiresAt: FirebaseFirestore.Timestamp | Date
    }

    const expiresAt = (data.expiresAt as FirebaseFirestore.Timestamp).toDate
      ? (data.expiresAt as FirebaseFirestore.Timestamp).toDate()
      : (data.expiresAt as Date)

    if (new Date() > expiresAt) {
      await docRef.delete()
      res.status(400).json({ error: 'Code has expired. Please request a new one.' })
      return
    }

    if (data.attempts >= MAX_ATTEMPTS) {
      await docRef.delete()
      res.status(400).json({ error: 'Too many attempts. Please request a new code.' })
      return
    }

    await docRef.update({ attempts: data.attempts + 1 })

    if (!timingSafeHexEqual(sha256(otp.trim()), data.otpHash)) {
      const remaining = MAX_ATTEMPTS - (data.attempts + 1)
      res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` })
      return
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    await docRef.update({
      resetTokenHash: sha256(resetToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      verified: true,
    })

    const phDistinctId = req.phDistinctId ?? (doc.data() as { uid?: string } | undefined)?.uid
    if (phDistinctId) {
      phCapture(phDistinctId, 'otp_verified', { purpose: 'password_reset', channel: 'email' })
    }

    res.status(200).json({ resetToken })
  } catch (err) {
    console.error('[authController] handleVerifyOtp error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
}

// POST /api/auth/forgot-password/reset-password  { email, resetToken, newPassword }
export async function handleResetPassword(req: Request, res: Response): Promise<void> {
  const { email, resetToken, newPassword } = req.body as {
    email?: string
    resetToken?: string
    newPassword?: string
  }
  if (!email || !resetToken || !newPassword) {
    res.status(400).json({ error: 'Email, reset token, and new password are required' })
    return
  }
  const pwError = validatePasswordStrength(newPassword)
  if (pwError) {
    res.status(400).json({ error: pwError })
    return
  }
  const normalized = email.trim().toLowerCase()

  try {
    const docRef = adminDb.collection(OTP_COLLECTION).doc(normalized)
    const doc = await docRef.get()
    if (!doc.exists) {
      res.status(400).json({ error: 'Invalid or expired reset session.' })
      return
    }
    const data = doc.data() as {
      verified?: boolean
      resetTokenHash?: string
      resetTokenExpiresAt?: FirebaseFirestore.Timestamp | Date
      uid: string
    }

    if (!data.verified || !data.resetTokenHash || !data.resetTokenExpiresAt) {
      res.status(400).json({ error: 'OTP not verified.' })
      return
    }

    const tokenExpiry = (data.resetTokenExpiresAt as FirebaseFirestore.Timestamp).toDate
      ? (data.resetTokenExpiresAt as FirebaseFirestore.Timestamp).toDate()
      : (data.resetTokenExpiresAt as Date)

    if (new Date() > tokenExpiry) {
      await docRef.delete()
      res.status(400).json({ error: 'Reset session expired. Please start over.' })
      return
    }

    if (!timingSafeHexEqual(sha256(resetToken), data.resetTokenHash)) {
      res.status(400).json({ error: 'Invalid reset token.' })
      return
    }

    await adminAuth.updateUser(data.uid, { password: newPassword })
    await docRef.delete()

    res.status(200).json({ message: 'Password updated successfully.' })
  } catch (err) {
    console.error('[authController] handleResetPassword error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to reset password. Please try again.' })
  }
}
