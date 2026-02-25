/**
 * @fileoverview Unit tests for CategorySelector component.
 * 
 * Tests category display, selection, keyboard navigation, loading states,
 * and accessibility compliance according to task requirements.
 */

// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import '@testing-library/jest-dom';
import { CategorySelector, CategorySelectorProps } from '../../../../src/frontend/src/components/CategorySelector';
import { CategoryInfo, ProductCategory } from '../../../../src/frontend/src/types/product-types';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock CloudScape components
jest.mock('@cloudscape-design/components', () => ({
  Cards: ({ items, cardDefinition, onSelectionChange, selectedItems, ariaLabels, ...props }: any) => (
    <div data-testid="cards" {...props}>
      {items?.map((item: CategoryInfo, index: number) => (
        <div
          key={item.categoryId}
          data-testid={`category-card-${item.categoryId}`}
          role="button"
          tabIndex={0}
          aria-label={ariaLabels?.itemSelectionLabel?.(null, item)}
          onClick={() => onSelectionChange?.({ detail: { selectedItems: [item] } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectionChange?.({ detail: { selectedItems: [item] } });
            }
          }}
          className={selectedItems?.some((selected: CategoryInfo) => selected.categoryId === item.categoryId) ? 'selected' : ''}
        >
          <div data-testid={`category-header-${item.categoryId}`}>
            {cardDefinition.header(item)}
          </div>
          <div data-testid={`category-content-${item.categoryId}`}>
            {cardDefinition.sections[0].content(item)}
          </div>
        </div>
      ))}
    </div>
  ),
  Spinner: ({ size }: any) => <div data-testid="spinner" data-size={size}>Loading...</div>,
  Alert: ({ type, header, children }: any) => (
    <div data-testid="alert" data-type={type}>
      <div data-testid="alert-header">{header}</div>
      <div data-testid="alert-content">{children}</div>
    </div>
  ),
  Box: ({ children, textAlign, padding, variant, color, margin, ...props }: any) => (
    <div data-testid="box" data-variant={variant} data-color={color} {...props}>
      {children}
    </div>
  ),
  Icon: ({ name, size }: any) => <div data-testid="icon" data-name={name} data-size={size} />,
  SpaceBetween: ({ children, direction, size, alignItems }: any) => (
    <div data-testid="space-between" data-direction={direction} data-size={size}>
      {children}
    </div>
  )
}));

describe('CategorySelector Component', () => {
  // Test data
  const mockCategories: CategoryInfo[] = [
    {
      categoryId: 'powertools',
      categoryName: 'Power Tools',
      description: 'Professional and consumer power tools',
      icon: 'drill',
      productCount: 45,
      subcategories: ['saws', 'drills']
    },
    {
      categoryId: 'apparel',
      categoryName: 'Apparel',
      description: 'Clothing and garments',
      icon: 'shirt',
      productCount: 120,
      subcategories: ['shirts', 'hoodies']
    },
    {
      categoryId: 'footwear',
      categoryName: 'Footwear',
      description: 'Shoes and athletic footwear',
      icon: 'shoe',
      productCount: 80,
      subcategories: ['running', 'casual']
    },
    {
      categoryId: 'kitchen',
      categoryName: 'Kitchen Appliances',
      description: 'Small kitchen appliances',
      icon: 'blender',
      productCount: 35,
      subcategories: ['blenders', 'mixers']
    }
  ];

  const mockOnCategorySelect = jest.fn();

  const defaultProps: CategorySelectorProps = {
    categories: mockCategories,
    onCategorySelect: mockOnCategorySelect,
    isLoading: false,
    error: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Category Display', () => {
    it('should display all categories with icons and product counts', () => {
      render(<CategorySelector {...defaultProps} />);

      // Check that all categories are rendered
      mockCategories.forEach(category => {
        expect(screen.getByTestId(`category-card-${category.categoryId}`)).toBeInTheDocument();
        expect(screen.getByText(category.categoryName)).toBeInTheDocument();
        expect(screen.getByText(category.description)).toBeInTheDocument();
        expect(screen.getByText(`${category.productCount} products available`)).toBeInTheDocument();
      });

      // Check that icons are rendered
      expect(screen.getAllByTestId('icon')).toHaveLength(mockCategories.length);
    });

    it('should display category names correctly', () => {
      render(<CategorySelector {...defaultProps} />);

      expect(screen.getByText('Power Tools')).toBeInTheDocument();
      expect(screen.getByText('Apparel')).toBeInTheDocument();
      expect(screen.getByText('Footwear')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Appliances')).toBeInTheDocument();
    });

    it('should display product counts for each category', () => {
      render(<CategorySelector {...defaultProps} />);

      expect(screen.getByText('45 products available')).toBeInTheDocument();
      expect(screen.getByText('120 products available')).toBeInTheDocument();
      expect(screen.getByText('80 products available')).toBeInTheDocument();
      expect(screen.getByText('35 products available')).toBeInTheDocument();
    });
  });

  describe('Category Selection', () => {
    it('should call onCategorySelect when a category is clicked', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      const powertoolsCard = screen.getByTestId('category-card-powertools');
      await user.click(powertoolsCard);

      expect(mockOnCategorySelect).toHaveBeenCalledWith('powertools');
    });

    it('should update selection state when selectedCategory prop changes', () => {
      const { rerender } = render(<CategorySelector {...defaultProps} selectedCategory="powertools" />);

      const powertoolsCard = screen.getByTestId('category-card-powertools');
      expect(powertoolsCard).toHaveClass('selected');

      rerender(<CategorySelector {...defaultProps} selectedCategory="apparel" />);

      const apparelCard = screen.getByTestId('category-card-apparel');
      expect(apparelCard).toHaveClass('selected');
      expect(powertoolsCard).not.toHaveClass('selected');
    });

    it('should handle multiple category selections correctly', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      // Click on different categories
      await user.click(screen.getByTestId('category-card-powertools'));
      expect(mockOnCategorySelect).toHaveBeenCalledWith('powertools');

      await user.click(screen.getByTestId('category-card-apparel'));
      expect(mockOnCategorySelect).toHaveBeenCalledWith('apparel');

      expect(mockOnCategorySelect).toHaveBeenCalledTimes(2);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support Enter key to select category', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      const powertoolsCard = screen.getByTestId('category-card-powertools');
      powertoolsCard.focus();
      
      await user.keyboard('{Enter}');

      expect(mockOnCategorySelect).toHaveBeenCalledWith('powertools');
    });

    it('should support Space key to select category', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      const apparelCard = screen.getByTestId('category-card-apparel');
      apparelCard.focus();
      
      await user.keyboard(' ');

      expect(mockOnCategorySelect).toHaveBeenCalledWith('apparel');
    });

    it('should be focusable with tab navigation', () => {
      render(<CategorySelector {...defaultProps} />);

      const categoryCards = screen.getAllByRole('button');
      
      categoryCards.forEach(card => {
        expect(card).toHaveAttribute('tabIndex', '0');
      });
    });

    it('should not trigger selection on other keys', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      const powertoolsCard = screen.getByTestId('category-card-powertools');
      powertoolsCard.focus();
      
      await user.keyboard('{Escape}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('a');

      expect(mockOnCategorySelect).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('should display spinner when loading', () => {
      render(<CategorySelector {...defaultProps} isLoading={true} />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading categories...')).toBeInTheDocument();
      expect(screen.queryByTestId('cards')).not.toBeInTheDocument();
    });

    it('should display large spinner size', () => {
      render(<CategorySelector {...defaultProps} isLoading={true} />);

      const spinner = screen.getByTestId('spinner');
      expect(spinner).toHaveAttribute('data-size', 'large');
    });

    it('should not display categories when loading', () => {
      render(<CategorySelector {...defaultProps} isLoading={true} />);

      mockCategories.forEach(category => {
        expect(screen.queryByTestId(`category-card-${category.categoryId}`)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error State', () => {
    it('should display error message when error prop is provided', () => {
      const error = new Error('Failed to load categories');
      render(<CategorySelector {...defaultProps} error={error} />);

      expect(screen.getByTestId('alert')).toBeInTheDocument();
      expect(screen.getByTestId('alert-header')).toHaveTextContent('Unable to load categories');
      expect(screen.getByTestId('alert-content')).toHaveTextContent('Failed to load categories');
    });

    it('should display generic error message when error has no message', () => {
      const error = new Error();
      render(<CategorySelector {...defaultProps} error={error} />);

      expect(screen.getByTestId('alert-content')).toHaveTextContent(
        'Categories cannot be loaded at this time. Please try again.'
      );
    });

    it('should not display categories when error occurs', () => {
      const error = new Error('Test error');
      render(<CategorySelector {...defaultProps} error={error} />);

      expect(screen.queryByTestId('cards')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no categories provided', () => {
      render(<CategorySelector {...defaultProps} categories={[]} />);

      expect(screen.getByTestId('alert')).toBeInTheDocument();
      expect(screen.getByTestId('alert-header')).toHaveTextContent('No categories available');
      expect(screen.getByTestId('alert-content')).toHaveTextContent(
        'No product categories are currently available.'
      );
    });

    it('should display empty state when categories is null', () => {
      render(<CategorySelector {...defaultProps} categories={null as any} />);

      expect(screen.getByTestId('alert')).toBeInTheDocument();
      expect(screen.getByTestId('alert-header')).toHaveTextContent('No categories available');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<CategorySelector {...defaultProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA labels for category selection', () => {
      render(<CategorySelector {...defaultProps} />);

      mockCategories.forEach(category => {
        const card = screen.getByTestId(`category-card-${category.categoryId}`);
        // Updated to match the enhanced accessibility labels
        expect(card).toHaveAttribute('aria-label', 
          `Select ${category.categoryName} category with ${category.productCount} products. ${category.description}`
        );
      });
    });

    it('should have proper role attributes', () => {
      render(<CategorySelector {...defaultProps} />);

      const categoryCards = screen.getAllByRole('button');
      expect(categoryCards).toHaveLength(mockCategories.length);
    });

    it('should be keyboard accessible', () => {
      render(<CategorySelector {...defaultProps} />);

      const categoryCards = screen.getAllByRole('button');
      
      categoryCards.forEach(card => {
        expect(card).toHaveAttribute('tabIndex', '0');
      });
    });

    it('should maintain focus management', async () => {
      const user = userEvent.setup();
      render(<CategorySelector {...defaultProps} />);

      const firstCard = screen.getByTestId('category-card-powertools');
      
      await user.tab();
      expect(firstCard).toHaveFocus();
    });
  });

  describe('Props Validation', () => {
    it('should handle undefined selectedCategory', () => {
      render(<CategorySelector {...defaultProps} selectedCategory={undefined} />);

      const categoryCards = screen.getAllByTestId(/category-card-/);
      categoryCards.forEach(card => {
        expect(card).not.toHaveClass('selected');
      });
    });

    it('should handle null selectedCategory', () => {
      render(<CategorySelector {...defaultProps} selectedCategory={null} />);

      const categoryCards = screen.getAllByTestId(/category-card-/);
      categoryCards.forEach(card => {
        expect(card).not.toHaveClass('selected');
      });
    });

    it('should work with minimal required props', () => {
      const minimalProps = {
        categories: mockCategories,
        onCategorySelect: mockOnCategorySelect
      };

      render(<CategorySelector {...minimalProps} />);

      expect(screen.getByTestId('cards')).toBeInTheDocument();
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('alert')).not.toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should work with real category data structure', () => {
      const realCategoryData: CategoryInfo[] = [
        {
          categoryId: 'powertools',
          categoryName: 'Power Tools',
          description: 'Professional and consumer power tools for construction and DIY projects',
          icon: 'drill',
          productCount: 45,
          subcategories: ['saws', 'drills', 'sanders', 'grinders'],
          lastUpdated: '2024-01-15T10:30:00Z'
        }
      ];

      render(<CategorySelector {...defaultProps} categories={realCategoryData} />);

      expect(screen.getByText('Power Tools')).toBeInTheDocument();
      expect(screen.getByText('Professional and consumer power tools for construction and DIY projects')).toBeInTheDocument();
      expect(screen.getByText('45 products available')).toBeInTheDocument();
    });

    it('should handle category selection workflow', async () => {
      const user = userEvent.setup();
      let selectedCategory: ProductCategory | null = null;
      
      const handleCategorySelect = (category: ProductCategory) => {
        selectedCategory = category;
      };

      const { rerender } = render(
        <CategorySelector 
          {...defaultProps} 
          onCategorySelect={handleCategorySelect}
          selectedCategory={selectedCategory}
        />
      );

      // Select a category
      await user.click(screen.getByTestId('category-card-powertools'));
      
      // Update the component with the new selection
      selectedCategory = 'powertools';
      rerender(
        <CategorySelector 
          {...defaultProps} 
          onCategorySelect={handleCategorySelect}
          selectedCategory={selectedCategory}
        />
      );

      expect(screen.getByTestId('category-card-powertools')).toHaveClass('selected');
    });
  });
});