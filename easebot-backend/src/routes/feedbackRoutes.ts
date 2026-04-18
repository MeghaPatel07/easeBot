import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleCreateFeedback } from '../controllers/feedbackController'

// Feedback can be submitted by guests (no token required). The shared
// `requireAuth` middleware is a guest-pass-through: it attaches `req.user`
// when a valid Bearer token is present, and otherwise lets the request
// proceed with `req.user === undefined`. The global `apiRateLimiter`
// (mounted on /api/ in app.ts) already throttles this route at 30 req/min/IP.
const router = Router()

router.post('/', requireAuth, handleCreateFeedback)

export default router
