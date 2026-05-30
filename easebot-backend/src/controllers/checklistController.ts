import { Request, Response } from 'express'
import {
  createChecklist, editChecklistItem, toggleItemDone,
  deleteChecklist, getChecklistStats,
} from '../services/checklistService'

export async function handleCreateChecklist(req: Request, res: Response): Promise<void> {
  const uid = req.user?.uid
  if (!uid) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { title, items } = req.body as { title: string; items: unknown }
  if (!title || !Array.isArray(items)) { res.status(400).json({ error: 'title and items[] are required' }); return }
  // BUG-BE-20260526-023: accept both items:['text'] and items:[{text:'text'}] —
  // normalize to flat strings so the persisted item.text is a string, not a
  // nested { text: '...' } object. Reject items that resolve to empty strings.
  const normalized: string[] = []
  for (const raw of items) {
    let str: string | null = null
    if (typeof raw === 'string') str = raw.trim()
    else if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
      str = ((raw as { text: string }).text).trim()
    }
    if (str && str.length > 0) normalized.push(str)
  }
  if (normalized.length === 0) { res.status(400).json({ error: 'items[] must contain at least one non-empty string or {text:string}' }); return }
  try {
    const checklist = await createChecklist(uid, title, normalized)
    res.status(201).json(checklist)
  } catch (err: any) {
    // Don't echo arbitrary err.message — same pattern as BUG-BE-005/011/014
    console.error('[handleCreateChecklist]', err)
    res.status(500).json({ error: 'Failed to create checklist' })
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
