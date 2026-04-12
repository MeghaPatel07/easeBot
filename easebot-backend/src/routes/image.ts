import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleGenerateImage } from '../controllers/imageController'
import { validateBody } from '../middleware/validateRequest'
import { ImageGenerateSchema } from '../schemas/image'

const router = Router()

// POST /api/generate-image
router.post('/', requireAuth, validateBody(ImageGenerateSchema), handleGenerateImage)

export default router
