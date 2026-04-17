import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface ProductResult {
  uid: string
  name: string
  description: string
  category: string
  price: number
  currency: string
  vendor: string
  tags: string[]
  productUrl: string
  imageUrl: string
  rating: number
}

// Keywords that suggest the user is looking for a product category
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dress:   ['dress', 'gown', 'lehenga', 'bridal wear', 'outfit', 'attire', 'wear', 'clothing',
            'haldi', 'mehndi', 'mehandi', 'mehendi', 'sangeet', 'reception', 'saree', 'sari', 'sharara', 'anarkali',
            'sherwani', 'kurta', 'dupatta', 'blouse', 'bridesmaid', 'groomsmen'],
  rings:   ['ring', 'rings', 'band', 'engagement', 'jewelry', 'jewellery', 'necklace', 'earring',
            'mangalsutra', 'bangles', 'choker', 'maang tikka'],
  venue:   ['venue', 'hall', 'banquet', 'location', 'place', 'garden', 'resort', 'farmhouse',
            'palace', 'rooftop', 'destination'],
  florist: ['flower', 'floral', 'bouquet', 'centerpiece', 'decoration', 'decor', 'garland',
            'marigold', 'mandap', 'flowerwork'],
  cake:    ['cake', 'dessert', 'sweet', 'bakery', 'mithai', 'ladoo', 'barfi'],
  photo:   ['photo', 'photograph', 'camera', 'videograph', 'film', 'cinemat', 'candid', 'reel'],
}

function toProduct(d: any, variantImageUrl?: string): ProductResult {
  const data = d.data()
  return {
    uid: d.id,
    name: data.name ?? '',
    description: data.description ?? '',
    category: data.category ?? '',
    price: data.price ?? 0,
    currency: data.currency ?? 'INR',
    vendor: data.vendor ?? '',
    tags: data.tags ?? [],
    productUrl: `https://migration-testshiv97.web.app/product-detail/${d.id}`,
    imageUrl: data.imageUrl || variantImageUrl || '',
    rating: data.rating ?? 0,
  }
}

/** Fetch first variant image for a product when the product doc has no imageUrl */
async function fetchFirstVariantImage(productId: string): Promise<string> {
  try {
    const snap = await getDocs(
      query(collection(db, 'variants'), where('productId', '==', productId), limit(1))
    )
    if (snap.empty) return ''
    const images = snap.docs[0].data()?.images as string[] | undefined
    return images?.[0] ?? ''
  } catch {
    return ''
  }
}

function extractCategories(userMessage: string): string[] {
  const lower = userMessage.toLowerCase()
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([category]) => category)
}

/** Convert product docs to ProductResult[], fetching variant images for any missing imageUrl */
async function resolveProductImages(docs: any[]): Promise<ProductResult[]> {
  return Promise.all(
    docs.map(async (d) => {
      const data = d.data()
      if (data.imageUrl) return toProduct(d)
      const variantImg = await fetchFirstVariantImage(d.id)
      return toProduct(d, variantImg)
    })
  )
}

// Fetch up to 8 relevant products from Firestore for the user's message
export async function getRelevantProducts(userMessage: string): Promise<ProductResult[]> {
  const categories = extractCategories(userMessage)

  if (categories.length > 0) {
    const categorySnap = await getDocs(
      query(collection(db, 'products'), where('category', '==', categories[0]), limit(8))
    )
    // If category-specific query has results, use them; otherwise fall back to any products
    if (categorySnap.docs.length > 0) {
      return resolveProductImages(categorySnap.docs)
    }
  }

  const snap = await getDocs(query(collection(db, 'products'), limit(8)))
  return resolveProductImages(snap.docs)
}

// Format products as a context block injected into the Stylist system prompt
export function formatProductsContext(products: ProductResult[]): string {
  if (products.length === 0) return ''

  // Only include products that have a real image URL — products without images
  // cause the LLM to substitute the product page URL as the image, which breaks rendering.
  const withImages = products.filter(p => p.imageUrl)
  if (withImages.length === 0) return ''

  const lines = withImages.map(p => {
    const desc = p.description ? p.description.slice(0, 120).replace(/\n/g, ' ') : ''
    return `- ![${p.name}](${p.imageUrl}) [${p.name}](${p.productUrl})|${desc}`
  })

  return `\n\nAvailable products from WeddingEase catalogue (copy these lines verbatim — do not reformat):\n${lines.join('\n')}\n`
}
