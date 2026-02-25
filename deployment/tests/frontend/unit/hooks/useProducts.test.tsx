/**
 * @fileoverview Tests for useProducts hook with cursor-based pagination.
 * 
 * Tests the useProducts hook functionality including pagination,
 * filtering, searching, and error handling.
 */

// @ts-nocheck
import { renderHook, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { ReactNode } from 'react';
import { useProducts, ProductFilter } from '@/hooks/useProducts';
import { LIST_PRODUCTS, SEARCH_PRODUCTS } from '@/graphql/queries';

// Mock data
const mockProducts = [
  {
    id: '1',
    product_id: 'CMAN-SAW-PRO725',
    category: 'powertools',
    subcategory: 'saws',
    role: 'best',
    vendor: 'CRAFTSMAN',
    cost: 89.99,
    MSRP: 179.99,
    MAP: 149.99,
    yearTarget: 5000,
    attributes: '{"powerType":"cordless","batteryVoltage":"60V MAX"}',
    features: ['Brushless Motor', 'LED Light'],
    imageUrl: 'https://example.com/image1.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    product_id: 'DEWALT-DRILL-D001',
    category: 'powertools',
    subcategory: 'drills',
    role: 'better',
    vendor: 'DEWALT',
    cost: 65.99,
    MSRP: 129.99,
    MAP: 109.99,
    yearTarget: 8000,
    attributes: '{"powerType":"cordless","batteryVoltage":"20V MAX"}',
    features: ['Compact Design', 'LED Light'],
    imageUrl: 'https://example.com/image2.jpg',
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  }
];

const mockConnection = {
  edges: mockProducts.map((product, index) => ({
    node: product,
    cursor: `cursor-${index + 1}`
  })),
  pageInfo: {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: 'cursor-1',
    endCursor: 'cursor-2'
  },
  totalCount: 2
};

describe('useProducts Hook', () => {
  const createWrapper = (mocks: any[] = []) => {
    return ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    );
  };

  describe('Basic Functionality', () => {
    it('should fetch products for a category', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.products).toEqual([]);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(2);
      expect(result.current.products[0].product_id).toBe('CMAN-SAW-PRO725');
      expect(result.current.products[1].product_id).toBe('DEWALT-DRILL-D001');
      expect(result.current.totalCount).toBe(2);
      expect(result.current.hasNextPage).toBe(false);
    });

    it('should not fetch when disabled', () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: false
        }),
        { wrapper: createWrapper(mocks) }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.products).toEqual([]);
    });

    it('should handle empty results', async () => {
      const emptyConnection = {
        edges: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null
        },
        totalCount: 0
      };

      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: emptyConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.isEmpty).toBe(true);
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('Filtering', () => {
    it('should apply filters to query', async () => {
      const filter: ProductFilter = {
        roles: ['best'],
        subcategories: ['saws'],
        vendors: ['CRAFTSMAN'],
        priceRange: { min: 100, max: 200 },
        attributes: { powerType: ['cordless'] }
      };

      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              filter,
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: {
                edges: [mockConnection.edges[0]], // Only first product matches
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: 'cursor-1',
                  endCursor: 'cursor-1'
                },
                totalCount: 1
              }
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          filter,
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(1);
      expect(result.current.products[0].product_id).toBe('CMAN-SAW-PRO725');
      expect(result.current.totalCount).toBe(1);
    });

    it('should handle empty filter object', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              filter: {},
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          filter: {},
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(2);
    });
  });

  describe('Search Functionality', () => {
    it('should use search query when provided', async () => {
      const mocks = [
        {
          request: {
            query: SEARCH_PRODUCTS,
            variables: {
              category: 'powertools',
              query: 'cordless saw',
              first: 20
            }
          },
          result: {
            data: {
              searchProducts: {
                edges: [mockConnection.edges[0]], // Only saw matches
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: 'cursor-1',
                  endCursor: 'cursor-1'
                },
                totalCount: 1
              }
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          searchQuery: 'cordless saw',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(1);
      expect(result.current.products[0].product_id).toBe('CMAN-SAW-PRO725');
    });

    it('should combine search with filters', async () => {
      const filter: ProductFilter = {
        roles: ['best']
      };

      const mocks = [
        {
          request: {
            query: SEARCH_PRODUCTS,
            variables: {
              category: 'powertools',
              query: 'cordless',
              filter,
              first: 20
            }
          },
          result: {
            data: {
              searchProducts: {
                edges: [mockConnection.edges[0]],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: 'cursor-1',
                  endCursor: 'cursor-1'
                },
                totalCount: 1
              }
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          searchQuery: 'cordless',
          filter,
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(1);
    });
  });

  describe('Cursor-based Pagination', () => {
    it('should load more products with cursor pagination', async () => {
      const firstPageConnection = {
        edges: [mockConnection.edges[0]],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-1'
        },
        totalCount: 2
      };

      const secondPageConnection = {
        edges: [mockConnection.edges[1]],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: true,
          startCursor: 'cursor-2',
          endCursor: 'cursor-2'
        },
        totalCount: 2
      };

      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 1, // Small page size for testing
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: firstPageConnection
            }
          }
        },
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 1,
              after: 'cursor-1',
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: secondPageConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          first: 1,
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      // Wait for first page to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);

      // Load more products
      await result.current.loadMore();

      await waitFor(() => {
        expect(result.current.products).toHaveLength(2);
      });

      expect(result.current.hasNextPage).toBe(false);
      expect(result.current.products[0].product_id).toBe('CMAN-SAW-PRO725');
      expect(result.current.products[1].product_id).toBe('DEWALT-DRILL-D001');
    });

    it('should handle loadMore when no more pages', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(false);

      // Should not make additional request
      await result.current.loadMore();

      expect(result.current.products).toHaveLength(2);
    });
  });

  describe('Sorting', () => {
    it('should apply sorting parameters', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'PRICE',
              sortDirection: 'ASC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          sortBy: 'PRICE',
          sortDirection: 'ASC',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.products).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle GraphQL errors', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          error: new Error('GraphQL error')
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.products).toEqual([]);
      expect(result.current.error?.message).toBe('GraphQL error');
    });

    it('should handle network errors', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          networkError: new Error('Network error')
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.products).toEqual([]);
    });
  });

  describe('Refetch Functionality', () => {
    it('should refetch products', async () => {
      const mocks = [
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: mockConnection
            }
          }
        },
        {
          request: {
            query: LIST_PRODUCTS,
            variables: {
              category: 'powertools',
              first: 20,
              sortBy: 'UPDATED_AT',
              sortDirection: 'DESC'
            }
          },
          result: {
            data: {
              listProducts: {
                ...mockConnection,
                totalCount: 3 // Updated count
              }
            }
          }
        }
      ];

      const { result } = renderHook(
        () => useProducts({
          category: 'powertools',
          enabled: true
        }),
        { wrapper: createWrapper(mocks) }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.totalCount).toBe(2);

      // Refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.totalCount).toBe(3);
      });
    });
  });
});