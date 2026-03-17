import { Request, Response } from 'express'
import {
  createChecklist, editChecklistItem, toggleItemDone,
  deleteChecklist, getChecklistStats,
} from '../services/checklistService'

export async function handleCreateChecklist(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { title, items } = req.body as { title: string; items: string[] }
  if (!title || !Array.isArray(items)) { res.status(400).json({ error: 'title and items[] are required' }); return }
  try {
    const checklist = await createChecklist(uid, title, items)
    res.status(201).json(checklist)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleEditItem(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { id, itemId } = req.params
  const { text } = req.body as { text: string }
  if (!text) { res.status(400).json({ error: 'text is required' }); return }
  try {
    await editChecklistItem(uid, id, itemId, text)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleToggleDone(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { id, itemId } = req.params
  try {
    const completed = await toggleItemDone(uid, id, itemId)
    res.status(200).json({ completed })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleDeleteChecklist(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { id } = req.params
  try {
    await deleteChecklist(uid, id)
    res.status(200).json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export async function handleGetStats(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const stats = await getChecklistStats(uid)
    res.status(200).json(stats)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
