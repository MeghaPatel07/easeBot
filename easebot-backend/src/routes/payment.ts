import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  initiate,
  handleReturn,
  handleWebhook,
  verify,
} from '../controllers/paymentController'

const router = Router()

// Authenticated: user-initiated purchase + verify.
router.post('/initiate', requireAuth, initiate)
router.get ('/verify',   requireAuth, verify)

// Unauthenticated (PayU is the HTTP client). Hash verification is the gate.
router.post('/return',  handleReturn)
router.post('/webhook', handleWebhook)

export default router
