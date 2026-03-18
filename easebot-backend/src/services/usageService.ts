import { doc, updateDoc, setDoc, getDoc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Atomically increments the token usage counters on the user's Firestore document.
 * If the usage map doesn't exist yet, initialises it first then increments.
 */
export async function incrementUserUsage(uid: string, usage: TokenUsage): Promise<void> {
  console.log(`[usageService] incrementUserUsage called — uid=${uid}`, usage)

  const userRef = doc(db, 'users', uid)

  try {
    // Check if usage map exists — if not, initialise it so increment() works
    const snap = await getDoc(userRef)
    if (!snap.exists()) {
      console.warn(`[usageService] User doc not found for uid=${uid}`)
      return
    }

    const data = snap.data()
    if (!data.usage) {
      console.log(`[usageService] usage map absent — initialising for uid=${uid}`)
      await setDoc(userRef, {
        usage: {
          totalPromptTokens:     0,
          totalCompletionTokens: 0,
          totalTokens:           0,
          requestCount:          0,
          lastUpdatedAt:         null,
        },
      }, { merge: true })
    }

    await updateDoc(userRef, {
      'usage.totalPromptTokens':     increment(usage.promptTokens),
      'usage.totalCompletionTokens': increment(usage.completionTokens),
      'usage.totalTokens':           increment(usage.totalTokens),
      'usage.requestCount':          increment(1),
      'usage.lastUpdatedAt':         serverTimestamp(),
    })

    console.log(`[usageService] ✓ usage updated — uid=${uid} +${usage.totalTokens} tokens`)
  } catch (err) {
    console.error(`[usageService] ✗ failed to update usage for uid=${uid}`, err)
    throw err
  }
}
