import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  getDocs,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string
  title: string
  body: string
  type: 'reminder' | 'overdue' | 'info'
  read: boolean
  relatedId: string | null    // checklistId, eventId, etc.
  relatedType: string | null  // 'checklist' | 'event' etc.
  createdAt: any
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function notificationsCol(userId: string) {
  return collection(db, 'users', userId, 'notifications')
}

function notificationDoc(userId: string, notifId: string) {
  return doc(db, 'users', userId, 'notifications', notifId)
}

// ── Subscribe ────────────────────────────────────────────────────────────────

export function subscribeToNotifications(
  userId: string,
  callback: (notifs: AppNotification[]) => void
): Unsubscribe {
  const q = query(notificationsCol(userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const notifs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as AppNotification[]
      callback(notifs)
    },
    (err) => console.error('[subscribeToNotifications]', err.message)
  )
}

// ── Mark as read ─────────────────────────────────────────────────────────────

export async function markAsRead(userId: string, notifId: string): Promise<void> {
  await updateDoc(notificationDoc(userId, notifId), { read: true })
}

export async function markAllAsRead(
  userId: string,
  notifs: AppNotification[]
): Promise<void> {
  const unread = notifs.filter((n) => !n.read)
  if (unread.length === 0) return

  const batch = writeBatch(db)
  unread.forEach((n) => {
    batch.update(notificationDoc(userId, n.id), { read: true })
  })
  await batch.commit()
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteNotification(
  userId: string,
  notifId: string
): Promise<void> {
  await deleteDoc(notificationDoc(userId, notifId))
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createNotification(
  userId: string,
  notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
): Promise<string> {
  const docRef = await addDoc(notificationsCol(userId), {
    ...notif,
    read: false,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

// ── Generate overdue notifications ───────────────────────────────────────────

export async function generateOverdueNotifications(
  userId: string,
  checklists: Array<{
    id: string
    title: string
    items: Array<{
      id: string
      text: string
      completed: boolean
      dueDate: string | null
    }>
  }>
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // Collect all overdue item IDs
  const overdueItems: Array<{
    itemId: string
    itemText: string
    checklistTitle: string
    dueDate: string
  }> = []

  for (const cl of checklists) {
    for (const item of cl.items) {
      if (!item.completed && item.dueDate && item.dueDate < today) {
        overdueItems.push({
          itemId: item.id,
          itemText: item.text,
          checklistTitle: cl.title,
          dueDate: item.dueDate,
        })
      }
    }
  }

  if (overdueItems.length === 0) return

  // Query existing overdue notifications to avoid duplicates
  const existingQuery = query(
    notificationsCol(userId),
    where('type', '==', 'overdue'),
    where('relatedType', '==', 'checklist-item')
  )
  const existingSnap = await getDocs(existingQuery)
  const existingRelatedIds = new Set(
    existingSnap.docs.map((d) => d.data().relatedId as string)
  )

  // Create notifications for items that don't already have one
  for (const item of overdueItems) {
    if (existingRelatedIds.has(item.itemId)) continue

    await createNotification(userId, {
      title: `Overdue: ${item.itemText}`,
      body: `This task from "${item.checklistTitle}" was due on ${item.dueDate}.`,
      type: 'overdue',
      relatedId: item.itemId,
      relatedType: 'checklist-item',
    })
  }
}
