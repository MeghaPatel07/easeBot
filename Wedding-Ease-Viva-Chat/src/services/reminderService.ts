import { api, apiAll, invalidate, liveQuery } from './apiClient'
import type { Timestamp } from '@/lib/timestamp'
import type { ReminderDoc, UserProfile } from '@/types'

type Unsubscribe = () => void
const TOPIC = 'reminders'
/** Signed-in identity as the services need it (was a Firebase `User`). */
type Actor = { uid: string }

export interface ReminderInput {
  title: string
  eventDateStr: string                // YYYY-MM-DD
  eventTimeStr: string | null         // HH:MM or null for all-day
  description?: string | null
  leadTimeMinutes: number             // minutes before event to notify
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface RawReminder extends Omit<ReminderDoc, 'eventAt' | 'notifyAt' | 'sentAt' | 'createdAt' | 'updatedAt'> {
  eventAt: Timestamp | null
  notifyAt: Timestamp | null
  sentAt: Timestamp | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

const d = (ts: Timestamp | null | undefined): Date => ts?.toDate() ?? new Date()
const dn = (ts: Timestamp | null | undefined): Date | null => (ts ? ts.toDate() : null)

function mapReminder(r: RawReminder): ReminderDoc {
  return {
    ...r,
    description: r.description ?? null,
    eventTimeStr: r.eventTimeStr ?? null,
    lastError: r.lastError ?? null,
    eventAt: d(r.eventAt), notifyAt: d(r.notifyAt), sentAt: dn(r.sentAt), createdAt: d(r.createdAt), updatedAt: d(r.updatedAt),
  }
}

/**
 * Tier limits (`maxActiveReminders`) and the delivery channel (email vs WhatsApp) are decided server-side now; a limit hit
 * surfaces as an `ApiError` whose message is the same upgrade copy the UI used to build locally.
 */
export async function createReminder(_user: Actor, _profile: UserProfile | null, input: ReminderInput): Promise<ReminderDoc> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')
  if (!input.eventDateStr) throw new Error('Date is required.')
  if (typeof input.leadTimeMinutes !== 'number' || input.leadTimeMinutes < 0) throw new Error('Invalid lead time.')
  const created = await api<RawReminder>('/reminders', { json: { title, description: input.description?.trim() || null, eventDateStr: input.eventDateStr, eventTimeStr: input.eventTimeStr || null, leadTimeMinutes: input.leadTimeMinutes, timezone: resolveTimezone() } })
  invalidate(TOPIC)
  return mapReminder(created)
}

export async function updateReminder(_userId: string, reminderId: string, input: ReminderInput): Promise<void> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')
  if (!input.eventDateStr) throw new Error('Date is required.')
  await api(`/reminders/${reminderId}`, { method: 'PUT', json: { title, description: input.description?.trim() || null, eventDateStr: input.eventDateStr, eventTimeStr: input.eventTimeStr || null, leadTimeMinutes: input.leadTimeMinutes, timezone: resolveTimezone() } })
  invalidate(TOPIC)
}

export async function deleteReminder(_userId: string, reminderId: string): Promise<void> {
  await api(`/reminders/${reminderId}`, { method: 'DELETE' })
  invalidate(TOPIC)
}

export async function listReminders(_userId: string): Promise<ReminderDoc[]> {
  return (await apiAll<RawReminder>('/reminders')).map(mapReminder)
}

export function subscribeToReminders(_userId: string, callback: (reminders: ReminderDoc[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => listReminders(_userId), callback)
}
