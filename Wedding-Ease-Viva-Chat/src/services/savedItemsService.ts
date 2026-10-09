import { api, apiAll, invalidate, liveQuery } from './apiClient'

type Unsubscribe = () => void
const TOPIC = 'saved'
const touch = <T>(p: Promise<T>) => p.then((r) => { invalidate(TOPIC); return r })

export interface SavedItem {
  id: string
  text: string
  category: string
  sourceThreadId: string | null
  sourceThreadTitle: string | null
  note: string | null
  createdAt: any
}

export function subscribeToSavedItems(_userId: string, callback: (items: SavedItem[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => apiAll<SavedItem>('/saved-items'), callback)
}

export async function addSavedItem(_userId: string, item: Omit<SavedItem, 'id' | 'createdAt'>): Promise<string> {
  return (await touch(api<{ id: string }>('/saved-items', { json: item }))).id
}

export async function updateSavedItemNote(_userId: string, itemId: string, note: string): Promise<void> {
  await touch(api(`/saved-items/${itemId}`, { method: 'PATCH', json: { note } }))
}

export async function updateSavedItemCategory(_userId: string, itemId: string, category: string): Promise<void> {
  await touch(api(`/saved-items/${itemId}`, { method: 'PATCH', json: { category } }))
}

export async function deleteSavedItem(_userId: string, itemId: string): Promise<void> {
  await touch(api(`/saved-items/${itemId}`, { method: 'DELETE' }))
}
