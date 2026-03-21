import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Types ────────────────────────────────────────────────────────────────────

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

function shoppingListsCol(userId: string) {
  return collection(db, 'users', userId, 'shoppingLists')
}

function shoppingListDoc(userId: string, listId: string) {
  return doc(db, 'users', userId, 'shoppingLists', listId)
}

// ── Real-time listener ───────────────────────────────────────────────────────

export function subscribeToShoppingLists(
  userId: string,
  callback: (lists: ShoppingList[]) => void
): Unsubscribe {
  return onSnapshot(
    shoppingListsCol(userId),
    (snapshot) => {
      const lists = snapshot.docs
        .map(d => ({ ...d.data() } as ShoppingList))
        .sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis?.() ?? 0
          const bMs = (b.createdAt as any)?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(lists)
    },
    (err) => console.error('[subscribeToShoppingLists]', err.message)
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createShoppingList(
  userId: string,
  title: string
): Promise<ShoppingList> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const list = { id, userId, title, items: [], createdAt: now, updatedAt: now }
  await setDoc(shoppingListDoc(userId, id), list)
  return list as unknown as ShoppingList
}

export async function deleteShoppingList(
  userId: string,
  listId: string
): Promise<void> {
  await deleteDoc(shoppingListDoc(userId, listId))
}

export async function addShoppingItem(
  userId: string,
  listId: string,
  item: Omit<ShoppingItem, 'id'>
): Promise<void> {
  const ref = shoppingListDoc(userId, listId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = snap.data().items as ShoppingItem[]
  items.push({ id: crypto.randomUUID(), ...item })
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function updateShoppingItem(
  userId: string,
  listId: string,
  itemId: string,
  updates: Partial<ShoppingItem>
): Promise<void> {
  const ref = shoppingListDoc(userId, listId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ShoppingItem[]).map(item =>
    item.id === itemId ? { ...item, ...updates } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function deleteShoppingItem(
  userId: string,
  listId: string,
  itemId: string
): Promise<void> {
  const ref = shoppingListDoc(userId, listId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ShoppingItem[]).filter(i => i.id !== itemId)
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function toggleItemPurchased(
  userId: string,
  listId: string,
  itemId: string
): Promise<void> {
  const ref = shoppingListDoc(userId, listId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ShoppingItem[]).map(item =>
    item.id === itemId ? { ...item, purchased: !item.purchased } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}
