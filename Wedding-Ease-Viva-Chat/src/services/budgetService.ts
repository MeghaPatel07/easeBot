import { api, invalidate, liveQuery } from './apiClient'

type Unsubscribe = () => void
const TOPIC = 'budget'
const touch = <T>(p: Promise<T>) => p.then((r) => { invalidate(TOPIC); return r })

export interface BudgetLineItem {
  id: string
  description: string
  amount: number
  vendor: string | null
  paid: boolean
  date: string | null // ISO date
}

export interface BudgetCategory {
  id: string
  name: string // e.g. "Venue", "Catering", "Photography"
  allocated: number
  spent: number
  items: BudgetLineItem[]
}

export interface BudgetData {
  totalBudget: number
  categories: BudgetCategory[]
  updatedAt: any
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function subscribeToBudget(_userId: string, callback: (data: BudgetData | null) => void): Unsubscribe {
  return liveQuery(TOPIC, () => api<BudgetData | null>('/budget'), callback)
}

export async function setBudgetTotal(_userId: string, total: number): Promise<void> {
  await touch(api('/budget', { method: 'PUT', json: { totalBudget: total } }))
}

export async function addBudgetCategory(_userId: string, name: string, allocated: number): Promise<void> {
  await touch(api('/budget/categories', { json: { name, allocated } }))
}

export async function updateBudgetCategory(
  _userId: string,
  categoryId: string,
  updates: Partial<Pick<BudgetCategory, 'name' | 'allocated'>>,
): Promise<void> {
  await touch(api(`/budget/categories/${categoryId}`, { method: 'PATCH', json: updates }))
}

export async function deleteBudgetCategory(_userId: string, categoryId: string): Promise<void> {
  await touch(api(`/budget/categories/${categoryId}`, { method: 'DELETE' }))
}

export async function addLineItem(_userId: string, categoryId: string, item: Omit<BudgetLineItem, 'id'>): Promise<void> {
  await touch(api(`/budget/categories/${categoryId}/items`, { json: item }))
}

export async function updateLineItem(_userId: string, categoryId: string, itemId: string, updates: Partial<BudgetLineItem>): Promise<void> {
  const { id: _id, ...patch } = updates
  await touch(api(`/budget/categories/${categoryId}/items/${itemId}`, { method: 'PATCH', json: patch }))
}

export async function deleteLineItem(_userId: string, categoryId: string, itemId: string): Promise<void> {
  await touch(api(`/budget/categories/${categoryId}/items/${itemId}`, { method: 'DELETE' }))
}

export async function toggleLineItemPaid(_userId: string, categoryId: string, itemId: string): Promise<void> {
  await touch(api(`/budget/categories/${categoryId}/items/${itemId}/toggle-paid`, { method: 'POST' }))
}
