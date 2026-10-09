import { api, apiAll, invalidate, liveQuery } from './apiClient'

type Unsubscribe = () => void
const TOPIC = 'shopping'
const touch = <T>(p: Promise<T>) => p.then((r) => { invalidate(TOPIC); return r })

export interface ShoppingItem {
  id: string
  name: string
  price: number | null   // estimated price
  link: string | null     // product URL
  purchased: boolean
  category: string | null // e.g. "Decor", "Favors"
}

export interface ShoppingList {
  id: string
  userId: string
  title: string           // e.g. "Wedding Decor", "Guest Favors"
  items: ShoppingItem[]
  createdAt: any
  updatedAt: any
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function subscribeToShoppingLists(_userId: string, callback: (lists: ShoppingList[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => apiAll<ShoppingList>('/shopping-lists'), callback)
}

export const createShoppingList = (_userId: string, title: string): Promise<ShoppingList> =>
  touch(api<ShoppingList>('/shopping-lists', { json: { title } }))

export async function deleteShoppingList(_userId: string, listId: string): Promise<void> {
  await touch(api(`/shopping-lists/${listId}`, { method: 'DELETE' }))
}

export async function addShoppingItem(_userId: string, listId: string, item: Omit<ShoppingItem, 'id'>): Promise<void> {
  await touch(api(`/shopping-lists/${listId}/items`, { json: item }))
}

export async function updateShoppingItem(_userId: string, listId: string, itemId: string, updates: Partial<ShoppingItem>): Promise<void> {
  const { id: _id, ...patch } = updates
  await touch(api(`/shopping-lists/${listId}/items/${itemId}`, { method: 'PATCH', json: patch }))
}

export async function deleteShoppingItem(_userId: string, listId: string, itemId: string): Promise<void> {
  await touch(api(`/shopping-lists/${listId}/items/${itemId}`, { method: 'DELETE' }))
}

export async function toggleItemPurchased(_userId: string, listId: string, itemId: string): Promise<void> {
  await touch(api(`/shopping-lists/${listId}/items/${itemId}/toggle`, { method: 'POST' }))
}
