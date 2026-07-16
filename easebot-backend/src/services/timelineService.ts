import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

function timelineEventsCol() {
  return adminDb.collection('timelineEvents')
}

function timelineEventRef(eventId: string) {
  return adminDb.doc(`timelineEvents/${eventId}`)
}

// ---------------------------------------------------------------------------
// Timeline Events CRUD
// ---------------------------------------------------------------------------

export interface CreateTimelineEventInput {
  title: string
  date: string // ISO date (YYYY-MM-DD) or full ISO timestamp
  description?: string | null
  category?: string | null
}

export async function createTimelineEvent(
  userId: string,
  userEmail: string,
  data: CreateTimelineEventInput,
): Promise<any> {
  const id = crypto.randomUUID()
  const now = FieldValue.serverTimestamp()
  const eventData: any = {
    id,
    title: data.title,
    date: data.date,
    description: data.description ?? null,
    category: data.category ?? null,
    ownerId: userId,
    ownerEmail: userEmail,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    source: 'chat',
  }
  await timelineEventRef(id).set(eventData)
  return { ...eventData, createdAt: null, updatedAt: null }
}

// Re-export col accessor for callers that want to list (future use).
export { timelineEventsCol }
