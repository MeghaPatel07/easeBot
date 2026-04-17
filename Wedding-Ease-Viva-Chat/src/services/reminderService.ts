import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '@/lib/firebase'
import type { ReminderDoc, UserProfile } from '@/types'
import { isDerivedPhoneEmail } from '@/services/authService'
import { resolveTier, getLimits, type PlanTier } from '@/config/tierConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReminderInput {
  title: string
  eventDateStr: string                // YYYY-MM-DD
  eventTimeStr: string | null         // HH:MM or null for all-day
  description?: string | null
  leadTimeMinutes: number             // minutes before event to notify
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function remindersCol(userId: string) {
  return collection(db, 'users', userId, 'reminders')
}

function reminderDocRef(userId: string, reminderId: string) {
  return doc(db, 'users', userId, 'reminders', reminderId)
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Resolve the notification channel from the user's primary auth provider.
 * WhatsApp is gated to Pro+ tiers per PRICING_PRD §4.
 *  - password / google.com → email
 *  - phone + Pro/ProMax    → whatsapp
 *  - phone + Free          → email (with fallback warning)
 *  - fallback: email if profile has email, else whatsapp if eligible
 *  - throws if neither is available
 */
function resolveChannel(user: User, profile: UserProfile | null): 'email' | 'whatsapp' {
  const tier = resolveTier(profile)
  const limits = getLimits(tier)
  const whatsappAllowed = limits.reminderChannels.includes('whatsapp')

  const providerId = user.providerData?.[0]?.providerId

  if (providerId === 'password' || providerId === 'google.com') return 'email'
  if (providerId === 'phone') {
    // Phone-auth users get WhatsApp only if their tier allows it
    if (whatsappAllowed) return 'whatsapp'
    // Fall through to email if they have one
    const hasRealEmail = !!(profile?.email && !isDerivedPhoneEmail(profile.email))
    if (hasRealEmail) return 'email'
    // Phone-only free user with no email — still use email (the derived one)
    return 'email'
  }

  // Fallback: prefer email if we have a real one, else whatsapp if eligible
  const hasRealEmail = !!(profile?.email && !isDerivedPhoneEmail(profile.email))
  if (hasRealEmail) return 'email'
  if (profile?.phone && whatsappAllowed) return 'whatsapp'
  if (profile?.phone) return 'email' // Free tier: fall back to email
  throw new Error('Cannot create reminder: account has no email or phone for notifications.')
}

function computeEventAt(eventDateStr: string, eventTimeStr: string | null): Date {
  const [y, m, d] = eventDateStr.split('-').map(Number)
  if (!y || !m || !d) throw new Error('Invalid event date')
  if (eventTimeStr) {
    const [hh, mm] = eventTimeStr.split(':').map(Number)
    return new Date(y, (m - 1), d, hh || 0, mm || 0, 0, 0)
  }
  // All-day: midnight local time
  return new Date(y, (m - 1), d, 0, 0, 0, 0)
}

// Legacy flat cap removed — now tier-based via TIER_LIMITS.maxActiveReminders

// ── Maps a Firestore doc to a JS-friendly ReminderDoc with Date objects. ────

interface RawReminder {
  id?: string
  userId?: string
  title?: string
  description?: string | null
  eventAt?: Timestamp | null
  eventDateStr?: string
  eventTimeStr?: string | null
  leadTimeMinutes?: number
  notifyAt?: Timestamp | null
  timezone?: string
  channel?: 'email' | 'whatsapp'
  status?: 'pending' | 'sent' | 'failed' | 'cancelled'
  attemptCount?: number
  lastError?: string | null
  sentAt?: Timestamp | null
  source?: 'chat' | 'manual'
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

function tsToDate(ts: Timestamp | null | undefined): Date {
  return ts?.toDate?.() ?? new Date()
}

function tsToDateOrNull(ts: Timestamp | null | undefined): Date | null {
  return ts ? (ts.toDate?.() ?? null) : null
}

function mapReminder(id: string, data: RawReminder): ReminderDoc {
  return {
    id,
    userId: data.userId ?? '',
    title: data.title ?? '',
    description: data.description ?? null,
    eventAt: tsToDate(data.eventAt),
    eventDateStr: data.eventDateStr ?? '',
    eventTimeStr: data.eventTimeStr ?? null,
    leadTimeMinutes: data.leadTimeMinutes ?? 0,
    notifyAt: tsToDate(data.notifyAt),
    timezone: data.timezone ?? 'UTC',
    channel: data.channel ?? 'email',
    status: data.status ?? 'pending',
    attemptCount: data.attemptCount ?? 0,
    lastError: data.lastError ?? null,
    sentAt: tsToDateOrNull(data.sentAt),
    source: data.source ?? 'manual',
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createReminder(
  user: User,
  profile: UserProfile | null,
  input: ReminderInput,
): Promise<ReminderDoc> {
  if (!user?.uid) throw new Error('You must be signed in to create reminders.')

  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')
  if (!input.eventDateStr) throw new Error('Date is required.')
  if (typeof input.leadTimeMinutes !== 'number' || input.leadTimeMinutes < 0) {
    throw new Error('Invalid lead time.')
  }

  // Enforce tier-based active-reminder cap (Free=3, Pro/ProMax=unlimited)
  const tier = resolveTier(profile)
  const limits = getLimits(tier)
  const maxReminders = limits.maxActiveReminders

  if (maxReminders !== null) {
    const pendingSnap = await getDocs(
      query(remindersCol(user.uid), where('status', '==', 'pending')),
    )
    if (pendingSnap.size >= maxReminders) {
      throw new Error(
        `Reminder limit reached (${pendingSnap.size}/${maxReminders}). ` +
        (tier === 'free'
          ? 'Upgrade to Pro for unlimited reminders, or delete existing ones to free up a slot.'
          : 'Delete old reminders to add new ones.'),
      )
    }
  }

  const channel = resolveChannel(user, profile)
  const timezone = resolveTimezone()
  const eventAt = computeEventAt(input.eventDateStr, input.eventTimeStr)
  const notifyAt = new Date(eventAt.getTime() - input.leadTimeMinutes * 60_000)

  const payload = {
    userId: user.uid,
    title,
    description: input.description?.trim() || null,
    eventAt: Timestamp.fromDate(eventAt),
    eventDateStr: input.eventDateStr,
    eventTimeStr: input.eventTimeStr || null,
    leadTimeMinutes: input.leadTimeMinutes,
    notifyAt: Timestamp.fromDate(notifyAt),
    timezone,
    channel,
    status: 'pending' as const,
    attemptCount: 0,
    lastError: null,
    sentAt: null as Timestamp | null,
    source: 'manual' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(remindersCol(user.uid), payload)
  // Stamp the id field to match contract
  await updateDoc(ref, { id: ref.id })

  return {
    id: ref.id,
    userId: user.uid,
    title,
    description: payload.description,
    eventAt,
    eventDateStr: payload.eventDateStr,
    eventTimeStr: payload.eventTimeStr,
    leadTimeMinutes: payload.leadTimeMinutes,
    notifyAt,
    timezone,
    channel,
    status: 'pending',
    attemptCount: 0,
    lastError: null,
    sentAt: null,
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function updateReminder(
  userId: string,
  reminderId: string,
  input: ReminderInput,
): Promise<void> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')
  if (!input.eventDateStr) throw new Error('Date is required.')

  const timezone = resolveTimezone()
  const eventAt = computeEventAt(input.eventDateStr, input.eventTimeStr)
  const notifyAt = new Date(eventAt.getTime() - input.leadTimeMinutes * 60_000)

  await updateDoc(reminderDocRef(userId, reminderId), {
    title,
    description: input.description?.trim() || null,
    eventAt: Timestamp.fromDate(eventAt),
    eventDateStr: input.eventDateStr,
    eventTimeStr: input.eventTimeStr || null,
    leadTimeMinutes: input.leadTimeMinutes,
    notifyAt: Timestamp.fromDate(notifyAt),
    timezone,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteReminder(userId: string, reminderId: string): Promise<void> {
  await deleteDoc(reminderDocRef(userId, reminderId))
}

export async function listReminders(userId: string): Promise<ReminderDoc[]> {
  const snap = await getDocs(query(remindersCol(userId), orderBy('eventAt', 'desc')))
  return snap.docs.map(d => mapReminder(d.id, d.data() as RawReminder))
}

export function subscribeToReminders(
  userId: string,
  callback: (reminders: ReminderDoc[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(remindersCol(userId), orderBy('eventAt', 'desc')),
    (snapshot) => {
      const reminders = snapshot.docs.map(d => mapReminder(d.id, d.data() as RawReminder))
      callback(reminders)
    },
    (err) => console.error('[subscribeToReminders]', err.message),
  )
}
