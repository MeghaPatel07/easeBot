import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleGenerateImage } from '../controllers/imageController'
import { validateBody } from '../middleware/validateRequest'
import { ImageGenerateSchema } from '../schemas/image'
import { quotaCheck } from '../middleware/quotaMiddleware'

const router = Router()

// POST /api/generate-image
router.post('/', requireAuth, validateBody(ImageGenerateSchema), quotaCheck('image'), handleGenerateImage)

export default router
