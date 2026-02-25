/**
 * @fileoverview ProductDetailModal component for displaying detailed product information.
 * 
 * Provides a modal interface for viewing comprehensive product details with
 * category-specific attribute organization and pricing analysis validation.
 * Supports all product categories with dynamic attribute grouping.
 * Implements WCAG 2.1 AA accessibility standards with proper focus management,
 * ARIA labels, and keyboard navigation support.
 */

// @ts-ignore - JSX elements are properly declared in react.d.ts
import React from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Header,
  Container,
  ColumnLayout,
  Alert,
  Badge
} from '@cloudscape-design/components';
import {
  ProductType,
  isPowerToolProduct,
  isApparelProduct,
  isFootwearProduct,
  isKitchenProduct,
  hasRequiredPricingData,
  getRoleBadgeColor,
  getCategoryDisplayName
} from '../types/product-types';

/**
 * Props interface for ProductDetailModal component.
 */
export interface ProductDetailModalProps {
  /** Product to display details for (null when modal is closed) */
  product: ProductType | null;
  
  /** Whether the modal is currently open */
  isOpen: boolean;
  
  /** Callback function when modal is closed */
  onClose: () => void;
  
  /** Callback function when "Start Pricing Analysis" is clicked */
  onStartPricingAnalysis: (product: ProductType) => void;
  
  /** Whether pricing analysis is currently starting (loading state) */
  isStarting?: boolean;
}

/**
 * ProductDetailModal component for displaying comprehensive product information.
 * 
 * Features:
 * - Category-specific attribute organization
 * - Product validation for pricing analysis
 * - Large product image with fallback
 * - Responsive layout with proper spacing
 * - Accessibility support
 * 
 * @param props - Component props
 * @returns ProductDetailModal component
 */
export const ProductDetailModal = ({
  product,
  isOpen,
  onClose,
  onStartPricingAnalysis,
  isStarting = false
}: ProductDetailModalProps) => {
  // Don't render if no product is provided
  if (!product) {
    return null;
  }

  // Validate product for pricing analysis
  const isValidForPricing = hasRequiredPricingData(product);
  const validationErrors = getValidationErrors(product);

  /**
   * Handles the start pricing analysis button click.
   */
  const handleStartPricingAnalysis = () => {
    if (isValidForPricing && !isStarting) {
      onStartPricingAnalysis(product);
    }
  };

  /**
   * Renders category-specific attributes in organized sections.
   */
  const renderCategoryAttributes = () => {
    if (isPowerToolProduct(product)) {
      return renderPowerToolAttributes(product);
    } else if (isApparelProduct(product)) {
      return renderApparelAttributes(product);
    } else if (isFootwearProduct(product)) {
      return renderFootwearAttributes(product);
    } else if (isKitchenProduct(product)) {
      return renderKitchenAttributes(product);
    }
    return null;
  };

  return (
    <Modal
      onDismiss={onClose}
      visible={isOpen}
      closeAriaLabel="Close product details modal"
      size="large"

      header={
        <Header
          variant="h1"
          description={`${getCategoryDisplayName(product.category)} - ${product.subcategory}`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Badge 
                color={getRoleBadgeColor(product.role)}
                aria-label={`Product tier: ${product.role}`}
              >
                {product.role.toUpperCase()}
              </Badge>
            </SpaceBetween>
          }
        >
          <span id="product-modal-title">
            {product.product_id}
          </span>
        </Header>
      }
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button 
              variant="link" 
              onClick={onClose}
              ariaLabel="Close product details modal"
            >
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleStartPricingAnalysis}
              disabled={!isValidForPricing || isStarting}
              loading={isStarting}
              ariaLabel={
                !isValidForPricing 
                  ? `Cannot start pricing analysis for ${product.product_id} due to missing required data`
                  : `Start pricing analysis for ${product.product_id}`
              }
              ariaDescribedby={!isValidForPricing ? "validation-errors" : undefined}
            >
              {isStarting ? 'Starting Analysis...' : 'Start Pricing Analysis'}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <div id="product-modal-description">
        <SpaceBetween size="l">
          {/* Validation Error Alert */}
          {!isValidForPricing && (
            <Alert
              statusIconAriaLabel="Error"
              type="error"
              header="Missing Required Pricing Data"
              id="validation-errors"

            >
              This product cannot be analyzed because it is missing required pricing information:
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <ColumnLayout columns={2} variant="text-grid">
            {/* Product Image */}
            <Container header={<Header variant="h2" id="product-image-heading">Product Image</Header>}>
              <div role="img" aria-labelledby="product-image-heading">
                <Box textAlign="center">
                {React.createElement('img', {
                  src: product.imageUrl,
                  alt: `Detailed product image for ${product.product_id}, a ${product.subcategory} from ${product.vendor} in the ${product.category} category`,
                  onError: (e: any) => {
                    // Fallback to placeholder on image load error
                    const target = e.target as HTMLImageElement;
                    target.src = 'https://via.placeholder.com/400x300?text=No+Image+Available';
                    target.alt = `Product image not available for ${product.product_id}`;
                  },
                  style: { width: '100%', height: '300px', objectFit: 'contain' }
                })}
                </Box>
              </div>
            </Container>

            {/* Basic Information */}
            <Container header={<Header variant="h2" id="basic-info-heading">Basic Information</Header>}>
              <ColumnLayout columns={1} variant="text-grid">
                <Box>
                  <Box variant="awsui-key-label" id="product-id-label">Product ID</Box>
                  <Box aria-labelledby="product-id-label">{product.product_id}</Box>
                </Box>
                <Box>
                  <Box variant="awsui-key-label" id="vendor-label">Vendor</Box>
                  <Box aria-labelledby="vendor-label">{product.vendor}</Box>
                </Box>
                <Box>
                  <Box variant="awsui-key-label" id="category-label">Category</Box>
                  <Box aria-labelledby="category-label">{getCategoryDisplayName(product.category)}</Box>
                </Box>
                <Box>
                  <Box variant="awsui-key-label" id="subcategory-label">Subcategory</Box>
                  <Box aria-labelledby="subcategory-label">{product.subcategory}</Box>
                </Box>
                <Box>
                  <Box variant="awsui-key-label" id="tier-label">Product Tier</Box>
                  <Box aria-labelledby="tier-label">
                    <Badge 
                      color={getRoleBadgeColor(product.role)}
                      aria-label={`Product tier: ${product.role}`}
                    >
                      {product.role.toUpperCase()}
                    </Badge>
                  </Box>
                </Box>
              </ColumnLayout>
            </Container>
          </ColumnLayout>

        {/* Category-Specific Attributes */}
        {renderCategoryAttributes()}

          {/* Pricing Information */}
          <Container header={<Header variant="h2" id="pricing-info-heading">Pricing Information</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <Box>
                <Box variant="awsui-key-label" id="cost-label">Cost</Box>
                <Box aria-labelledby="cost-label">
                  {typeof product.cost === 'number' ? `$${product.cost.toFixed(2)}` : 'Not available'}
                </Box>
              </Box>
              <Box>
                <Box variant="awsui-key-label" id="msrp-label">MSRP (Manufacturer's Suggested Retail Price)</Box>
                <Box aria-labelledby="msrp-label">
                  {typeof product.MSRP === 'number' ? `$${product.MSRP.toFixed(2)}` : 'Not available'}
                </Box>
              </Box>
              <Box>
                <Box variant="awsui-key-label" id="map-label">MAP (Minimum Advertised Price)</Box>
                <Box aria-labelledby="map-label">
                  {typeof product.MAP === 'number' ? `$${product.MAP.toFixed(2)}` : 'Not available'}
                </Box>
              </Box>
              <Box>
                <Box variant="awsui-key-label" id="target-label">Annual Sales Target</Box>
                <Box aria-labelledby="target-label">
                  {typeof product.yearTarget === 'number' ? `${product.yearTarget.toLocaleString()} units` : 'Not available'}
                </Box>
              </Box>
            </ColumnLayout>
          </Container>

          {/* Product Features */}
          {product.features && product.features.length > 0 && (
            <Container header={<Header variant="h2" id="features-heading">Product Features</Header>}>
              <ul role="list" aria-labelledby="features-heading" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {product.features.map((feature, index) => (
                  <li key={index} role="listitem">
                    <Box margin={{ left: 's' }}>
                      • {feature}
                    </Box>
                  </li>
                ))}
              </ul>
            </Container>
          )}
        </SpaceBetween>
      </div>
    </Modal>
  );
};

/**
 * Renders Power Tools specific attributes.
 */
function renderPowerToolAttributes(product: ProductType) {
  if (!isPowerToolProduct(product)) return null;

  const { attributes } = product;

  return (
    <Container header={<Header variant="h2">Power Specifications</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Power Type</Box>
          <Box>{attributes.powerType || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Battery Voltage</Box>
          <Box>{attributes.batteryVoltage || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Motor Type</Box>
          <Box>{attributes.motorType || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Blade Speed</Box>
          <Box>{attributes.bladeSpeed || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Cutting Depth</Box>
          <Box>{attributes.cuttingDepth || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Bevel Capacity</Box>
          <Box>{attributes.bevelCapacity || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Color</Box>
          <Box>{attributes.color || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Size</Box>
          <Box>{attributes.size ? `${attributes.size}"` : 'N/A'}</Box>
        </Box>
      </ColumnLayout>
    </Container>
  );
}

/**
 * Renders Apparel specific attributes.
 */
function renderApparelAttributes(product: ProductType) {
  if (!isApparelProduct(product)) return null;

  const { attributes } = product;

  return (
    <Container header={<Header variant="h2">Size & Fit</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Size</Box>
          <Box>{attributes.size || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Color</Box>
          <Box>{attributes.color || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Material</Box>
          <Box>{attributes.material || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Season</Box>
          <Box>{attributes.season || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Gender</Box>
          <Box>{attributes.gender || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Fit</Box>
          <Box>{attributes.fit || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Sleeve</Box>
          <Box>{attributes.sleeve || 'N/A'}</Box>
        </Box>
      </ColumnLayout>
    </Container>
  );
}

/**
 * Renders Footwear specific attributes.
 */
function renderFootwearAttributes(product: ProductType) {
  if (!isFootwearProduct(product)) return null;

  const { attributes } = product;

  return (
    <Container header={<Header variant="h2">Size & Style</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Size</Box>
          <Box>{attributes.size || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Width</Box>
          <Box>{attributes.width || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Color</Box>
          <Box>{attributes.color || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Material</Box>
          <Box>{attributes.material || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Style</Box>
          <Box>{attributes.style || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Closure</Box>
          <Box>{attributes.closure || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Sole</Box>
          <Box>{attributes.sole || 'N/A'}</Box>
        </Box>
      </ColumnLayout>
    </Container>
  );
}

/**
 * Renders Kitchen Appliances specific attributes.
 */
function renderKitchenAttributes(product: ProductType) {
  if (!isKitchenProduct(product)) return null;

  const { attributes } = product;

  return (
    <Container header={<Header variant="h2">Specifications</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Capacity</Box>
          <Box>{attributes.capacity || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Power</Box>
          <Box>{attributes.power || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Material</Box>
          <Box>{attributes.material || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Color</Box>
          <Box>{attributes.color || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Dimensions</Box>
          <Box>{attributes.dimensions || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Weight</Box>
          <Box>{attributes.weight || 'N/A'}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Speed Settings</Box>
          <Box>{attributes.speeds || 'N/A'}</Box>
        </Box>
      </ColumnLayout>
    </Container>
  );
}

/**
 * Gets validation errors for a product.
 * 
 * Note: MAP and MSRP are optional and can be 0 or null. The backend
 * can handle products without these values for pricing analysis.
 * 
 * @param product - Product to validate
 * @returns Array of validation error messages
 */
function getValidationErrors(product: ProductType): string[] {
  const errors: string[] = [];

  if (!product.cost || product.cost <= 0) {
    errors.push('Cost price is required and must be greater than 0');
  }

  if (!product.yearTarget || product.yearTarget <= 0) {
    errors.push('Year target is required and must be greater than 0');
  }

  return errors;
}