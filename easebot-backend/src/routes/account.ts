import { Router } from 'express'
import {
  requireStrictAuth,
  rateLimitMutations,
  rateLimitSensitive,
  handleGetMe,
  handleUpdateProfile,
  handleEmailChangeStub,
  handlePasswordChangeStub,
  handleGetPlan,
  handleCheckoutStub,
  handleSoftDelete,
  handleSignOutEverywhere,
  handleUpdatePreferences,
  handleExportStub,
} from '../controllers/accountController'

// All /api/account/* endpoints require a verified Firebase ID token.
// Routine mutations are rate-limited at 10/min/uid (`rateLimitMutations`).
// Sensitive ops (email/password/delete/sign-out-everywhere) are additionally
// rate-limited at 5/hour/uid (`rateLimitSensitive`).
const router = Router()

// --- Reads ---
router.get('/me',     requireStrictAuth, handleGetMe)
router.get('/plan',   requireStrictAuth, handleGetPlan)
router.get('/export', requireStrictAuth, handleExportStub)

// --- Routine mutations (rate-limited 10/min/uid) ---
router.patch ('/profile',         requireStrictAuth, rateLimitMutations, handleUpdateProfile)
router.post  ('/plan/checkout',   requireStrictAuth, rateLimitMutations, handleCheckoutStub)
router.patch ('/preferences',     requireStrictAuth, rateLimitMutations, handleUpdatePreferences)

// --- Sensitive mutations (rate-limited 10/min AND 5/hour per uid) ---
router.post('/email/change',       requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleEmailChangeStub)
router.post('/password/change',    requireStrictAuth, rateLimitMutations, rateLimitSensitive, handlePasswordChangeStub)
router.post('/delete',             requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleSoftDelete)
router.post('/sign-out-everywhere',requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleSignOutEverywhere)

export default router
