import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleTTS } from '../controllers/ttsController'

const router = Router()
router.post('/', requireAuth, handleTTS)
export default router
