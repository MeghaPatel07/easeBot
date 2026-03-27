import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Types ────────────────────────────────────────────────────────────────────

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

function budgetDoc(userId: string) {
  return doc(db, 'users', userId, 'budget', 'main')
}

async function getBudgetData(userId: string): Promise<BudgetData | null> {
  const snap = await getDoc(budgetDoc(userId))
  if (!snap.exists()) return null
  return snap.data() as BudgetData
}

function recalcSpent(category: BudgetCategory): BudgetCategory {
  return {
    ...category,
    spent: category.items
      .filter((item) => item.paid)
      .reduce((sum, item) => sum + item.amount, 0),
  }
}

// ── Real-time listener ───────────────────────────────────────────────────────

export function subscribeToBudget(
  userId: string,
  callback: (data: BudgetData | null) => void
): Unsubscribe {
  return onSnapshot(
    budgetDoc(userId),
    (snap) => {
      if (!snap.exists()) {
        callback(null)
        return
      }
      callback(snap.data() as BudgetData)
    },
    (err) => console.error('[subscribeToBudget]', err.message)
  )
}

// ── Budget total ─────────────────────────────────────────────────────────────

export async function setBudgetTotal(userId: string, total: number): Promise<void> {
  const ref = budgetDoc(userId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { totalBudget: total, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, {
      totalBudget: total,
      categories: [],
      updatedAt: serverTimestamp(),
    })
  }
}

// ── Category CRUD ────────────────────────────────────────────────────────────

export async function addBudgetCategory(
  userId: string,
  name: string,
  allocated: number
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const newCategory: BudgetCategory = {
    id: crypto.randomUUID(),
    name,
    allocated,
    spent: 0,
    items: [],
  }
  await updateDoc(ref, {
    categories: [...data.categories, newCategory],
    updatedAt: serverTimestamp(),
  })
}

export async function updateBudgetCategory(
  userId: string,
  categoryId: string,
  updates: Partial<Pick<BudgetCategory, 'name' | 'allocated'>>
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.map((cat) =>
    cat.id === categoryId ? { ...cat, ...updates } : cat
  )
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}

export async function deleteBudgetCategory(
  userId: string,
  categoryId: string
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.filter((cat) => cat.id !== categoryId)
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}

// ── Line item CRUD ───────────────────────────────────────────────────────────

export async function addLineItem(
  userId: string,
  categoryId: string,
  item: Omit<BudgetLineItem, 'id'>
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat
    const newItem: BudgetLineItem = { ...item, id: crypto.randomUUID() }
    const updated = { ...cat, items: [...cat.items, newItem] }
    return recalcSpent(updated)
  })
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}

export async function updateLineItem(
  userId: string,
  categoryId: string,
  itemId: string,
  updates: Partial<BudgetLineItem>
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat
    const items = cat.items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    )
    return recalcSpent({ ...cat, items })
  })
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}

export async function deleteLineItem(
  userId: string,
  categoryId: string,
  itemId: string
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat
    const items = cat.items.filter((item) => item.id !== itemId)
    return recalcSpent({ ...cat, items })
  })
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}

export async function toggleLineItemPaid(
  userId: string,
  categoryId: string,
  itemId: string
): Promise<void> {
  const ref = budgetDoc(userId)
  const data = await getBudgetData(userId)
  if (!data) return

  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat
    const items = cat.items.map((item) =>
      item.id === itemId ? { ...item, paid: !item.paid } : item
    )
    return recalcSpent({ ...cat, items })
  })
  await updateDoc(ref, { categories, updatedAt: serverTimestamp() })
}
