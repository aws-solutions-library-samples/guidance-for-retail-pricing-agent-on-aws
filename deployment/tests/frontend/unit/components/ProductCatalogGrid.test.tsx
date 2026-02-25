/**
 * @fileoverview Unit tests for ProductCatalogGrid component.
 * 
 * Tests grid rendering, product selection, loading states, and empty state handling.
 */

// @ts-nocheck - Test file with complex JSX mocking
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCatalogGrid } from '../../../../src/frontend/src/components/ProductCatalogGrid';
import { ProductType } from '../../../../src/frontend/src/types/product-types';

// Mock CloudScape components
jest.mock('@cloudscape-design/components', () => ({
  Tiles: ({ items, renderItem, columns, ariaLabels, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-tiles',
      'data-columns': columns,
      'aria-label': ariaLabels?.selectionGroupLabel,
      ...props
    }, items.map((item: any, index: number) =>
      React.createElement('div', {
        key: item.product_id || index,
        'data-testid': `tile-item-${index}`
      }, renderItem(item))
    ))
  ),
  Spinner: ({ size, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-spinner',
      'data-size': size,
      ...props
    }, 'Loading...')
  ),
  Box: ({ children, textAlign, padding, variant, color, margin, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-box',
      'data-text-align': textAlign,
      'data-padding': padding,
      'data-variant': variant,
      'data-color': color,
      'data-margin': margin ? JSON.stringify(margin) : undefined,
      ...props
    }, children)
  ),
  StatusIndicator: ({ children, type, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-status-indicator',
      'data-type': type,
      ...props
    }, children)
  )
}));

// Mock ProductCard component
jest.mock('../../../../src/frontend/src/components/ProductCard', () => ({
  ProductCard: ({ product, isSelected, onSelect }: any) => (
    React.createElement('div', {
      'data-testid': `product-card-${product.product_id}`,
      'data-selected': isSelected,
      onClick: () => onSelect && onSelect(product.product_id),
      role: 'button'
    }, [
      React.createElement('div', { key: 'id', 'data-testid': 'product-id' }, product.product_id),
      React.createElement('div', { key: 'vendor', 'data-testid': 'product-vendor' }, product.vendor),
      React.createElement('div', { key: 'role', 'data-testid': 'product-role' }, product.role)
    ])
  )
}));

/**
 * Creates a mock product for testing.
 */
const createMockProduct = (overrides: Partial<ProductType> = {}): ProductType => {
  const baseProduct = {
    product_id: 'TEST-PRODUCT-001',
    category: 'powertools' as const,
    subcategory: 'drills',
    role: 'best' as const,
    vendor: 'TEST_VENDOR',
    cost: 50.00,
    MSRP: 99.99,
    MAP: 89.99,
    yearTarget: 1000,
    attributes: {
      powerType: 'cordless' as const,
      batteryVoltage: '20V',
      color: 'red'
    },
    features: ['LED Light', 'Brushless Motor'],
    imageUrl: 'https://example.com/test-image.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  };

  return { ...baseProduct, ...overrides } as ProductType;
};

/**
 * Creates an array of mock products for testing.
 */
const createMockProducts = (count: number): ProductType[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockProduct({
      product_id: `TEST-PRODUCT-${String(index + 1).padStart(3, '0')}`,
      vendor: `VENDOR_${index + 1}`,
      role: ['best', 'better', 'good', 'entry'][index % 4] as any
    })
  );
};

describe('ProductCatalogGrid Component', () => {
  const mockOnProductSelect = jest.fn();

  const defaultProps = {
    products: createMockProducts(3),
    onProductSelect: mockOnProductSelect
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render all products in the grid', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      // Check that Tiles component is rendered with correct props
      const tiles = screen.getByTestId('cloudscape-tiles');
      expect(tiles).toBeInTheDocument();
      expect(tiles).toHaveAttribute('data-columns', '4');
      expect(tiles).toHaveAttribute('aria-label', 'Product selection');

      // Check that all products are rendered
      expect(screen.getByTestId('product-card-TEST-PRODUCT-001')).toBeInTheDocument();
      expect(screen.getByTestId('product-card-TEST-PRODUCT-002')).toBeInTheDocument();
      expect(screen.getByTestId('product-card-TEST-PRODUCT-003')).toBeInTheDocument();

      // Verify product details are displayed
      expect(screen.getByText('TEST-PRODUCT-001')).toBeInTheDocument();
      expect(screen.getByText('VENDOR_1')).toBeInTheDocument();
    });

    it('should render with 4-column layout', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      const tiles = screen.getByTestId('cloudscape-tiles');
      expect(tiles).toHaveAttribute('data-columns', '4');
    });

    it('should handle empty products array', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={[]} onProductSelect={mockOnProductSelect} />);

      expect(screen.getByText('No products found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or search criteria to find products.')).toBeInTheDocument();
    });

    it('should handle undefined products array', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={undefined as any} onProductSelect={mockOnProductSelect} />);

      expect(screen.getByText('No products found')).toBeInTheDocument();
    });
  });

  describe('Product Selection', () => {
    it('should call onProductSelect when a product is clicked', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      const productCard = screen.getByTestId('product-card-TEST-PRODUCT-001');
      fireEvent.click(productCard);

      expect(mockOnProductSelect).toHaveBeenCalledWith('TEST-PRODUCT-001');
    });

    it('should mark selected product as selected', () => {
      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          {...defaultProps}
          selectedProductID="TEST-PRODUCT-002"
        />
      );

      const selectedCard = screen.getByTestId('product-card-TEST-PRODUCT-002');
      const unselectedCard = screen.getByTestId('product-card-TEST-PRODUCT-001');

      expect(selectedCard).toHaveAttribute('data-selected', 'true');
      expect(unselectedCard).toHaveAttribute('data-selected', 'false');
    });

    it('should update selection when selectedProductID changes', () => {
      // @ts-ignore - JSX element type compatibility
      const { rerender } = render(
        <ProductCatalogGrid
          {...defaultProps}
          selectedProductID="TEST-PRODUCT-001"
        />
      );

      let selectedCard = screen.getByTestId('product-card-TEST-PRODUCT-001');
      expect(selectedCard).toHaveAttribute('data-selected', 'true');

      // Change selection
      // @ts-ignore - JSX element type compatibility
      rerender(
        <ProductCatalogGrid
          {...defaultProps}
          selectedProductID="TEST-PRODUCT-002"
        />
      );

      selectedCard = screen.getByTestId('product-card-TEST-PRODUCT-002');
      const unselectedCard = screen.getByTestId('product-card-TEST-PRODUCT-001');

      expect(selectedCard).toHaveAttribute('data-selected', 'true');
      expect(unselectedCard).toHaveAttribute('data-selected', 'false');
    });

    it('should handle selection when onProductSelect is not provided', () => {
      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          products={defaultProps.products}
          selectedProductID="TEST-PRODUCT-001"
        />
      );

      const productCard = screen.getByTestId('product-card-TEST-PRODUCT-001');

      // Should not throw error when clicked
      expect(() => fireEvent.click(productCard)).not.toThrow();
    });
  });

  describe('Loading State', () => {
    it('should display spinner when loading', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} isLoading={true} />);

      expect(screen.getByTestId('cloudscape-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Loading products...')).toBeInTheDocument();

      // Should not render products when loading
      expect(screen.queryByTestId('cloudscape-tiles')).not.toBeInTheDocument();
    });

    it('should display large spinner size', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} isLoading={true} />);

      const spinner = screen.getByTestId('cloudscape-spinner');
      expect(spinner).toHaveAttribute('data-size', 'large');
    });

    it('should not display products when loading', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} isLoading={true} />);

      expect(screen.queryByTestId('product-card-TEST-PRODUCT-001')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cloudscape-tiles')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should display default empty message when no products', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={[]} onProductSelect={mockOnProductSelect} />);

      expect(screen.getByTestId('cloudscape-status-indicator')).toBeInTheDocument();
      expect(screen.getByText('No products found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or search criteria to find products.')).toBeInTheDocument();
    });

    it('should display custom empty message when provided', () => {
      const customMessage = 'No power tools available';
      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          products={[]}
          onProductSelect={mockOnProductSelect}
          emptyStateMessage={customMessage}
        />
      );

      expect(screen.getByText(customMessage)).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters or search criteria to find products.')).toBeInTheDocument();
    });

    it('should use stopped status indicator for empty state', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={[]} onProductSelect={mockOnProductSelect} />);

      const statusIndicator = screen.getByTestId('cloudscape-status-indicator');
      expect(statusIndicator).toHaveAttribute('data-type', 'stopped');
    });

    it('should not display tiles when empty', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={[]} onProductSelect={mockOnProductSelect} />);

      expect(screen.queryByTestId('cloudscape-tiles')).not.toBeInTheDocument();
    });
  });

  describe('Grid Layout and Responsiveness', () => {
    it('should render with responsive 4-column layout', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      const tiles = screen.getByTestId('cloudscape-tiles');
      expect(tiles).toHaveAttribute('data-columns', '4');
    });

    it('should handle large number of products', () => {
      const manyProducts = createMockProducts(20);
      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          products={manyProducts}
          onProductSelect={mockOnProductSelect}
        />
      );

      // Should render all products
      expect(screen.getAllByTestId(/^product-card-/)).toHaveLength(20);

      // Check first and last products
      expect(screen.getByTestId('product-card-TEST-PRODUCT-001')).toBeInTheDocument();
      expect(screen.getByTestId('product-card-TEST-PRODUCT-020')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for selection group', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      const tiles = screen.getByTestId('cloudscape-tiles');
      expect(tiles).toHaveAttribute('aria-label', 'Product selection');
    });

    it('should provide accessible product selection feedback', () => {
      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          {...defaultProps}
          selectedProductID="TEST-PRODUCT-001"
        />
      );

      // The Tiles component should handle selection announcements
      const tiles = screen.getByTestId('cloudscape-tiles');
      expect(tiles).toHaveAttribute('aria-label', 'Product selection');
    });
  });

  describe('Different Product Categories', () => {
    it('should render mixed category products correctly', () => {
      const mixedProducts: ProductType[] = [
        createMockProduct({
          product_id: 'POWER-001',
          category: 'powertools',
          vendor: 'CRAFTSMAN'
        }),
        {
          product_id: 'APPAREL-001',
          category: 'apparel',
          subcategory: 'shirts',
          role: 'better',
          vendor: 'NIKE',
          cost: 15.99,
          MSRP: 39.99,
          MAP: 34.99,
          yearTarget: 10000,
          attributes: {
            size: 'M',
            color: 'blue',
            material: 'cotton',
            season: 'summer',
            gender: 'men'
          },
          features: ['Moisture-wicking'],
          imageUrl: 'https://example.com/apparel.jpg',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z'
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(
        <ProductCatalogGrid
          products={mixedProducts}
          onProductSelect={mockOnProductSelect}
        />
      );

      expect(screen.getByText('POWER-001')).toBeInTheDocument();
      expect(screen.getByText('CRAFTSMAN')).toBeInTheDocument();
      expect(screen.getByText('APPAREL-001')).toBeInTheDocument();
      expect(screen.getByText('NIKE')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    it('should handle missing optional props gracefully', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={defaultProps.products} />);

      // Should render without errors
      expect(screen.getByTestId('cloudscape-tiles')).toBeInTheDocument();
      expect(screen.getByTestId('product-card-TEST-PRODUCT-001')).toBeInTheDocument();
    });

    it('should use default values for optional props', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid products={[]} />);

      // Should use default empty message
      expect(screen.getByText('No products found')).toBeInTheDocument();

      // Should not be in loading state by default
      expect(screen.queryByTestId('cloudscape-spinner')).not.toBeInTheDocument();
    });
  });

  describe('Performance Considerations', () => {
    it('should handle rapid selection changes', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCatalogGrid {...defaultProps} />);

      const product1 = screen.getByTestId('product-card-TEST-PRODUCT-001');
      const product2 = screen.getByTestId('product-card-TEST-PRODUCT-002');

      // Rapid clicks should all be handled
      fireEvent.click(product1);
      fireEvent.click(product2);
      fireEvent.click(product1);

      expect(mockOnProductSelect).toHaveBeenCalledTimes(3);
      expect(mockOnProductSelect).toHaveBeenNthCalledWith(1, 'TEST-PRODUCT-001');
      expect(mockOnProductSelect).toHaveBeenNthCalledWith(2, 'TEST-PRODUCT-002');
      expect(mockOnProductSelect).toHaveBeenNthCalledWith(3, 'TEST-PRODUCT-001');
    });
  });
});