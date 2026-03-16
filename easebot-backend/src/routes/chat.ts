import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleChat } from '../controllers/chatController'

const router = Router()
router.post('/', requireAuth, handleChat)
export default router
