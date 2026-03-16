import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleTranscribe } from '../controllers/transcribeController'

const router = Router()

// POST /transcribe
router.post('/', requireAuth, handleTranscribe)

export default router
