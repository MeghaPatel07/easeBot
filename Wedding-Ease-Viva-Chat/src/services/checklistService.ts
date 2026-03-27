import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Checklist, ChecklistItem } from '@/types'

function checklistsCol(userId: string) {
  return collection(db, 'users', userId, 'checklists')
}

function checklistDoc(userId: string, checklistId: string) {
  return doc(db, 'users', userId, 'checklists', checklistId)
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createChecklist(
  userId: string,
  title: string,
  itemTexts: string[]
): Promise<Checklist> {
  const id = crypto.randomUUID()
  const now = serverTimestamp()
  const items: ChecklistItem[] = itemTexts.map(text => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    vendorRef: null,
    dueDate: null,
  }))

  const checklist = { id, userId, title, items, createdAt: now, updatedAt: now }
  await setDoc(checklistDoc(userId, id), checklist)
  return checklist as unknown as Checklist
}

export async function updateChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string,
  newText: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, text: newText } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function toggleItemDone(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, completed: !item.completed } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function addChecklistItem(
  userId: string,
  checklistId: string,
  text: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = snap.data().items as ChecklistItem[]
  items.push({ id: crypto.randomUUID(), text, completed: false, vendorRef: null, dueDate: null })
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function deleteChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).filter(i => i.id !== itemId)
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function updateItemDueDate(
  userId: string,
  checklistId: string,
  itemId: string,
  dueDate: string | null
): Promise<void> {
  const ref = checklistDoc(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, dueDate } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function deleteChecklist(userId: string, checklistId: string): Promise<void> {
  await deleteDoc(checklistDoc(userId, checklistId))
}

// ── Real-time listener ────────────────────────────────────────────────────────

export function subscribeToChecklists(
  userId: string,
  callback: (checklists: Checklist[]) => void
): Unsubscribe {
  return onSnapshot(
    checklistsCol(userId),
    (snapshot) => {
      const checklists = snapshot.docs
        .map(d => ({ ...d.data() } as Checklist))
        .sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis?.() ?? 0
          const bMs = (b.createdAt as any)?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(checklists)
    },
    (err) => console.error('[subscribeToChecklists]', err.message)
  )
}

// ── Stats (client-side) ───────────────────────────────────────────────────────

export function computeStats(checklists: Checklist[]): { todo: number; completed: number; overdue: number } {
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
  return { todo, completed, overdue }
}
