import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

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

function likedProductsCol(userId: string) {
  return collection(db, 'users', userId, 'likedProducts')
}

function likedProductDoc(userId: string, productId: string) {
  return doc(db, 'users', userId, 'likedProducts', productId)
}

export function subscribeToLikedProducts(
  userId: string,
  callback: (items: LikedProduct[]) => void,
): Unsubscribe {
  const q = query(likedProductsCol(userId), orderBy('likedAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map(d => ({
        ...d.data(),
        id: d.id,
      } as LikedProduct))
      callback(items)
    },
    (err) => console.error('[subscribeToLikedProducts]', err.message),
  )
}

export async function addLikedProduct(
  userId: string,
  productId: string,
  item: Omit<LikedProduct, 'id' | 'likedAt'>,
): Promise<void> {
  await setDoc(likedProductDoc(userId, productId), {
    ...item,
    likedAt: serverTimestamp(),
  })
}

export async function removeLikedProduct(
  userId: string,
  productId: string,
): Promise<void> {
  await deleteDoc(likedProductDoc(userId, productId))
}
