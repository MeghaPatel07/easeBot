import { Router } from 'express'
import { requireAuthOrGuest } from '../middleware/auth'
import { handleCreateFeedback } from '../controllers/feedbackController'

// Feedback can be submitted by guests, but anonymous callers must still carry a
// valid guest session (X-Guest-Id). `requireAuthOrGuest` admits a valid user OR
// a valid guest session, attaches `req.user` for authenticated callers, and
// rejects invalid tokens / fully-anonymous callers (WE-20260527-202). The global
// `apiRateLimiter` (mounted on /api/ in app.ts) additionally throttles this route.
const router = Router()

router.post('/', requireAuthOrGuest, handleCreateFeedback)

export default router
