import * as admin from 'firebase-admin'

const db = admin.firestore()

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Atomically increments token usage counters on the user document.
 * Stored under users/{uid}.usage — won't overwrite other user fields.
 */
export async function trackTokens(uid: string, usage: TokenUsage): Promise<void> {
  const ref = db.collection('users').doc(uid)
  await ref.set(
    {
      usage: {
        totalPromptTokens: admin.firestore.FieldValue.increment(usage.promptTokens),
        totalCompletionTokens: admin.firestore.FieldValue.increment(usage.completionTokens),
        totalTokens: admin.firestore.FieldValue.increment(usage.totalTokens),
        requestCount: admin.firestore.FieldValue.increment(1),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  )
}
