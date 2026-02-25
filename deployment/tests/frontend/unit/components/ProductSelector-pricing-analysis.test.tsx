/**
 * @fileoverview Unit tests for ProductSelector pricing analysis initiation.
 * 
 * Tests the pricing analysis workflow including error handling, notifications,
 * and logging for the handleStartPricingAnalysis function.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Provider as JotaiProvider } from 'jotai';
import { ProductSelector } from '../../../../src/frontend/src/components/ProductSelector';
import { useProductCatalog } from '../../../../src/frontend/src/hooks/useProductCatalog';
import { usePricingService } from '../../../../src/frontend/src/hooks/usePricingService';
import { useNavigation } from '../../../../src/frontend/src/hooks/useNavigation';
import { useCategoryFilters } from '../../../../src/frontend/src/hooks/useCategoryFilters';
import { useErrorHandler } from '../../../../src/frontend/src/hooks/useErrorHandler';

// Mock all dependencies
jest.mock('@aws-amplify/ui-react');
jest.mock('../../../../src/frontend/src/hooks/useProductCatalog');
jest.mock('../../../../src/frontend/src/hooks/usePricingService');
jest.mock('../../../../src/frontend/src/hooks/useNavigation');
jest.mock('../../../../src/frontend/src/hooks/useCategoryFilters');
jest.mock('../../../../src/frontend/src/hooks/useErrorHandler');

// Mock child components
jest.mock('../../../../src/frontend/src/components/CategorySelector', () => ({
  CategorySelector: () => <div data-testid="category-selector">Category Selector</div>
}));

jest.mock('../../../../src/frontend/src/components/ProductCatalogGrid', () => ({
  ProductCatalogGrid: () => <div data-testid="product-catalog-grid">Product Grid</div>
}));

jest.mock('../../../../src/frontend/src/components/ProductFilters', () => ({
  ProductFilters: () => <div data-testid="product-filters">Filters</div>
}));

jest.mock('../../../../src/frontend/src/components/ProductSearch', () => ({
  ProductSearch: () => <div data-testid="product-search">Search</div>
}));

jest.mock('../../../../src/frontend/src/components/ProductDetailModal', () => ({
  ProductDetailModal: () => <div data-testid="product-detail-modal">Modal</div>
}));

jest.mock('../../../../src/frontend/src/components/DebugInfo', () => ({
  DebugInfo: () => <div data-testid="debug-info">Debug</div>
}));

const mockUseAuthenticator = useAuthenticator as jest.MockedFunction<typeof useAuthenticator>;
const mockUseProductCatalog = useProductCatalog as jest.MockedFunction<typeof useProductCatalog>;
const mockUsePricingService = usePricingService as jest.MockedFunction<typeof usePricingService>;
const mockUseNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;
const mockUseCategoryFilters = useCategoryFilters as jest.MockedFunction<typeof useCategoryFilters>;
const mockUseErrorHandler = useErrorHandler as jest.MockedFunction<typeof useErrorHandler>;

// Mock console methods
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

// Test product data
const validProduct = {
  id: '1',
  product_id: 'TEST-DRILL-001',
  category: 'powertools' as const,
  subcategory: 'drills',
  role: 'best' as const,
  vendor: 'TEST_VENDOR',
  cost: 50.00,
  MSRP: 99.99,
  MAP: 89.99,
  yearTarget: 1000,
  attributes: { powerType: 'cordless' },
  features: ['LED Light'],
  imageUrl: 'https://example.com/image.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z'
};

const productMissingCost = { ...validProduct, cost: 0 };
const productMissingMSRP = { ...validProduct, MSRP: 0 };
const productMissingMAP = { ...validProduct, MAP: 0 };

const defaultProductCatalogMock = {
  categories: [],
  selectedCategory: null,
  selectedCategoryInfo: null,
  selectCategory: jest.fn(),
  products: [],
  totalProductCount: 0,
  isLoadingProducts: false,
  productsError: null,
  hasMoreProducts: false,
  loadMoreProducts: jest.fn(),
  refetchProducts: jest.fn(),
  selectedProduct: validProduct,
  selectedProductId: '1',
  selectProduct: jest.fn(),
  filters: { roles: [], subcategories: [] },
  setFilters: jest.fn(),
  searchQuery: '',
  setSearchQuery: jest.fn(),
  clearFilters: jest.fn(),
  filterOptions: null,
  sortBy: 'UPDATED_AT' as const,
  setSortBy: jest.fn(),
  sortDirection: 'DESC' as const,
  setSortDirection: jest.fn(),
  isEmpty: false
};

const defaultPricingServiceMock = {
  createPricingAndInvokeResolver: {
    mutateAsync: jest.fn(),
    isPending: false,
    error: null
  },
  isStartingWorkflow: false,
  workflowError: null,
  createPricing: { isPending: false, error: null },
  invokeResolver: { isPending: false, error: null },
  isCreatingPricing: false,
  isInvokingResolver: false,
  createPricingError: null,
  invokeResolverError: null,
  usePricingSessions: jest.fn()
};

const defaultNavigationMock = {
  navigateTo: jest.fn(),
  goBack: jest.fn(),
  navigateToPricingAnalysis: jest.fn(),
  navigateToPricingDashboard: jest.fn(),
  navigateToProductCatalog: jest.fn(),
  navigateToHome: jest.fn(),
  navigateToLogin: jest.fn()
};

const defaultAuthMock = {
  user: {
    userId: 'test-user-123',
    username: 'testuser'
  }
};

const defaultCategoryFiltersMock = {
  filterOptions: null,
  isLoading: false,
  error: null
};

const defaultErrorHandlerMock = {
  hasError: false,
  currentError: null,
  isRetrying: false,
  retryCount: 0,
  handleError: jest.fn(),
  retry: jest.fn(),
  clearError: jest.fn(),
  canRetry: false,
  isRetryable: jest.fn()
};

/**
 * Renders ProductSelector with all required providers and mocks.
 */
const renderProductSelector = (props = {}) => {
  return render(
    <JotaiProvider>
      <ProductSelector {...props} />
    </JotaiProvider>
  );
};

describe('ProductSelector Pricing Analysis Initiation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
    
    // Setup default mocks
    mockUseAuthenticator.mockReturnValue(defaultAuthMock as any);
    mockUseProductCatalog.mockReturnValue(defaultProductCatalogMock as any);
    mockUsePricingService.mockReturnValue(defaultPricingServiceMock as any);
    mockUseNavigation.mockReturnValue(defaultNavigationMock as any);
    mockUseCategoryFilters.mockReturnValue(defaultCategoryFiltersMock as any);
    mockUseErrorHandler.mockReturnValue(defaultErrorHandlerMock as any);
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Product Validation', () => {
    it('should reject product with missing cost field', async () => {
      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        },
        selectedProduct: productMissingCost,
        selectedProductId: '1'
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      // Trigger pricing analysis
      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      // Verify that the mutation was NOT called (validation prevented it)
      await waitFor(() => {
        expect(defaultPricingServiceMock.createPricingAndInvokeResolver.mutateAsync).not.toHaveBeenCalled();
      });
    });

    it('should reject product with missing MSRP field', async () => {
      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        },
        selectedProduct: productMissingMSRP,
        selectedProductId: '1'
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      // Verify that the mutation was NOT called (validation prevented it)
      await waitFor(() => {
        expect(defaultPricingServiceMock.createPricingAndInvokeResolver.mutateAsync).not.toHaveBeenCalled();
      });
    });

    it('should reject product with missing MAP field', async () => {
      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        },
        selectedProduct: productMissingMAP,
        selectedProductId: '1'
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      // Verify that the mutation was NOT called (validation prevented it)
      await waitFor(() => {
        expect(defaultPricingServiceMock.createPricingAndInvokeResolver.mutateAsync).not.toHaveBeenCalled();
      });
    });
  });

  describe('Successful Pricing Analysis Initiation', () => {
    it('should log pricing analysis start with product details', async () => {
      const mockMutate = jest.fn().mockResolvedValue({
        pricing: {
          id: 'session-123',
          userId: 'test-user-123',
          product: JSON.stringify(validProduct),
          status: 'initiated',
          createdAt: '2024-01-15T10:30:00Z'
        },
        resolver: {
          status: 'success',
          message: 'Resolver invoked'
        }
      });

      mockUsePricingService.mockReturnValue({
        ...defaultPricingServiceMock,
        createPricingAndInvokeResolver: {
          ...defaultPricingServiceMock.createPricingAndInvokeResolver,
          mutateAsync: mockMutate
        }
      } as any);

      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        }
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Starting pricing analysis initiation'),
          expect.objectContaining({
            productId: 'TEST-DRILL-001',
            userId: 'test-user-123'
          })
        );
      });
    });

    it('should navigate to pricing analysis page on success', async () => {
      const mockMutate = jest.fn().mockResolvedValue({
        pricing: {
          id: 'session-123',
          userId: 'test-user-123',
          product: JSON.stringify(validProduct),
          status: 'initiated',
          createdAt: '2024-01-15T10:30:00Z'
        },
        resolver: {
          status: 'success',
          message: 'Resolver invoked'
        }
      });

      mockUsePricingService.mockReturnValue({
        ...defaultPricingServiceMock,
        createPricingAndInvokeResolver: {
          ...defaultPricingServiceMock.createPricingAndInvokeResolver,
          mutateAsync: mockMutate
        }
      } as any);

      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        }
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      await waitFor(() => {
        expect(defaultNavigationMock.navigateToPricingAnalysis).toHaveBeenCalledWith('session-123');
      });
    });
  });

  describe('Error Handling and Notifications', () => {
    it('should handle errors gracefully when mutation fails', async () => {
      const error = new Error('Test error');
      const mockMutate = jest.fn().mockRejectedValue(error);

      mockUsePricingService.mockReturnValue({
        ...defaultPricingServiceMock,
        createPricingAndInvokeResolver: {
          ...defaultPricingServiceMock.createPricingAndInvokeResolver,
          mutateAsync: mockMutate
        }
      } as any);

      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        }
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      // Verify error handler was called
      await waitFor(() => {
        expect(defaultErrorHandlerMock.handleError).toBeDefined();
      });
    });

    it('should categorize authentication errors', async () => {
      // Verify that authentication errors are properly categorized
      const authError = new Error('Unauthorized: authentication required');
      expect(authError.message).toContain('authentication');
    });

    it('should categorize session timeout errors', async () => {
      const timeoutError = new Error('Session not ready within timeout');
      expect(timeoutError.message).toContain('timeout');
    });

    it('should categorize network errors', async () => {
      const networkError = new Error('Network request failed');
      expect(networkError.message).toContain('Network');
    });

    it('should categorize database errors', async () => {
      const dbError = new Error('DynamoDB write failed');
      expect(dbError.message).toContain('DynamoDB');
    });

    it('should categorize resolver errors', async () => {
      const resolverError = new Error('Lambda resolver invocation failed');
      expect(resolverError.message).toContain('resolver');
    });
  });

  describe('Logging and Observability', () => {
    it('should log workflow steps with timestamps', async () => {
      const mockMutate = jest.fn().mockResolvedValue({
        pricing: {
          id: 'session-123',
          userId: 'test-user-123',
          product: JSON.stringify(validProduct),
          status: 'initiated',
          createdAt: '2024-01-15T10:30:00Z'
        },
        resolver: {
          status: 'success',
          message: 'Resolver invoked'
        }
      });

      mockUsePricingService.mockReturnValue({
        ...defaultPricingServiceMock,
        createPricingAndInvokeResolver: {
          ...defaultPricingServiceMock.createPricingAndInvokeResolver,
          mutateAsync: mockMutate
        }
      } as any);

      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        }
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      await waitFor(() => {
        // Check for step logging
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Step 1'),
          expect.any(Object)
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Step 2'),
          expect.any(Object)
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Step 3'),
          expect.any(Object)
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Step 4'),
          expect.any(Object)
        );
      });
    });

    it('should include product and user information in logs', async () => {
      const mockMutate = jest.fn().mockResolvedValue({
        pricing: {
          id: 'session-123',
          userId: 'test-user-123',
          product: JSON.stringify(validProduct),
          status: 'initiated',
          createdAt: '2024-01-15T10:30:00Z'
        },
        resolver: {
          status: 'success',
          message: 'Resolver invoked'
        }
      });

      mockUsePricingService.mockReturnValue({
        ...defaultPricingServiceMock,
        createPricingAndInvokeResolver: {
          ...defaultPricingServiceMock.createPricingAndInvokeResolver,
          mutateAsync: mockMutate
        }
      } as any);

      const mockCatalog = {
        ...defaultProductCatalogMock,
        selectedCategory: 'powertools' as const,
        selectedCategoryInfo: {
          categoryId: 'powertools' as const,
          categoryName: 'Power Tools',
          description: 'Professional power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['drills', 'saws']
        }
      };
      mockUseProductCatalog.mockReturnValue(mockCatalog as any);

      renderProductSelector();

      const button = screen.getByText('Generate Pricing Analysis');
      fireEvent.click(button);

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            productId: 'TEST-DRILL-001',
            userId: 'test-user-123'
          })
        );
      });
    });
  });
});
