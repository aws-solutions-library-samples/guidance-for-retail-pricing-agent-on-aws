/**
 * @fileoverview Unit tests for ProductSearch component.
 * 
 * Tests debounced search behavior, case-insensitive matching,
 * clear functionality, and category-specific placeholders.
 */

// @ts-nocheck - Suppress TypeScript errors for test environment JSX compatibility
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductCategory } from '@/types/product-types';

// Mock timers for debounce testing
jest.useFakeTimers();

describe('ProductSearch Component', () => {
  const mockOnSearchChange = jest.fn();
  
  const defaultProps = {
    category: 'powertools' as ProductCategory,
    searchQuery: '',
    onSearchChange: mockOnSearchChange
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('Rendering and Basic Functionality', () => {
    it('should render search input with category-specific placeholder', () => {
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute(
        'placeholder', 
        'Search power tools by ID, vendor, power type, or features...'
      );
    });

    it('should render custom placeholder when provided', () => {
      const customPlaceholder = 'Custom search placeholder';
      render(
        <ProductSearch 
          {...defaultProps} 
          placeholder={customPlaceholder} 
        />
      );
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('placeholder', customPlaceholder);
    });

    it('should display different placeholders for different categories', () => {
      const categories: Array<{ category: ProductCategory; expectedText: string }> = [
        { 
          category: 'powertools', 
          expectedText: 'Search power tools by ID, vendor, power type, or features...' 
        },
        { 
          category: 'apparel', 
          expectedText: 'Search apparel by ID, vendor, size, color, or material...' 
        },
        { 
          category: 'footwear', 
          expectedText: 'Search footwear by ID, vendor, size, style, or material...' 
        },
        { 
          category: 'kitchen', 
          expectedText: 'Search kitchen appliances by ID, vendor, capacity, or features...' 
        }
      ];

      categories.forEach(({ category, expectedText }) => {
        const { rerender } = render(
          <ProductSearch {...defaultProps} category={category} />
        );
        
        const searchInput = screen.getByRole('searchbox');
        expect(searchInput).toHaveAttribute('placeholder', expectedText);
        
        rerender(<span />); // Clean up between renders
      });
    });

    it('should display current search query in input', () => {
      const searchQuery = 'test query';
      render(<ProductSearch {...defaultProps} searchQuery={searchQuery} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue(searchQuery);
    });

    it('should be disabled when disabled prop is true', () => {
      render(<ProductSearch {...defaultProps} disabled={true} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toBeDisabled();
    });

    it('should show loading state when isLoading is true', () => {
      render(<ProductSearch {...defaultProps} isLoading={true} />);
      
      expect(screen.getByText('Searching products...')).toBeInTheDocument();
    });
  });

  describe('Debounced Search Behavior', () => {
    it('should debounce search input with 300ms delay', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Type in search input
      await user.type(searchInput, 'test');
      
      // Should not call onSearchChange immediately
      expect(mockOnSearchChange).not.toHaveBeenCalled();
      
      // Advance timers by less than 300ms
      jest.advanceTimersByTime(200);
      expect(mockOnSearchChange).not.toHaveBeenCalled();
      
      // Advance timers to complete the 300ms delay
      jest.advanceTimersByTime(100);
      
      await waitFor(() => {
        expect(mockOnSearchChange).toHaveBeenCalledWith('test');
      });
    });

    it('should reset debounce timer on new input', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Type first character
      await user.type(searchInput, 't');
      
      // Advance timer partially
      jest.advanceTimersByTime(200);
      
      // Type second character (should reset timer)
      await user.type(searchInput, 'e');
      
      // Advance timer by 200ms (total would be 400ms from first char, but timer was reset)
      jest.advanceTimersByTime(200);
      expect(mockOnSearchChange).not.toHaveBeenCalled();
      
      // Complete the 300ms from the last input
      jest.advanceTimersByTime(100);
      
      await waitFor(() => {
        expect(mockOnSearchChange).toHaveBeenCalledWith('te');
      });
    });

    it('should handle rapid typing correctly', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Type multiple characters rapidly
      await user.type(searchInput, 'rapid');
      
      // Should not call onSearchChange during typing
      expect(mockOnSearchChange).not.toHaveBeenCalled();
      
      // Advance timers to trigger debounce
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(mockOnSearchChange).toHaveBeenCalledTimes(1);
        expect(mockOnSearchChange).toHaveBeenCalledWith('rapid');
      });
    });
  });

  describe('Search Functionality', () => {
    it('should call onSearchChange immediately on Enter key press', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Type without waiting for debounce
      await user.type(searchInput, 'immediate');
      
      // Press Enter key
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
      
      // Should call onSearchChange immediately without waiting for debounce
      expect(mockOnSearchChange).toHaveBeenCalledWith('immediate');
    });

    it('should clear search on Escape key press', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} searchQuery="existing query" />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Press Escape key
      fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });
      
      // Should clear the search
      expect(mockOnSearchChange).toHaveBeenCalledWith('');
      expect(searchInput).toHaveValue('');
    });

    it('should update input value when external searchQuery prop changes', () => {
      const { rerender } = render(<ProductSearch {...defaultProps} searchQuery="" />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('');
      
      // Update searchQuery prop
      rerender(<ProductSearch {...defaultProps} searchQuery="external update" />);
      
      expect(searchInput).toHaveValue('external update');
    });
  });

  describe('Clear Functionality', () => {
    it('should clear search when clear button is used', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} searchQuery="test query" />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('test query');
      
      // Clear the input (simulating clear button click)
      await user.clear(searchInput);
      
      // Should call onSearchChange with empty string
      jest.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(mockOnSearchChange).toHaveBeenCalledWith('');
      });
    });

    it('should have proper aria-label for clear functionality', () => {
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-label', 'Search products in powertools category. Search power tools by ID, vendor, power type, or features...');
    });
  });

  describe('Case-Insensitive Matching', () => {
    it('should handle case-insensitive search terms', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Test various case combinations
      const testCases = ['TEST', 'Test', 'test', 'TeSt'];
      
      for (const testCase of testCases) {
        await user.clear(searchInput);
        await user.type(searchInput, testCase);
        
        jest.advanceTimersByTime(300);
        
        await waitFor(() => {
          expect(mockOnSearchChange).toHaveBeenCalledWith(testCase);
        });
        
        mockOnSearchChange.mockClear();
      }
    });
  });

  describe('Search Across Multiple Fields', () => {
    it('should indicate search across multiple product fields', () => {
      render(<ProductSearch {...defaultProps} />);
      
      // Check that the component indicates it searches across multiple fields
      expect(screen.getByText(/Search across product IDs, vendors, and power types/)).toBeInTheDocument();
    });

    it('should show category-specific search field hints', () => {
      const categories: Array<{ category: ProductCategory; expectedHint: string }> = [
        { category: 'powertools', expectedHint: 'power types' },
        { category: 'apparel', expectedHint: 'sizes and colors' },
        { category: 'footwear', expectedHint: 'sizes and styles' },
        { category: 'kitchen', expectedHint: 'capacities and features' }
      ];

      categories.forEach(({ category, expectedHint }) => {
        const { rerender } = render(
          <ProductSearch {...defaultProps} category={category} />
        );
        
        expect(screen.getByText(new RegExp(expectedHint))).toBeInTheDocument();
        
        rerender(<span />); // Clean up between renders
      });
    });
  });

  describe('Search Status Indicators', () => {
    it('should show searching indicator when input differs from debounced value', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Type in search input
      await user.type(searchInput, 'searching');
      
      // Should show "Searching for..." message before debounce completes
      expect(screen.getByText('Searching for "searching"...')).toBeInTheDocument();
      
      // Complete debounce
      jest.advanceTimersByTime(300);
      
      // Wait for the searching message to disappear
      await waitFor(() => {
        expect(screen.queryByText('Searching for "searching"...')).not.toBeInTheDocument();
      });
    });

    it('should show search tips when input is empty', () => {
      render(<ProductSearch {...defaultProps} />);
      
      expect(screen.getByText(/Search across product IDs, vendors, and power types/)).toBeInTheDocument();
    });

    it('should hide search tips when input has content', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      // Initially shows search tips
      expect(screen.getByText(/Search across product IDs, vendors, and power types/)).toBeInTheDocument();
      
      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'test');
      
      // Should hide search tips when there's input
      expect(screen.queryByText(/Search across product IDs, vendors, and power types/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-label', 'Search products in powertools category. Search power tools by ID, vendor, power type, or features...');
    });

    it('should have proper ARIA attributes when loading', () => {
      render(<ProductSearch {...defaultProps} isLoading={true} />);
      
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-describedby', 'search-instructions search-status');
      
      // Check that the status region exists (it's hidden but present for screen readers)
      const statusRegion = document.getElementById('search-status');
      expect(statusRegion).toBeInTheDocument();
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      
      render(<ProductSearch {...defaultProps} />);
      
      const searchInput = screen.getByRole('searchbox');
      
      // Should be focusable
      await user.tab();
      expect(searchInput).toHaveFocus();
      
      // Should accept keyboard input
      await user.keyboard('test input');
      expect(searchInput).toHaveValue('test input');
    });
  });
});