import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleTTS } from '../controllers/ttsController'
import { quotaCheck } from '../middleware/quotaMiddleware'

const router = Router()
router.post('/', requireAuth, quotaCheck('tts'), handleTTS)
export default router
