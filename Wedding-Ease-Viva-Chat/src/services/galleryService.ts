import { api, invalidate } from './apiClient'
import type { Timestamp } from '@/lib/timestamp'
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
  _userId: string,
  options: { category?: ImageCategory; maxResults?: number; filter?: GalleryFilter; vibeId?: string | null } = {},
): Promise<UserImage[]> {
  try {
    const q = new URLSearchParams({ limit: String(Math.min(options.maxResults ?? 100, 100)), filter: options.filter ?? 'all' })
    if (options.category) q.set('category', options.category)
    if (options.vibeId) q.set('vibeId', options.vibeId)
    return (await api<{ items: UserImage[] }>(`/gallery?${q}`)).items
  } catch (err) {
    console.error('[galleryService] getUserImages error:', err)
    return []
  }
}

/** Deletes the row + storage object and strips the URL from the chat message that used it (all server-side). */
export async function deleteUserImage(imageId: string): Promise<string | null> {
  const r = await api<{ url?: string }>(`/gallery/${imageId}`, { method: 'DELETE' })
  invalidate('gallery')
  return r.url ?? null
}

export async function uploadUserImage(_userId: string, file: File, category: ImageCategory = 'other'): Promise<UserImage> {
  if (!file) throw new Error('No file selected.')
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Image must be smaller than 10MB.')
  const form = new FormData()
  form.set('file', file)
  form.set('category', category)
  const img = await api<UserImage>('/gallery/upload', { method: 'POST', body: form })
  invalidate('gallery')
  return img
}
