import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { quotaCheck } from '../middleware/quotaMiddleware'
import { handleTTS } from '../controllers/ttsController'

const router = Router()
// quotaCheck('tts') gates the (cost-bearing) Azure/Gemini TTS call. Without
// this, an unauthenticated scrape rotating IPs through the apiRateLimiter
// could burn arbitrary paid TTS minutes — see BUG-BE-20260525-010.
router.post('/', requireAuth, quotaCheck('tts'), handleTTS)
export default router
