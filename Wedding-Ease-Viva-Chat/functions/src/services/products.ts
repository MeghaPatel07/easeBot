import * as admin from 'firebase-admin'

export interface ProductResult {
  uid: string
  name: string
  category: string
  price: number
  currency: string
  vendor: string
  tags: string[]
  productUrl: string
}

// Keywords that suggest the user is looking for a product category
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dress:   ['dress', 'gown', 'lehenga', 'bridal wear', 'outfit', 'attire', 'wear', 'clothing'],
  rings:   ['ring', 'rings', 'band', 'engagement', 'jewelry', 'jewellery'],
  venue:   ['venue', 'hall', 'banquet', 'location', 'place', 'garden', 'resort'],
  florist: ['flower', 'floral', 'bouquet', 'centerpiece', 'decoration', 'decor'],
  cake:    ['cake', 'dessert', 'sweet', 'bakery'],
  photo:   ['photo', 'photograph', 'camera', 'videograph', 'film'],
}

function extractCategories(userMessage: string): string[] {
  const lower = userMessage.toLowerCase()
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([category]) => category)
}

// Fetch up to 5 relevant products from Firestore for the user's message
export async function getRelevantProducts(userMessage: string): Promise<ProductResult[]> {
  const db = admin.firestore()
  const categories = extractCategories(userMessage)

  let snap: admin.firestore.QuerySnapshot

  if (categories.length > 0) {
    // Filter by detected category — take first match
    snap = await db
      .collection('products')
      .where('category', '==', categories[0])
      .limit(5)
      .get()
  } else {
    // No category detected — return latest 5 products
    snap = await db.collection('products').limit(5).get()
  }

  return snap.docs.map(d => {
    const data = d.data()
    return {
      uid: d.id,
      name: data.name ?? '',
      category: data.category ?? '',
      price: data.price ?? 0,
      currency: data.currency ?? 'INR',
      vendor: data.vendor ?? '',
      tags: data.tags ?? [],
      productUrl: `https://weddingease.ai/product-detail/${d.id}`,
    }
  })
}

// Format products as a context block injected into the Stylist system prompt
export function formatProductsContext(products: ProductResult[]): string {
  if (products.length === 0) return ''

  const lines = products.map(
    p => `- [${p.name}](${p.productUrl}) by ${p.vendor} — ${p.currency} ${p.price.toLocaleString()}`
  )

  return `\n\nAvailable products from WeddingEase catalogue:\n${lines.join('\n')}\n\nIMPORTANT: Only recommend products from the list above. Use the exact links provided. Never invent or hallucinate product links.`
}
