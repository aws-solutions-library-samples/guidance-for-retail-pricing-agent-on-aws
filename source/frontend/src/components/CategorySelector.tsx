/**
 * @fileoverview CategorySelector component for displaying and selecting product categories.
 * 
 * Uses static category data bundled with the frontend build for instant loading.
 * Displays categories in a responsive grid with icons, names, and product counts.
 * Implements WCAG 2.1 AA accessibility standards with proper ARIA labels,
 * keyboard navigation, and screen reader support.
 */

// @ts-nocheck
import React from 'react';
import { 
  Cards, 
  Spinner, 
  Alert,
  Box,
  Icon,
  SpaceBetween
} from '@cloudscape-design/components';


import { CategoryInfo, ProductCategory } from '../types/product-types';

// Screen reader only styles
const srOnlyStyles: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
};

/**
 * Props for CategorySelector component.
 */
export interface CategorySelectorProps {
  /** Available product categories */
  categories: CategoryInfo[];
  /** Currently selected category */
  selectedCategory?: ProductCategory | null;
  /** Callback when a category is selected */
  onCategorySelect: (category: ProductCategory) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
}



/**
 * CategorySelector component for product category selection.
 * 
 * Displays available categories in a 2x2 grid layout with category icons,
 * names, descriptions, and product counts. Supports keyboard navigation
 * and screen reader accessibility.
 */
export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
  isLoading = false,
  error = null
}) => {
  console.log('CategorySelector received categories:', categories);
  // Show loading state
  if (isLoading) {
    return (
      <Box textAlign="center" padding="xl">
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" margin={{ top: 's' }}>
          Loading categories...
        </Box>
      </Box>
    );
  }

  // Show error state
  if (error) {
    return (
      <Alert 
        type="error" 
        header="Unable to load categories"
      >
        {error.message || 'Categories cannot be loaded at this time. Please try again.'}
      </Alert>
    );
  }

  // Show empty state
  if (!categories || categories.length === 0) {
    return (
      <Alert 
        type="info" 
        header="No categories available"
      >
        No product categories are currently available.
      </Alert>
    );
  }

  return (
    <div role="region" aria-labelledby="category-selector-heading">
      {/* Screen reader heading for the category selection region */}
      <h2 id="category-selector-heading" style={srOnlyStyles}>
        Product Category Selection
      </h2>
      
      <Cards
        cardDefinition={{
          header: (item: CategoryInfo) => (
            <SpaceBetween direction="horizontal" size="s" alignItems="center">
              <Icon 
                name={item.icon as any} 
                size="medium" 
                alt={`${item.categoryName} category icon`}
              />
              <Box>
                <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 'bold' }}>
                  {item.categoryName}
                </h3>
              </Box>
            </SpaceBetween>
          ),
          sections: [
            {
              id: 'description',
              content: (item: CategoryInfo) => (
                <Box>
                  <Box 
                    variant="p" 
                    color="text-body-secondary" 
                    margin={{ bottom: 's' }}
                    id={`category-${item.categoryId}-description`}
                  >
                    {item.description}
                  </Box>
                  <Box 
                    variant="small" 
                    color="text-status-info"
                    aria-label={`${item.productCount} products available in ${item.categoryName} category`}
                  >
                    {item.productCount} products available
                  </Box>
                </Box>
              )
            }
          ]
        }}
        cardsPerRow={[
          { cards: 1 },
          { minWidth: 600, cards: 2 }
        ]}
        items={categories}
        selectionType="single"
        selectedItems={selectedCategory ? categories.filter(cat => cat.categoryId === selectedCategory) : []}
        onSelectionChange={({ detail }: { detail: { selectedItems: CategoryInfo[] } }) => {
          const selectedItem = detail.selectedItems[0];
          if (selectedItem) {
            onCategorySelect(selectedItem.categoryId as ProductCategory);
          }
        }}
        trackBy="categoryId"
        variant="full-page"
        stickyHeader={false}
        empty={
          <Box textAlign="center" color="inherit" role="status" aria-live="polite">
            <Box variant="strong" textAlign="center" color="inherit">
              No categories available
            </Box>
            <Box variant="p" padding={{ bottom: 's' }} color="inherit">
              No product categories are currently available. Please try refreshing the page.
            </Box>
          </Box>
        }
        ariaLabels={{
          itemSelectionLabel: (_: any, item: CategoryInfo) => 
            `Select ${item.categoryName} category with ${item.productCount} products. ${item.description}`,
          selectionGroupLabel: 'Product categories selection',
          cardsLabel: 'Product categories',
          cardLabel: (item: CategoryInfo) => 
            `${item.categoryName} category card. ${item.description}. ${item.productCount} products available.`
        }}
      />
      
      {/* Screen reader instructions */}
      <div style={srOnlyStyles} aria-live="polite" id="category-instructions">
        Use arrow keys to navigate between categories, Enter or Space to select a category.
      </div>
    </div>
  );
};