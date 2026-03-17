import { Request, Response } from 'express'
import {
  createChecklist,
  editChecklistItem,
  toggleItemDone,
  deleteChecklist,
  getChecklistStats,
} from '../services/checklistService'

// POST /api/checklists
// Body: { title: string, items: string[] }
export async function handleCreateChecklist(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const { title, items } = req.body as { title: string; items: string[] }

  if (!title || !Array.isArray(items)) {
    res.status(400).json({ error: 'title and items[] are required' })
    return
  }

  try {
    const checklist = await createChecklist(uid, title, items)
    res.status(201).json(checklist)
  } catch (err: any) {
    console.error('[checklistController] createChecklist error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}

// PATCH /api/checklists/:id/items/:itemId
// Body: { text: string }
export async function handleEditItem(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const { id, itemId } = req.params
  const { text } = req.body as { text: string }

  if (!text) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  try {
    await editChecklistItem(uid, id, itemId, text)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    console.error('[checklistController] editItem error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}

// PATCH /api/checklists/:id/items/:itemId/done
export async function handleToggleDone(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const { id, itemId } = req.params

  try {
    const completed = await toggleItemDone(uid, id, itemId)
    res.status(200).json({ completed })
  } catch (err: any) {
    console.error('[checklistController] toggleDone error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}

// DELETE /api/checklists/:id
export async function handleDeleteChecklist(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid
  const { id } = req.params

  try {
    await deleteChecklist(uid, id)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    console.error('[checklistController] deleteChecklist error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}

// GET /api/checklists/stats
export async function handleGetStats(req: Request, res: Response): Promise<void> {
  const uid = req.user!.uid

  try {
    const stats = await getChecklistStats(uid)
    res.status(200).json(stats)
  } catch (err: any) {
    console.error('[checklistController] getStats error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
