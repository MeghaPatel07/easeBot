/**
 * In-app notifications writer.
 *
 * Writes documents to users/{uid}/notifications which the frontend's
 * NotificationsView renders.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type AppNotificationType = 'reminder' | 'info' | 'overdue'

interface WriteNotificationInput {
  title: string
  body: string
  type: AppNotificationType
  relatedId?: string | null
  relatedType?: string | null
}

export async function writeAppNotification(
  uid: string,
  input: WriteNotificationInput,
): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'notifications'), {
    title: input.title,
    body: input.body,
    type: input.type,
    relatedId: input.relatedId ?? null,
    relatedType: input.relatedType ?? null,
    read: false,
    createdAt: serverTimestamp(),
  })
}
