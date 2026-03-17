import * as admin from 'firebase-admin'
import { v4 as uuid } from 'uuid'

const db = admin.firestore()

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
  createdAt: admin.firestore.Timestamp
  updatedAt: admin.firestore.Timestamp
}

export interface ChecklistStats {
  todo: number
  completed: number
  total: number
}

function checklistsRef(userId: string) {
  return db.collection('users').doc(userId).collection('checklists')
}

export async function createChecklist(
  userId: string,
  title: string,
  itemTexts: string[]
): Promise<Checklist> {
  const id = uuid()
  const now = admin.firestore.Timestamp.now()
  const items: ChecklistItem[] = itemTexts.map(text => ({
    id: uuid(),
    text,
    completed: false,
    vendorRef: null,
  }))

  const doc: Checklist = { id, userId, title, items, createdAt: now, updatedAt: now }
  await checklistsRef(userId).doc(id).set(doc)
  return doc
}

export async function editChecklistItem(
  userId: string,
  checklistId: string,
  itemId: string,
  newText: string
): Promise<void> {
  const ref = checklistsRef(userId).doc(checklistId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Checklist not found')

  const data = snap.data() as Checklist
  const items = data.items.map(item =>
    item.id === itemId ? { ...item, text: newText } : item
  )
  await ref.update({ items, updatedAt: admin.firestore.Timestamp.now() })
}

export async function toggleItemDone(
  userId: string,
  checklistId: string,
  itemId: string
): Promise<boolean> {
  const ref = checklistsRef(userId).doc(checklistId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Checklist not found')

  const data = snap.data() as Checklist
  let newCompleted = false
  const items = data.items.map(item => {
    if (item.id === itemId) {
      newCompleted = !item.completed
      return { ...item, completed: newCompleted }
    }
    return item
  })
  await ref.update({ items, updatedAt: admin.firestore.Timestamp.now() })
  return newCompleted
}

export async function deleteChecklist(userId: string, checklistId: string): Promise<void> {
  await checklistsRef(userId).doc(checklistId).delete()
}

export async function getChecklistStats(userId: string): Promise<ChecklistStats> {
  const snap = await checklistsRef(userId).get()
  let todo = 0
  let completed = 0

  snap.docs.forEach(doc => {
    const data = doc.data() as Checklist
    data.items.forEach(item => {
      if (item.completed) completed++
      else todo++
    })
  })

  return { todo, completed, total: todo + completed }
}

export async function getChecklistCount(userId: string): Promise<number> {
  const snap = await checklistsRef(userId).count().get()
  return snap.data().count
}
