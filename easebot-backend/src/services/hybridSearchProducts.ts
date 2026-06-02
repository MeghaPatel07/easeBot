/**
 * Server-side product search via the WeddingEase searchProducts Cloud Run service.
 *
 * The service runs lexical + vector (hybrid) search and returns ranked product
 * variants. Each item already carries its parent `product_id`, so — unlike the
 * previous hybridSearch Cloud Function — we no longer need a Firestore
 * variant→product lookup. We dedupe by product_id and normalize to the existing
 * ProductResult shape so callers don't change.
 *
 * Endpoint: https://searchproducts-xstuppfsia-uc.a.run.app/
 * Request:  { query, limit, allVariant }
 * Response: { items: SearchProductItem[], nextCursor, totalCount, totalPages, facets }
 */

import type { ProductResult } from './products'
import { getRelevantProducts } from './products'
import { resolveAlgoliaQuery } from './keywordDirectory'

const SEARCH_PRODUCTS_URL = 'https://searchproducts-xstuppfsia-uc.a.run.app/'

// We surface 4 products per turn, so fetch 4 from the search service.
const DEFAULT_LIMIT = 4

const PRODUCT_DETAIL_BASE = 'https://migration-testshiv97.web.app/product-detail'

// One item from the searchProducts response. Only the fields we consume are
// typed; the service also returns `description_embedding`, `vector_similarity`,
// `lexical_rank`, `search_text`, `detail_types_json`, etc. which we ignore.
interface SearchProductItem {
  product_id?: string
  firestore_id?: string
  variant_id?: string
  lower_name?: string
  description?: string
  image_url?: string | null
  fixedprice?: number
  selling_price?: number | null
  original_price?: number | null
  sub_cat_id?: string
  main_cat_id?: string
  show?: boolean
  score?: number
}

interface SearchProductsResponse {
  items?: SearchProductItem[]
  nextCursor?: string | null
  totalCount?: number
  totalPages?: number
  facets?: unknown
}

interface SearchProductsRequest {
  query: string
  limit?: number
  allVariant?: boolean
}

// The catalogue stores names lowercased (`lower_name`); title-case for display.
function titleCase(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Pick the most meaningful non-zero price the item exposes.
function pickPrice(item: SearchProductItem): number {
  for (const n of [item.fixedprice, item.selling_price, item.original_price]) {
    if (typeof n === 'number' && n > 0) return n
  }
  return 0
}

async function callSearchProducts(request: SearchProductsRequest): Promise<SearchProductsResponse> {
  const body = {
    query: request.query.trim(),
    limit: request.limit ?? DEFAULT_LIMIT,
    allVariant: request.allVariant ?? true,
  }

  const response = await fetch(SEARCH_PRODUCTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `searchProducts failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
    )
  }

  return (await response.json()) as SearchProductsResponse
}

function itemToProduct(item: SearchProductItem): ProductResult | null {
  const productId = item.product_id ?? ''
  if (!productId) return null
  // Hidden/unpublished products should never surface in recommendations.
  if (item.show === false) return null

  const rawName = item.lower_name ?? ''

  return {
    uid: productId,
    name: rawName ? titleCase(rawName) : '',
    description: item.description ?? '',
    category: item.sub_cat_id ?? '',
    price: pickPrice(item),
    currency: 'INR',
    vendor: '',
    tags: [],
    productUrl: `${PRODUCT_DETAIL_BASE}/${productId}`,
    imageUrl: item.image_url ?? '',
    rating: 0,
  }
}

export async function getRelevantProductsViaHybridSearch(
  userMessage: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ProductResult[]> {
  const query = resolveAlgoliaQuery(userMessage)

  let response: SearchProductsResponse
  try {
    response = await callSearchProducts({ query, limit, allVariant: true })
  } catch (err) {
    console.error('[hybridSearchProducts] searchProducts call failed, falling back to Firestore:', err)
    return getRelevantProducts(userMessage)
  }

  const items = response.items ?? []
  if (items.length === 0) {
    // Backend returned nothing → fall back to Firestore keyword match so the
    // recommender still has a chance to surface products.
    return getRelevantProducts(userMessage)
  }

  // Map → dedupe by product_id (allVariant:true can return several variants of
  // the same product), preserving the backend's relevance ranking.
  const seen = new Set<string>()
  const unique: ProductResult[] = []
  for (const item of items) {
    const product = itemToProduct(item)
    if (!product || seen.has(product.uid)) continue
    seen.add(product.uid)
    unique.push(product)
  }

  if (unique.length === 0) return getRelevantProducts(userMessage)
  return unique
}
