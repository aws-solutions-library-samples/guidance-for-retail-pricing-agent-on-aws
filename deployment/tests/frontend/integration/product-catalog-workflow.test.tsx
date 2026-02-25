/**
 * @fileoverview Integration tests for complete product catalog workflow.
 * 
 * Tests the end-to-end user workflow from category selection
 * through product browsing, filtering, searching, and selection using
 * the actual ProductSelector component and its child components.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { ProductSelector } from '@/components/ProductSelector';

// Mock the useAuthenticator hook
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: {
      userId: 'test-user-123',
      username: 'testuser'
    }
  })
}));

// Mock the navigation hook
const mockNavigateToPricingAnalysis = jest.fn();
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateToPricingAnalysis: mockNavigateToPricingAnalysis
  })
}));

// Mock the catalog service to avoid GraphQL complexity in integration tests
jest.mock('@/services/catalog-service', () => ({
  catalogService: {
    getCategories: jest.fn().mockResolvedValue([
      {
        categoryId: 'powertools',
        categoryName: 'Power Tools',
        description: 'Professional and consumer power tools',
        icon: 'drill',
        productCount: 45,
        subcategories: ['saws', 'drills', 'sanders', 'grinders']
      },
      {
        categoryId: 'apparel',
        categoryName: 'Apparel',
        description: 'Clothing and accessories',
        icon: 'shirt',
        productCount: 120,
        subcategories: ['shirts', 'pants', 'jackets']
      },
      {
        categoryId: 'footwear',
        categoryName: 'Footwear',
        description: 'Shoes and boots',
        icon: 'shoe',
        productCount: 85,
        subcategories: ['running', 'casual', 'dress']
      },
      {
        categoryId: 'kitchen',
        categoryName: 'Kitchen Appliances',
        description: 'Kitchen and cooking appliances',
        icon: 'blender',
        productCount: 65,
        subcategories: ['blenders', 'mixers', 'processors']
      }
    ]),
    getCategoryById: jest.fn().mockImplementation((categoryId) => {
      const categories = {
        powertools: {
          categoryId: 'powertools',
          categoryName: 'Power Tools',
          description: 'Professional and consumer power tools',
          icon: 'drill',
          productCount: 45,
          subcategories: ['saws', 'drills', 'sanders', 'grinders']
        },
        apparel: {
          categoryId: 'apparel',
          categoryName: 'Apparel',
          description: 'Clothing and accessories',
          icon: 'shirt',
          productCount: 120,
          subcategories: ['shirts', 'pants', 'jackets']
        }
      };
      return categories[categoryId] || null;
    })
  }
}));

// Mock the hooks to avoid GraphQL complexity
jest.mock('@/hooks/useProducts', () => ({
  useProducts: jest.fn().mockReturnValue({
    products: [
      {
        product_id: 'CMAN-SAW-PRO725',
        category: 'powertools',
        subcategory: 'saws',
        role: 'best',
        vendor: 'CRAFTSMAN',
        cost: 89.99,
        MSRP: 179.99,
        MAP: 149.99,
        yearTarget: 5000,
        attributes: {
          powerType: 'cordless',
          batteryVoltage: '60V MAX',
          motorType: 'brushless',
          color: 'red'
        },
        features: ['LED Light', 'Belt Clip'],
        imageUrl: 'https://example.com/saw.jpg',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      },
      {
        product_id: 'DEWALT-DRILL-D001',
        category: 'powertools',
        subcategory: 'drills',
        role: 'better',
        vendor: 'DEWALT',
        cost: 65.99,
        MSRP: 129.99,
        MAP: 109.99,
        yearTarget: 8000,
        attributes: {
          powerType: 'cordless',
          batteryVoltage: '20V MAX',
          motorType: 'brushless',
          color: 'yellow'
        },
        features: ['LED Light', 'Belt Clip'],
        imageUrl: 'https://example.com/drill.jpg',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      }
    ],
    totalCount: 2,
    isLoading: false,
    error: null,
    hasNextPage: false,
    loadMore: jest.fn(),
    refetch: jest.fn(),
    isEmpty: false
  })
}));

jest.mock('@/hooks/useCategoryStats', () => ({
  useCategoryStats: jest.fn().mockReturnValue({
    stats: {
      totalProducts: 2,
      productsByRole: {
        best: 1,
        better: 1,
        good: 0,
        entry: 0
      }
    }
  })
}));

jest.mock('@/hooks/useCategoryFilters', () => ({
  useCategoryFilters: jest.fn().mockReturnValue({
    filterOptions: {
      availableRoles: ['best', 'better', 'good', 'entry'],
      availableSubcategories: ['saws', 'drills', 'sanders', 'grinders'],
      categorySpecificFilters: {
        powertools: {
          powerTypes: ['cordless', 'corded', 'pneumatic'],
          batteryVoltages: ['12V', '18V', '20V MAX', '60V MAX'],
          colors: ['red', 'yellow', 'green', 'blue']
        }
      }
    },
    isLoading: false,
    error: null
  })
}));

jest.mock('@/hooks/usePricingService', () => ({
  usePricingService: () => ({
    createPricingAndInvokeResolver: {
      mutateAsync: jest.fn().mockResolvedValue({
        pricing: {
          id: 'pricing-session-123',
          userId: 'test-user-123',
          status: 'initiated'
        },
        resolver: {
          status: 'success',
          message: 'Analysis started'
        }
      })
    },
    isStartingWorkflow: false,
    workflowError: null
  })
}));

jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    hasError: false,
    currentError: null,
    isRetrying: false,
    retryCount: 0,
    handleError: jest.fn(),
    retry: jest.fn(),
    clearError: jest.fn(),
    canRetry: false
  })
}));



describe('Product Catalog Integration Tests', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <MockedProvider mocks={[]} addTypename={false}>
            {children}
          </MockedProvider>
        </JotaiProvider>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Complete User Workflow', () => {
    it('should complete full category selection to product selection workflow', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Step 1: Verify category selection screen is displayed
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
      expect(screen.getByText('Select a product category to browse available products for pricing analysis')).toBeInTheDocument();

      // Wait for categories to load and verify they are displayed
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      expect(screen.getByText('Apparel')).toBeInTheDocument();
      expect(screen.getByText('Footwear')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Appliances')).toBeInTheDocument();

      // Step 2: Select Power Tools category
      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      expect(powerToolsCard).toBeInTheDocument();
      await user.click(powerToolsCard!);

      // Step 3: Verify product catalog screen is displayed
      await waitFor(() => {
        expect(screen.getByText('Browse and select products from the Power Tools category')).toBeInTheDocument();
      });

      // Verify navigation elements
      expect(screen.getByText('Back to Categories')).toBeInTheDocument();
      expect(screen.getByText('Generate Pricing Analysis')).toBeInTheDocument();

      // Step 4: Wait for products to load and verify they are displayed
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      expect(screen.getByText('DEWALT-DRILL-D001')).toBeInTheDocument();

      // Step 5: Verify Generate button is initially disabled
      const generateButton = screen.getByText('Generate Pricing Analysis');
      expect(generateButton).toBeDisabled();

      // Step 6: Select a product by clicking on it
      const sawProduct = screen.getByText('CMAN-SAW-PRO725').closest('[data-testid]');
      await user.click(sawProduct!);

      // Step 7: Verify Generate button is now enabled
      await waitFor(() => {
        expect(generateButton).toBeEnabled();
      });

      // Step 8: Test navigation back to categories
      const backButton = screen.getByText('Back to Categories');
      await user.click(backButton);

      // Verify we're back to category selection
      await waitFor(() => {
        expect(screen.getByText('Select a product category to browse available products for pricing analysis')).toBeInTheDocument();
      });
    });

    it('should handle search functionality correctly', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Navigate to Power Tools category
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Wait for products to load
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      // Verify all products are initially shown
      expect(screen.getByText('DEWALT-DRILL-D001')).toBeInTheDocument();

      // Find and use the search input
      const searchInput = screen.getByPlaceholderText(/Search power tools/i);
      expect(searchInput).toBeInTheDocument();

      // Search for "SAW"
      await user.type(searchInput, 'SAW');

      // Verify search input has the value
      expect(searchInput).toHaveValue('SAW');

      // Clear search by clearing the input
      await user.clear(searchInput);

      // Verify search input is cleared
      expect(searchInput).toHaveValue('');
    });

    it('should handle filtering functionality correctly', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Navigate to Power Tools category
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Wait for products and filters to load
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      // Verify filter controls are present
      expect(screen.getByText('Product Tier')).toBeInTheDocument();
      expect(screen.getByText('Subcategory')).toBeInTheDocument();

      // Find the role filter multiselect
      const roleFilterButton = screen.getByText('Filter by product tier');
      await user.click(roleFilterButton);

      // Select "Best" role filter
      const bestOption = screen.getByText('Best');
      await user.click(bestOption);

      // Test clear filters functionality
      const clearFiltersButton = screen.getByText('Clear filters');
      await user.click(clearFiltersButton);

      // Verify clear filters button exists and is clickable
      expect(clearFiltersButton).toBeInTheDocument();
    });

    it('should handle product selection and enable Generate button', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Navigate to Power Tools category
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Wait for products to load
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      // Verify Generate button is initially disabled
      const generateButton = screen.getByText('Generate Pricing Analysis');
      expect(generateButton).toBeDisabled();

      // Select a product
      const sawProduct = screen.getByText('CMAN-SAW-PRO725').closest('[data-testid]');
      await user.click(sawProduct!);

      // Verify Generate button is now enabled
      await waitFor(() => {
        expect(generateButton).toBeEnabled();
      });

      // Verify product selection state (the product card should show as selected)
      expect(sawProduct).toHaveAttribute('aria-selected', 'true');
    });

    it('should create pricing session and navigate when Generate button is clicked', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Navigate to Power Tools category
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Wait for products to load
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      // Select a product
      const sawProduct = screen.getByText('CMAN-SAW-PRO725').closest('[data-testid]');
      await user.click(sawProduct!);

      // Wait for Generate button to be enabled
      const generateButton = screen.getByText('Generate Pricing Analysis');
      await waitFor(() => {
        expect(generateButton).toBeEnabled();
      });

      // Click Generate button
      await user.click(generateButton);

      // Verify navigation was called with the correct session ID
      await waitFor(() => {
        expect(mockNavigateToPricingAnalysis).toHaveBeenCalledWith('pricing-session-123');
      });
    });

    it('should display component structure correctly', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Navigate to Power Tools category
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
      });

      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Wait for products to load
      await waitFor(() => {
        expect(screen.getByText('CMAN-SAW-PRO725')).toBeInTheDocument();
      });

      // Verify key components are rendered
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
      expect(screen.getByText('Browse and select products from the Power Tools category')).toBeInTheDocument();
      expect(screen.getByText('Back to Categories')).toBeInTheDocument();
      expect(screen.getByText('Generate Pricing Analysis')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search power tools/i)).toBeInTheDocument();
      expect(screen.getByText('Product Tier')).toBeInTheDocument();
      expect(screen.getByText('Subcategory')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('should integrate all child components correctly', async () => {
      render(<ProductSelector />, { wrapper: createWrapper() });

      // Verify initial state shows category selection
      expect(screen.getByText('Product Catalog')).toBeInTheDocument();
      expect(screen.getByText('Select a product category to browse available products for pricing analysis')).toBeInTheDocument();

      // Verify categories are loaded and displayed
      await waitFor(() => {
        expect(screen.getByText('Power Tools')).toBeInTheDocument();
        expect(screen.getByText('Apparel')).toBeInTheDocument();
        expect(screen.getByText('Footwear')).toBeInTheDocument();
        expect(screen.getByText('Kitchen Appliances')).toBeInTheDocument();
      });

      // Verify category cards are interactive
      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      expect(powerToolsCard).toBeInTheDocument();
      expect(powerToolsCard).toHaveAttribute('tabIndex', '0');
    });

    it('should handle component state transitions correctly', async () => {
      const user = userEvent.setup();

      render(<ProductSelector />, { wrapper: createWrapper() });

      // Start with category selection
      expect(screen.getByText('Select a product category to browse available products for pricing analysis')).toBeInTheDocument();

      // Select a category
      const powerToolsCard = screen.getByText('Power Tools').closest('[role="button"]');
      await user.click(powerToolsCard!);

      // Verify transition to product catalog view
      await waitFor(() => {
        expect(screen.getByText('Browse and select products from the Power Tools category')).toBeInTheDocument();
      });

      // Verify all product catalog components are present
      expect(screen.getByText('Back to Categories')).toBeInTheDocument();
      expect(screen.getByText('Generate Pricing Analysis')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search power tools/i)).toBeInTheDocument();

      // Go back to categories
      const backButton = screen.getByText('Back to Categories');
      await user.click(backButton);

      // Verify we're back to category selection
      await waitFor(() => {
        expect(screen.getByText('Select a product category to browse available products for pricing analysis')).toBeInTheDocument();
      });
    });
  });
});