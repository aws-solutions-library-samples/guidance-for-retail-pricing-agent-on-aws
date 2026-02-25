/**
 * @fileoverview React hooks for product catalog with hybrid architecture.
 * 
 * Combines static category data (bundled) with dynamic GraphQL-based product fetching
 * for optimal performance and scalability. Uses the updated CatalogService with
 * GraphQL integration and S3 fallback for backward compatibility.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { catalogService } from '../services/catalog-service';
import { ProductCategory, CategoryInfo } from '../types/product-types';
import { useProducts, ProductFilter } from './useProducts';
import { useCategoryStats } from './useCategoryStats';
import { useCategoryFilters } from './useCategoryFilters';
import { useAllCategoryStats } from './useAllCategoryStats';

// Re-export individual hooks for convenience
export { useProducts, type ProductFilter } from './useProducts';
export { useCategoryStats, type CategoryStats } from './useCategoryStats';
export { useCategoryFilters, type CategoryFilterOptions } from './useCategoryFilters';

/**
 * Hook for accessing category data with real product counts.
 * Categories load instantly from bundled data, then product counts are fetched via GraphQL.
 */
export function useCategories() {
  // Get all category stats (product counts) for all categories
  const { 
    updatedCategories, 
    isLoading: isLoadingCounts, 
    error: countsError,
    refetch: refetchCounts
  } = useAllCategoryStats();

  const getCategoryById = useCallback((categoryId: string) => {
    return catalogService.getCategoryById(categoryId);
  }, []);

  return {
    categories: updatedCategories,
    isLoading: isLoadingCounts,
    error: countsError,
    refetchCounts,
    getCategoryById
  };
}

/**
 * Hook for managing product selection and filtering state.
 * Combines static categories with GraphQL products for comprehensive catalog management.
 */
export function useProductCatalog() {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProductFilter>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'UPDATED_AT' | 'CREATED_AT' | 'PRICE' | 'NAME' | 'VENDOR'>('UPDATED_AT');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  // Get categories with real product counts
  const { categories, isLoading: isLoadingCategories, error: categoriesError, refetchCounts } = useCategories();

  // Get products for selected category
  const productQuery = useMemo(() => ({
    category: selectedCategory!,
    filter: filters,
    ...(searchQuery && { searchQuery }),
    sortBy,
    sortDirection,
    enabled: !!selectedCategory
  }), [selectedCategory, filters, searchQuery, sortBy, sortDirection]);

  const productsResult = useProducts(productQuery);

  // Get category stats to update bundled category data
  const { stats } = useCategoryStats(selectedCategory || 'powertools', !!selectedCategory);

  // Note: Category product counts are now fetched automatically by useAllCategoryStats
  // Individual category stats are still available for detailed analysis when a category is selected

  // Get filter options for selected category
  const { filterOptions } = useCategoryFilters(selectedCategory || 'powertools', !!selectedCategory);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearchQuery('');
  }, []);

  const selectCategory = useCallback((category: ProductCategory) => {
    setSelectedCategory(category);
    setSelectedProductId(null);
    clearFilters();
  }, [clearFilters]);

  const selectProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
  }, []);

  const selectedProduct = useMemo(() => 
    productsResult.products.find(p => p.product_id === selectedProductId),
    [productsResult.products, selectedProductId]
  );
  
  const selectedCategoryInfo = useMemo(() => 
    selectedCategory ? catalogService.getCategoryById(selectedCategory) : null,
    [selectedCategory]
  );

  return {
    // Categories (with real product counts)
    categories,
    isLoadingCategories,
    categoriesError,
    refetchCounts,
    selectedCategory,
    selectedCategoryInfo,
    selectCategory,
    
    // Products (GraphQL)
    products: selectedCategory ? productsResult.products : [],
    totalProductCount: selectedCategory ? productsResult.totalCount : 0,
    isLoadingProducts: selectedCategory ? productsResult.isLoading : false,
    productsError: selectedCategory ? productsResult.error : null,
    hasMoreProducts: selectedCategory ? productsResult.hasNextPage : false,
    loadMoreProducts: productsResult.loadMore,
    refetchProducts: productsResult.refetch,
    
    // Product selection
    selectedProduct,
    selectedProductId,
    selectProduct,
    
    // Filtering and search
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    clearFilters,
    filterOptions,
    
    // Sorting
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    
    // Utility
    isEmpty: !selectedCategory || productsResult.isEmpty
  };
}