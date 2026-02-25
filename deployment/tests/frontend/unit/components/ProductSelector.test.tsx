/**
 * @fileoverview Unit tests for ProductSelector component.
 * 
 * Tests the main container component functionality including authentication integration,
 * pricing service integration, navigation, and notification management.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Provider as JotaiProvider } from 'jotai';
import { ProductSelector } from '../../../../src/frontend/src/components/ProductSelector';
import { useProductCatalog } from '../../../../src/frontend/src/hooks/useProductCatalog';
import { usePricingService } from '../../../../src/frontend/src/hooks/usePricingService';
import { useNavigation } from '../../../../src/frontend/src/hooks/useNavigation';
import { useCategoryFilters } from '../../../../src/frontend/src/hooks/useCategoryFilters';

// Mock all dependencies
jest.mock('@aws-amplify/ui-react');
jest.mock('../../../../src/frontend/src/hooks/useProductCatalog');
jest.mock('../../../../src/frontend/src/hooks/usePricingService');
jest.mock('../../../../src/frontend/src/hooks/useNavigation');
jest.mock('../../../../src/frontend/src/hooks/useCategoryFilters', () => ({
  useCategoryFilters: jest.fn()
}));

// Mock all child components to avoid complex dependency issues
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

const mockUseAuthenticator = useAuthenticator as jest.MockedFunction<typeof useAuthenticator>;
const mockUseProductCatalog = useProductCatalog as jest.MockedFunction<typeof useProductCatalog>;
const mockUsePricingService = usePricingService as jest.MockedFunction<typeof usePricingService>;
const mockUseNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;
const mockUseCategoryFilters = useCategoryFilters as jest.MockedFunction<typeof useCategoryFilters>;

// Default mock implementations
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
  selectedProduct: null,
  selectedProductId: null,
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
  isEmpty: true
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

/**
 * Renders ProductSelector with all required providers and mocks.
 */
const renderProductSelector = (props = {}) => {
  return render(
    <JotaiProvider>
      <MockedProvider mocks={[]} addTypename={false}>
        <ProductSelector {...props} />
      </MockedProvider>
    </JotaiProvider>
  );
};

describe('ProductSelector Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockUseAuthenticator.mockReturnValue(defaultAuthMock as any);
    mockUseProductCatalog.mockReturnValue(defaultProductCatalogMock as any);
    mockUsePricingService.mockReturnValue(defaultPricingServiceMock as any);
    mockUseNavigation.mockReturnValue(defaultNavigationMock as any);
    mockUseCategoryFilters.mockReturnValue(defaultCategoryFiltersMock as any);
  });

  describe('Initial Rendering', () => {
    it('should render product catalog header', () => {
      renderProductSelector();
      
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
      expect(screen.getByText(/Select a product category to browse/)).toBeInTheDocument();
    });

    it('should render category selector when no category is selected', () => {
      renderProductSelector();
      
      expect(screen.getByTestId('category-selector')).toBeInTheDocument();
    });

    it('should not render Generate button when no product is selected', () => {
      renderProductSelector();
      
      expect(screen.queryByText('Generate Pricing Analysis')).not.toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should integrate with all required hooks', () => {
      renderProductSelector();
      
      expect(mockUseAuthenticator).toHaveBeenCalled();
      expect(mockUseProductCatalog).toHaveBeenCalled();
      expect(mockUsePricingService).toHaveBeenCalled();
      expect(mockUseNavigation).toHaveBeenCalled();
    });

    it('should render child components when category is selected', () => {
      const mockWithCategory = {
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
      
      mockUseProductCatalog.mockReturnValue(mockWithCategory as any);
      
      renderProductSelector();
      
      expect(screen.getByTestId('product-search')).toBeInTheDocument();
      expect(screen.getByTestId('product-filters')).toBeInTheDocument();
      expect(screen.getByTestId('product-catalog-grid')).toBeInTheDocument();
    });

    it('should handle authentication state', () => {
      mockUseAuthenticator.mockReturnValue({ user: null } as any);
      
      renderProductSelector();
      
      // Component should still render even without authentication
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
    });

    it('should handle pricing service errors', () => {
      const mockWithError = {
        ...defaultPricingServiceMock,
        workflowError: new Error('Workflow failed')
      };
      
      mockUsePricingService.mockReturnValue(mockWithError as any);
      
      renderProductSelector();
      
      // Component should handle errors gracefully
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
    });

    it('should handle product loading errors', () => {
      const mockWithError = {
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
        productsError: new Error('Failed to load products')
      };
      
      mockUseProductCatalog.mockReturnValue(mockWithError as any);
      
      renderProductSelector();
      
      expect(screen.getByText('Error loading products')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderProductSelector();
      
      // Check for proper heading structure
      expect(screen.getByRole('heading', { name: 'Product Catalog' })).toBeInTheDocument();
    });
  });
});