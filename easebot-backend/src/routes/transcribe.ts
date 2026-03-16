import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleTranscribe } from '../controllers/transcribeController'

const router = Router()
router.post('/', requireAuth, handleTranscribe)
export default router
