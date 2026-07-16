/**
 * In-app notifications writer.
 *
 * Writes documents to users/{uid}/notifications which the frontend's
 * NotificationsView renders.
 */

import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'

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
  await adminDb.collection(`users/${uid}/notifications`).add({
    title: input.title,
    body: input.body,
    type: input.type,
    relatedId: input.relatedId ?? null,
    relatedType: input.relatedType ?? null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  })
}
