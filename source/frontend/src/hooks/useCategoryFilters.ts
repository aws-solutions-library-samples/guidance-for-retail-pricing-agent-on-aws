/**
 * @fileoverview Hook for getting available filter options using CatalogService.
 * 
 * Fetches available filter options like roles, subcategories, vendors,
 * and category-specific attributes using the hybrid CatalogService.
 */

import { useState, useEffect, useCallback } from 'react';
import { catalogService, GraphQLServiceError } from '../services/catalog-service';
import { ProductCategory } from '../types/product-types';

/**
 * Category filter options interface.
 */
export interface CategoryFilterOptions {
  category: ProductCategory;
  availableRoles: string[];
  availableSubcategories: string[];
  availableVendors: string[];
  priceRange: {
    min: number;
    max: number;
    average: number;
  };
  categorySpecificFilters: Record<string, any>;
}

/**
 * Hook return type for useCategoryFilters.
 */
export interface UseCategoryFiltersResult {
  filterOptions: CategoryFilterOptions | null;
  isLoading: boolean;
  error: GraphQLServiceError | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for getting available filter options using CatalogService.
 * 
 * @param category - Product category to get filter options for
 * @param enabled - Whether to enable the query (default: true)
 * @returns Available filter options with loading state
 */
export function useCategoryFilters(
  category: ProductCategory, 
  enabled: boolean = true
): UseCategoryFiltersResult {
  const [filterOptions, setFilterOptions] = useState<CategoryFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GraphQLServiceError | null>(null);

  const fetchFilters = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const filters = await catalogService.getCategoryFilters(category);
      setFilterOptions(filters);
    } catch (err) {
      const serviceError = err instanceof GraphQLServiceError 
        ? err 
        : new GraphQLServiceError(
            'UNKNOWN_ERROR' as any,
            err instanceof Error ? err.message : 'Unknown error',
            err instanceof Error ? err : undefined
          );
      
      setError(serviceError);
      console.error('Error fetching category filters:', serviceError);
    } finally {
      setIsLoading(false);
    }
  }, [category, enabled]);

  const refetch = useCallback(async () => {
    await fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  return {
    filterOptions,
    isLoading,
    error,
    refetch
  };
}