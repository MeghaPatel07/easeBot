import { Router } from 'express'
import { requireAuthOrGuest } from '../middleware/auth'
import { handleGenerateImage } from '../controllers/imageController'
import { validateBody } from '../middleware/validateRequest'
import { ImageGenerateSchema } from '../schemas/image'
import { quotaCheck } from '../middleware/quotaMiddleware'

const router = Router()

// POST /api/generate-image — quota-burning, guest-allowed. Valid user OR valid
// guest session only; invalid tokens and anonymous callers are rejected (WE-20260527-202).
router.post('/', requireAuthOrGuest, validateBody(ImageGenerateSchema), quotaCheck('image'), handleGenerateImage)

export default router
