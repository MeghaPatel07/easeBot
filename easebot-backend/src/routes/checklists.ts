import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import {
  handleCreateChecklist, handleEditItem, handleToggleDone,
  handleDeleteChecklist, handleGetStats,
} from '../controllers/checklistController'

const router = Router()

router.get('/stats', requireAuth, handleGetStats)
router.post('/', requireAuth, handleCreateChecklist)
router.patch('/:id/items/:itemId', requireAuth, handleEditItem)
router.patch('/:id/items/:itemId/done', requireAuth, handleToggleDone)
router.delete('/:id', requireAuth, handleDeleteChecklist)

export default router
