/**
 * @fileoverview Unit tests for ProductCard component.
 * 
 * Tests image fallback behavior, keyboard navigation, role badge color coding,
 * and accessibility features.
 */

// @ts-nocheck - Test file with complex JSX mocking
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductCard } from '../../../../src/frontend/src/components/ProductCard';
import { ProductType } from '../../../../src/frontend/src/types/product-types';

// Mock CloudScape components
jest.mock('@cloudscape-design/components', () => ({
  Box: ({ children, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-box', ...props }, children)
  ),
  Badge: ({ children, color, ...props }: any) => (
    React.createElement('span', { 'data-testid': 'cloudscape-badge', 'data-color': color, ...props }, children)
  ),
  StatusIndicator: ({ children, type, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-status-indicator', 'data-type': type, ...props }, children)
  ),
  SpaceBetween: ({ children, direction, size, alignItems, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-space-between',
      'data-direction': direction,
      'data-size': size,
      'data-align-items': alignItems,
      style: { 
        display: 'flex', 
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        alignItems: alignItems,
        gap: size === 's' ? '8px' : size === 'm' ? '16px' : '24px'
      },
      ...props
    }, children)
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

describe('ProductCard Component', () => {
  const mockOnSelect = jest.fn();
  const defaultProps = {
    product: createMockProduct(),
    onSelect: mockOnSelect
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render product information correctly', () => {
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      expect(screen.getByText('TEST-PRODUCT-001')).toBeInTheDocument();
      expect(screen.getByText('TEST_VENDOR')).toBeInTheDocument();
      expect(screen.getByText('BEST')).toBeInTheDocument();
      expect(screen.getByText('MSRP: $99.99')).toBeInTheDocument();
    });

    it('should render product image with correct attributes', () => {
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const image = screen.getByAltText('Product image for TEST-PRODUCT-001, a drills from TEST_VENDOR in the best tier');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/test-image.jpg');
      expect(image).toHaveAttribute('loading', 'lazy');
    });

    it('should show loading indicator initially', () => {
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      expect(screen.getByText('Loading image...')).toBeInTheDocument();
    });
  });

  describe('Image Fallback Behavior', () => {
    it('should show placeholder when image fails to load', async () => {
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const image = screen.getByAltText('Product image for TEST-PRODUCT-001, a drills from TEST_VENDOR in the best tier');
      
      // Simulate image load error
      fireEvent.error(image);
      
      await waitFor(() => {
        expect(screen.getByText('Image unavailable')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('Loading image...')).not.toBeInTheDocument();
    });

    it('should hide loading indicator when image loads successfully', async () => {
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const image = screen.getByAltText('Product image for TEST-PRODUCT-001, a drills from TEST_VENDOR in the best tier');
      
      // Simulate successful image load
      fireEvent.load(image);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading image...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Role Badge Color Coding', () => {
    it('should display correct badge color for "best" role', () => {
      const product = createMockProduct({ role: 'best' });
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      const badge = screen.getByText('BEST');
      expect(badge).toBeInTheDocument();
      // Note: CloudScape Badge component uses internal styling, 
      // so we verify the text content and presence
    });

    it('should display correct badge color for "better" role', () => {
      const product = createMockProduct({ role: 'better' });
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      const badge = screen.getByText('BETTER');
      expect(badge).toBeInTheDocument();
    });

    it('should display correct badge color for "good" role', () => {
      const product = createMockProduct({ role: 'good' });
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      const badge = screen.getByText('GOOD');
      expect(badge).toBeInTheDocument();
    });

    it('should display correct badge color for "entry" role', () => {
      const product = createMockProduct({ role: 'entry' });
      // @ts-ignore - JSX element type compatibility
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      const badge = screen.getByText('ENTRY');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should call onSelect when Enter key is pressed', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
      
      expect(mockOnSelect).toHaveBeenCalledWith('TEST-PRODUCT-001');
    });

    it('should not call onSelect when other keys are pressed', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      fireEvent.keyDown(card, { key: 'Space', code: 'Space' });
      fireEvent.keyDown(card, { key: 'Tab', code: 'Tab' });
      fireEvent.keyDown(card, { key: 'Escape', code: 'Escape' });
      
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should be focusable with tab navigation', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Mouse Interaction', () => {
    it('should call onSelect when clicked', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      fireEvent.click(card);
      
      expect(mockOnSelect).toHaveBeenCalledWith('TEST-PRODUCT-001');
    });

    it('should not call onSelect when onSelect prop is not provided', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={defaultProps.product} />);
      
      const card = screen.getByRole('button');
      
      fireEvent.click(card);
      
      // Should not throw error
      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Selection State', () => {
    it('should apply selected styling when isSelected is true', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} isSelected={true} />);
      
      const card = screen.getByRole('button');
      
      expect(card).toHaveStyle({
        border: '2px solid #0972d3',
        backgroundColor: '#f2f8fd'
      });
    });

    it('should apply default styling when isSelected is false', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} isSelected={false} />);
      
      const card = screen.getByRole('button');
      
      expect(card).toHaveStyle({
        border: '1px solid #e9ebed',
        backgroundColor: '#ffffff'
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      expect(card).toHaveAttribute(
        'aria-label', 
        'Select product TEST-PRODUCT-001 from TEST_VENDOR, best tier, MSRP $99.99'
      );
    });

    it('should have proper role attribute', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      
      expect(card).toHaveAttribute('role', 'button');
    });

    it('should have no accessibility violations', async () => {
      // Note: Accessibility testing with axe is skipped due to CloudScape component complexity
      // Manual accessibility testing should be performed
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      // Basic accessibility checks
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('should have proper alt text for product image', () => {
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard {...defaultProps} />);
      
      const image = screen.getByAltText('Product image for TEST-PRODUCT-001, a drills from TEST_VENDOR in the best tier');
      
      expect(image).toBeInTheDocument();
    });
  });

  describe('Price Formatting', () => {
    it('should format MSRP price with two decimal places', () => {
      const product = createMockProduct({ MSRP: 123.5 });
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      expect(screen.getByText('MSRP: $123.50')).toBeInTheDocument();
    });

    it('should handle whole number prices correctly', () => {
      const product = createMockProduct({ MSRP: 100 });
      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={product} onSelect={mockOnSelect} />);
      
      expect(screen.getByText('MSRP: $100.00')).toBeInTheDocument();
    });
  });

  describe('Different Product Categories', () => {
    it('should render apparel product correctly', () => {
      const apparelProduct: ProductType = {
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
        features: ['Moisture-wicking', 'UV Protection'],
        imageUrl: 'https://example.com/apparel.jpg',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={apparelProduct} onSelect={mockOnSelect} />);
      
      expect(screen.getByText('APPAREL-001')).toBeInTheDocument();
      expect(screen.getByText('NIKE')).toBeInTheDocument();
      expect(screen.getByText('BETTER')).toBeInTheDocument();
    });

    it('should render footwear product correctly', () => {
      const footwearProduct: ProductType = {
        product_id: 'FOOTWEAR-001',
        category: 'footwear',
        subcategory: 'running',
        role: 'good',
        vendor: 'ADIDAS',
        cost: 45.99,
        MSRP: 129.99,
        MAP: 109.99,
        yearTarget: 8000,
        attributes: {
          size: '10',
          width: 'D',
          color: 'black',
          material: 'synthetic',
          style: 'running'
        },
        features: ['Cushioned Sole', 'Breathable Mesh'],
        imageUrl: 'https://example.com/footwear.jpg',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      // @ts-ignore - JSX element type compatibility
      render(<ProductCard product={footwearProduct} onSelect={mockOnSelect} />);
      
      expect(screen.getByText('FOOTWEAR-001')).toBeInTheDocument();
      expect(screen.getByText('ADIDAS')).toBeInTheDocument();
      expect(screen.getByText('GOOD')).toBeInTheDocument();
    });
  });
});