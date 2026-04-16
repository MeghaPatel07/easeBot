import * as admin from 'firebase-admin'
import crypto from 'crypto'
import { Request, Response } from 'express'
import { sendOtpEmail } from '../services/emailService'

const db = admin.firestore()

const OTP_COLLECTION = 'passwordResetOtps'
const OTP_TTL_MS = 10 * 60 * 1000  // 10 minutes
const MAX_ATTEMPTS = 5

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString()
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex')
}

/**
 * POST /api/auth/forgot-password/send-otp
 * Body: { email: string }
 *
 * Generates a 6-digit OTP, stores hashed in Firestore, and emails it.
 */
export async function sendOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: string }

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()

  try {
    // Check user exists in Firebase Auth
    let userRecord: admin.auth.UserRecord
    try {
      userRecord = await admin.auth().getUserByEmail(normalizedEmail)
    } catch {
      // Don't reveal whether the email exists — still return success
      res.status(200).json({ message: 'If an account exists, a code has been sent.' })
      return
    }

    // Check this is an email/password account (not Google-only)
    const hasPassword = userRecord.providerData.some(p => p.providerId === 'password')
    if (!hasPassword) {
      // Google-only account — can't reset password
      res.status(400).json({ error: 'This account uses Google sign-in. Please sign in with Google.' })
      return
    }

    const otp = generateOtp()
    const otpHash = hashOtp(otp)

    // Store OTP hash in Firestore with TTL
    await db.collection(OTP_COLLECTION).doc(normalizedEmail).set({
      otpHash,
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      uid: userRecord.uid,
    })

    // Send OTP email
    await sendOtpEmail(normalizedEmail, otp)

    res.status(200).json({ message: 'If an account exists, a code has been sent.' })
  } catch (err: any) {
    console.error('[authController] sendOtp error:', err)
    res.status(500).json({ error: 'Failed to process request. Please try again.' })
  }
}

/**
 * POST /api/auth/forgot-password/verify-otp
 * Body: { email: string, otp: string }
 *
 * Verifies the OTP. Returns a short-lived reset token on success.
 */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as { email?: string; otp?: string }

  if (!email || !otp) {
    res.status(400).json({ error: 'Email and OTP are required' })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()

  try {
    const docRef = db.collection(OTP_COLLECTION).doc(normalizedEmail)
    const doc = await docRef.get()

    if (!doc.exists) {
      res.status(400).json({ error: 'No reset request found. Please request a new code.' })
      return
    }

    const data = doc.data()!
    const now = new Date()

    // Check expiry
    const expiresAt = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt)
    if (now > expiresAt) {
      await docRef.delete()
      res.status(400).json({ error: 'Code has expired. Please request a new one.' })
      return
    }

    // Check attempt limit
    if (data.attempts >= MAX_ATTEMPTS) {
      await docRef.delete()
      res.status(400).json({ error: 'Too many attempts. Please request a new code.' })
      return
    }

    // Increment attempts
    await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) })

    // Constant-time comparison
    const inputHash = hashOtp(otp.trim())
    if (!crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(data.otpHash))) {
      const remaining = MAX_ATTEMPTS - (data.attempts + 1)
      res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` })
      return
    }

    // OTP correct — generate a reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')

    // Update doc with reset token (valid for 5 minutes)
    await docRef.update({
      resetTokenHash,
      resetTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      verified: true,
    })

    res.status(200).json({ resetToken })
  } catch (err: any) {
    console.error('[authController] verifyOtp error:', err)
    res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
}

/**
 * POST /api/auth/forgot-password/reset-password
 * Body: { email: string, resetToken: string, newPassword: string }
 *
 * Updates the user's password using Firebase Admin SDK.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { email, resetToken, newPassword } = req.body as {
    email?: string
    resetToken?: string
    newPassword?: string
  }

  if (!email || !resetToken || !newPassword) {
    res.status(400).json({ error: 'Email, reset token, and new password are required' })
    return
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()

  try {
    const docRef = db.collection(OTP_COLLECTION).doc(normalizedEmail)
    const doc = await docRef.get()

    if (!doc.exists) {
      res.status(400).json({ error: 'Invalid or expired reset session.' })
      return
    }

    const data = doc.data()!

    if (!data.verified) {
      res.status(400).json({ error: 'OTP not verified.' })
      return
    }

    // Check reset token expiry
    const tokenExpiry = data.resetTokenExpiresAt?.toDate?.() ?? new Date(data.resetTokenExpiresAt)
    if (new Date() > tokenExpiry) {
      await docRef.delete()
      res.status(400).json({ error: 'Reset session expired. Please start over.' })
      return
    }

    // Verify reset token
    const inputHash = crypto.createHash('sha256').update(resetToken).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(data.resetTokenHash))) {
      res.status(400).json({ error: 'Invalid reset token.' })
      return
    }

    // Update password via Firebase Admin
    await admin.auth().updateUser(data.uid, { password: newPassword })

    // Clean up OTP doc
    await docRef.delete()

    res.status(200).json({ message: 'Password updated successfully.' })
  } catch (err: any) {
    console.error('[authController] resetPassword error:', err)
    res.status(500).json({ error: 'Failed to reset password. Please try again.' })
  }
}
