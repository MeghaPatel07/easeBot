import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleChat, handleChatStream } from '../controllers/chatController'

const router = Router()
router.post('/', requireAuth, handleChat)
router.post('/stream', requireAuth, handleChatStream)
export default router
