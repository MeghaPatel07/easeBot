/**
 * First-party reminders service.
 *
 * Replaces the old Google Calendar integration. Writes reminder docs to
 * users/{uid}/reminders via the Admin SDK. The companion in-process scheduler
 * in src/services/reminderScheduler.ts polls these docs and dispatches the
 * notifications.
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'
import { computeEventInstant } from '../utils/dateTime'

export type ReminderChannel = 'email' | 'whatsapp'
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled'
export type ReminderSource = 'chat' | 'manual'

export interface Reminder {
  id: string
  userId: string
  title: string
  description: string | null
  eventAt: Timestamp
  eventDateStr: string
  eventTimeStr: string | null
  leadTimeMinutes: number
  notifyAt: Timestamp
  timezone: string
  channel: ReminderChannel
  status: ReminderStatus
  attemptCount: number
  lastError: string | null
  sentAt: Timestamp | null
  source: ReminderSource
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ReminderInput {
  userId: string
  title: string
  eventDateStr: string
  eventTimeStr?: string | null
  description?: string | null
  leadTimeMinutes?: number
  timezone?: string
  source: ReminderSource
}

const DEFAULT_LEAD_MINUTES = 1440 // 24 hours
const DEFAULT_TIMEZONE = 'Asia/Kolkata'
const MAX_PENDING_PER_USER = 100

interface UserProfileLite {
  email?: string | null
  phone?: string | null
  phoneNumber?: string | null
  name?: string | null
  displayName?: string | null
  timezone?: string | null
}

export class ReminderError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ReminderError'
    this.code = code
  }
}

async function fetchUserProfile(uid: string): Promise<UserProfileLite | null> {
  const snap = await adminDb.doc(`users/${uid}`).get()
  if (!snap.exists) return null
  return snap.data() as UserProfileLite
}

function resolveChannel(profile: UserProfileLite): {
  channel: ReminderChannel
} {
  const hasEmail = !!(profile.email && String(profile.email).trim().length > 0)
  const phone = profile.phone ?? profile.phoneNumber ?? null
  const hasPhone = !!(phone && String(phone).trim().length > 0)
  if (hasEmail) return { channel: 'email' }
  if (hasPhone) return { channel: 'whatsapp' }
  throw new Error('user has no email or phone')
}

export async function createReminderDoc(
  input: ReminderInput,
): Promise<{ id: string; channel: ReminderChannel; notifyAt: Date }> {
  // Validate date format (YYYY-MM-DD) up front so the failure mode is clear
  // to both the LLM (via plannerTools) and the user.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDateStr ?? '')) {
    throw new ReminderError(
      'INVALID_DATE_FORMAT',
      `Invalid date "${input.eventDateStr}". Expected YYYY-MM-DD (e.g. 2026-05-10).`,
    )
  }

  const profile = await fetchUserProfile(input.userId)
  if (!profile) throw new ReminderError('USER_PROFILE_NOT_FOUND', 'user profile not found')
  const { channel } = resolveChannel(profile)

  const timezone = input.timezone || profile.timezone || DEFAULT_TIMEZONE
  const leadTimeMinutes = input.leadTimeMinutes ?? DEFAULT_LEAD_MINUTES

  const eventAtDate = computeEventInstant(
    input.eventDateStr,
    input.eventTimeStr ?? null,
    timezone,
  )
  const notifyAtDate = new Date(eventAtDate.getTime() - leadTimeMinutes * 60_000)

  // Enforce per-user pending cap (max 100 pending reminders).
  const remindersCol = adminDb.collection(`users/${input.userId}/reminders`)
  const pendingSnap = await remindersCol.where('status', '==', 'pending').get()
  if (pendingSnap.size >= MAX_PENDING_PER_USER) {
    throw new Error(
      `pending reminder limit reached (${MAX_PENDING_PER_USER}). Please cancel or wait for existing reminders to fire before adding more.`,
    )
  }

  const ref = await remindersCol.add({
    userId: input.userId,
    title: input.title,
    description: input.description ?? null,
    eventAt: Timestamp.fromDate(eventAtDate),
    eventDateStr: input.eventDateStr,
    eventTimeStr: input.eventTimeStr ?? null,
    leadTimeMinutes,
    notifyAt: Timestamp.fromDate(notifyAtDate),
    timezone,
    channel,
    status: 'pending' as ReminderStatus,
    attemptCount: 0,
    lastError: null,
    sentAt: null,
    source: input.source,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Echo the generated id back into the doc body so frontend reads have it.
  await ref.set({ id: ref.id }, { merge: true })

  return { id: ref.id, channel, notifyAt: notifyAtDate }
}

export interface PendingReminderRow {
  path: string
  data: Reminder
}

/**
 * Fetch up to `limit` reminders that are pending and due (notifyAt <= now),
 * across ALL users, via a Firestore collection-group query.
 *
 * Requires a single-field index on `notifyAt` for the `reminders` collection
 * group plus a composite index `(status ASC, notifyAt ASC)` — Firestore will
 * print the index-creation URL the first time the query runs in production.
 */
export async function listPendingDueReminders(
  limit = 100,
): Promise<PendingReminderRow[]> {
  const nowTs = Timestamp.fromDate(new Date())
  const snap = await adminDb
    .collectionGroup('reminders')
    .where('status', '==', 'pending')
    .where('notifyAt', '<=', nowTs)
    .orderBy('notifyAt', 'asc')
    .limit(limit)
    .get()
  return snap.docs.map((d) => ({
    path: d.ref.path,
    data: { ...(d.data() as Reminder), id: d.id },
  }))
}

export async function markReminderSent(path: string): Promise<void> {
  await adminDb.doc(path).update({
    status: 'sent' as ReminderStatus,
    sentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function markReminderFailed(
  path: string,
  errorMsg: string,
  attemptCount: number,
): Promise<void> {
  const finalStatus: ReminderStatus = attemptCount >= 3 ? 'failed' : 'pending'
  await adminDb.doc(path).update({
    status: finalStatus,
    attemptCount,
    lastError: errorMsg.slice(0, 500),
    updatedAt: FieldValue.serverTimestamp(),
  })
}
