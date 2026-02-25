/**
 * @fileoverview ProductCatalogGrid component for displaying products in a responsive grid.
 * 
 * Uses CloudScape Tiles component to display products in a grid layout with
 * selection support, loading states, and accessibility features.
 */

import React from 'react';
import { 
  Tiles, 
  Box, 
  Spinner, 
  StatusIndicator 
} from '@cloudscape-design/components';
import { ProductType } from '../types/product-types';
import { ProductCard } from './ProductCard';

/**
 * Props for ProductCatalogGrid component.
 */
export interface ProductCatalogGridProps {
  /** Array of products to display in the grid */
  products: ProductType[];
  
  /** ID of the currently selected product */
  selectedProductID?: string;
  
  /** Callback when a product is selected */
  onProductSelect?: (productId: string) => void;
  
  /** Callback when product details should be shown */
  onShowProductDetails?: (product: ProductType) => void;
  
  /** Whether the grid is in loading state */
  isLoading?: boolean;
  
  /** Whether more products are being loaded */
  isLoadingMore?: boolean;
  
  /** Error message to display */
  error?: string | Error | null;
  
  /** Custom empty state message */
  emptyStateMessage?: string;
  
  /** Whether the grid should show selection indicators */
  showSelection?: boolean;
  
  /** Whether the grid is in a disabled state */
  disabled?: boolean;
  
  /** Whether there are more products to load */
  hasMoreProducts?: boolean;
  
  /** Callback to load more products */
  onLoadMore?: () => void;
  
  /** Total number of products available */
  totalCount?: number;
  
  /** Whether the product list is empty */
  isEmpty?: boolean;
}

/**
 * ProductCatalogGrid component that displays products in a responsive grid layout.
 * 
 * Features:
 * - Responsive grid layout using CloudScape Tiles
 * - Product selection with visual feedback
 * - Loading and empty states
 * - Accessibility support with ARIA labels
 * - Error handling and display
 * 
 * @param props - Component props
 * @returns JSX element representing the product catalog grid
 */
export const ProductCatalogGrid = ({
  products,
  selectedProductID,
  onProductSelect,
  onShowProductDetails,
  isLoading = false,
  isLoadingMore = false,
  error,
  emptyStateMessage = "No products found",
  showSelection = true,
  disabled = false,
  hasMoreProducts = false,
  onLoadMore,
  totalCount,
  isEmpty = false
}: ProductCatalogGridProps) => {
  
  /**
   * Handles product selection.
   */
  const handleProductSelect = (productId: string) => {
    if (!disabled && onProductSelect) {
      onProductSelect(productId);
    }
  };

  // Show error state
  if (error) {
    const errorMessage = typeof error === 'string' ? error : error.message || 'An error occurred';
    return (
      <Box textAlign="center" padding="xl">
        <StatusIndicator type="error">
          {errorMessage}
        </StatusIndicator>
        <Box variant="p" color="text-body-secondary" margin={{ top: 's' }}>
          Please try again or contact support if the problem persists.
        </Box>
      </Box>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div role="status" aria-live="polite">
        <Box textAlign="center" padding="xl">
          <Spinner size="large" />
          <Box variant="p" color="text-body-secondary" margin={{ top: 's' }}>
            Loading products...
          </Box>
        </Box>
      </div>
    );
  }

  // Show empty state when no products
  if (!products || products.length === 0) {
    return (
      <div role="status" aria-live="polite">
        <Box textAlign="center" padding="xl">
          <StatusIndicator type="stopped">
            {emptyStateMessage}
          </StatusIndicator>
          <Box 
            variant="p" 
            color="text-body-secondary" 
            margin={{ top: 's' }}
          >
            Try adjusting your filters or search criteria to find products.
          </Box>
        </Box>
      </div>
    );
  }

  // Render products in a responsive grid using Tiles
  return (
    <>
      {/* Screen reader announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {products.length} products displayed. 
        {selectedProductID && ` Product ${selectedProductID} is selected.`}
      </div>

      {/* Use a simple grid layout instead of Tiles for custom rendering */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '16px',
        padding: '16px 0'
      }}>
        {products.map(product => (
          <ProductCard
            key={product.product_id}
            product={product}
            isSelected={selectedProductID === product.product_id}
            onSelect={handleProductSelect}
          />
        ))}
      </div>
      
      {/* Loading more indicator */}
      {isLoadingMore && (
        <div role="status" aria-live="polite">
          <Box textAlign="center" padding="m">
            <Spinner size="normal" />
            <Box variant="small" color="text-body-secondary" margin={{ top: 'xs' }}>
              Loading more products...
            </Box>
          </Box>
        </div>
      )}
    </>
  );
};