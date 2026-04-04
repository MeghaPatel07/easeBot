/**
 * Gallery service — fetches AI-generated images from Firestore `userImages` collection.
 */
import { collection, query, where, orderBy, limit as fsLimit, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type ImageCategory = 'attire' | 'venue' | 'decor' | 'cake' | 'flowers' | 'invitation' | 'other'

export interface UserImage {
  id: string
  userId: string
  url: string
  prompt: string
  enhancedPrompt: string
  mode: string
  threadId: string | null
  aspectRatio: string
  type: 'generated' | 'edited'
  parentImageId: string | null
  category: ImageCategory
  pinned: boolean
  createdAt: Timestamp
}

/**
 * Fetch all generated images for a user from Firestore.
 */
export async function getUserImages(
  userId: string,
  options: { category?: ImageCategory; maxResults?: number } = {}
): Promise<UserImage[]> {
  try {
    const constraints: any[] = [
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    ]

    if (options.category) {
      constraints.push(where('category', '==', options.category))
    }

    constraints.push(fsLimit(options.maxResults ?? 100))

    const q = query(collection(db, 'userImages'), ...constraints)
    const snap = await getDocs(q)

    return snap.docs.map(d => d.data() as UserImage)
  } catch (err) {
    console.error('[galleryService] getUserImages error:', err)
    return []
  }
}

/**
 * Delete an image from Firestore.
 */
export async function deleteUserImage(imageId: string): Promise<void> {
  await deleteDoc(doc(db, 'userImages', imageId))
}
