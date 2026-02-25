/**
 * @fileoverview ProductFilters component for filtering products by category-specific attributes.
 * 
 * Provides dynamic filter controls based on selected category using CloudScape Select components.
 * Implements category-specific filters with AND logic for multiple filters and URL parameter updates.
 * Fully compliant with WCAG 2.1 AA accessibility standards with proper ARIA live regions,
 * keyboard navigation, and screen reader support.
 */

import React, { useEffect, useCallback } from 'react';
import {
  FormField,
  Multiselect,
  SpaceBetween,
  Button,
  Box,
  Alert,
  Spinner,
  MultiselectProps
} from '@cloudscape-design/components';
import { ProductCategory, CategorySpecificFilters, createEmptyFilters } from '../types/product-types';
import { CategoryFilterOptions } from '../hooks/useCategoryFilters';
import { GraphQLServiceError } from '../services/catalog-service';

/**
 * Props for ProductFilters component.
 */
export interface ProductFiltersProps {
  /** Current product category */
  category: ProductCategory;
  /** Current filter state */
  filters: CategorySpecificFilters;
  /** Callback when filters change */
  onFilterChange: (filters: CategorySpecificFilters) => void;
  /** Available filter options from GraphQL */
  filterOptions?: CategoryFilterOptions | null;
  /** Loading state for filter options */
  isLoadingOptions?: boolean;
  /** Error loading filter options */
  optionsError?: GraphQLServiceError | null;
  /** Number of products matching current filters */
  filteredCount?: number;
  /** Total number of products in category */
  totalCount?: number;
}

/**
 * ProductFilters component for dynamic category-based filtering.
 * 
 * Renders filter controls based on the selected category and available
 * filter options from GraphQL. Applies AND logic for multiple filters
 * and provides clear filters functionality with URL parameter updates.
 */
export const ProductFilters = ({
  category,
  filters,
  onFilterChange,
  filterOptions,
  isLoadingOptions = false,
  optionsError = null,
  filteredCount = 0,
  totalCount = 0
}: ProductFiltersProps) => {

  /**
   * Updates URL query parameters when filters change for shareable URLs.
   * This allows users to bookmark or share filtered product views.
   */
  const updateUrlParams = useCallback((newFilters: CategorySpecificFilters) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();

    // Always include the current category in URL
    params.set('category', category);

    // Add common filter parameters if they have values
    if (newFilters.roles.length > 0) {
      params.set('roles', newFilters.roles.join(','));
    }

    if (newFilters.subcategories.length > 0) {
      params.set('subcategories', newFilters.subcategories.join(','));
    }

    // Add category-specific filter parameters
    // Skip 'roles' and 'subcategories' as they're handled above
    Object.entries(newFilters).forEach(([key, value]) => {
      if (key !== 'roles' && key !== 'subcategories' && Array.isArray(value) && value.length > 0) {
        params.set(key, value.join(','));
      }
    });

    // Update URL without triggering page reload (preserves React state)
    const newUrl = `${url.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [category]);

  /**
   * Reset filters when category changes to prevent invalid filter combinations.
   * Each category has different available filter options, so we need to clear
   * filters when switching between categories (e.g., powerType doesn't apply to apparel).
   */
  useEffect(() => {
    const emptyFilters = createEmptyFilters(category);
    onFilterChange(emptyFilters);
    updateUrlParams(emptyFilters);
  }, [category, onFilterChange, updateUrlParams]);

  const handleFilterChange = useCallback((newFilters: CategorySpecificFilters) => {
    onFilterChange(newFilters);
    updateUrlParams(newFilters);
  }, [onFilterChange, updateUrlParams]);

  const handleRoleChange: MultiselectProps['onChange'] = ({ detail }) => {
    const newFilters = {
      ...filters,
      roles: detail.selectedOptions.map((option) => option.value as any)
    };
    handleFilterChange(newFilters);
  };

  const handleSubcategoryChange: MultiselectProps['onChange'] = ({ detail }) => {
    const newFilters = {
      ...filters,
      subcategories: detail.selectedOptions.map((option) => option.value as string)
    };
    handleFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters = createEmptyFilters(category);
    handleFilterChange(emptyFilters);
  };

  const hasActiveFilters = () => {
    return (
      filters.roles.length > 0 ||
      filters.subcategories.length > 0 ||
      Object.entries(filters).some(([key, value]) =>
        key !== 'roles' &&
        key !== 'subcategories' &&
        Array.isArray(value) &&
        value.length > 0
      )
    );
  };

  // Show loading state
  if (isLoadingOptions) {
    return (
      <Box padding="s">
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <Spinner size="normal" />
          <Box variant="small" color="text-body-secondary">
            Loading filter options...
          </Box>
        </SpaceBetween>
      </Box>
    );
  }

  // Show error state
  if (optionsError) {
    return (
      <Alert type="warning" header="Filter options unavailable">
        Unable to load filter options: {optionsError.message}
      </Alert>
    );
  }

  // Show empty state if no filter options
  if (!filterOptions) {
    return (
      <Box variant="small" color="text-body-secondary" padding="s">
        No filter options available for this category.
      </Box>
    );
  }

  // Render category-specific filters
  const renderCategorySpecificFilters = () => {
    if (!filterOptions?.categorySpecificFilters) return null;

    switch (category) {
      case 'powertools':
        const powertoolsOptions = filterOptions.categorySpecificFilters.powertools;
        if (!powertoolsOptions) return null;

        return (
          <>
            {powertoolsOptions.powerTypes && powertoolsOptions.powerTypes.length > 0 && (
              <FormField label="Power Type">
                <Multiselect
                  selectedOptions={
                    (filters as any).powerTypes?.map((type: string) => ({
                      label: type.charAt(0).toUpperCase() + type.slice(1),
                      value: type
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      powerTypes: detail.selectedOptions.map((opt) => opt.value as any)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={powertoolsOptions.powerTypes.map(type => ({
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    value: type
                  }))}
                  placeholder="Filter by power type"
                  selectedAriaLabel="Selected power types"
                  ariaLabel="Power type filter"
                />
              </FormField>
            )}

            {powertoolsOptions.batteryVoltages && powertoolsOptions.batteryVoltages.length > 0 && (
              <FormField label="Battery Voltage">
                <Multiselect
                  selectedOptions={
                    (filters as any).batteryVoltages?.map((voltage: string) => ({
                      label: voltage,
                      value: voltage
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      batteryVoltages: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={powertoolsOptions.batteryVoltages.map(voltage => ({
                    label: voltage,
                    value: voltage
                  }))}
                  placeholder="Filter by battery voltage"
                  selectedAriaLabel="Selected battery voltages"
                  ariaLabel="Battery voltage filter"
                />
              </FormField>
            )}

            {powertoolsOptions.colors && powertoolsOptions.colors.length > 0 && (
              <FormField label="Color">
                <Multiselect
                  selectedOptions={
                    (filters as any).colors?.map((color: string) => ({
                      label: color.charAt(0).toUpperCase() + color.slice(1),
                      value: color
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      colors: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={powertoolsOptions.colors.map(color => ({
                    label: color.charAt(0).toUpperCase() + color.slice(1),
                    value: color
                  }))}
                  placeholder="Filter by color"
                  selectedAriaLabel="Selected colors"
                  ariaLabel="Color filter"
                />
              </FormField>
            )}
          </>
        );

      case 'apparel':
        const apparelOptions = filterOptions.categorySpecificFilters.apparel;
        if (!apparelOptions) return null;

        return (
          <>
            {apparelOptions.sizes && apparelOptions.sizes.length > 0 && (
              <FormField label="Size">
                <Multiselect
                  selectedOptions={
                    (filters as any).sizes?.map((size: string) => ({
                      label: size,
                      value: size
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      sizes: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={apparelOptions.sizes.map(size => ({
                    label: size,
                    value: size
                  }))}
                  placeholder="Filter by size"
                  selectedAriaLabel="Selected sizes"
                  ariaLabel="Size filter"
                />
              </FormField>
            )}

            {apparelOptions.colors && apparelOptions.colors.length > 0 && (
              <FormField label="Color">
                <Multiselect
                  selectedOptions={
                    (filters as any).colors?.map((color: string) => ({
                      label: color.charAt(0).toUpperCase() + color.slice(1),
                      value: color
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      colors: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={apparelOptions.colors.map(color => ({
                    label: color.charAt(0).toUpperCase() + color.slice(1),
                    value: color
                  }))}
                  placeholder="Filter by color"
                  selectedAriaLabel="Selected colors"
                  ariaLabel="Color filter"
                />
              </FormField>
            )}

            {apparelOptions.materials && apparelOptions.materials.length > 0 && (
              <FormField label="Material">
                <Multiselect
                  selectedOptions={
                    (filters as any).materials?.map((material: string) => ({
                      label: material.charAt(0).toUpperCase() + material.slice(1),
                      value: material
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      materials: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={apparelOptions.materials.map(material => ({
                    label: material.charAt(0).toUpperCase() + material.slice(1),
                    value: material
                  }))}
                  placeholder="Filter by material"
                  selectedAriaLabel="Selected materials"
                  ariaLabel="Material filter"
                />
              </FormField>
            )}

            {apparelOptions.genders && apparelOptions.genders.length > 0 && (
              <FormField label="Gender">
                <Multiselect
                  selectedOptions={
                    (filters as any).genders?.map((gender: string) => ({
                      label: gender.charAt(0).toUpperCase() + gender.slice(1),
                      value: gender
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      genders: detail.selectedOptions.map((opt) => opt.value as any)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={apparelOptions.genders.map(gender => ({
                    label: gender.charAt(0).toUpperCase() + gender.slice(1),
                    value: gender
                  }))}
                  placeholder="Filter by gender"
                  selectedAriaLabel="Selected genders"
                  ariaLabel="Gender filter"
                />
              </FormField>
            )}
          </>
        );

      case 'footwear':
        const footwearOptions = filterOptions.categorySpecificFilters.footwear;
        if (!footwearOptions) return null;

        return (
          <>
            {footwearOptions.sizes && footwearOptions.sizes.length > 0 && (
              <FormField label="Size">
                <Multiselect
                  selectedOptions={
                    (filters as any).sizes?.map((size: string) => ({
                      label: size,
                      value: size
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      sizes: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={footwearOptions.sizes.map(size => ({
                    label: size,
                    value: size
                  }))}
                  placeholder="Filter by size"
                  selectedAriaLabel="Selected sizes"
                  ariaLabel="Size filter"
                />
              </FormField>
            )}

            {footwearOptions.widths && footwearOptions.widths.length > 0 && (
              <FormField label="Width">
                <Multiselect
                  selectedOptions={
                    (filters as any).widths?.map((width: string) => ({
                      label: width,
                      value: width
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      widths: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={footwearOptions.widths.map(width => ({
                    label: width,
                    value: width
                  }))}
                  placeholder="Filter by width"
                  selectedAriaLabel="Selected widths"
                  ariaLabel="Width filter"
                />
              </FormField>
            )}

            {footwearOptions.styles && footwearOptions.styles.length > 0 && (
              <FormField label="Style">
                <Multiselect
                  selectedOptions={
                    (filters as any).styles?.map((style: string) => ({
                      label: style.charAt(0).toUpperCase() + style.slice(1),
                      value: style
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      styles: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={footwearOptions.styles.map(style => ({
                    label: style.charAt(0).toUpperCase() + style.slice(1),
                    value: style
                  }))}
                  placeholder="Filter by style"
                  selectedAriaLabel="Selected styles"
                  ariaLabel="Style filter"
                />
              </FormField>
            )}
          </>
        );

      case 'kitchen':
        const kitchenOptions = filterOptions.categorySpecificFilters.kitchen;
        if (!kitchenOptions) return null;

        return (
          <>
            {kitchenOptions.capacities && kitchenOptions.capacities.length > 0 && (
              <FormField label="Capacity">
                <Multiselect
                  selectedOptions={
                    (filters as any).capacities?.map((capacity: string) => ({
                      label: capacity,
                      value: capacity
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      capacities: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={kitchenOptions.capacities.map(capacity => ({
                    label: capacity,
                    value: capacity
                  }))}
                  placeholder="Filter by capacity"
                  selectedAriaLabel="Selected capacities"
                  ariaLabel="Capacity filter"
                />
              </FormField>
            )}

            {kitchenOptions.materials && kitchenOptions.materials.length > 0 && (
              <FormField label="Material">
                <Multiselect
                  selectedOptions={
                    (filters as any).materials?.map((material: string) => ({
                      label: material.charAt(0).toUpperCase() + material.slice(1),
                      value: material
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      materials: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={kitchenOptions.materials.map(material => ({
                    label: material.charAt(0).toUpperCase() + material.slice(1),
                    value: material
                  }))}
                  placeholder="Filter by material"
                  selectedAriaLabel="Selected materials"
                  ariaLabel="Material filter"
                />
              </FormField>
            )}

            {kitchenOptions.powers && kitchenOptions.powers.length > 0 && (
              <FormField label="Power">
                <Multiselect
                  selectedOptions={
                    (filters as any).powers?.map((power: string) => ({
                      label: power,
                      value: power
                    })) || []
                  }
                  onChange={({ detail }) => {
                    const newFilters = {
                      ...filters,
                      powers: detail.selectedOptions.map((opt) => opt.value as string)
                    };
                    handleFilterChange(newFilters);
                  }}
                  options={kitchenOptions.powers.map(power => ({
                    label: power,
                    value: power
                  }))}
                  placeholder="Filter by power"
                  selectedAriaLabel="Selected powers"
                  ariaLabel="Power filter"
                />
              </FormField>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div role="region" aria-labelledby="filters-heading">
      {/* Screen reader heading */}
      <h3 id="filters-heading" style={{
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
        Product Filters
      </h3>

      <SpaceBetween size="m">
        {/* Filter Results Summary */}
        <SpaceBetween direction="horizontal" size="s" alignItems="center">

          {hasActiveFilters() && (
            <Button
              variant="link"
              onClick={clearFilters}
              ariaLabel={`Clear all active filters. Currently filtering by ${
                [
                  filters.roles.length > 0 && `${filters.roles.length} product tiers`,
                  filters.subcategories.length > 0 && `${filters.subcategories.length} subcategories`,
                  ...Object.entries(filters)
                    .filter(([key, value]) => 
                      key !== 'roles' && 
                      key !== 'subcategories' && 
                      Array.isArray(value) && 
                      value.length > 0
                    )
                    .map(([key, value]) => `${(value as string[]).length} ${key}`)
                ].filter(Boolean).join(', ')
              }`}
            >
              Clear filters
            </Button>
          )}
        </SpaceBetween>

        <SpaceBetween size="s">
          {/* Live region for filter changes */}
          <div
            aria-live="polite"
            aria-atomic="false"
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
            {hasActiveFilters() && `Filters applied. ${filteredCount} products match current filters.`}
          </div>

          {/* Role Filter (Common across all categories) */}
          {filterOptions && filterOptions.availableRoles.length > 0 && (
            <FormField 
              label="Product Tier"
              description="Filter products by their quality tier (Best, Better, Good, Entry)"
            >
              <Multiselect
                selectedOptions={
                  filters.roles.map(role => ({
                    label: role.charAt(0).toUpperCase() + role.slice(1),
                    value: role
                  }))
                }
                onChange={handleRoleChange}
                options={filterOptions.availableRoles.map(role => ({
                  label: role.charAt(0).toUpperCase() + role.slice(1),
                  value: role
                }))}
                placeholder="Filter by product tier"
                selectedAriaLabel={`Selected product tiers: ${filters.roles.length > 0 ? filters.roles.join(', ') : 'none'}`}
                ariaLabel="Product tier filter. Select one or more tiers to filter products."
                ariaDescribedby="tier-filter-help"
              />
              <div
                id="tier-filter-help"
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
                Use arrow keys to navigate options, Space to select, Enter to confirm selection.
              </div>
            </FormField>
          )}

          {/* Subcategory Filter */}
          {/* {filterOptions && filterOptions.availableSubcategories.length > 0 && (
            <FormField 
              label="Subcategory"
              description="Filter products by their specific subcategory within the selected category"
            >
              <Multiselect
                selectedOptions={
                  filters.subcategories.map(sub => ({
                    label: sub.charAt(0).toUpperCase() + sub.slice(1),
                    value: sub
                  }))
                }
                onChange={handleSubcategoryChange}
                options={filterOptions.availableSubcategories.map(sub => ({
                  label: sub.charAt(0).toUpperCase() + sub.slice(1),
                  value: sub
                }))}
                placeholder="Filter by subcategory"
                selectedAriaLabel={`Selected subcategories: ${filters.subcategories.length > 0 ? filters.subcategories.join(', ') : 'none'}`}
                ariaLabel="Subcategory filter. Select one or more subcategories to filter products."
              />
            </FormField>
          )} */}

          <Box 
            variant="small" 
            color="text-body-secondary"
            
          >
            {filteredCount > 0 ? (
              <>Showing {filteredCount} of {totalCount} products</>
            ) : totalCount > 0 ? (
              <>No products match the current filters</>
            ) : (
              <>Loading products...</>
            )}
          </Box>

          {/* Category-Specific Filters */}
          {renderCategorySpecificFilters()}
        </SpaceBetween>
      </SpaceBetween>
    </div>
  );
};