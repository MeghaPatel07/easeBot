import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  initiate,
  activatePlan,
  handleReturn,
  handleWebhook,
  verify,
  razorpayInitiate,
  razorpayVerify,
  razorpayWebhook,
} from '../controllers/paymentController'
import {
  upgrade,
  // downgrade, // TODO: disabled for now, only upgrades allowed
  getCurrentSubscription,
} from '../controllers/subscriptionController'

const router = Router()

// Authenticated: user-initiated purchase + verify.
router.post('/initiate', requireAuth, initiate)
router.post('/activate-plan', requireAuth, activatePlan)
router.get ('/verify',   requireAuth, verify)

// Subscription mutations.
router.post('/subscription/upgrade',   requireAuth, upgrade)
// router.post('/subscription/downgrade', requireAuth, downgrade) // TODO: disabled for now, only upgrades allowed
router.get ('/subscription/current',   requireAuth, getCurrentSubscription)

// Top-up alias — hits the standard initiate flow with plan=topup_2m.
router.post('/topup', requireAuth, (req, res, next) => {
  req.body = { ...(req.body ?? {}), plan: 'topup_2m', cycle: 'once' }
  return initiate(req, res, next)
})

// Unauthenticated (PayU is the HTTP client). Hash verification is the gate.
router.post('/return',  handleReturn)
router.post('/webhook', handleWebhook)

// Razorpay (second gateway). initiate/verify are user-driven (auth); webhook is
// called by Razorpay — its x-razorpay-signature HMAC is the gate (no auth).
router.post('/razorpay/initiate', requireAuth, razorpayInitiate)
router.post('/razorpay/verify',   requireAuth, razorpayVerify)
router.post('/razorpay/webhook',  razorpayWebhook)

export default router
