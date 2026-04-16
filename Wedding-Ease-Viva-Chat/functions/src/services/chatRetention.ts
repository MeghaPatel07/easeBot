// ─────────────────────────────────────────────────────────────────────────────
// Chat History Retention — PRICING_PRD §4.
// Free users: 30-day rolling window. Messages older than 30 days are deleted.
// Pro / Pro Max: unlimited retention.
// Called via a Cloud Scheduler cron (daily) or on-demand.
// ─────────────────────────────────────────────────────────────────────────────

import * as admin from 'firebase-admin'
import { resolveTier, getLimits } from '../config/tierConfig'

const db = admin.firestore()

/**
 * Delete chat messages older than the retention window for a single user.
 * Returns the count of messages deleted.
 */
async function enforceRetentionForUser(uid: string): Promise<number> {
  const profileSnap = await db.collection('users').doc(uid).get()
  const tier = resolveTier(profileSnap.exists ? profileSnap.data() as any : null)
  const limits = getLimits(tier)

  // Null retention = unlimited — skip
  if (limits.chatRetentionDays === null) return 0
  if (limits.chatRetentionDays <= 0) return 0

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - limits.chatRetentionDays)
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff)

  // Find threads with messages older than cutoff
  const threadsSnap = await db.collection('chats')
    .where('userId', '==', uid)
    .get()

  let totalDeleted = 0

  for (const threadDoc of threadsSnap.docs) {
    const oldMessages = await threadDoc.ref
      .collection('messages')
      .where('timestamp', '<', cutoffTs)
      .limit(500) // batch to avoid memory issues
      .get()

    if (oldMessages.empty) continue

    const batch = db.batch()
    for (const msgDoc of oldMessages.docs) {
      batch.delete(msgDoc.ref)
    }
    await batch.commit()
    totalDeleted += oldMessages.size
  }

  return totalDeleted
}

/**
 * Run retention enforcement for all free-tier users.
 * Designed to be called by a Cloud Scheduler job daily.
 */
export async function enforceAllRetention(): Promise<{ usersProcessed: number; messagesDeleted: number }> {
  // Query all users on free tier
  const freeUsers = await db.collection('users')
    .where('plan', 'in', ['free', null])
    .limit(1000) // process in batches
    .get()

  let usersProcessed = 0
  let messagesDeleted = 0

  for (const userDoc of freeUsers.docs) {
    try {
      const deleted = await enforceRetentionForUser(userDoc.id)
      if (deleted > 0) {
        console.log(`[chatRetention] ${userDoc.id}: deleted ${deleted} messages`)
        messagesDeleted += deleted
      }
      usersProcessed++
    } catch (err) {
      console.error(`[chatRetention] failed for ${userDoc.id}:`, err)
    }
  }

  return { usersProcessed, messagesDeleted }
}

export { enforceRetentionForUser }
