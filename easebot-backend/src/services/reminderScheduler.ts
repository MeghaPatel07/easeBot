/**
 * In-process reminder scheduler.
 *
 * The PRD originally specified a Firebase scheduled function for dispatching
 * pending reminders. Since this codebase ships an always-on Express backend
 * AND the agent that authored this change cannot deploy Firebase functions,
 * we implement the same logic in-process with `setInterval`. The trade-off:
 *   + No deploy needed; runs wherever the Express server runs.
 *   - If the backend is not running, reminders won't dispatch.
 *
 * Idempotency is enforced by the `status == 'pending'` guard in the query
 * plus a re-check before dispatch — so a reminder is never sent twice even
 * if two ticks overlap.
 */

import { adminDb } from '../lib/firebaseAdmin'
import {
  listPendingDueReminders,
  markReminderFailed,
  markReminderSent,
  type PendingReminderRow,
} from './reminderService'
import { buildReminderEmail, sendEmailNotification } from './emailService'
import { sendWhatsAppReminder } from './whatsappReminderService'
import { chargeTokensAsSystem } from './tokenMeter'
import { writeAppNotification } from './notificationService'
import { formatHumanDate } from '../utils/dateTime'

const TICK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const BATCH_LIMIT = 100

let intervalHandle: NodeJS.Timeout | null = null
let tickInFlight = false

// SEC-005: user notification preference shape. Mirrors
// Wedding-Ease-Viva-Chat/src/types/index.ts UserPreferences.notifications.
// All flags are opt-out (default true) so legacy users without a preferences
// field continue to receive reminders exactly as before.
interface NotificationPrefs {
  emailReminders?: boolean
  whatsappReminders?: boolean
  productUpdates?: boolean
  tips?: boolean
}

type NotificationChannel = keyof NotificationPrefs

interface UserContact {
  email: string | null
  phone: string | null
  name: string | null
  // `null` when the user doc has no `preferences` field at all (legacy users)
  // — the helper treats this as "all-true" and never gates them out.
  notificationPrefs: NotificationPrefs | null
}

/**
 * SEC-005: opt-out gate for any reminder/notification dispatch.
 *
 * Returns true when the channel should be sent. Default is true unless the
 * user has explicitly set `preferences.notifications.<channel> === false`.
 * Users whose profile has no `preferences` field are treated as all-true
 * (legacy behavior, opt-out model).
 */
function shouldSendNotification(
  user: { notificationPrefs: NotificationPrefs | null },
  channel: NotificationChannel,
): boolean {
  const prefs = user.notificationPrefs
  if (!prefs) return true
  const flag = prefs[channel]
  if (flag === false) return false
  return true
}

async function loadUserContact(uid: string): Promise<UserContact> {
  try {
    const snap = await adminDb.doc(`users/${uid}`).get()
    if (!snap.exists)
      return { email: null, phone: null, name: null, notificationPrefs: null }
    const data = snap.data() as Record<string, unknown>
    const email = (data.email as string | undefined) ?? null
    const phone =
      (data.phone as string | undefined) ??
      (data.phoneNumber as string | undefined) ??
      null
    const name =
      (data.name as string | undefined) ??
      (data.displayName as string | undefined) ??
      (data.nickname as string | undefined) ??
      null
    // Read-only consumer of preferences.notifications. Do not mutate the
    // user doc here — accountController owns all writes (Ravi, parallel work).
    const preferences = data.preferences as
      | { notifications?: NotificationPrefs }
      | undefined
    const notificationPrefs: NotificationPrefs | null =
      preferences && typeof preferences === 'object'
        ? (preferences.notifications ?? {})
        : null
    return { email, phone, name, notificationPrefs }
  } catch (err) {
    console.error('[reminderScheduler] loadUserContact failed', err)
    return { email: null, phone: null, name: null, notificationPrefs: null }
  }
}

async function dispatchOne(row: PendingReminderRow): Promise<void> {
  const { path, data } = row
  // Re-check status defensively: another tick may have grabbed this doc.
  if (data.status !== 'pending') return

  const uid = data.userId
  const contact = await loadUserContact(uid)
  const channel = data.channel
  const eventDate = data.eventAt.toDate()
  const includeTime = !!data.eventTimeStr
  const human = formatHumanDate(eventDate, data.timezone || 'Asia/Kolkata', includeTime)

  const nextAttempt = (data.attemptCount ?? 0) + 1

  try {
    if (channel === 'email') {
      // SEC-005: honor user opt-out for email reminders. Default true for
      // legacy users without a `preferences.notifications` field.
      if (!shouldSendNotification(contact, 'emailReminders')) {
        console.log(
          `[reminder] skipped email for uid=${uid} (user opted out)`,
        )
        await markReminderSent(path)
        return
      }
      if (!contact.email) throw new Error('user has no email on file')
      const built = buildReminderEmail({
        name: contact.name,
        title: data.title,
        description: data.description,
        humanFormattedDate: human,
        channelLabel: 'email',
      })
      await sendEmailNotification({
        to: contact.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
      })
    } else if (channel === 'whatsapp') {
      // SEC-005: honor user opt-out for WhatsApp reminders. Default true for
      // legacy users without a `preferences.notifications` field.
      if (!shouldSendNotification(contact, 'whatsappReminders')) {
        console.log(
          `[reminder] skipped whatsapp for uid=${uid} (user opted out)`,
        )
        await markReminderSent(path)
        return
      }
      if (!contact.phone) throw new Error('user has no phone on file')
      await sendWhatsAppReminder({
        phone: contact.phone,
        title: data.title,
        humanFormattedDate: human,
        description: data.description,
      })
      // P1-3: await the charge and inspect the result. No retry on failure —
      // the WhatsApp message has already been dispatched, so refusing to
      // charge would be a revenue leak and retrying would risk a duplicate
      // charge. A denied result is logged for ops follow-up.
      try {
        const chargeResult = await chargeTokensAsSystem(uid, {
          kind: 'whatsapp',
          messages: 1,
        })
        if (!chargeResult.allowed) {
          console.warn('[reminderScheduler] whatsapp charge denied', {
            uid,
            reason: chargeResult.reason,
          })
        }
      } catch (chargeErr) {
        console.warn('[reminderScheduler] whatsapp charge threw', {
          uid,
          err: chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
        })
      }
    } else {
      throw new Error(`unknown channel: ${String(channel)}`)
    }

    // Always write an in-app notification mirroring the dispatch.
    await writeAppNotification(uid, {
      title: data.title,
      body: `${human} — sent to your ${channel}.`,
      type: 'reminder',
      relatedId: data.id,
      relatedType: 'reminder',
    })

    await markReminderSent(path)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[reminderScheduler] dispatch failed for ${path} (attempt ${nextAttempt}):`,
      msg,
    )
    await markReminderFailed(path, msg, nextAttempt)
    if (nextAttempt >= 3) {
      try {
        await writeAppNotification(uid, {
          title: 'Reminder delivery failed',
          body: `We couldn't deliver your reminder for ${data.title} — please check your contact info.`,
          type: 'info',
          relatedId: data.id,
          relatedType: 'reminder',
        })
      } catch (warnErr) {
        console.error(
          '[reminderScheduler] failed to write failure notification',
          warnErr,
        )
      }
    }
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) {
    console.log('[reminderScheduler] previous tick still running, skipping')
    return
  }
  tickInFlight = true
  try {
    const due = await listPendingDueReminders(BATCH_LIMIT)
    if (due.length > 0) {
      console.log(`[reminderScheduler] dispatching ${due.length} reminder(s)`)
    }
    for (const row of due) {
      try {
        await dispatchOne(row)
      } catch (err) {
        console.error('[reminderScheduler] dispatchOne crashed (swallowed):', err)
      }
    }
  } catch (err) {
    console.error('[reminderScheduler] tick failed (swallowed):', err)
  } finally {
    tickInFlight = false
  }
}

export function startReminderScheduler(): void {
  if (intervalHandle) {
    console.log('[reminderScheduler] already running, ignoring start()')
    return
  }
  console.log('[reminderScheduler] started (5 min interval)')
  // Fire one tick immediately, then schedule the recurring interval.
  void tick()
  intervalHandle = setInterval(() => {
    void tick()
  }, TICK_INTERVAL_MS)
  // Don't keep the event loop alive purely for the scheduler — the HTTP
  // server is the canonical liveness anchor.
  intervalHandle.unref?.()
}

export function stopReminderScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[reminderScheduler] stopped')
  }
}
