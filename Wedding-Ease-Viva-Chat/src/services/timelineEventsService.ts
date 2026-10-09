import { apiAll, api, invalidate, liveQuery } from './apiClient'
import type { Timestamp } from '@/lib/timestamp'
import type { TimelineEvent } from '@/types'

type Unsubscribe = () => void
const TOPIC = 'timeline'

interface RawTimelineEvent {
  id: string
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

const tsToDate = (ts: Timestamp | null | undefined): Date | null => (ts ? ts.toDate() : null)

function mapTimelineEvent(data: RawTimelineEvent): TimelineEvent {
  return {
    id: data.id,
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

/** Live list of the signed-in user's (non-deleted) timeline events. */
export function subscribeToTimelineEvents(userId: string, callback: (events: TimelineEvent[]) => void): Unsubscribe {
  if (!userId) {
    callback([])
    return () => {}
  }
  return liveQuery(TOPIC, async () => (await apiAll<RawTimelineEvent>('/timeline-events')).map(mapTimelineEvent).filter((e) => !e.isDeleted), callback, { onError: () => callback([]) })
}

export async function deleteTimelineEvent(eventId: string): Promise<void> {
  await api(`/timeline-events/${eventId}`, { method: 'DELETE' })
  invalidate(TOPIC)
}
