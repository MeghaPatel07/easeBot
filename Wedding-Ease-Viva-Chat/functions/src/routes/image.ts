import { Router } from 'express'
import { optionalAuth } from '../middleware/optionalAuth'
import { handleGenerateImage } from '../controllers/imageController'

const router = Router()

// POST /generate-image
router.post('/', optionalAuth, handleGenerateImage)

export default router
