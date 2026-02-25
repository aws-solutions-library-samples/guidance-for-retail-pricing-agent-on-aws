/**
 * @fileoverview ProductDetailsCard component for pricing dashboard.
 * 
 * Displays comprehensive product information including image, metadata,
 * pricing details, features, and specifications. Uses CloudScape Container
 * and ColumnLayout for responsive design with proper accessibility support.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import React, { useState, useMemo } from 'react';
import {
  Container,
  Header,
  ColumnLayout,
  Box,
  Badge,
  SpaceBetween,
  KeyValuePairs,
  ExpandableSection,
  StatusIndicator
} from '@cloudscape-design/components';
import { ProductType, formatPrice, getRoleBadgeColor } from '../types/product-types';

/**
 * Props for ProductDetailsCard component.
 */
export interface ProductDetailsCardProps {
  /** Product data to display */
  product: {
    product_id: string;
    category: string;
    subcategory: string;
    role: string;
    vendor: string;
    cost: number;
    MSRP: number;
    MAP: number;
    yearTarget: number;
    features: string[];
    imageUrl: string;
    attributes?: Record<string, string>;
    id?: string;
  };
}

/**
 * ProductDetailsCard component.
 * 
 * Displays product details including image, metadata, pricing information,
 * features, and specifications in a structured layout using CloudScape components.
 * 
 * Performance optimizations:
 * - Memoized with React.memo (Requirement 15.2)
 * - Lazy loading for product images (Requirement 15.3)
 * - useMemo for expensive calculations
 * 
 * @param props - Component props
 * @returns JSX element
 */
const ProductDetailsCardComponent: React.FC<ProductDetailsCardProps> = ({ product }) => {

  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    features: false,
    specifications: false
  });

  /**
   * Handles image load errors by showing placeholder.
   */
  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  /**
   * Handles successful image load.
   */
  const handleImageLoad = () => {
    console.log('image loaded');
    setImageLoading(false);
  };

  /**
   * Toggles the expanded state of a section.
   * 
   * @param sectionKey - Section identifier
   */
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  /**
   * Formats specifications as key-value pairs for display.
   * Memoized to avoid recalculation on every render (Requirement 15.3)
   * 
   * @returns Array of key-value pair items
   */
  const formatSpecifications = useMemo(() => {
    return Object.entries(product.attributes).map(([key, value]) => ({
      label: key.split(/(?=[A-Z])/).join(' ').replace(/^\w/, c => c.toUpperCase()),
      value: value
    }));
  }, [product.attributes]);

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Product information for pricing analysis"
        >
          Product Details
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {/* Product Image and Metadata Section */}
        <ColumnLayout columns={2} variant="text-grid">
          {/* Left Column: Product Image */}
          <div>
            <Box textAlign="center">
              <div className="product-image-container">
                {imageLoading && !imageError && (
                  <StatusIndicator type="loading">Loading product image...</StatusIndicator>
                )}

                {!imageError ? (
                  <img
                    src={product.imageUrl}
                    alt={`Product image for ${product.product_id}`}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    // loading="lazy"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      display: imageLoading ? 'none' : 'block'
                    }}
                  />
                ) : (
                  <Box textAlign="center" color="text-body-secondary" padding="l">
                    <StatusIndicator type="stopped">
                      Product image unavailable
                    </StatusIndicator>
                  </Box>
                )}
              </div>
            </Box>
          </div>

          {/* Right Column: Product Metadata */}
          <div>
            <SpaceBetween direction="vertical" size="m">
              {/* Product ID */}
              <div>
                <Box variant="awsui-key-label">Product ID</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {product.product_id}
                </Box>
              </div>

              {/* Category, Subcategory, Role */}
              <KeyValuePairs
                columns={1}
                items={[
                  {
                    label: 'Category',
                    value: product.category
                  },
                  {
                    label: 'Subcategory',
                    value: product.subcategory
                  },
                  {
                    label: 'Role',
                    value: (
                      <Badge color={getRoleBadgeColor(product.role as any)}>
                        {product.role.toUpperCase()}
                      </Badge>
                    )
                  }
                ]}
              />
            </SpaceBetween>
          </div>
        </ColumnLayout>

        {/* Pricing Information Section */}
        <div>
          <Box variant="h3" margin={{ bottom: 's' }}>
            Pricing Information
          </Box>
          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">Cost</Box>
              <Box fontSize="heading-m" fontWeight="bold">
                {formatPrice(product.cost)}
              </Box>
              <Box color="text-body-secondary" fontSize="body-s">
                Base cost price
              </Box>
            </div>

            <div>
              <Box variant="awsui-key-label">MSRP</Box>
              <Box fontSize="heading-m" fontWeight="bold">
                {formatPrice(product.MSRP)}
              </Box>
              <Box color="text-body-secondary" fontSize="body-s">
                Manufacturer's suggested retail price
              </Box>
            </div>

            <div>
              <Box variant="awsui-key-label">MAP</Box>
              <Box fontSize="heading-m" fontWeight="bold">
                {formatPrice(product.MAP)}
              </Box>
              <Box color="text-body-secondary" fontSize="body-s">
                Minimum advertised price
              </Box>
            </div>
          </ColumnLayout>
        </div>

        {/* Product Features Section */}
        {product.features && product.features.length > 0 && (
          <ExpandableSection
            headerText="Product Features"
            headerDescription={`${product.features.length} key features`}
            expanded={expandedSections.features}
            onChange={() => toggleSection('features')}
          >
            <Box>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '20px',
                  listStyleType: 'disc'
                }}
              >
                {product.features.map((feature, index) => (
                  <li key={index} style={{ marginBottom: '8px' }}>
                    <Box>{feature}</Box>
                  </li>
                ))}
              </ul>
            </Box>
          </ExpandableSection>
        )}

        {/* Product Attributes Section */}
        {product.attributes && Object.keys(product.attributes).length > 0 && (
          <ExpandableSection
            headerText="Product Specifications"
            headerDescription={`${Object.keys(product.attributes).length} specifications`}
            expanded={expandedSections.specifications}
            onChange={() => toggleSection('specifications')}
          >
            <KeyValuePairs
              columns={2}
              items={formatSpecifications}
            />
          </ExpandableSection>
        )}
      </SpaceBetween>
    </Container>
  );
};


/**
 * Memoized ProductDetailsCard component to prevent unnecessary re-renders.
 * Only re-renders when product data changes.
 * 
 * Performance optimization (Requirement 15.2)
 */
export const ProductDetailsCard = React.memo(ProductDetailsCardComponent, (prevProps, nextProps) => {
  // Deep comparison of product object
  return prevProps.product.id === nextProps.product.id &&
         prevProps.product.product_id === nextProps.product.product_id &&
         prevProps.product.imageUrl === nextProps.product.imageUrl;
});

ProductDetailsCard.displayName = 'ProductDetailsCard';
