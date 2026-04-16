import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleTranscribe } from '../controllers/transcribeController'
import { quotaCheck } from '../middleware/quotaMiddleware'

const router = Router()
router.post('/', requireAuth, quotaCheck('stt'), handleTranscribe)
export default router
