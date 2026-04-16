import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { quotaGuard } from '../middleware/quotaGuard'
import { handleTranscribe } from '../controllers/transcribeController'

const router = Router()

// POST /transcribe — requireAuth (no guests) + quotaGuard (7K tokens/min)
router.post('/', requireAuth, quotaGuard('transcribe'), handleTranscribe)

export default router
