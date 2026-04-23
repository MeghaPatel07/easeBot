/**
 * Server-side product search via the WeddingEase hybridSearch Cloud Function.
 * The Cloud Function runs lexical + vector search concurrently and returns
 * merged results. We dedupe across buckets, resolve each variant to its
 * parent product via Firestore, and normalize to the existing ProductResult
 * shape so callers don't change.
 *
 * Endpoint: https://us-central1-wedding-ease-dc99a.cloudfunctions.net/hybridSearch
 * Docs:     see Wedding-Ease-User-Interface/src/services/hybridSearchService.ts
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ProductResult } from './products'
import { getRelevantProducts } from './products'
import { resolveAlgoliaQuery } from './keywordDirectory'

const HYBRID_SEARCH_URL =
  'https://us-central1-wedding-ease-dc99a.cloudfunctions.net/hybridSearch'

const DEFAULT_LIMIT = 8

type HybridSearchMode = 'all' | 'lexical' | 'vector' | 'filtered'

interface HybridSearchItem {
  firestoreId?: string
  id?: string
  objectID?: string
  name?: string
  description?: string
  imageUrl?: string | null
  fixedprice?: number
  subCatId?: string
  tags?: string[]
  type?: 'variants' | 'subcategories' | string
  score?: number
  source?: string
}

interface HybridSearchBucket {
  items?: HybridSearchItem[]
  variants?: HybridSearchItem[]
  subcategories?: Array<Record<string, unknown>>
  hasMore?: boolean
  offset?: number
  limit?: number
}

interface HybridSearchResponse {
  success?: boolean
  quality?: string
  shouldRunVector?: boolean
  lexical?: HybridSearchBucket
  filtered?: HybridSearchBucket
  vector?: HybridSearchBucket
}

interface HybridSearchRequest {
  query: string
  isFiltered?: boolean
  filterWords?: string[]
  limit?: number
  offset?: number
  mode?: HybridSearchMode
}

async function fetchVariantProductId(variantId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'variants', variantId))
    if (!snap.exists()) {
      console.warn(`[hybridSearchProducts] variant doc not found — id=${variantId}`)
      return ''
    }
    const productId: string = snap.data()?.productId ?? ''
    return productId
  } catch (err) {
    console.error(`[hybridSearchProducts] fetchVariantProductId error for id=${variantId}:`, err)
    return ''
  }
}

async function callHybridSearch(request: HybridSearchRequest): Promise<HybridSearchResponse> {
  const body = {
    query: request.query.trim(),
    isFiltered: request.isFiltered ?? false,
    filterWords: request.filterWords ?? [],
    limit: request.limit ?? DEFAULT_LIMIT,
    offset: request.offset ?? 0,
    mode: request.mode ?? 'all',
  }

  const response = await fetch(HYBRID_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `hybridSearch failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
    )
  }

  return (await response.json()) as HybridSearchResponse
}

// Pick the variant-type items from a bucket (prefers the dedicated `variants`
// array; falls back to filtering `items` by `type === 'variants'`).
function pickVariantItems(bucket: HybridSearchBucket | undefined): HybridSearchItem[] {
  if (!bucket) return []
  if (bucket.variants && bucket.variants.length > 0) return bucket.variants
  return (bucket.items ?? []).filter((it) => it.type === 'variants')
}

// Merge variant items across lexical → filtered → vector buckets, preserving
// backend ranking and deduping by variant id.
function mergeVariantItems(resp: HybridSearchResponse): HybridSearchItem[] {
  const out: HybridSearchItem[] = []
  const seen = new Set<string>()
  for (const bucket of [resp.lexical, resp.filtered, resp.vector]) {
    for (const item of pickVariantItems(bucket)) {
      const id = item.firestoreId || item.id || item.objectID || ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(item)
    }
  }
  return out
}

async function variantItemToProduct(item: HybridSearchItem): Promise<ProductResult | null> {
  const variantId = item.firestoreId || item.id || item.objectID || ''
  if (!variantId) return null

  const productDocId = await fetchVariantProductId(variantId)
  if (!productDocId) return null

  const imageUrl = item.imageUrl ?? ''
  const price = typeof item.fixedprice === 'number' ? item.fixedprice : 0

  return {
    uid: productDocId,
    name: item.name ?? '',
    description: item.description ?? '',
    category: item.subCatId ?? '',
    price,
    currency: 'INR',
    vendor: '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    productUrl: `https://migration-testshiv97.web.app/product-detail/${productDocId}`,
    imageUrl,
    rating: 0,
  }
}

export async function getRelevantProductsViaHybridSearch(
  userMessage: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ProductResult[]> {
  const query = resolveAlgoliaQuery(userMessage)

  let response: HybridSearchResponse
  try {
    response = await callHybridSearch({ query, limit, mode: 'all' })
  } catch (err) {
    console.error('[hybridSearchProducts] hybridSearch call failed, falling back to Firestore:', err)
    return getRelevantProducts(userMessage)
  }

  const variantItems = mergeVariantItems(response)
  if (variantItems.length === 0) {
    // Backend returned nothing → fall back to Firestore keyword match so
    // the recommender still has a chance to surface products.
    return getRelevantProducts(userMessage)
  }

  const products = (
    await Promise.all(variantItems.map(variantItemToProduct))
  ).filter((p): p is ProductResult => p !== null)

  // Dedupe by productDocId in case two variants resolved to the same product.
  const seen = new Set<string>()
  const unique: ProductResult[] = []
  for (const p of products) {
    if (seen.has(p.uid)) continue
    seen.add(p.uid)
    unique.push(p)
  }

  if (unique.length === 0) return getRelevantProducts(userMessage)
  return unique
}
