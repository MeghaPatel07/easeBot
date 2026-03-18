/**
 * Hook for Algolia multi-index search (variants + subcategories).
 * Maps variant hits to ProductModelClass for the products grid.
 * Only runs when Algolia is configured (env keys set) and query length >= 2.
 */

import { useState, useEffect, useCallback } from 'react';
import { ProductModelClass } from '../models/ProductModel';
import VariantService from '../services/variantService';
import {
  algoliaSearch,
  isAlgoliaConfigured,
  AlgoliaVariantHit,
  AlgoliaMultiIndexResponse,
} from '../services/algoliaSearchService';

/** Build product model from variant hit. docId must be the product's Firestore docId (for detail page link). */
function variantHitToProductModel(hit: AlgoliaVariantHit, productDocId: string): ProductModelClass {
  const price = typeof hit.price === 'number' ? hit.price : 0;
  const images = Array.isArray(hit.images) ? hit.images : [];
  const defaultImage = images[0] || '';

  return ProductModelClass.fromJson({
    docId: productDocId,
    name: hit.name || '',
    description: hit.description || '',
    images,
    defaultImage,
    minPrice: price,
    maxPrice: price,
    subCatDocId: hit.subCatId || '',
    defaultSubCatDocId: hit.subCatId || '',
    subcatIds: hit.subCatId ? [hit.subCatId] : [],
    mainCatDocId: '',
    combinationNames: [],
    lowerName: (hit.name || '').toLowerCase(),
    vendorDocId: '',
    show: true,
    sku: '',
    userType: 'customer',
    createdAt: new Date(),
    topSelling: false,
    quantitySold: 0,
    totalSalesAmount: 0,
    tags: [],
    detailsList: [],
    priorityNo: 0,
    rating: 0,
  });
}

export interface UseAlgoliaSearchResult {
  products: ProductModelClass[];
  subcategoryHits: Array<{ objectID: string; name?: string; description?: string }>;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

export function useAlgoliaSearch(searchQuery: string, isEnabled: boolean = true): UseAlgoliaSearchResult {
  const [products, setProducts] = useState<ProductModelClass[]>([]);
  const [subcategoryHits, setSubcategoryHits] = useState<Array<{ objectID: string; name?: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = isAlgoliaConfigured();

  const runSearch = useCallback(async (query: string) => {
    if (!isAlgoliaConfigured()) {
      setProducts([]);
      setSubcategoryHits([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result: AlgoliaMultiIndexResponse = await algoliaSearch(query, 0);

      const variantResult = result.results.find((r) => r.index === 'variants');
      const subcatResult = result.results.find((r) => r.index === 'subcategories');

      const variantHits = (variantResult?.hits || []) as AlgoliaVariantHit[];
      const productsFromVariants: ProductModelClass[] = [];

      for (const hit of variantHits) {
        let productDocId = hit.productId || hit.productDocId || '';
        if (!productDocId) {
          const variant = await VariantService.getVariantById(hit.objectID);
          productDocId = variant?.productId || '';
        }
        if (productDocId) {
          productsFromVariants.push(variantHitToProductModel(hit, productDocId));
        }
      }
      setProducts(productsFromVariants);

      const subcatHits = (subcatResult?.hits || []).map((h: { objectID: string; name?: string; description?: string }) => ({
        objectID: h.objectID,
        name: h.name,
        description: h.description,
      }));
      setSubcategoryHits(subcatHits);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Algolia search failed';
      setError(message);
      setProducts([]);
      setSubcategoryHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!isEnabled || trimmed.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      setSubcategoryHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (!isConfigured) {
      setProducts([]);
      setSubcategoryHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      runSearch(trimmed).then(() => {
        if (cancelled) {
          setProducts([]);
          setSubcategoryHits([]);
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, isEnabled, isConfigured, runSearch]);

  return { products, subcategoryHits, loading, error, isConfigured };
}
