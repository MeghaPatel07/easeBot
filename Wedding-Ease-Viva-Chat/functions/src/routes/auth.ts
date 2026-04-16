import { Router } from 'express'
import { sendOtp, verifyOtp, resetPassword } from '../controllers/authController'

const router = Router()

router.post('/forgot-password/send-otp', sendOtp)
router.post('/forgot-password/verify-otp', verifyOtp)
router.post('/forgot-password/reset-password', resetPassword)

export default router
