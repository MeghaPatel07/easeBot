/**
 * guestCleanupCron — in-process fallback for Firestore guest-doc TTL.
 *
 * The preferred path is a Firestore TTL policy on `guests/{guestId}.ttlExpiresAt`
 * (enabled via the Firebase console — see FIREBASE_CONSOLE_CHECKLIST §3.1).
 * This cron ships regardless so the collection is bounded even if the human
 * forgets to flip the console switch.
 *
 * Runs every hour. Each tick deletes up to 50 expired docs. Safe to run
 * concurrently with Firestore's native TTL sweep — both just delete.
 */

import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../lib/firebaseAdmin'

const TICK_INTERVAL_MS = 60 * 60 * 1000 // 1h
const MAX_DELETES_PER_TICK = 50

let started = false
let timer: NodeJS.Timeout | null = null

async function tick(): Promise<void> {
  try {
    const now = Timestamp.fromDate(new Date())
    const snap = await adminDb
      .collection('guests')
      .where('ttlExpiresAt', '<', now)
      .limit(MAX_DELETES_PER_TICK)
      .get()
    if (snap.empty) return
    let deleted = 0
    for (const docSnap of snap.docs) {
      try {
        await docSnap.ref.delete()
        deleted++
      } catch (err) {
        console.warn('[guestCleanupCron] delete failed', docSnap.id, err)
      }
    }
    if (deleted > 0) {
      console.log('[guestCleanupCron] tick deleted', { count: deleted })
    }
  } catch (err) {
    // Don't crash the process — this is a fallback path. If Firestore is
    // unreachable the next tick tries again.
    console.warn('[guestCleanupCron] tick failed', err)
  }
}

export function startGuestCleanupCron(): void {
  if (started) return
  started = true
  // First tick immediately (catches docs that expired while the process was down),
  // then every hour.
  tick().catch(() => {})
  timer = setInterval(() => {
    tick().catch(() => {})
  }, TICK_INTERVAL_MS)
  if (timer.unref) timer.unref()
  console.log('[guestCleanupCron] started (1h interval)')
}

export function stopGuestCleanupCron(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
