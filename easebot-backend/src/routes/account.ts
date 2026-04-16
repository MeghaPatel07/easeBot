import { Router } from 'express'
import {
  requireStrictAuth,
  rateLimitMutations,
  rateLimitSensitive,
  handleGetMe,
  handleUpdateProfile,
  handleGetPlan,
  handleGetUsage,
  handleGetInvoices,
  handleGetInvoicePdf,
  handleSwitchPlan,
  handleSoftDelete,
  handleSignOutEverywhere,
  handleUpdatePreferences,
  handleExport,
  handleClearHistory,
} from '../controllers/accountController'

// All /api/account/* endpoints require a verified Firebase ID token.
// Routine mutations are rate-limited at 10/min/uid (`rateLimitMutations`).
// Sensitive ops (email/password/delete/sign-out-everywhere) are additionally
// rate-limited at 5/hour/uid (`rateLimitSensitive`).
const router = Router()

// --- Reads ---
router.get('/me',     requireStrictAuth, handleGetMe)
router.get('/plan',   requireStrictAuth, handleGetPlan)
router.get('/usage',  requireStrictAuth, handleGetUsage)
router.get('/invoices', requireStrictAuth, handleGetInvoices)
router.get('/invoices/:id/pdf', requireStrictAuth, handleGetInvoicePdf)
router.get('/export', requireStrictAuth, handleExport)

// --- Routine mutations (rate-limited 10/min/uid) ---
router.patch ('/profile',         requireStrictAuth, rateLimitMutations, handleUpdateProfile)
router.post  ('/plan/switch',     requireStrictAuth, rateLimitMutations, handleSwitchPlan)
router.patch ('/preferences',     requireStrictAuth, rateLimitMutations, handleUpdatePreferences)

// --- Sensitive mutations (rate-limited 10/min AND 5/hour per uid) ---
router.delete('/history',          requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleClearHistory)
router.post('/delete',             requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleSoftDelete)
router.post('/sign-out-everywhere',requireStrictAuth, rateLimitMutations, rateLimitSensitive, handleSignOutEverywhere)

export default router
