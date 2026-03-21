/**
 * Web Search service using Google Custom Search JSON API.
 *
 * Required environment variables:
 *   GOOGLE_SEARCH_API_KEY     — Google API key with Custom Search enabled
 *   GOOGLE_SEARCH_ENGINE_ID   — Programmable Search Engine ID (cx)
 *
 * Falls back to Bing Web Search if Google is not configured:
 *   BING_SEARCH_API_KEY       — Azure Bing Search v7 key
 */

export interface SearchResultItem {
  title: string
  snippet: string
  url: string
}

/**
 * Search the web and return top results.
 * Tries Google Custom Search first, falls back to Bing, then returns empty.
 */
export async function webSearch(query: string, numResults = 5): Promise<SearchResultItem[]> {
  // Try Google Custom Search first
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (googleKey && googleCx) {
    return googleSearch(query, googleKey, googleCx, numResults)
  }

  // Fallback: Bing Web Search v7
  const bingKey = process.env.BING_SEARCH_API_KEY
  if (bingKey) {
    return bingSearch(query, bingKey, numResults)
  }

  console.warn('[webSearch] No search API configured — returning empty results')
  return []
}

async function googleSearch(
  query: string,
  apiKey: string,
  cx: string,
  num: number
): Promise<SearchResultItem[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(Math.min(num, 10)))

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error('[webSearch] Google search failed:', res.status, await res.text())
    return []
  }

  const data = await res.json() as any
  return (data.items ?? []).slice(0, num).map((item: any) => ({
    title: item.title ?? '',
    snippet: item.snippet ?? '',
    url: item.link ?? '',
  }))
}

async function bingSearch(
  query: string,
  apiKey: string,
  num: number
): Promise<SearchResultItem[]> {
  const url = new URL('https://api.bing.microsoft.com/v7.0/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(num, 10)))

  const res = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  })
  if (!res.ok) {
    console.error('[webSearch] Bing search failed:', res.status, await res.text())
    return []
  }

  const data = await res.json() as any
  return (data.webPages?.value ?? []).slice(0, num).map((item: any) => ({
    title: item.name ?? '',
    snippet: item.snippet ?? '',
    url: item.url ?? '',
  }))
}

/** Format search results as plain text for the LLM tool response */
export function formatSearchResults(results: SearchResultItem[]): string {
  if (results.length === 0) {
    return 'No search results found. Answer based on your existing knowledge and note that the information may not be current.'
  }

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
    .join('\n\n')
}
