import {
  collection, doc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

function timelineEventsCol() {
  return collection(db, 'timelineEvents')
}

function timelineEventRef(eventId: string) {
  return doc(db, 'timelineEvents', eventId)
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
  const now = serverTimestamp()
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
  await setDoc(timelineEventRef(id), eventData)
  return { ...eventData, createdAt: null, updatedAt: null }
}

// Re-export col accessor for callers that want to list (future use).
export { timelineEventsCol }
