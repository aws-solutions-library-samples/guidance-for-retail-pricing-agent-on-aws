/**
 * @fileoverview Unit tests for ProductDetailModal component.
 * 
 * Tests modal display functionality, product validation, error handling,
 * and user interactions for the product detail modal component.
 */

// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductDetailModal } from '../../../../src/frontend/src/components/ProductDetailModal';
import { ProductType, PowerToolProduct, ApparelProduct } from '../../../../src/frontend/src/types/product-types';

// Mock product data for testing
const mockPowerToolProduct: PowerToolProduct = {
  product_id: 'CMAN-SAW-PRO725',
  category: 'powertools',
  subcategory: 'saws',
  role: 'best',
  vendor: 'CRAFTSMAN',
  cost: 89.99,
  MSRP: 179.99,
  MAP: 149.99,
  yearTarget: 5000,
  features: ['Brushless Motor', 'LED Light', 'Dust Blower'],
  imageUrl: 'https://example.com/saw.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  attributes: {
    powerType: 'cordless',
    batteryVoltage: '60V MAX',
    motorType: 'brushless',
    bladeSpeed: '5200 RPM',
    cuttingDepth: '2.5 inches',
    bevelCapacity: '50 degrees',
    color: 'red',
    size: 7.25
  }
};

const mockApparelProduct: ApparelProduct = {
  product_id: 'NIKE-SHIRT-M001',
  category: 'apparel',
  subcategory: 'shirts',
  role: 'better',
  vendor: 'NIKE',
  cost: 15.99,
  MSRP: 39.99,
  MAP: 34.99,
  yearTarget: 10000,
  features: ['Moisture-wicking', 'UV Protection', 'Quick Dry'],
  imageUrl: 'https://example.com/shirt.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  attributes: {
    size: 'M',
    color: 'blue',
    material: 'cotton',
    season: 'summer',
    gender: 'men',
    fit: 'regular',
    sleeve: 'short'
  }
};

const mockInvalidProduct: ProductType = {
  ...mockPowerToolProduct,
  cost: 0, // Invalid cost
  MSRP: 0, // Invalid MSRP
  MAP: 0, // Invalid MAP
  yearTarget: 0 // Invalid year target
};

describe('ProductDetailModal', () => {
  const mockOnClose = jest.fn();
  const mockOnStartPricingAnalysis = jest.fn();



  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Modal Display', () => {
    it('should not render when product is null', () => {
      const { container } = render(
        <ProductDetailModal
          product={null}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not render when modal is closed', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={false}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      // Modal should not be visible when isOpen is false
      expect(screen.queryByText(mockPowerToolProduct.product_id)).not.toBeInTheDocument();
    });

    it('should render modal when product is provided and modal is open', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getAllByText(mockPowerToolProduct.product_id)).toHaveLength(2); // Header and basic info
      expect(screen.getByText('Power Tools - saws')).toBeInTheDocument();
      expect(screen.getAllByText('BEST')).toHaveLength(2); // Header and basic info
    });
  });

  describe('Product Attributes Display', () => {
    it('should display all basic product information', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getAllByText(mockPowerToolProduct.product_id)).toHaveLength(2); // Header and basic info
      expect(screen.getByText(mockPowerToolProduct.vendor)).toBeInTheDocument();
      expect(screen.getByText('Power Tools')).toBeInTheDocument();
      expect(screen.getByText(mockPowerToolProduct.subcategory)).toBeInTheDocument();
    });

    it('should display power tool specific attributes', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getByText('Power Specifications')).toBeInTheDocument();
      expect(screen.getByText('cordless')).toBeInTheDocument();
      expect(screen.getByText('60V MAX')).toBeInTheDocument();
      expect(screen.getByText('brushless')).toBeInTheDocument();
      expect(screen.getByText('5200 RPM')).toBeInTheDocument();
    });

    it('should display apparel specific attributes', () => {
      render(
        <ProductDetailModal
          product={mockApparelProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getByText('Size & Fit')).toBeInTheDocument();
      expect(screen.getByText('M')).toBeInTheDocument();
      expect(screen.getByText('blue')).toBeInTheDocument();
      expect(screen.getByText('cotton')).toBeInTheDocument();
      expect(screen.getByText('summer')).toBeInTheDocument();
      expect(screen.getByText('men')).toBeInTheDocument();
    });

    it('should display pricing information', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getByText('$89.99')).toBeInTheDocument();
      expect(screen.getByText('$179.99')).toBeInTheDocument();
      expect(screen.getByText('$149.99')).toBeInTheDocument();
      expect(screen.getByText('5,000 units')).toBeInTheDocument();
    });

    it('should display product features', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getByText('Features')).toBeInTheDocument();
      expect(screen.getByText('• Brushless Motor')).toBeInTheDocument();
      expect(screen.getByText('• LED Light')).toBeInTheDocument();
      expect(screen.getByText('• Dust Blower')).toBeInTheDocument();
    });

    it('should display N/A for missing optional attributes', () => {
      const productWithMissingAttributes: PowerToolProduct = {
        ...mockPowerToolProduct,
        attributes: {
          powerType: 'cordless'
          // Missing other optional attributes
        }
      };

      render(
        <ProductDetailModal
          product={productWithMissingAttributes}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      // Should show N/A for missing attributes
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThan(0);
    });
  });

  describe('Product Validation', () => {
    it('should enable Start Pricing Analysis button for valid product', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const startButton = screen.getByText('Start Pricing Analysis');
      expect(startButton).toBeEnabled();
    });

    it('should disable Start Pricing Analysis button for invalid product', () => {
      render(
        <ProductDetailModal
          product={mockInvalidProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const startButton = screen.getByText('Start Pricing Analysis');
      expect(startButton).toBeDisabled();
    });

    it('should display validation error message for invalid product', () => {
      render(
        <ProductDetailModal
          product={mockInvalidProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.getByText('Missing Required Pricing Data')).toBeInTheDocument();
      expect(screen.getByText(/Cost price is required and must be greater than 0/)).toBeInTheDocument();
      expect(screen.getByText(/MSRP is required and must be greater than 0/)).toBeInTheDocument();
      expect(screen.getByText(/MAP.*is required and must be greater than 0/)).toBeInTheDocument();
      expect(screen.getByText(/Year target is required and must be greater than 0/)).toBeInTheDocument();
    });

    it('should not display validation error for valid product', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      expect(screen.queryByText('Missing Required Pricing Data')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when Close button is clicked', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onStartPricingAnalysis when Start Pricing Analysis button is clicked', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const startButton = screen.getByText('Start Pricing Analysis');
      fireEvent.click(startButton);

      expect(mockOnStartPricingAnalysis).toHaveBeenCalledTimes(1);
      expect(mockOnStartPricingAnalysis).toHaveBeenCalledWith(mockPowerToolProduct);
    });

    it('should not call onStartPricingAnalysis when button is disabled', () => {
      render(
        <ProductDetailModal
          product={mockInvalidProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const startButton = screen.getByText('Start Pricing Analysis');
      fireEvent.click(startButton);

      expect(mockOnStartPricingAnalysis).not.toHaveBeenCalled();
    });

    it('should show loading state when isStarting is true', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
          isStarting={true}
        />
      );

      expect(screen.getByText('Starting Analysis...')).toBeInTheDocument();
      
      const startButton = screen.getByText('Starting Analysis...');
      expect(startButton).toBeDisabled();
    });

    it('should not call onStartPricingAnalysis when in loading state', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
          isStarting={true}
        />
      );

      const startButton = screen.getByText('Starting Analysis...');
      fireEvent.click(startButton);

      expect(mockOnStartPricingAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('Image Handling', () => {
    it('should display product image with correct alt text', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const image = screen.getByAltText(`${mockPowerToolProduct.product_id} product image`);
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', mockPowerToolProduct.imageUrl);
    });

    it('should handle image load error with fallback', async () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      const image = screen.getByAltText(`${mockPowerToolProduct.product_id} product image`) as HTMLImageElement;
      
      // Simulate image load error
      fireEvent.error(image);

      await waitFor(() => {
        expect(image.src).toBe('https://via.placeholder.com/400x300?text=No+Image+Available');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      // Check for close button aria label
      const closeButton = screen.getByLabelText('Close product details');
      expect(closeButton).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(
        <ProductDetailModal
          product={mockPowerToolProduct}
          isOpen={true}
          onClose={mockOnClose}
          onStartPricingAnalysis={mockOnStartPricingAnalysis}
        />
      );

      // Check for main heading
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mockPowerToolProduct.product_id);
      
      // Check for section headings
      expect(screen.getByRole('heading', { name: 'Product Image' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Power Specifications' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Pricing Information' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    });
  });
});