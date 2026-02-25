/**
 * @fileoverview Hook for fetching product counts for all categories.
 * 
 * Fetches product counts for all available categories to display
 * accurate counts in the category selector. Uses the same GraphQL
 * pattern as the Test Graph button.
 */

import { useState, useEffect, useCallback } from 'react';
import { client } from '../graphql/client';
import { ProductCategory, CategoryInfo } from '../types/product-types';
import { PRODUCT_CATEGORIES } from '../data/categories';
import catalogService from '@/services/catalog-service';

/**
 * Category count result interface.
 */
export interface CategoryCount {
  categoryId: ProductCategory;
  productCount: number;
  error?: string;
}

/**
 * Hook return type for useAllCategoryStats.
 */
export interface UseAllCategoryStatsResult {
  categoryCounts: CategoryCount[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updatedCategories: CategoryInfo[];
}

/**
 * Hook for fetching product counts for all categories.
 * 
 * Fetches the total product count for each category using GraphQL
 * and returns updated category information with real counts.
 * 
 * @param enabled - Whether to enable the query (default: true)
 * @returns Category counts with loading state and updated categories
 */
export function useAllCategoryStats(enabled: boolean = true): UseAllCategoryStatsResult {
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetches product count for a single category.
   * 
   * @param category - Category to fetch count for
   * @returns Promise resolving to category count
   */
  const fetchCategoryCount = useCallback(async (category: ProductCategory): Promise<CategoryCount> => {
    try {
      console.log(`Fetching count for category: ${category}`);
      const stats = await catalogService.getCategoryStats(category);

      // console.log(`Raw result for ${category}:`, result);
      const totalCount = stats.totalProducts
      // console.log(`Extracted totalCount for ${category}:`, totalCount);
      
      return {
        categoryId: category,
        productCount: totalCount
      };
    } catch (err) {
      console.error(`Error fetching count for category ${category}:`, err);
      return {
        categoryId: category,
        productCount: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  }, []);

  /**
   * Fetches product counts for all categories.
   */
  const fetchAllCategoryCounts = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      // Get all category IDs from static data
      const categoryIds = PRODUCT_CATEGORIES.map(cat => cat.categoryId as ProductCategory);
      // console.log('Fetching counts for categories:', categoryIds);
      
      // Fetch counts for all categories in parallel
      const countPromises = categoryIds.map(categoryId => fetchCategoryCount(categoryId));
      const counts = await Promise.all(countPromises);
      
      // console.log('All category counts fetched:', counts);
      setCategoryCounts(counts);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch category counts');
      setError(error);
      console.error('Error fetching all category counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, fetchCategoryCount]);

  const refetch = useCallback(async () => {
    await fetchAllCategoryCounts();
  }, [fetchAllCategoryCounts]);

  // Fetch counts on mount and when enabled changes
  useEffect(() => {
    fetchAllCategoryCounts();
  }, [fetchAllCategoryCounts]);

  // Create updated categories with real product counts
  const updatedCategories = useCallback((): CategoryInfo[] => {
    // console.log('Creating updated categories with counts:', categoryCounts);
    const result = PRODUCT_CATEGORIES.map(category => {
      const countData = categoryCounts.find(count => count.categoryId === category.categoryId);
      const updatedCategory = {
        ...category,
        productCount: countData?.productCount || 0
      };
      // console.log(`Updated category ${category.categoryId}:`, updatedCategory);
      return updatedCategory;
    });
    // console.log('Final updated categories:', result);
    return result;
  }, [categoryCounts]);

  return {
    categoryCounts,
    isLoading,
    error,
    refetch,
    updatedCategories: updatedCategories()
  };
}