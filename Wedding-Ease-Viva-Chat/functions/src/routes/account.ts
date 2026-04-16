import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { getUsageSnapshot } from '../services/tokenMeter'

const router = Router()

// GET /account/usage — returns current token pool usage (x/y counts)
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const uid = req.user!.uid
    const snapshot = await getUsageSnapshot(uid)
    res.status(200).json(snapshot)
  } catch (err: any) {
    console.error('[account/usage] error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
})

export default router
