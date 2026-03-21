/**
 * Server-side Algolia product search for stylist mode.
 * Uses ALGOLIA_APP_ID and ALGOLIA_SEARCH_KEY from process.env (not VITE_*).
 * Falls back to Firestore-based getRelevantProducts if Algolia is not configured.
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ProductResult } from './products'
import { getRelevantProducts, formatProductsContext } from './products'
import { resolveAlgoliaQuery } from './keywordDirectory'

interface AlgoliaVariantHit {
  objectID: string
  name?: string
  description?: string
  images?: string[]
  price?: number
  subCatId?: string
  productId?: string
  productDocId?: string
}

interface AlgoliaResult {
  index?: string
  hits: AlgoliaVariantHit[]
  nbHits?: number
}

interface AlgoliaResponse {
  results: AlgoliaResult[]
}

function isConfigured(): boolean {
  return Boolean(process.env.ALGOLIA_APP_ID && process.env.ALGOLIA_SEARCH_KEY)
}

/** Fetch productId from Firestore variants collection when not indexed in Algolia */
async function fetchVariantProductId(variantId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'variants', variantId))
    if (!snap.exists()) {
      console.warn(`[algoliaProducts] variant doc not found — id=${variantId}`)
      return ''
    }
    const productId: string = snap.data()?.productId ?? ''
    console.log(`[algoliaProducts] fetched productId=${productId} for variantId=${variantId}`)
    return productId
  } catch (err) {
    console.error(`[algoliaProducts] fetchVariantProductId error for id=${variantId}:`, err)
    return ''
  }
}

async function hitToProduct(hit: AlgoliaVariantHit): Promise<ProductResult | null> {
  // images ARE in Algolia — use directly
  const imageUrl = hit.images?.[0] ?? ''

  // productId is NOT indexed in Algolia — fetch from Firestore variant doc
  let productDocId = hit.productDocId ?? hit.productId ?? ''
  if (!productDocId) {
    productDocId = await fetchVariantProductId(hit.objectID)
  }

  if (!productDocId) {
    console.warn(`[algoliaProducts] skipping hit — could not resolve productId, objectID=${hit.objectID}`)
    return null
  }

  return {
    uid: productDocId,
    name: hit.name ?? '',
    description: hit.description ?? '',
    category: hit.subCatId ?? '',
    price: hit.price ?? 0,
    currency: 'INR',
    vendor: '',
    tags: [],
    productUrl: `https://migration-testshiv97.web.app/product-detail/${productDocId}`,
    imageUrl,
    rating: 0,
  }
}

export async function getRelevantProductsViaAlgolia(userMessage: string): Promise<ProductResult[]> {
  if (!isConfigured()) {
    return getRelevantProducts(userMessage)
  }

  const appId = process.env.ALGOLIA_APP_ID!
  const apiKey = process.env.ALGOLIA_SEARCH_KEY!
  const algoliaQuery = resolveAlgoliaQuery(userMessage)

  const optionalWords = algoliaQuery.trim().split(/\s+/).filter(Boolean).slice(0, 10)

  const body = {
    requests: [
      {
        indexName: 'variants',
        query: algoliaQuery,
        hitsPerPage: 5,
        typoTolerance: true,
        removeWordsIfNoResults: 'allOptional',
        removeStopWords: true,
        queryType: 'prefixAll',
        synonyms: true,
        relevancyStrictness: 70,
        analytics: false,
        attributesToRetrieve: ['name', 'description', 'images', 'price', 'subCatId', 'productId', 'productDocId'],
        optionalWords: optionalWords.length > 0 ? optionalWords : [algoliaQuery],
        facetFilters: [],
      },
    ],
  }

  const url = `https://${appId}-dsn.algolia.net/1/indexes/*/queries`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': appId,
      'X-Algolia-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Algolia search failed: ${response.status} ${response.statusText} — ${text}`)
  }

  const data = (await response.json()) as AlgoliaResponse
  const variantResult = data.results.find(r => r.index === 'variants')
  const hits = variantResult?.hits ?? []

  const products = (await Promise.all(hits.map(hitToProduct)))
    .filter((p): p is ProductResult => p !== null)

  // If Algolia returned nothing, fall back to Firestore
  if (products.length === 0) {
    return getRelevantProducts(userMessage)
  }

  return products
}

export { formatProductsContext }
