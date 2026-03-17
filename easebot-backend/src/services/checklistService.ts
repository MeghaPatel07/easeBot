import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  vendorRef: string | null
}

export interface Checklist {
  id: string
  userId: string
  title: string
  items: ChecklistItem[]
  createdAt: any
  updatedAt: any
}

export interface ChecklistStats {
  todo: number
  completed: number
  total: number
}

function checklistsCol(userId: string) {
  return collection(db, 'users', userId, 'checklists')
}

function checklistRef(userId: string, checklistId: string) {
  return doc(db, 'users', userId, 'checklists', checklistId)
}

export async function createChecklist(
  userId: string,
  title: string,
  itemTexts: string[]
): Promise<Checklist> {
  const id = crypto.randomUUID()
  const items: ChecklistItem[] = itemTexts.map(text => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    vendorRef: null,
  }))
  const now = serverTimestamp()
  const data: any = { id, userId, title, items, createdAt: now, updatedAt: now }
  await setDoc(checklistRef(userId, id), data)
  return { ...data, createdAt: null, updatedAt: null } as Checklist
}

export async function editChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string,
  newText: string
): Promise<void> {
  const ref = checklistRef(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Checklist not found')
  const items = (snap.data().items as ChecklistItem[]).map(item =>
    item.id === itemId ? { ...item, text: newText } : item
  )
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
}

export async function toggleItemDone(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<boolean> {
  const ref = checklistRef(userId, checklistId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Checklist not found')
  let newCompleted = false
  const items = (snap.data().items as ChecklistItem[]).map(item => {
    if (item.id === itemId) {
      newCompleted = !item.completed
      return { ...item, completed: newCompleted }
    }
    return item
  })
  await updateDoc(ref, { items, updatedAt: serverTimestamp() })
  return newCompleted
}

export async function deleteChecklist(userId: string, checklistId: string): Promise<void> {
  await deleteDoc(checklistRef(userId, checklistId))
}

export async function getChecklistCount(userId: string): Promise<number> {
  const snap = await getDocs(checklistsCol(userId))
  return snap.size
}

export async function getChecklistStats(userId: string): Promise<ChecklistStats> {
  const snap = await getDocs(checklistsCol(userId))
  let todo = 0
  let completed = 0
  snap.docs.forEach(d => {
    (d.data().items as ChecklistItem[]).forEach(item => {
      if (item.completed) completed++
      else todo++
    })
  })
  return { todo, completed, total: todo + completed }
}
