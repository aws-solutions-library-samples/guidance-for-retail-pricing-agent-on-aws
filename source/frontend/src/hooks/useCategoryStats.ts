/**
 * @fileoverview Hook for getting category statistics using CatalogService.
 * 
 * Fetches category statistics like product counts and price ranges
 * using the hybrid CatalogService with GraphQL and S3 fallback.
 */

import { useState, useEffect, useCallback } from 'react';
import { catalogService, GraphQLServiceError } from '../services/catalog-service';
import { ProductCategory } from '../types/product-types';

/**
 * Category statistics interface.
 */
export interface CategoryStats {
  category: ProductCategory;
  totalProducts: number;
  productsByRole: Array<{
    role: string;
    count: number;
  }>;
  productsBySubcategory: Array<{
    subcategory: string;
    count: number;
  }>;
  priceRange: {
    min: number;
    max: number;
    average: number;
  };
}

/**
 * Hook return type for useCategoryStats.
 */
export interface UseCategoryStatsResult {
  stats: CategoryStats | null;
  isLoading: boolean;
  error: GraphQLServiceError | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for getting category statistics using CatalogService.
 * 
 * @param category - Product category to get stats for
 * @param enabled - Whether to enable the query (default: true)
 * @returns Category statistics with loading state
 */
export function useCategoryStats(
  category: ProductCategory, 
  enabled: boolean = true
): UseCategoryStatsResult {
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GraphQLServiceError | null>(null);

  const fetchStats = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const categoryStats = await catalogService.getCategoryStats(category);
      setStats(categoryStats);
    } catch (err) {
      const serviceError = err instanceof GraphQLServiceError 
        ? err 
        : new GraphQLServiceError(
            'UNKNOWN_ERROR' as any,
            err instanceof Error ? err.message : 'Unknown error',
            err instanceof Error ? err : undefined
          );
      
      setError(serviceError);
      console.error('Error fetching category stats:', serviceError);
    } finally {
      setIsLoading(false);
    }
  }, [category, enabled]);

  const refetch = useCallback(async () => {
    await fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refetch
  };
}