/**
 * Image storage service — uploads generated images to Firebase Storage
 * and saves metadata to Firestore `userImages` collection.
 */
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, doc, setDoc, getDocs, query, where, orderBy, limit as fsLimit, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Mode } from '../types'
import crypto from 'crypto'

// ── Types ───────────────────────────────────────────────────────────────────────

export type ImageCategory = 'attire' | 'venue' | 'decor' | 'cake' | 'flowers' | 'invitation' | 'other'

export interface UserImage {
  id: string
  userId: string
  url: string
  prompt: string
  enhancedPrompt: string
  mode: Mode
  threadId: string | null
  aspectRatio: string
  type: 'generated' | 'edited'
  parentImageId: string | null
  category: ImageCategory
  pinned: boolean
  createdAt: Timestamp
}

export interface StoreImageMetadata {
  prompt: string
  enhancedPrompt: string
  mode: Mode
  threadId?: string | null
  aspectRatio: string
  type: 'generated' | 'edited'
  parentImageId?: string | null
  category?: ImageCategory
}

// ── Category Detection ──────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<ImageCategory, string[]> = {
  attire: ['lehenga', 'saree', 'sherwani', 'gown', 'dress', 'tuxedo', 'outfit', 'attire', 'wear', 'suit', 'blouse', 'dupatta', 'kurta', 'ghagra', 'anarkali', 'bridal wear', 'groom wear'],
  venue: ['venue', 'hall', 'mandap', 'altar', 'church', 'garden', 'beach', 'banquet', 'resort', 'palace', 'farmhouse', 'courtyard', 'terrace', 'ballroom'],
  decor: ['decor', 'table', 'centerpiece', 'lighting', 'drape', 'stage', 'backdrop', 'setup', 'arrangement', 'candle', 'lantern', 'fairy light', 'string light'],
  cake: ['cake', 'dessert', 'sweet', 'pastry', 'cupcake', 'tier cake'],
  flowers: ['flower', 'floral', 'bouquet', 'garland', 'marigold', 'rose arrangement', 'lily', 'jasmine', 'orchid', 'peony'],
  invitation: ['invitation', 'card', 'invite', 'rsvp', 'save the date', 'wedding card', 'menu card'],
  other: [],
}

/** Categorize an image based on the prompt text */
export function categorizeFromPrompt(prompt: string): ImageCategory {
  const lower = prompt.toLowerCase()
  let bestCategory: ImageCategory = 'other'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'other') continue
    const score = keywords.filter(kw => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category as ImageCategory
    }
  }

  return bestCategory
}

// ── Storage Operations ──────────────────────────────────────────────────────────

/**
 * Upload a single generated image to Firebase Storage and save metadata.
 * @param base64 Raw base64 string (no data URI prefix)
 * @param userId Firebase Auth UID
 * @param metadata Image metadata
 * @returns CDN URL and Firestore document ID
 */
export async function storeGeneratedImage(
  base64: string,
  userId: string,
  metadata: StoreImageMetadata
): Promise<{ url: string; imageId: string }> {
  const imageId = crypto.randomUUID()
  const filename = `generated/${userId}/${Date.now()}-${imageId}.jpg`

  try {
    const storage = getStorage()
    const storageRef = ref(storage, filename)
    const buffer = Buffer.from(base64, 'base64')

    await uploadBytes(storageRef, buffer, {
      contentType: 'image/jpeg',
      customMetadata: {
        prompt: metadata.prompt.substring(0, 200),
        mode: metadata.mode,
        threadId: metadata.threadId || '',
      },
    })

    const url = await getDownloadURL(storageRef)

    // Save metadata to Firestore
    const imageDoc: UserImage = {
      id: imageId,
      userId,
      url,
      prompt: metadata.prompt,
      enhancedPrompt: metadata.enhancedPrompt,
      mode: metadata.mode,
      threadId: metadata.threadId ?? null,
      aspectRatio: metadata.aspectRatio,
      type: metadata.type,
      parentImageId: metadata.parentImageId ?? null,
      category: metadata.category ?? categorizeFromPrompt(metadata.prompt),
      pinned: false,
      createdAt: Timestamp.now(),
    }

    await setDoc(doc(db, 'userImages', imageId), imageDoc)

    return { url, imageId }
  } catch (err) {
    console.error('[imageStorage] storeGeneratedImage error:', err)
    throw err
  }
}

/**
 * Upload multiple images in parallel.
 * @param base64Array Array of raw base64 strings
 * @param userId Firebase Auth UID
 * @param metadata Shared metadata for all images
 * @returns Array of CDN URLs and Firestore document IDs
 */
export async function storeMultipleImages(
  base64Array: string[],
  userId: string,
  metadata: StoreImageMetadata
): Promise<{ url: string; imageId: string }[]> {
  return Promise.all(
    base64Array.map(b64 => storeGeneratedImage(b64, userId, metadata))
  )
}

// ── Query Operations ────────────────────────────────────────────────────────────

export interface GetUserImagesOptions {
  category?: ImageCategory
  pinned?: boolean
  maxResults?: number
}

/**
 * Retrieve a user's generated images from Firestore.
 */
export async function getUserImages(
  userId: string,
  options: GetUserImagesOptions = {}
): Promise<UserImage[]> {
  try {
    const constraints: any[] = [
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    ]

    if (options.category) {
      constraints.push(where('category', '==', options.category))
    }
    if (options.pinned !== undefined) {
      constraints.push(where('pinned', '==', options.pinned))
    }

    constraints.push(fsLimit(options.maxResults ?? 50))

    const q = query(collection(db, 'userImages'), ...constraints)
    const snap = await getDocs(q)

    return snap.docs.map(d => d.data() as UserImage)
  } catch (err) {
    console.error('[imageStorage] getUserImages error:', err)
    return []
  }
}

/**
 * Pin or unpin an image in the gallery.
 */
export async function updateImagePin(imageId: string, pinned: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'userImages', imageId), { pinned })
  } catch (err) {
    console.error('[imageStorage] updateImagePin error:', err)
    throw err
  }
}

/**
 * Update the category of a stored image.
 */
export async function updateImageCategory(imageId: string, category: ImageCategory): Promise<void> {
  try {
    await updateDoc(doc(db, 'userImages', imageId), { category })
  } catch (err) {
    console.error('[imageStorage] updateImageCategory error:', err)
    throw err
  }
}

/**
 * Delete an image metadata document from Firestore.
 * (Storage file cleanup is handled by lifecycle rules, not inline.)
 */
export async function deleteImage(imageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'userImages', imageId))
  } catch (err) {
    console.error('[imageStorage] deleteImage error:', err)
    throw err
  }
}
