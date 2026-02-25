/**
 * @fileoverview Amplify-based catalog service for product management.
 * 
 * Clean, simple service using AWS Amplify's GraphQL client with:
 * - Static categories bundled with the app
 * - Type-safe GraphQL operations (when codegen is set up)
 * - Automatic authentication and caching
 * - Simplified error handling
 */

import { client } from '../graphql/client';
import { PRODUCT_CATEGORIES, getCategoryById } from '../data/categories';
import { ProductCategory, CategoryInfo, ProductType } from '../types/product-types';

/**
 * GraphQL error types for better error handling.
 */
export enum GraphQLErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Custom error class for GraphQL operations.
 */
export class GraphQLServiceError extends Error {
  constructor(
    public type: GraphQLErrorType,
    message: string,
    public originalError?: Error,
    public query?: string
  ) {
    super(message);
    this.name = 'GraphQLServiceError';
  }
}

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
 * Product query options interface (for compatibility with useProducts hook).
 */
export interface ProductQueryOptions {
  category: ProductCategory;
  filter?: ProductFilter;
  searchQuery?: string;
  first?: number;
  after?: string;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Product list response interface.
 */
export interface ProductListResponse {
  products: ProductType[];
  totalCount: number;
  hasNextPage: boolean;
  nextCursor?: string;
}

/**
 * Category statistics interface.
 */
export interface CategoryStats {
  category: ProductCategory;
  totalProducts: number;
  productsByRole: Array<{ role: string; count: number }>;
  productsBySubcategory: Array<{ subcategory: string; count: number }>;
  priceRange: {
    min: number;
    max: number;
    average: number;
  };
}

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
 * Amplify-based catalog service class.
 */
class AmplifyProductCatalogService {
  /**
   * Get all available categories (static data).
   */
  async getCategories(): Promise<CategoryInfo[]> {
    // Return static categories - no API call needed
    return PRODUCT_CATEGORIES;
  }

  /**
   * Get category by ID (static data).
   */
  getCategoryById(categoryId: string): CategoryInfo | null {
    return getCategoryById(categoryId) || null;
  }

  /**
   * List products with pagination and filtering.
   */
  async listProducts(
    category: ProductCategory,
    options: {
      filter?: ProductFilter;
      first?: number;
      after?: string;
      sortBy?: string;
      sortDirection?: 'ASC' | 'DESC';
    } = {}
  ): Promise<ProductListResponse> {
    try {
      const { filter, first = 20, after, sortBy, sortDirection } = options;

      const result = await client.graphql({
        query: `
          query ListProducts(
            $category: ProductCategory!
            $filter: ProductFilter
            $first: Int
            $after: String
            $sortBy: ProductSortField
            $sortDirection: SortDirection
          ) {
            listProducts(
              category: $category
              filter: $filter
              first: $first
              after: $after
              sortBy: $sortBy
              sortDirection: $sortDirection
            ) {
              edges {
                node {
                  id
                  product_id
                  category
                  subcategory
                  role
                  vendor
                  cost
                  MSRP
                  MAP
                  yearTarget
                  attributes
                  features
                  imageUrl
                  createdAt
                  updatedAt
                }
                cursor
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
              totalCount
            }
          }
        `,
        variables: {
          category,
          ...(filter && Object.keys(filter).length > 0 && { filter }),
          first,
          after,
          sortBy,
          sortDirection
        }
      });

      const data = (result as any).data?.listProducts;
      if (!data) {
        throw new GraphQLServiceError(
          GraphQLErrorType.NOT_FOUND,
          'No product data returned'
        );
      }

      return {
        products: data.edges.map((edge: any) => edge.node),
        totalCount: data.totalCount,
        hasNextPage: data.pageInfo.hasNextPage,
        nextCursor: data.pageInfo.endCursor
      };
    } catch (error) {
      throw this.handleGraphQLError(error, 'listProducts');
    }
  }

  /**
   * Search products with full-text search.
   */
  async searchProducts(
    category: ProductCategory,
    query: string,
    options: {
      filter?: ProductFilter;
      first?: number;
      after?: string;
    } = {}
  ): Promise<ProductListResponse> {
    try {
      const { filter, first = 20, after } = options;

      const result = await client.graphql({
        query: `
          query SearchProducts(
            $category: ProductCategory!
            $query: String!
            $filter: ProductFilter
            $first: Int
            $after: String
          ) {
            searchProducts(
              category: $category
              query: $query
              filter: $filter
              first: $first
              after: $after
            ) {
              edges {
                node {
                  id
                  product_id
                  category
                  subcategory
                  role
                  vendor
                  cost
                  MSRP
                  MAP
                  yearTarget
                  attributes
                  features
                  imageUrl
                  createdAt
                  updatedAt
                }
                cursor
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
              totalCount
            }
          }
        `,
        variables: {
          category,
          query,
          ...(filter && Object.keys(filter).length > 0 && { filter }),
          first,
          after
        }
      });

      const data = (result as any).data?.searchProducts;
      if (!data) {
        throw new GraphQLServiceError(
          GraphQLErrorType.NOT_FOUND,
          'No search results returned'
        );
      }

      return {
        products: data.edges.map((edge: any) => edge.node),
        totalCount: data.totalCount,
        hasNextPage: data.pageInfo.hasNextPage,
        nextCursor: data.pageInfo.endCursor
      };
    } catch (error) {
      throw this.handleGraphQLError(error, 'searchProducts');
    }
  }

  /**
   * Get category statistics.
   */
  async getCategoryStats(category: ProductCategory): Promise<CategoryStats> {
    try {
      const result = await client.graphql({
        query: `
          query GetCategoryStats($category: ProductCategory!) {
            getCategoryStats(category: $category) {
              category
              totalProducts
              productsByRole {
                role
                count
              }
              productsBySubcategory {
                subcategory
                count
              }
              priceRange {
                min
                max
                average
              }
            }
          }
        `,
        variables: { category }
      });

      const data = (result as any).data?.getCategoryStats;
      if (!data) {
        throw new GraphQLServiceError(
          GraphQLErrorType.NOT_FOUND,
          'No category stats returned'
        );
      }

      return data;
    } catch (error) {
      throw this.handleGraphQLError(error, 'getCategoryStats');
    }
  }

  /**
   * Get products (compatibility method for useProducts hook).
   */
  async getProducts(options: {
    category: ProductCategory;
    filter?: ProductFilter;
    searchQuery?: string;
    first?: number;
    after?: string;
    sortBy?: string;
    sortDirection?: 'ASC' | 'DESC';
  }): Promise<{
    products: ProductType[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
      endCursor: string | null;
    };
    totalCount: number;
  }> {
    const { searchQuery, ...listOptions } = options;
    
    if (searchQuery) {
      const result = await this.searchProducts(options.category, searchQuery, listOptions);
      return {
        products: result.products,
        pageInfo: {
          hasNextPage: result.hasNextPage,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: result.nextCursor || null
        },
        totalCount: result.totalCount
      };
    } else {
      const result = await this.listProducts(options.category, listOptions);
      return {
        products: result.products,
        pageInfo: {
          hasNextPage: result.hasNextPage,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: result.nextCursor || null
        },
        totalCount: result.totalCount
      };
    }
  }

  /**
   * Get category filter options.
   */
  async getCategoryFilters(category: ProductCategory): Promise<CategoryFilterOptions> {
    try {
      const result = await client.graphql({
        query: `
          query GetCategoryFilters($category: ProductCategory!) {
            getCategoryFilters(category: $category) {
              category
              availableRoles
              availableSubcategories
              availableVendors
              priceRange {
                min
                max
                average
              }
              categorySpecificFilters
            }
          }
        `,
        variables: { category }
      });

      const data = (result as any).data?.getCategoryFilters;
      if (!data) {
        throw new GraphQLServiceError(
          GraphQLErrorType.NOT_FOUND,
          'No category filters returned'
        );
      }

      return data;
    } catch (error) {
      throw this.handleGraphQLError(error, 'getCategoryFilters');
    }
  }

  /**
   * Handle GraphQL errors and convert to service errors.
   */
  private handleGraphQLError(error: any, operation: string): GraphQLServiceError {
    console.error(`GraphQL error in ${operation}:`, error);

    // Handle Amplify GraphQL errors
    if (error.errors && error.errors.length > 0) {
      const graphqlError = error.errors[0];
      const message = graphqlError.message || 'GraphQL operation failed';
      
      // Determine error type based on error message/code
      if (message.includes('Unauthorized') || message.includes('Authentication')) {
        return new GraphQLServiceError(GraphQLErrorType.AUTHENTICATION_ERROR, message, error, operation);
      }
      
      if (message.includes('Forbidden') || message.includes('Access denied')) {
        return new GraphQLServiceError(GraphQLErrorType.AUTHORIZATION_ERROR, message, error, operation);
      }
      
      if (message.includes('Validation') || message.includes('Invalid')) {
        return new GraphQLServiceError(GraphQLErrorType.VALIDATION_ERROR, message, error, operation);
      }
      
      return new GraphQLServiceError(GraphQLErrorType.SERVER_ERROR, message, error, operation);
    }

    // Handle network errors
    if (error.name === 'NetworkError' || error.message?.includes('Network')) {
      return new GraphQLServiceError(
        GraphQLErrorType.NETWORK_ERROR,
        'Network error occurred. Please check your connection.',
        error,
        operation
      );
    }

    // Default to unknown error
    return new GraphQLServiceError(
      GraphQLErrorType.UNKNOWN_ERROR,
      error.message || 'An unknown error occurred',
      error,
      operation
    );
  }

  /**
   * Get service status (for compatibility).
   */
  getServiceStatus() {
    return {
      graphqlEnabled: true,
      amplifyConfigured: true
    };
  }

  /**
   * Get cache stats (for compatibility).
   */
  getCacheStats() {
    return {
      amplifyCache: { size: 0, sizeInBytes: 0 },
      lastCacheReset: new Date().toISOString()
    };
  }

  /**
   * Check GraphQL availability (for compatibility).
   */
  async checkGraphQLAvailability(): Promise<boolean> {
    try {
      const result = await client.graphql({
        query: `query { __typename }`
      });
      return !!(result as any).data;
    } catch (error) {
      console.warn('GraphQL service unavailable:', error);
      return false;
    }
  }

  /**
   * Clear cache (for compatibility).
   */
  async clearCache(): Promise<void> {
    console.log('Amplify cache cleared (handled automatically)');
  }

  /**
   * Reset cache (for compatibility).
   */
  async resetCache(): Promise<void> {
    console.log('Amplify cache reset (handled automatically)');
  }
}

/**
 * Singleton instance of the catalog service.
 */
export const catalogService = new AmplifyProductCatalogService();

export default catalogService;