# PRD: Algolia-Powered Product Fetching in Stylist Mode

## Overview

Replace the current keyword-based Firestore product query in stylist mode with Algolia search. Algolia understands natural language queries (e.g. "mehandi", "lehenga for sangeet"), handles typos, synonyms, and returns semantically relevant products — making the stylist's recommendations far more accurate.

---

## Problem with Current Approach

| Issue | Detail |
|-------|--------|
| Hard-coded keywords | `CATEGORY_KEYWORDS` in `products.ts` only matches exact strings like `"mehndi"` — misses `"mehandi"`, `"mehendi"`, etc. |
| Firestore category filter | Only queries by a single broad category (`dress`, `rings`, etc.) — no relevance ranking |
| No semantic search | `"give me products for mehandi"` falls back to 5 random products because the keyword doesn't match |
| Manual maintenance | Adding new product types requires updating the keyword map in code |

---

## Proposed Solution

Add a **server-side Algolia search function** to the backend that:
1. Takes the user's raw message as the query
2. Calls Algolia's multi-index REST API (`variants` + `subcategories` indexes)
3. Maps variant hits to the existing `ProductResult` format
4. Injects results into the stylist system prompt as before

The Algolia call happens entirely in the backend — no client involvement.

---

## Data Flow

```
User message (stylist mode)
        │
        ▼
buildSystemPrompt('stylist', userMessage)
        │
        ▼
getRelevantProductsViaAlgolia(userMessage)   ← NEW
        │
        ├── POST https://{APP_ID}-dsn.algolia.net/1/indexes/*/queries
        │       indexes: ['variants', 'subcategories']
        │       query: userMessage
        │       hitsPerPage: 5
        │
        ▼
Map AlgoliaVariantHit → ProductResult
        │
        ▼
formatProductsContext(products)
        │
        ▼
getStylistPrompt(context)   ← injected as before
```

---

## Algolia Index Schema (existing)

### `variants` index
| Field | Type | Use |
|-------|------|-----|
| `objectID` | string | Algolia record ID |
| `name` | string | Product/variant name — primary search field |
| `description` | string | Snippet text |
| `images` | string[] | First image used as `imageUrl` |
| `price` | number | Display price |
| `subCatId` | string | Subcategory reference |
| `productId` | string | Firestore product doc ID (preferred) |
| `productDocId` | string | Fallback Firestore product doc ID |

### `subcategories` index
| Field | Type | Use |
|-------|------|-----|
| `objectID` | string | Subcategory ID |
| `name` | string | Subcategory name |
| `description` | string | Description |

> Subcategory hits are not shown as products but can enrich context (e.g. tell the AI what product categories matched).

---

## Implementation Spec

### 1. New env vars (backend `.env`)

```
ALGOLIA_APP_ID=your_app_id
ALGOLIA_SEARCH_KEY=your_search_only_api_key
```

> Use server-side env vars (`process.env`), NOT `VITE_*` vars which are frontend-only.

---

### 2. New file: `src/services/algoliaProducts.ts`

**Responsibilities:**
- Call Algolia REST API with the user's message as the query
- Return up to 5 `ProductResult` objects mapped from variant hits
- Fall back gracefully if Algolia is not configured or request fails

**Key mapping** (`AlgoliaVariantHit` → `ProductResult`):

| ProductResult field | Source |
|---------------------|--------|
| `uid` | `hit.productDocId ?? hit.productId ?? hit.objectID` |
| `name` | `hit.name` |
| `category` | `hit.subCatId` (raw, used for context only) |
| `price` | `hit.price` |
| `currency` | `"INR"` (hardcoded default) |
| `vendor` | `""` (not in Algolia index — omit or leave blank) |
| `tags` | `[]` |
| `productUrl` | `https://weddingease.ai/product-detail/${productDocId}` |
| `imageUrl` | `hit.images?.[0] ?? ""` |
| `rating` | `0` (not in Algolia index) |

**Algolia request config** (mirrors `algoliaSearchService.ts`):
```json
{
  "indexName": "variants",
  "query": "<userMessage>",
  "hitsPerPage": 5,
  "typoTolerance": true,
  "removeWordsIfNoResults": "allOptional",
  "removeStopWords": true,
  "queryType": "prefixAll",
  "synonyms": true,
  "relevancyStrictness": 70
}
```

---

### 3. Update `src/controllers/chatController.ts`

Replace `getRelevantProducts` with `getRelevantProductsViaAlgolia` in `buildSystemPrompt`:

```ts
if (mode === 'stylist') {
  try {
    const products = await getRelevantProductsViaAlgolia(userMessage)
    const context = formatProductsContext(products)
    return getStylistPrompt(context)
  } catch {
    return getStylistPrompt()
  }
}
```

The `formatProductsContext` and `getStylistPrompt` functions remain unchanged.

---

### 4. Keep `products.ts` as fallback

If `ALGOLIA_APP_ID` is not set, fall back to the existing Firestore-based `getRelevantProducts`. This ensures the feature degrades gracefully in local dev without Algolia credentials.

```ts
export async function getRelevantProductsViaAlgolia(userMessage: string): Promise<ProductResult[]> {
  if (!process.env.ALGOLIA_APP_ID || !process.env.ALGOLIA_SEARCH_KEY) {
    return getRelevantProducts(userMessage) // existing Firestore fallback
  }
  // ... Algolia fetch
}
```

---

## Why Algolia Beats the Current Approach for This Use Case

| Scenario | Current (Firestore) | Algolia |
|----------|---------------------|---------|
| "mehandi outfit" | No match (wrong spelling) | Matches via typo tolerance + synonym |
| "red lehenga for reception" | Matches `dress` category, returns random | Returns lehengas tagged `reception`, ranked by relevance |
| "floral mandap decor" | Matches `florist` category | Returns mandap + floral products ranked by exact query |
| "something elegant for sangeet" | Matches `dress` category | Understands `sangeet` + `elegant`, returns relevant results |
| New product type added | Requires code change in keyword map | Works automatically from Algolia index |

---

## Acceptance Criteria

- [ ] "give me products for mehandi" in stylist mode returns relevant mehndi outfit products
- [ ] Typo variants (`mehandi`, `mehendi`, `mehndi`) all return results
- [ ] Up to 5 products are injected into the stylist system prompt
- [ ] If Algolia credentials are missing, falls back to Firestore query without error
- [ ] Product URLs follow format: `https://weddingease.ai/product-detail/{productDocId}`
- [ ] No `VITE_*` env vars used in backend code

---

## Out of Scope

- Showing subcategory hits as clickable UI elements (future)
- Pagination of Algolia results in chat (future)
- Algolia analytics / click tracking (future)
