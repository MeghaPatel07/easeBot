import { api, apiAll, invalidate, liveQuery } from './apiClient'
import type { Checklist } from '@/types'

type Unsubscribe = () => void
const TOPIC = 'checklists'
const touch = <T>(p: Promise<T>) => p.then((r) => { invalidate(TOPIC); return r })

export const createChecklist = (_userId: string, title: string, itemTexts: string[]): Promise<Checklist> =>
  touch(api<Checklist>('/checklists', { json: { title, items: itemTexts } }))

export async function duplicateChecklist(_userId: string, source: Checklist): Promise<void> {
  await touch(api(`/checklists/${source.id}/duplicate`, { method: 'POST' }))
}

export async function updateChecklistItem(_userId: string, checklistId: string, itemId: string, newText: string): Promise<void> {
  await touch(api(`/checklists/${checklistId}/items/${itemId}`, { method: 'PATCH', json: { text: newText } }))
}

export async function toggleItemDone(_userId: string, checklistId: string, itemId: string): Promise<void> {
  await touch(api(`/checklists/${checklistId}/items/${itemId}`, { method: 'PATCH', json: { toggle: true } }))
}

export async function addChecklistItem(_userId: string, checklistId: string, text: string): Promise<void> {
  await touch(api(`/checklists/${checklistId}/items`, { method: 'POST', json: { text } }))
}

export async function deleteChecklistItem(_userId: string, checklistId: string, itemId: string): Promise<void> {
  await touch(api(`/checklists/${checklistId}/items/${itemId}`, { method: 'DELETE' }))
}

export async function updateItemDueDate(_userId: string, checklistId: string, itemId: string, dueDate: string | null): Promise<void> {
  await touch(api(`/checklists/${checklistId}/items/${itemId}`, { method: 'PATCH', json: { dueDate } }))
}

export async function reorderChecklistItems(_userId: string, checklistId: string, orderedItemIds: string[]): Promise<void> {
  await touch(api(`/checklists/${checklistId}/order`, { method: 'PUT', json: { itemIds: orderedItemIds } }))
}

export async function deleteChecklist(_userId: string, checklistId: string): Promise<void> {
  await touch(api(`/checklists/${checklistId}`, { method: 'DELETE' }))
}

/** Newest first (the API returns `createdAt desc`). */
export function subscribeToChecklists(_userId: string, callback: (checklists: Checklist[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => apiAll<Checklist>('/checklists'), callback)
}

export function computeStats(checklists: Checklist[]): { total: number; todo: number; completed: number; overdue: number } {
  let todo = 0
  let completed = 0
  let overdue = 0
  const today = new Date().toISOString().slice(0, 10)
  checklists.forEach(cl => {
    cl.items.forEach(item => {
      if (item.completed) completed++
      else {
        todo++
        if (item.dueDate && item.dueDate < today) overdue++
      }
    })
  })
  return { total: todo + completed, todo, completed, overdue }
}
