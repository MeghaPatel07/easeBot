/**
 * Gallery service — fetches AI-generated images from Firestore `userImages` collection.
 */
import { collection, query, where, orderBy, limit as fsLimit, getDocs, deleteDoc, updateDoc, doc, Timestamp } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

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
 * Delete an image fully: remove from userImages collection, delete from Firebase Storage,
 * and mark the corresponding chat message as imageDeleted.
 * Returns the image URL so callers can update local state if needed.
 */
export async function deleteUserImage(imageId: string): Promise<string | null> {
  // 1. Read the userImages doc to get url and threadId
  const imgSnap = await getDocs(query(collection(db, 'userImages'), where('id', '==', imageId), fsLimit(1)))
  const imgData = imgSnap.docs[0]?.data() as UserImage | undefined
  const imageUrl = imgData?.url ?? null
  const threadId = imgData?.threadId ?? null

  // 2. Delete the userImages doc
  await deleteDoc(doc(db, 'userImages', imageId))

  // 3. Delete the file from Firebase Storage (best-effort)
  if (imageUrl) {
    try {
      const storageRef = ref(storage, imageUrl)
      await deleteObject(storageRef)
    } catch {
      // External URL or already deleted — fine
    }
  }

  // 4. Find and update the chat message that contains this image URL
  if (threadId && imageUrl) {
    try {
      const msgsSnap = await getDocs(collection(db, 'chats', threadId, 'messages'))
      for (const msgDoc of msgsSnap.docs) {
        const data = msgDoc.data()
        const urls: string[] = data.imageUrls ?? []
        const singleUrl: string | null = data.imageUrl ?? null

        if (urls.includes(imageUrl) || singleUrl === imageUrl) {
          const filtered = urls.filter((u: string) => u !== imageUrl)
          const newSingleUrl = singleUrl === imageUrl ? (filtered[0] ?? null) : singleUrl
          const allGone = filtered.length === 0 && !newSingleUrl
          await updateDoc(msgDoc.ref, {
            imageUrls: filtered,
            imageUrl: newSingleUrl,
            ...(allGone ? { imageDeleted: true } : {}),
          })
          break
        }
      }
    } catch (err) {
      console.error('[galleryService] Failed to update chat message after image delete:', err)
    }
  }

  return imageUrl
}
