/**
 * @fileoverview Factory functions for creating mock product data in tests.
 * 
 * Provides consistent, predictable test data for product-related tests
 * across the application. Supports all product categories with proper
 * type safety and realistic default values.
 */

import { ProductType, PowerToolProduct, ApparelProduct, FootwearProduct, KitchenProduct } from '@/types/product-types';

/**
 * Creates a mock power tool product with default values.
 * 
 * @param overrides - Properties to override in the default product
 * @returns Mock power tool product
 */
export const createMockPowerToolProduct = (overrides: Partial<PowerToolProduct> = {}): PowerToolProduct => ({
  product_id: 'TEST-POWERTOOL-001',
  category: 'powertools',
  subcategory: 'drills',
  role: 'best',
  vendor: 'TEST_VENDOR',
  cost: 50.00,
  MSRP: 99.99,
  MAP: 89.99,
  yearTarget: 1000,
  attributes: {
    powerType: 'cordless',
    batteryVoltage: '20V MAX',
    motorType: 'brushless',
    color: 'red'
  },
  features: ['LED Light', 'Belt Clip'],
  imageUrl: 'https://example.com/powertool.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides
});

/**
 * Creates a mock apparel product with default values.
 * 
 * @param overrides - Properties to override in the default product
 * @returns Mock apparel product
 */
export const createMockApparelProduct = (overrides: Partial<ApparelProduct> = {}): ApparelProduct => ({
  product_id: 'TEST-APPAREL-001',
  category: 'apparel',
  subcategory: 'shirts',
  role: 'better',
  vendor: 'TEST_VENDOR',
  cost: 15.00,
  MSRP: 39.99,
  MAP: 34.99,
  yearTarget: 2000,
  attributes: {
    size: 'M',
    color: 'blue',
    material: 'cotton',
    season: 'summer',
    gender: 'men',
    fit: 'regular',
    sleeve: 'short'
  },
  features: ['Moisture-wicking', 'UV Protection'],
  imageUrl: 'https://example.com/apparel.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides
});

/**
 * Creates a mock footwear product with default values.
 * 
 * @param overrides - Properties to override in the default product
 * @returns Mock footwear product
 */
export const createMockFootwearProduct = (overrides: Partial<FootwearProduct> = {}): FootwearProduct => ({
  product_id: 'TEST-FOOTWEAR-001',
  category: 'footwear',
  subcategory: 'running',
  role: 'good',
  vendor: 'TEST_VENDOR',
  cost: 35.00,
  MSRP: 79.99,
  MAP: 69.99,
  yearTarget: 1500,
  attributes: {
    size: '10',
    width: 'D',
    color: 'black',
    material: 'synthetic',
    style: 'running',
    closure: 'lace-up',
    sole: 'rubber'
  },
  features: ['Cushioned Sole', 'Breathable Mesh'],
  imageUrl: 'https://example.com/footwear.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides
});

/**
 * Creates a mock kitchen product with default values.
 * 
 * @param overrides - Properties to override in the default product
 * @returns Mock kitchen product
 */
export const createMockKitchenProduct = (overrides: Partial<KitchenProduct> = {}): KitchenProduct => ({
  product_id: 'TEST-KITCHEN-001',
  category: 'kitchen',
  subcategory: 'blenders',
  role: 'entry',
  vendor: 'TEST_VENDOR',
  cost: 25.00,
  MSRP: 59.99,
  MAP: 49.99,
  yearTarget: 800,
  attributes: {
    capacity: '64oz',
    power: '1000W',
    material: 'stainless steel',
    color: 'silver',
    dimensions: '8x7x15',
    weight: '8lbs',
    speeds: '10'
  },
  features: ['Variable Speed', 'Pulse Function'],
  imageUrl: 'https://example.com/kitchen.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides
});

/**
 * Creates a mock product of any category with default values.
 * Automatically creates the appropriate category-specific product based on the category.
 * 
 * @param overrides - Properties to override in the default product
 * @returns Mock product of the specified category
 */
export const createMockProduct = (overrides: Partial<ProductType> = {}): ProductType => {
  const category = overrides.category || 'powertools';

  switch (category) {
    case 'powertools':
      return createMockPowerToolProduct(overrides as Partial<PowerToolProduct>);
    case 'apparel':
      return createMockApparelProduct(overrides as Partial<ApparelProduct>);
    case 'footwear':
      return createMockFootwearProduct(overrides as Partial<FootwearProduct>);
    case 'kitchen':
      return createMockKitchenProduct(overrides as Partial<KitchenProduct>);
    default:
      return createMockPowerToolProduct(overrides as Partial<PowerToolProduct>);
  }
};

/**
 * Creates an array of mock products for testing.
 * 
 * @param count - Number of products to create
 * @param category - Category for all products (optional)
 * @param baseOverrides - Base overrides to apply to all products
 * @returns Array of mock products
 */
export const createMockProducts = (
  count: number,
  category?: ProductType['category'],
  baseOverrides: Partial<ProductType> = {}
): ProductType[] => {
  return Array.from({ length: count }, (_, index) => {
    const productOverrides = {
      ...baseOverrides,
      product_id: `${baseOverrides.product_id || 'TEST-PRODUCT'}-${String(index + 1).padStart(3, '0')}`,
      ...(category && { category })
    };
    return createMockProduct(productOverrides);
  });
};

/**
 * Creates a mock product with missing required pricing data for validation testing.
 * 
 * @param missingFields - Array of fields to make invalid/missing
 * @returns Mock product with missing required data
 */
export const createInvalidMockProduct = (
  missingFields: Array<'cost' | 'MSRP' | 'MAP' | 'yearTarget'> = ['cost']
): ProductType => {
  const product = createMockProduct();
  
  missingFields.forEach(field => {
    switch (field) {
      case 'cost':
        (product as any).cost = null;
        break;
      case 'MSRP':
        (product as any).MSRP = null;
        break;
      case 'MAP':
        (product as any).MAP = null;
        break;
      case 'yearTarget':
        (product as any).yearTarget = null;
        break;
    }
  });

  return product;
};

/**
 * Creates a complete set of mock products for all categories for comprehensive testing.
 * 
 * @returns Object with arrays of mock products for each category
 */
export const createMockProductCatalog = () => ({
  powertools: [
    createMockPowerToolProduct({
      product_id: 'CMAN-SAW-PRO725',
      subcategory: 'saws',
      role: 'best',
      vendor: 'CRAFTSMAN',
      attributes: {
        powerType: 'cordless',
        batteryVoltage: '60V MAX',
        motorType: 'brushless',
        bladeSpeed: '5200 RPM',
        color: 'red'
      }
    }),
    createMockPowerToolProduct({
      product_id: 'DEWALT-DRILL-D001',
      subcategory: 'drills',
      role: 'better',
      vendor: 'DEWALT',
      attributes: {
        powerType: 'cordless',
        batteryVoltage: '20V MAX',
        motorType: 'brushless',
        color: 'yellow'
      }
    })
  ],
  apparel: [
    createMockApparelProduct({
      product_id: 'NIKE-SHIRT-M001',
      subcategory: 'shirts',
      role: 'better',
      vendor: 'NIKE',
      attributes: {
        size: 'M',
        color: 'blue',
        material: 'cotton',
        season: 'summer',
        gender: 'men'
      }
    })
  ],
  footwear: [
    createMockFootwearProduct({
      product_id: 'ADIDAS-SHOE-R001',
      subcategory: 'running',
      role: 'best',
      vendor: 'ADIDAS',
      attributes: {
        size: '10',
        width: 'D',
        color: 'black',
        material: 'synthetic',
        style: 'running'
      }
    })
  ],
  kitchen: [
    createMockKitchenProduct({
      product_id: 'CUISINART-BLENDER-B001',
      subcategory: 'blenders',
      role: 'good',
      vendor: 'CUISINART',
      attributes: {
        capacity: '64oz',
        power: '1000W',
        material: 'stainless steel',
        color: 'silver'
      }
    })
  ]
});