import { Router } from 'express'
import { optionalAuth } from '../middleware/optionalAuth'
import { quotaGuard } from '../middleware/quotaGuard'
import { handleChat } from '../controllers/chatController'

const router = Router()

// POST /chat — optionalAuth allows guests, quotaGuard enforces token pool
router.post('/', optionalAuth, quotaGuard('chat'), handleChat)

export default router
