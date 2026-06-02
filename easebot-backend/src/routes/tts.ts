import { Router } from 'express'
import { requireAuthOrGuest } from '../middleware/auth'
import { handleTTS } from '../controllers/ttsController'

// TTS is cost-bearing and guest-allowed. Valid user OR valid guest session
// only; invalid tokens and anonymous callers are rejected (WE-20260527-202).
const router = Router()
router.post('/', requireAuthOrGuest, handleTTS)
export default router
