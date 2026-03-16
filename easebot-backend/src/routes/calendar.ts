import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleAddCalendarEvent } from '../controllers/calendarController'

const router = Router()

// POST /api/calendar/add-event
router.post('/add-event', requireAuth, handleAddCalendarEvent)

export default router
