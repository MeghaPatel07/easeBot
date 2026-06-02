import { Router } from 'express'
import { requireUser } from '../middleware/auth'
import {
  initiate,
  activatePlan,
  handleReturn,
  handleWebhook,
  verify,
} from '../controllers/paymentController'
import {
  upgrade,
  // downgrade, // TODO: disabled for now, only upgrades allowed
  getCurrentSubscription,
} from '../controllers/subscriptionController'

const router = Router()

// Payment/subscription mutations must NEVER serve guests or invalid tokens.
// `requireUser` requires a verified Firebase user and FAILS CLOSED — missing OR
// invalid token => 401 (WE-20260527-202 / -1007). PayU callbacks below stay
// unauthenticated (PayU is the HTTP client; hash verification is the gate).

// Authenticated: user-initiated purchase + verify.
router.post('/initiate', requireUser, initiate)
router.post('/activate-plan', requireUser, activatePlan)
router.get ('/verify',   requireUser, verify)

// Subscription mutations.
router.post('/subscription/upgrade',   requireUser, upgrade)
// router.post('/subscription/downgrade', requireUser, downgrade) // TODO: disabled for now, only upgrades allowed
router.get ('/subscription/current',   requireUser, getCurrentSubscription)

// Top-up alias — hits the standard initiate flow with plan=topup_2m.
router.post('/topup', requireUser, (req, res, next) => {
  req.body = { ...(req.body ?? {}), plan: 'topup_2m', cycle: 'once' }
  return initiate(req, res, next)
})

// Unauthenticated (PayU is the HTTP client). Hash verification is the gate.
router.post('/return',  handleReturn)
router.post('/webhook', handleWebhook)

export default router
