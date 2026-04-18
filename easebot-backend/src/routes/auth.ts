import { Router } from 'express'
import {
  handleSendOtp,
  handleVerifyOtp,
  handleResetPassword,
} from '../controllers/authController'

// Public, unauthenticated forgot-password OTP flow.
// Bucket-level rate-limiting is provided by the global apiRateLimiter mounted in app.ts.
const router = Router()

router.post('/forgot-password/send-otp',       handleSendOtp)
router.post('/forgot-password/verify-otp',     handleVerifyOtp)
router.post('/forgot-password/reset-password', handleResetPassword)

export default router
