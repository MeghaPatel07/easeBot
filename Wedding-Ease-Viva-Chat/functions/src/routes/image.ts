import { Router } from 'express'
import { optionalAuth } from '../middleware/optionalAuth'
import { quotaGuard } from '../middleware/quotaGuard'
import { handleGenerateImage } from '../controllers/imageController'

const router = Router()

// POST /generate-image — quotaGuard checks token pool (16K tokens per image)
router.post('/', optionalAuth, quotaGuard('image'), handleGenerateImage)

export default router
