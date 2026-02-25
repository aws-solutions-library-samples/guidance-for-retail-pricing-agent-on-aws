/**
 * @fileoverview Hook for fetching products using the hybrid CatalogService.
 * 
 * Provides product fetching with GraphQL and S3 fallback, advanced filtering,
 * searching, sorting, and cursor-based pagination.
 */

import { useState, useEffect, useCallback } from 'react';
import { catalogService, GraphQLServiceError, ProductQueryOptions } from '../services/catalog-service';
import { ProductType } from '../types/product-types';

/**
 * Product filter interface for GraphQL queries.
 */
export interface ProductFilter {
  roles?: string[];
  subcategories?: string[];
  priceRange?: {
    min?: number;
    max?: number;
  };
  vendors?: string[];
  attributes?: Record<string, any>;
}

/**
 * Hook return type for useProducts.
 */
export interface UseProductsResult {
  products: ProductType[];
  totalCount: number;
  isLoading: boolean;
  error: GraphQLServiceError | null;
  hasNextPage: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  isEmpty: boolean;
}

/**
 * Hook for fetching products using the hybrid CatalogService.
 * 
 * @param options - Query options including category, filters, search, etc.
 * @returns Products data with pagination and loading states
 */
export function useProducts(options: ProductQueryOptions & { enabled?: boolean }): UseProductsResult {
  const { 
    category, 
    filter, 
    searchQuery, 
    sortBy = 'UPDATED_AT', 
    sortDirection = 'DESC', 
    first: pageSize = 20,
    enabled = true
  } = options;

  const [products, setProducts] = useState<ProductType[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GraphQLServiceError | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchProducts = useCallback(async (loadMore: boolean = false) => {
    if (!enabled) {
      console.log('fetchProducts: not enabled, skipping');
      return;
    }

    console.log('fetchProducts: starting fetch', { category, loadMore, enabled });

    try {
      setIsLoading(true);
      if (!loadMore) {
        setError(null);
      }

      const queryOptions: ProductQueryOptions = {
        category,
        ...(filter && { filter }),
        ...(searchQuery && { searchQuery }),
        first: pageSize,
        sortBy,
        sortDirection,
        ...(loadMore && nextCursor && { after: nextCursor })
      };

      console.log('fetchProducts: calling catalogService.getProducts with options:', queryOptions);
      const result = await catalogService.getProducts(queryOptions);
      console.log('fetchProducts: received result:', result);

      if (loadMore) {
        setProducts(prev => [...prev, ...result.products]);
      } else {
        setProducts(result.products);
        setTotalCount(result.totalCount);
      }

      setHasNextPage(result.pageInfo.hasNextPage);
      setNextCursor(result.pageInfo.endCursor);

    } catch (err) {
      const serviceError = err instanceof GraphQLServiceError 
        ? err 
        : new GraphQLServiceError(
            'UNKNOWN_ERROR' as any,
            err instanceof Error ? err.message : 'Unknown error',
            err instanceof Error ? err : undefined
          );
      
      setError(serviceError);
      console.error('Error fetching products:', serviceError);
    } finally {
      setIsLoading(false);
    }
  }, [category, filter, searchQuery, pageSize, sortBy, sortDirection, enabled, nextCursor]);

  const loadMoreProducts = useCallback(async () => {
    if (!hasNextPage || isLoading) return;
    await fetchProducts(true);
  }, [hasNextPage, isLoading, fetchProducts]);

  const refetchProducts = useCallback(async () => {
    setNextCursor(null);
    await fetchProducts(false);
  }, [fetchProducts]);

  // Initial fetch and refetch when dependencies change
  useEffect(() => {
    console.log('useProducts effect triggered:', { category, enabled, filter, searchQuery });
    if (enabled) {
      setNextCursor(null);
      fetchProducts(false);
    }
  }, [category, filter, searchQuery, sortBy, sortDirection, enabled]);

  return {
    products,
    totalCount,
    isLoading,
    error,
    hasNextPage,
    loadMore: loadMoreProducts,
    refetch: refetchProducts,
    isEmpty: products.length === 0 && !isLoading
  };
}