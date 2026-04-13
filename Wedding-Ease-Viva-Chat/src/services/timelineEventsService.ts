import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { TimelineEvent } from '@/types'

// Backend writes to a flat `timelineEvents` collection with `ownerId` as the
// user field. See `easebot-backend/src/services/timelineService.ts`.

function timelineEventsCol() {
  return collection(db, 'timelineEvents')
}

function timelineEventDoc(id: string) {
  return doc(db, 'timelineEvents', id)
}

interface RawTimelineEvent {
  id?: string
  ownerId?: string
  ownerEmail?: string | null
  title?: string
  date?: string
  description?: string | null
  category?: string | null
  source?: 'chat' | 'manual'
  isDeleted?: boolean
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

function tsToDate(ts: Timestamp | null | undefined): Date | null {
  return ts ? (ts.toDate?.() ?? null) : null
}

function mapTimelineEvent(id: string, data: RawTimelineEvent): TimelineEvent {
  return {
    id,
    ownerId: data.ownerId ?? '',
    ownerEmail: data.ownerEmail ?? null,
    title: data.title ?? '',
    date: data.date ?? '',
    description: data.description ?? null,
    category: data.category ?? null,
    source: data.source ?? 'manual',
    isDeleted: data.isDeleted ?? false,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  }
}

/**
 * Subscribe to the current user's timeline events. Degrades gracefully on
 * Firestore permission errors (logs + emits an empty array) so the Timeline
 * tab keeps working even if rules haven't been deployed yet.
 */
export function subscribeToTimelineEvents(
  userId: string,
  callback: (events: TimelineEvent[]) => void,
): Unsubscribe {
  if (!userId) {
    callback([])
    return () => {}
  }
  const q = query(timelineEventsCol(), where('ownerId', '==', userId))
  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs
        .map((d) => mapTimelineEvent(d.id, d.data() as RawTimelineEvent))
        .filter((e) => !e.isDeleted)
      callback(events)
    },
    (err) => {
      console.error('[subscribeToTimelineEvents]', err.message)
      // Graceful degradation: emit empty list so UI doesn't crash.
      callback([])
    },
  )
}

export async function deleteTimelineEvent(eventId: string): Promise<void> {
  await deleteDoc(timelineEventDoc(eventId))
}
