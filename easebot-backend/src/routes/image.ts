import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleGenerateImage } from '../controllers/imageController'

const router = Router()

// POST /api/generate-image
router.post('/', requireAuth, handleGenerateImage)

export default router
