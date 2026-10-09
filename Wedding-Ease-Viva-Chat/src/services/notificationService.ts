import { api, apiAll, invalidate, liveQuery } from './apiClient'

type Unsubscribe = () => void
const TOPIC = 'notifications'
const touch = <T>(p: Promise<T>) => p.then((r) => { invalidate(TOPIC); return r })

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

export function subscribeToNotifications(_userId: string, callback: (notifs: AppNotification[]) => void): Unsubscribe {
  return liveQuery(TOPIC, async () => (await apiAll<AppNotification>('/notifications', 5)), callback, { intervalMs: 45_000 })
}

export async function markAsRead(_userId: string, notifId: string): Promise<void> {
  await touch(api(`/notifications/${notifId}`, { method: 'PATCH' }))
}

export async function markAllAsRead(_userId: string, notifs: AppNotification[]): Promise<void> {
  if (!notifs.some((n) => !n.read)) return
  await touch(api('/notifications', { method: 'POST' }))
}

export async function deleteNotification(_userId: string, notifId: string): Promise<void> {
  await touch(api(`/notifications/${notifId}`, { method: 'DELETE' }))
}

/** Overdue-task notifications are generated (and de-duplicated) server-side; the checklists argument is kept for call-site compatibility. */
export async function generateOverdueNotifications(_userId: string, _checklists?: unknown): Promise<void> {
  const r = await api<{ created: number }>('/notifications/overdue', { method: 'POST' })
  if (r.created > 0) invalidate(TOPIC)
}
