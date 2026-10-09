import { api, apiAll, invalidate, liveQuery } from './apiClient'

type Unsubscribe = () => void
const TOPIC = 'liked'

export interface LikedProduct {
  id: string
  name: string
  description: string
  imageUrl: string
  productUrl: string
  sourceThreadId: string | null
  sourceThreadTitle: string | null
  likedAt: any
}

export function subscribeToLikedProducts(_userId: string, callback: (items: LikedProduct[]) => void): Unsubscribe {
  return liveQuery(TOPIC, () => apiAll<LikedProduct>('/liked-products'), callback)
}

export async function addLikedProduct(_userId: string, productId: string, item: Omit<LikedProduct, 'id' | 'likedAt'>): Promise<void> {
  await api(`/liked-products/${encodeURIComponent(productId)}`, { method: 'PUT', json: item })
  invalidate(TOPIC)
}

export async function removeLikedProduct(_userId: string, productId: string): Promise<void> {
  await api(`/liked-products/${encodeURIComponent(productId)}`, { method: 'DELETE' })
  invalidate(TOPIC)
}
