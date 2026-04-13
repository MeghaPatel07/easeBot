/**
 * Gallery service — fetches AI-generated images from Firestore `userImages` collection.
 */
import { collection, query, where, orderBy, limit as fsLimit, getDocs, deleteDoc, updateDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import { ref, deleteObject, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import type { GalleryFilter } from '@/types'

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
  type: 'generated' | 'edited' | 'uploaded'
  parentImageId: string | null
  category: ImageCategory
  pinned: boolean
  createdAt: Timestamp
  vibeId?: string | null
  vibeDescriptors?: string[] | null
}

/**
 * Fetch all generated images for a user from Firestore.
 */
export async function getUserImages(
  userId: string,
  options: {
    category?: ImageCategory
    maxResults?: number
    filter?: GalleryFilter
    vibeId?: string | null
  } = {}
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

    const images = snap.docs.map(d => d.data() as UserImage)

    // Client-side filter
    const filter: GalleryFilter = options.filter ?? 'all'
    switch (filter) {
      case 'all':
        return images
      case 'generated':
        return images.filter(img => img.type === 'generated')
      case 'edited':
        return images.filter(img => img.type === 'edited')
      case 'uploaded':
        return images.filter(img => img.type === 'uploaded')
      case 'current-vibe': {
        const vibeId = options.vibeId ?? null
        if (!vibeId) return []
        return images.filter(img => img.vibeId === vibeId)
      }
      default:
        return images
    }
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

/**
 * Upload a user-supplied image directly to Firebase Storage and register it in
 * the `userImages` Firestore collection so it shows up in the gallery.
 */
export async function uploadUserImage(
  userId: string,
  file: File,
  category: ImageCategory = 'other'
): Promise<UserImage> {
  if (!file) {
    throw new Error('No file selected.')
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed.')
  }
  const MAX_BYTES = 10 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    throw new Error('Image must be smaller than 10MB.')
  }
  if (!userId) {
    throw new Error('You must be signed in to upload images.')
  }

  const id = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `userImages/${userId}/${id}-${safeName}`

  try {
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: { userId, uploadedBy: 'client' },
    })
    const url = await getDownloadURL(storageRef)

    const data: UserImage = {
      id,
      userId,
      url,
      prompt: '',
      enhancedPrompt: '',
      mode: 'upload',
      threadId: null,
      aspectRatio: '1:1',
      type: 'uploaded',
      parentImageId: null,
      category,
      pinned: false,
      createdAt: Timestamp.now(),
    }

    await setDoc(doc(db, 'userImages', id), data)
    return data
  } catch (err: any) {
    console.error('[galleryService] uploadUserImage error:', err)
    const message = err?.message || 'Failed to upload image.'
    throw new Error(message)
  }
}
