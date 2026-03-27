import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  orderBy,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface SavedItem {
  id: string
  text: string
  category: string
  sourceThreadId: string | null
  sourceThreadTitle: string | null
  note: string | null
  createdAt: any
}

function savedItemsCol(userId: string) {
  return collection(db, 'users', userId, 'savedItems')
}

function savedItemDoc(userId: string, itemId: string) {
  return doc(db, 'users', userId, 'savedItems', itemId)
}

// ── Real-time listener ────────────────────────────────────────────────────────

export function subscribeToSavedItems(
  userId: string,
  callback: (items: SavedItem[]) => void
): Unsubscribe {
  const q = query(savedItemsCol(userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({
        ...d.data(),
        id: d.id,
      } as SavedItem))
      callback(items)
    },
    (err) => console.error('[subscribeToSavedItems]', err.message)
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function addSavedItem(
  userId: string,
  item: Omit<SavedItem, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = await addDoc(savedItemsCol(userId), {
    ...item,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateSavedItemNote(
  userId: string,
  itemId: string,
  note: string
): Promise<void> {
  await updateDoc(savedItemDoc(userId, itemId), { note })
}

export async function updateSavedItemCategory(
  userId: string,
  itemId: string,
  category: string
): Promise<void> {
  await updateDoc(savedItemDoc(userId, itemId), { category })
}

export async function deleteSavedItem(
  userId: string,
  itemId: string
): Promise<void> {
  await deleteDoc(savedItemDoc(userId, itemId))
}
