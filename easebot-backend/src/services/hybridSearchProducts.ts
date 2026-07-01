/**
 * Server-side product search via the WeddingEase Search API Cloud Run service.
 * Map results to the existing ProductResult shape so callers don't change.
 *
 * Endpoint: https://searchproducts-xstuppfsia-uc.a.run.app
 */

import type { ProductResult } from './products'
import { getRelevantProducts } from './products'
import { resolveAlgoliaQuery } from './keywordDirectory'

const SEARCH_API_URL = 'https://searchproducts-xstuppfsia-uc.a.run.app'
const DEFAULT_LIMIT = 8

interface SearchItem {
  firestore_id: string
  variant_id: string | null
  api_id: string | null
  product_id: string | null
  sub_cat_id: string | null
  main_cat_id: string | null
  lower_name: string
  description: string
  fixedprice: number | null
  original_price: number | null
  selling_price: number | null
  image_url: string | null
}

interface SearchResponse {
  items: SearchItem[]
  totalCount: number
}

function searchItemToProduct(item: SearchItem): ProductResult {
  const productDocId = item.product_id || item.firestore_id
  const name = item.lower_name
    ? item.lower_name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    : ''
  return {
    uid: productDocId,
    name,
    description: item.description ?? '',
    category: item.sub_cat_id ?? '',
    price: item.selling_price || item.fixedprice || 0,
    currency: 'INR',
    vendor: '',
    tags: [],
    productUrl: `https://weddingease.ai/product-detail/${productDocId}`,
    imageUrl: item.image_url ?? '',
    rating: 0,
  }
}

export async function getRelevantProductsViaHybridSearch(
  userMessage: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ProductResult[]> {
  const query = resolveAlgoliaQuery(userMessage)

  try {
    const response = await fetch(SEARCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query.trim(),
        limit,
        allVariant: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Search API returned status ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as SearchResponse
    if (!data.items || data.items.length === 0) {
      return getRelevantProducts(userMessage)
    }

    // Map and deduplicate by product ID
    const seen = new Set<string>()
    const unique: ProductResult[] = []

    for (const item of data.items) {
      const product = searchItemToProduct(item)
      if (!product.uid || seen.has(product.uid)) continue
      seen.add(product.uid)
      unique.push(product)
    }

    if (unique.length === 0) {
      return getRelevantProducts(userMessage)
    }

    return unique
  } catch (err) {
    console.error('[hybridSearchProducts] Search API call failed, falling back to Firestore:', err)
    return getRelevantProducts(userMessage)
  }
}
