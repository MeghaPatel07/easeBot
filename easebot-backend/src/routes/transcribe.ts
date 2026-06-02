import { Router } from 'express'
import { requireAuthOrGuest } from '../middleware/auth'
import { handleTranscribe } from '../controllers/transcribeController'
import { quotaCheck } from '../middleware/quotaMiddleware'

// STT is cost-bearing and guest-allowed. Valid user OR valid guest session
// only; invalid tokens and anonymous callers are rejected (WE-20260527-202).
const router = Router()
router.post('/', requireAuthOrGuest, quotaCheck('stt'), handleTranscribe)
export default router
