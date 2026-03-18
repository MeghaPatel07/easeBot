/**
 * Algolia multi-index search service.
 * Uses VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_KEY from env.
 */

const getConfig = () => {
  const appId = import.meta.env.VITE_ALGOLIA_APP_ID as string | undefined;
  const apiKey = import.meta.env.VITE_ALGOLIA_SEARCH_KEY as string | undefined;
  return { appId, apiKey };
};

export const isAlgoliaConfigured = (): boolean => {
  const { appId, apiKey } = getConfig();
  return Boolean(appId && apiKey);
};

export interface AlgoliaVariantHit {
  objectID: string;
  name?: string;
  description?: string;
  images?: string[];
  price?: number;
  subCatId?: string;
  /** Product document ID (Firestore) - used for linking to product detail page */
  productId?: string;
  productDocId?: string;
  _highlightResult?: Record<string, { value?: string }>;
}

export interface AlgoliaSubcategoryHit {
  objectID: string;
  name?: string;
  description?: string;
  _highlightResult?: Record<string, { value?: string }>;
}

export interface AlgoliaMultiIndexResponse {
  results: Array<{
    index?: string;
    hits: AlgoliaVariantHit[] | AlgoliaSubcategoryHit[];
    page?: number;
    nbHits?: number;
    nbPages?: number;
    hitsPerPage?: number;
    processingTimeMS?: number;
    query?: string;
    params?: string;
  }>;
}

const buildOptionalWords = (query: string): string[] => {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
};

export async function algoliaSearch(query: string, page: number = 0): Promise<AlgoliaMultiIndexResponse> {
  const { appId, apiKey } = getConfig();
  if (!appId || !apiKey) {
    throw new Error('Algolia is not configured. Set VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_KEY in .env');
  }

  const optionalWords = buildOptionalWords(query);
  const body = {
    requests: [
      {
        indexName: 'variants',
        query,
        page,
        relevancyStrictness: 70,
        hitsPerPage: 20,
        typoTolerance: true,
        removeWordsIfNoResults: 'allOptional',
        analytics: true,
        removeStopWords: true,
        queryType: 'prefixAll',
        attributesToRetrieve: ['name', 'description', 'images', 'price', 'subCatId', 'objectID', 'productId', 'productDocId'],
        attributesToHighlight: ['name', 'description'],
        attributesToSnippet: ['description:30'],
        advancedSyntax: true,
        synonyms: true,
        optionalWords: optionalWords.length > 0 ? optionalWords : ['word1', 'word2'],
        facetFilters: [],
      },
      {
        indexName: 'subcategories',
        query,
        queryType: 'prefixAll',
        hitsPerPage: 15,
        typoTolerance: true,
        relevancyStrictness: 70,
        removeStopWords: true,
        removeWordsIfNoResults: 'allOptional',
        analytics: true,
        attributesToRetrieve: ['name', 'description', 'objectID'],
        attributesToHighlight: ['name', 'description'],
        attributesToSnippet: ['description:30'],
        advancedSyntax: true,
        synonyms: true,
        optionalWords: optionalWords.length > 0 ? optionalWords : [query],
        facetFilters: [],
      },
    ],
  };

  const url = `https://${appId}-dsn.algolia.net/1/indexes/*/queries`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': appId,
      'X-Algolia-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algolia search failed: ${response.status} ${response.statusText} - ${text}`);
  }

  return response.json() as Promise<AlgoliaMultiIndexResponse>;
}
