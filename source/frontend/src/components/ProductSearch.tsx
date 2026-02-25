/**
 * @fileoverview ProductSearch component for real-time product searching.
 * 
 * Provides debounced search input with GraphQL search queries and category-specific
 * placeholder text. Searches across product ID, subcategory, role, vendor, and
 * category-specific attributes. Implements WCAG 2.1 AA accessibility standards
 * with proper ARIA live regions and screen reader support.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Input,
  Box
} from '@cloudscape-design/components';
import { ProductCategory } from '../types/product-types';

/**
 * Props for ProductSearch component.
 */
export interface ProductSearchProps {
  /** Current product category */
  category: ProductCategory;
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Custom placeholder text */
  placeholder?: string;
  /** Whether search is disabled */
  disabled?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Gets category-specific placeholder text for search input.
 */
const getCategoryPlaceholder = (category: ProductCategory): string => {
  const placeholders: Record<ProductCategory, string> = {
    'powertools': 'Search power tools by ID, vendor, power type, or features...',
    'apparel': 'Search apparel by ID, vendor, size, color, or material...',
    'footwear': 'Search footwear by ID, vendor, size, style, or material...',
    'kitchen': 'Search kitchen appliances by ID, vendor, capacity, or features...'
  };
  return placeholders[category] || 'Search products...';
};

/**
 * Custom hook for debounced search input to prevent excessive API calls.
 * 
 * Debouncing delays the search execution until the user stops typing for
 * the specified delay period. This prevents a new GraphQL query on every
 * keystroke, which would be inefficient and could overwhelm the backend.
 */
const useDebouncedValue = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function: cancel the timer if value changes before delay expires
    // This is crucial - without cleanup, we'd have multiple timers running
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // Re-run effect when value or delay changes

  return debouncedValue;
};

/**
 * ProductSearch component for real-time product searching.
 * 
 * Implements debounced search with 300ms delay to avoid excessive API calls.
 * Provides category-specific placeholder text and supports case-insensitive
 * matching across multiple product fields.
 */
export const ProductSearch = ({
  category,
  searchQuery,
  onSearchChange,
  placeholder,
  disabled = false,
  isLoading = false
}: ProductSearchProps) => {
  const [inputValue, setInputValue] = useState(searchQuery);

  // Debounce the search query to avoid excessive API calls
  const debouncedSearchQuery = useDebouncedValue(inputValue, 300);

  // Update parent component when debounced value changes
  useEffect(() => {
    if (debouncedSearchQuery !== searchQuery) {
      onSearchChange(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, searchQuery, onSearchChange]);

  // Update input value when external searchQuery changes
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const handleInputChange = useCallback(({ detail }: any) => {
    setInputValue(detail.value);
  }, []);

  const handleClear = useCallback(() => {
    setInputValue('');
    onSearchChange('');
  }, [onSearchChange]);

  const effectivePlaceholder = placeholder || getCategoryPlaceholder(category);

  return (
    <div role="search" aria-labelledby="search-heading">
      {/* Screen reader heading */}
      <h3 id="search-heading" style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0
      }}>
        Product Search
      </h3>

      <Box>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          placeholder={effectivePlaceholder}
          type="search"
          clearAriaLabel="Clear search query"
          disabled={disabled}
          ariaLabel={`Search products in ${category} category. ${effectivePlaceholder}`}
          ariaDescribedby="search-instructions search-status"
          onKeyDown={(event: any) => {
            // Handle Enter key for immediate search
            if (event.detail.key === 'Enter') {
              onSearchChange(inputValue);
            }
            // Handle Escape key to clear search
            if (event.detail.key === 'Escape') {
              handleClear();
            }
          }}
        />

        {/* Search instructions for screen readers */}
        <div
          id="search-instructions"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0
          }}
        >
          Type to search products. Press Enter to search immediately, Escape to clear.
        </div>

        {/* Live region for search status */}
        <div
          id="search-status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0
          }}
        >
          {isLoading && 'Searching products...'}
          {inputValue.length > 0 && debouncedSearchQuery !== inputValue && `Searching for ${inputValue}`}
          {inputValue.length === 0 && 'Search field is empty'}
        </div>

        {/* Visual search status for sighted users */}
        {isLoading && (
          <div role="status">
            <Box
              variant="small"
              color="text-body-secondary"
              margin={{ top: 'xs' }}
            >
              Searching products...
            </Box>
          </div>
        )}

        {/* Search tips */}
        {inputValue.length === 0 && (
          <Box
            variant="small"
            color="text-body-secondary"
            margin={{ top: 'xs' }}
          >
            Search across product IDs, vendors, and {category === 'powertools' ? 'power types' :
              category === 'apparel' ? 'sizes and colors' :
                category === 'footwear' ? 'sizes and styles' :
                  'capacities and features'}
          </Box>
        )}

        {/* Search results count hint */}
        {inputValue.length > 0 && debouncedSearchQuery !== inputValue && (
          <div role="status">
            <Box
              variant="small"
              color="text-body-secondary"
              margin={{ top: 'xs' }}
            >
              Searching for "{inputValue}"...
            </Box>
          </div>
        )}
      </Box>
    </div>
  );
};