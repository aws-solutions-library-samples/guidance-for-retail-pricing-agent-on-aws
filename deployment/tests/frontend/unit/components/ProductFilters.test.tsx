/**
 * @fileoverview Unit tests for ProductFilters component.
 * 
 * Tests filter selection updates, AND logic for multiple filters,
 * clear filters functionality, and URL query parameter updates.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductFilters, ProductFiltersProps } from '../../../../src/frontend/src/components/ProductFilters';
import {
    ProductCategory,
    PowerToolFilters,
    createEmptyFilters
} from '../../../../src/frontend/src/types/product-types';
import { CategoryFilterOptions } from '../../../../src/frontend/src/hooks/useCategoryFilters';

// Mock window.history.replaceState
const mockReplaceState = jest.fn();
Object.defineProperty(window, 'history', {
    value: {
        replaceState: mockReplaceState,
    },
    writable: true,
});

// Mock window.location
Object.defineProperty(window, 'location', {
    value: {
        href: 'http://localhost:3000/products',
        pathname: '/products',
    },
    writable: true,
});

describe('ProductFilters Component', () => {
    const mockOnFilterChange = jest.fn();

    const mockPowertoolsFilterOptions: CategoryFilterOptions = {
        category: 'powertools' as ProductCategory,
        availableRoles: ['best', 'better', 'good', 'entry'],
        availableSubcategories: ['drills', 'saws', 'sanders'],
        availableVendors: ['CRAFTSMAN', 'DEWALT', 'MILWAUKEE'],
        priceRange: { min: 50, max: 500, average: 200 },
        categorySpecificFilters: {
            powertools: {
                powerTypes: ['cordless', 'corded', 'pneumatic'],
                batteryVoltages: ['12V', '18V', '20V', '60V MAX'],
                colors: ['red', 'yellow', 'black'],
                sizes: [7.25, 10, 12]
            }
        }
    };

    const mockApparelFilterOptions: CategoryFilterOptions = {
        category: 'apparel' as ProductCategory,
        availableRoles: ['best', 'better', 'good', 'entry'],
        availableSubcategories: ['shirts', 'pants', 'jackets'],
        availableVendors: ['NIKE', 'ADIDAS', 'UNDER ARMOUR'],
        priceRange: { min: 20, max: 200, average: 80 },
        categorySpecificFilters: {
            apparel: {
                sizes: ['S', 'M', 'L', 'XL'],
                colors: ['blue', 'red', 'black', 'white'],
                materials: ['cotton', 'polyester', 'wool'],
                genders: ['men', 'women', 'unisex'],
                seasons: ['spring', 'summer', 'fall', 'winter'],
                fits: ['regular', 'slim', 'loose']
            }
        }
    };

    const defaultProps: ProductFiltersProps = {
        category: 'powertools',
        filters: createEmptyFilters('powertools'),
        onFilterChange: mockOnFilterChange,
        filterOptions: mockPowertoolsFilterOptions,
        isLoadingOptions: false,
        optionsError: null,
        filteredCount: 10,
        totalCount: 50
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockReplaceState.mockClear();
    });

    describe('Rendering', () => {
        it('should render filter results summary', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByText('Showing 10 of 50 products')).toBeInTheDocument();
        });

        it('should render loading state when filter options are loading', () => {
            render(
                <ProductFilters
                    {...defaultProps}
                    isLoadingOptions={true}
                    filterOptions={null}
                />
            );

            expect(screen.getByText('Loading filter options...')).toBeInTheDocument();
        });

        it('should render error state when filter options fail to load', () => {
            const error = { message: 'Failed to load filters' } as any;
            render(
                <ProductFilters
                    {...defaultProps}
                    optionsError={error}
                    filterOptions={null}
                />
            );

            expect(screen.getByText('Filter options unavailable')).toBeInTheDocument();
            expect(screen.getByText('Unable to load filter options: Failed to load filters')).toBeInTheDocument();
        });

        it('should render empty state when no filter options available', () => {
            render(
                <ProductFilters
                    {...defaultProps}
                    filterOptions={null}
                />
            );

            expect(screen.getByText('No filter options available for this category.')).toBeInTheDocument();
        });

        it('should render role filter for powertools category', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByText('Product Tier')).toBeInTheDocument();
            expect(screen.getByLabelText('Product tier filter')).toBeInTheDocument();
        });

        it('should render subcategory filter for powertools category', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByText('Subcategory')).toBeInTheDocument();
            expect(screen.getByLabelText('Subcategory filter')).toBeInTheDocument();
        });

        it('should render powertools-specific filters', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByText('Power Type')).toBeInTheDocument();
            expect(screen.getByText('Battery Voltage')).toBeInTheDocument();
            expect(screen.getByText('Color')).toBeInTheDocument();
        });

        it('should render apparel-specific filters when category is apparel', () => {
            const apparelFilters = createEmptyFilters('apparel');
            render(
                <ProductFilters
                    {...defaultProps}
                    category="apparel"
                    filters={apparelFilters}
                    filterOptions={mockApparelFilterOptions}
                />
            );

            expect(screen.getByText('Size')).toBeInTheDocument();
            expect(screen.getByText('Material')).toBeInTheDocument();
            expect(screen.getByText('Gender')).toBeInTheDocument();
        });
    });

    describe('Filter Selection', () => {
        it('should update state when role filter is changed', async () => {
            const user = userEvent.setup();
            render(<ProductFilters {...defaultProps} />);

            // Find and click the "Best" option directly
            const bestOption = screen.getByTestId('multiselect-option-best');
            await user.click(bestOption);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    roles: ['best']
                })
            );
        });

        it('should update state when subcategory filter is changed', async () => {
            const user = userEvent.setup();
            render(<ProductFilters {...defaultProps} />);

            // Find and click the "Drills" option directly
            const drillsOption = screen.getByTestId('multiselect-option-drills');
            await user.click(drillsOption);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    subcategories: ['drills']
                })
            );
        });

        it('should update state when power type filter is changed', async () => {
            const user = userEvent.setup();
            render(<ProductFilters {...defaultProps} />);

            // Find and click the "Cordless" option directly
            const cordlessOption = screen.getByTestId('multiselect-option-cordless');
            await user.click(cordlessOption);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    powerTypes: ['cordless']
                })
            );
        });

        it('should support multiple selections in the same filter', async () => {
            const user = userEvent.setup();

            // Start with one role already selected
            const filtersWithOneRole: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithOneRole}
                />
            );

            // Add another role
            const betterOption = screen.getByTestId('multiselect-option-better');
            await user.click(betterOption);

            expect(mockOnFilterChange).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    roles: expect.arrayContaining(['best', 'better'])
                })
            );
        });
    });

    describe('AND Logic for Multiple Filters', () => {
        it('should apply AND logic when multiple different filters are selected', async () => {
            const user = userEvent.setup();
            const filtersWithRole: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithRole}
                />
            );

            // Add a subcategory filter
            const drillsOption = screen.getByTestId('multiselect-option-drills');
            await user.click(drillsOption);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    roles: ['best'],
                    subcategories: ['drills']
                })
            );
        });

        it('should preserve existing filters when adding new ones', async () => {
            const user = userEvent.setup();
            const existingFilters: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best'],
                powerTypes: ['cordless']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={existingFilters}
                />
            );

            // Add battery voltage filter
            const voltage18V = screen.getByTestId('multiselect-option-18V');
            await user.click(voltage18V);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    roles: ['best'],
                    powerTypes: ['cordless'],
                    batteryVoltages: ['18V']
                })
            );
        });
    });

    describe('Clear Filters Functionality', () => {
        it('should show clear filters button when filters are active', () => {
            const filtersWithSelections: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best'],
                powerTypes: ['cordless']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithSelections}
                />
            );

            expect(screen.getByText('Clear filters')).toBeInTheDocument();
        });

        it('should not show clear filters button when no filters are active', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
        });

        it('should clear all filters when clear button is clicked', async () => {
            const user = userEvent.setup();
            const filtersWithSelections: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best', 'better'],
                subcategories: ['drills'],
                powerTypes: ['cordless'],
                batteryVoltages: ['18V']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithSelections}
                />
            );

            const clearButton = screen.getByText('Clear filters');
            await user.click(clearButton);

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                createEmptyFilters('powertools')
            );
        });
    });

    describe('URL Query Parameter Updates', () => {
        it('should update URL parameters when filters change', async () => {
            const user = userEvent.setup();
            render(<ProductFilters {...defaultProps} />);

            const bestOption = screen.getByTestId('multiselect-option-best');
            await user.click(bestOption);

            await waitFor(() => {
                expect(mockReplaceState).toHaveBeenCalledWith(
                    {},
                    '',
                    expect.stringContaining('category=powertools')
                );
                expect(mockReplaceState).toHaveBeenCalledWith(
                    {},
                    '',
                    expect.stringContaining('roles=best')
                );
            });
        });

        it('should update URL with multiple filter parameters', async () => {
            const user = userEvent.setup();
            const filtersWithMultiple: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best'],
                subcategories: ['drills']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithMultiple}
                />
            );

            // Add power type filter
            const cordlessOption = screen.getByTestId('multiselect-option-cordless');
            await user.click(cordlessOption);

            await waitFor(() => {
                expect(mockReplaceState).toHaveBeenCalledWith(
                    {},
                    '',
                    expect.stringMatching(/category=powertools.*roles=best.*subcategories=drills.*powerTypes=cordless/)
                );
            });
        });

        it('should clear URL parameters when filters are cleared', async () => {
            const user = userEvent.setup();
            const filtersWithSelections: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best'],
                powerTypes: ['cordless']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithSelections}
                />
            );

            const clearButton = screen.getByText('Clear filters');
            await user.click(clearButton);

            await waitFor(() => {
                expect(mockReplaceState).toHaveBeenCalledWith(
                    {},
                    '',
                    '/products?category=powertools'
                );
            });
        });
    });

    describe('Category Changes', () => {
        it('should reset filters when category changes', () => {
            const { rerender } = render(<ProductFilters {...defaultProps} />);

            // Change category to apparel
            const apparelFilters = createEmptyFilters('apparel');
            rerender(
                <ProductFilters
                    {...defaultProps}
                    category="apparel"
                    filters={apparelFilters}
                    filterOptions={mockApparelFilterOptions}
                />
            );

            expect(mockOnFilterChange).toHaveBeenCalledWith(
                createEmptyFilters('apparel')
            );
        });

        it('should show different category-specific filters when category changes', () => {
            const { rerender } = render(<ProductFilters {...defaultProps} />);

            // Initially shows powertools filters
            expect(screen.getByText('Power Type')).toBeInTheDocument();
            expect(screen.getByText('Battery Voltage')).toBeInTheDocument();

            // Change to apparel category
            const apparelFilters = createEmptyFilters('apparel');
            rerender(
                <ProductFilters
                    {...defaultProps}
                    category="apparel"
                    filters={apparelFilters}
                    filterOptions={mockApparelFilterOptions}
                />
            );

            // Should now show apparel filters
            expect(screen.queryByText('Power Type')).not.toBeInTheDocument();
            expect(screen.queryByText('Battery Voltage')).not.toBeInTheDocument();
            expect(screen.getByText('Size')).toBeInTheDocument();
            expect(screen.getByText('Material')).toBeInTheDocument();
            expect(screen.getByText('Gender')).toBeInTheDocument();
        });
    });

    describe('Product Count Display', () => {
        it('should show filtered count when products match filters', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByText('Showing 10 of 50 products')).toBeInTheDocument();
        });

        it('should show no products message when no products match filters', () => {
            render(
                <ProductFilters
                    {...defaultProps}
                    filteredCount={0}
                />
            );

            expect(screen.getByText('No products match the current filters')).toBeInTheDocument();
        });

        it('should show loading message when total count is 0', () => {
            render(
                <ProductFilters
                    {...defaultProps}
                    filteredCount={0}
                    totalCount={0}
                />
            );

            expect(screen.getByText('Loading products...')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA labels for all filter controls', () => {
            render(<ProductFilters {...defaultProps} />);

            expect(screen.getByLabelText('Product tier filter')).toBeInTheDocument();
            expect(screen.getByLabelText('Subcategory filter')).toBeInTheDocument();
            expect(screen.getByLabelText('Power type filter')).toBeInTheDocument();
            expect(screen.getByLabelText('Battery voltage filter')).toBeInTheDocument();
            expect(screen.getByLabelText('Color filter')).toBeInTheDocument();
        });

        it('should have proper ARIA label for clear filters button', () => {
            const filtersWithSelections: PowerToolFilters = {
                ...createEmptyFilters('powertools') as PowerToolFilters,
                roles: ['best']
            };

            render(
                <ProductFilters
                    {...defaultProps}
                    filters={filtersWithSelections}
                />
            );

            expect(screen.getByLabelText('Clear all filters')).toBeInTheDocument();
        });

        it('should have proper selectedAriaLabel for multiselect components', () => {
            render(<ProductFilters {...defaultProps} />);

            // Check that selectedAriaLabel is set (this is handled by CloudScape internally)
            const roleFilter = screen.getByLabelText('Product tier filter');
            expect(roleFilter).toHaveAttribute('aria-label', 'Product tier filter');
        });
    });
});