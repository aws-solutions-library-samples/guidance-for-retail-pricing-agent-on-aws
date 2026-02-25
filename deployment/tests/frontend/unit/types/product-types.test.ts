/**
 * @fileoverview Tests for product type definitions and type guards.
 * 
 * Tests the multi-category product type interfaces, type guards, and utility functions
 * for the product catalog management system. Validates type safety and runtime behavior
 * of category-specific product types and filtering interfaces.
 */

import {
  ProductType,
  PowerToolProduct,
  ApparelProduct,
  FootwearProduct,
  KitchenProduct,
  isPowerToolProduct,
  isApparelProduct,
  isFootwearProduct,
  isKitchenProduct,
  hasRequiredPricingData,
  getCategoryDisplayName,
  getRoleBadgeColor,
  createEmptyFilters,
  isPowerToolFilters,
  isApparelFilters,
  isFootwearFilters,
  isKitchenFilters
} from '@/types/product-types';

describe('Product Type Guards', () => {
  const mockPowerTool: PowerToolProduct = {
    product_id: 'CMAN-SAW-PRO725',
    category: 'powertools',
    subcategory: 'saws',
    role: 'best',
    vendor: 'CRAFTSMAN',
    cost: 89.99,
    MSRP: 179.99,
    MAP: 149.99,
    yearTarget: 5000,
    features: ['Brushless Motor', 'LED Light'],
    imageUrl: 'https://example.com/image.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    attributes: {
      powerType: 'cordless',
      batteryVoltage: '60V MAX',
      motorType: 'brushless',
      color: 'red',
      size: 7.25
    }
  };

  const mockApparel: ApparelProduct = {
    product_id: 'NIKE-SHIRT-M001',
    category: 'apparel',
    subcategory: 'shirts',
    role: 'better',
    vendor: 'NIKE',
    cost: 15.99,
    MSRP: 39.99,
    MAP: 34.99,
    yearTarget: 10000,
    features: ['Moisture-wicking', 'UV Protection'],
    imageUrl: 'https://example.com/shirt.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    attributes: {
      size: 'M',
      color: 'blue',
      material: 'cotton',
      season: 'summer',
      gender: 'men'
    }
  };

  const mockFootwear: FootwearProduct = {
    product_id: 'NIKE-SHOE-001',
    category: 'footwear',
    subcategory: 'running',
    role: 'good',
    vendor: 'NIKE',
    cost: 45.99,
    MSRP: 89.99,
    MAP: 79.99,
    yearTarget: 8000,
    features: ['Air Cushioning', 'Breathable Mesh'],
    imageUrl: 'https://example.com/shoe.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    attributes: {
      size: '10',
      width: 'D',
      color: 'black',
      material: 'synthetic',
      style: 'running',
      closure: 'lace-up'
    }
  };

  const mockKitchen: KitchenProduct = {
    product_id: 'NINJA-BLENDER-001',
    category: 'kitchen',
    subcategory: 'blenders',
    role: 'better',
    vendor: 'NINJA',
    cost: 79.99,
    MSRP: 149.99,
    MAP: 129.99,
    yearTarget: 3000,
    features: ['Auto-iQ Technology', 'BPA-Free'],
    imageUrl: 'https://example.com/blender.jpg',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    attributes: {
      capacity: '64oz',
      power: '1000W',
      material: 'plastic',
      color: 'black',
      speeds: '10'
    }
  };

  test('isPowerToolProduct correctly identifies power tool products', () => {
    expect(isPowerToolProduct(mockPowerTool)).toBe(true);
    expect(isPowerToolProduct(mockApparel)).toBe(false);
    expect(isPowerToolProduct(mockFootwear)).toBe(false);
    expect(isPowerToolProduct(mockKitchen)).toBe(false);
  });

  test('isApparelProduct correctly identifies apparel products', () => {
    expect(isApparelProduct(mockApparel)).toBe(true);
    expect(isApparelProduct(mockPowerTool)).toBe(false);
    expect(isApparelProduct(mockFootwear)).toBe(false);
    expect(isApparelProduct(mockKitchen)).toBe(false);
  });

  test('isFootwearProduct correctly identifies footwear products', () => {
    expect(isFootwearProduct(mockFootwear)).toBe(true);
    expect(isFootwearProduct(mockPowerTool)).toBe(false);
    expect(isFootwearProduct(mockApparel)).toBe(false);
    expect(isFootwearProduct(mockKitchen)).toBe(false);
  });

  test('isKitchenProduct correctly identifies kitchen products', () => {
    expect(isKitchenProduct(mockKitchen)).toBe(true);
    expect(isKitchenProduct(mockPowerTool)).toBe(false);
    expect(isKitchenProduct(mockApparel)).toBe(false);
    expect(isKitchenProduct(mockFootwear)).toBe(false);
  });

  test('type guards provide correct type narrowing', () => {
    const products: ProductType[] = [mockPowerTool, mockApparel, mockFootwear, mockKitchen];
    
    products.forEach(product => {
      if (isPowerToolProduct(product)) {
        // TypeScript should know this is a PowerToolProduct
        expect(product.attributes.powerType).toBeDefined();
        expect(product.category).toBe('powertools');
      } else if (isApparelProduct(product)) {
        // TypeScript should know this is an ApparelProduct
        expect(product.attributes.size).toBeDefined();
        expect(product.attributes.gender).toBeDefined();
        expect(product.category).toBe('apparel');
      } else if (isFootwearProduct(product)) {
        // TypeScript should know this is a FootwearProduct
        expect(product.attributes.width).toBeDefined();
        expect(product.attributes.style).toBeDefined();
        expect(product.category).toBe('footwear');
      } else if (isKitchenProduct(product)) {
        // TypeScript should know this is a KitchenProduct
        expect(product.attributes.material).toBeDefined();
        expect(product.category).toBe('kitchen');
      }
    });
  });
});

describe('Product Validation', () => {
  test('hasRequiredPricingData validates pricing fields correctly', () => {
    const validProduct: PowerToolProduct = {
      product_id: 'TEST-001',
      category: 'powertools',
      subcategory: 'drills',
      role: 'good',
      vendor: 'TEST',
      cost: 50.00,
      MSRP: 100.00,
      MAP: 80.00,
      yearTarget: 1000,
      features: [],
      imageUrl: '',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      attributes: {
        powerType: 'cordless'
      }
    };

    expect(hasRequiredPricingData(validProduct)).toBe(true);

    // Test with missing cost
    const invalidCostProduct = { ...validProduct, cost: 0 };
    expect(hasRequiredPricingData(invalidCostProduct)).toBe(false);

    // Test with missing MSRP
    const invalidMSRPProduct = { ...validProduct, MSRP: 0 };
    expect(hasRequiredPricingData(invalidMSRPProduct)).toBe(false);

    // Test with missing MAP
    const invalidMAPProduct = { ...validProduct, MAP: 0 };
    expect(hasRequiredPricingData(invalidMAPProduct)).toBe(false);

    // Test with missing yearTarget
    const invalidTargetProduct = { ...validProduct, yearTarget: 0 };
    expect(hasRequiredPricingData(invalidTargetProduct)).toBe(false);

    // Test with negative values
    const negativeValueProduct = { ...validProduct, cost: -10 };
    expect(hasRequiredPricingData(negativeValueProduct)).toBe(false);
  });
});

describe('Utility Functions', () => {
  test('getCategoryDisplayName returns correct display names', () => {
    expect(getCategoryDisplayName('powertools')).toBe('Power Tools');
    expect(getCategoryDisplayName('apparel')).toBe('Apparel');
    expect(getCategoryDisplayName('footwear')).toBe('Footwear');
    expect(getCategoryDisplayName('kitchen')).toBe('Kitchen Appliances');
  });

  test('getRoleBadgeColor returns correct colors', () => {
    expect(getRoleBadgeColor('best')).toBe('gold');
    expect(getRoleBadgeColor('better')).toBe('silver');
    expect(getRoleBadgeColor('good')).toBe('bronze');
    expect(getRoleBadgeColor('entry')).toBe('gray');
  });

  test('createEmptyFilters creates correct filter structure for all categories', () => {
    // Test Power Tools filters
    const powerToolFilters = createEmptyFilters('powertools');
    expect(isPowerToolFilters(powerToolFilters)).toBe(true);
    expect(powerToolFilters.powerTypes).toEqual([]);
    expect(powerToolFilters.batteryVoltages).toEqual([]);
    expect(powerToolFilters.colors).toEqual([]);
    expect(powerToolFilters.sizes).toEqual([]);
    expect(powerToolFilters.roles).toEqual([]);
    expect(powerToolFilters.subcategories).toEqual([]);

    // Test Apparel filters
    const apparelFilters = createEmptyFilters('apparel');
    expect(isApparelFilters(apparelFilters)).toBe(true);
    expect(apparelFilters.sizes).toEqual([]);
    expect(apparelFilters.colors).toEqual([]);
    expect(apparelFilters.materials).toEqual([]);
    expect(apparelFilters.genders).toEqual([]);
    expect(apparelFilters.seasons).toEqual([]);
    expect(apparelFilters.fits).toEqual([]);

    // Test Footwear filters
    const footwearFilters = createEmptyFilters('footwear');
    expect(isFootwearFilters(footwearFilters)).toBe(true);
    expect(footwearFilters.sizes).toEqual([]);
    expect(footwearFilters.widths).toEqual([]);
    expect(footwearFilters.colors).toEqual([]);
    expect(footwearFilters.materials).toEqual([]);
    expect(footwearFilters.styles).toEqual([]);
    expect(footwearFilters.closures).toEqual([]);

    // Test Kitchen filters
    const kitchenFilters = createEmptyFilters('kitchen');
    expect(isKitchenFilters(kitchenFilters)).toBe(true);
    expect(kitchenFilters.capacities).toEqual([]);
    expect(kitchenFilters.materials).toEqual([]);
    expect(kitchenFilters.colors).toEqual([]);
    expect(kitchenFilters.powers).toEqual([]);
    expect(kitchenFilters.speeds).toEqual([]);
  });

  test('createEmptyFilters throws error for unknown category', () => {
    expect(() => createEmptyFilters('unknown' as any)).toThrow('Unknown category: unknown');
  });
});

describe('Filter Type Guards', () => {
  test('filter type guards correctly identify filter types', () => {
    const powerToolFilters = createEmptyFilters('powertools');
    const apparelFilters = createEmptyFilters('apparel');
    const footwearFilters = createEmptyFilters('footwear');
    const kitchenFilters = createEmptyFilters('kitchen');

    // Test PowerTool filter identification
    expect(isPowerToolFilters(powerToolFilters)).toBe(true);
    expect(isPowerToolFilters(apparelFilters)).toBe(false);
    expect(isPowerToolFilters(footwearFilters)).toBe(false);
    expect(isPowerToolFilters(kitchenFilters)).toBe(false);

    // Test Apparel filter identification
    expect(isApparelFilters(apparelFilters)).toBe(true);
    expect(isApparelFilters(powerToolFilters)).toBe(false);
    expect(isApparelFilters(footwearFilters)).toBe(false);
    expect(isApparelFilters(kitchenFilters)).toBe(false);

    // Test Footwear filter identification
    expect(isFootwearFilters(footwearFilters)).toBe(true);
    expect(isFootwearFilters(powerToolFilters)).toBe(false);
    expect(isFootwearFilters(apparelFilters)).toBe(false);
    expect(isFootwearFilters(kitchenFilters)).toBe(false);

    // Test Kitchen filter identification
    expect(isKitchenFilters(kitchenFilters)).toBe(true);
    expect(isKitchenFilters(powerToolFilters)).toBe(false);
    expect(isKitchenFilters(apparelFilters)).toBe(false);
    expect(isKitchenFilters(footwearFilters)).toBe(false);
  });

  test('filter type guards work with populated filters', () => {
    // Create filters with some data
    const powerToolFilters = createEmptyFilters('powertools');
    if (isPowerToolFilters(powerToolFilters)) {
      powerToolFilters.powerTypes = ['cordless', 'corded'];
      powerToolFilters.batteryVoltages = ['60V MAX', '20V MAX'];
    }

    const apparelFilters = createEmptyFilters('apparel');
    if (isApparelFilters(apparelFilters)) {
      apparelFilters.genders = ['men', 'women'];
      apparelFilters.seasons = ['summer', 'winter'];
    }

    // Verify type guards still work with populated data
    expect(isPowerToolFilters(powerToolFilters)).toBe(true);
    expect(isApparelFilters(apparelFilters)).toBe(true);
    expect(isPowerToolFilters(apparelFilters)).toBe(false);
    expect(isApparelFilters(powerToolFilters)).toBe(false);
  });
});

describe('Product Interface Completeness', () => {
  test('all product types have required base fields', () => {
    const products: ProductType[] = [
      {
        product_id: 'TEST-POWER-001',
        category: 'powertools',
        subcategory: 'drills',
        role: 'best',
        vendor: 'TEST',
        cost: 50,
        MSRP: 100,
        MAP: 80,
        yearTarget: 1000,
        features: [],
        imageUrl: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        attributes: { powerType: 'cordless' }
      } as PowerToolProduct,
      {
        product_id: 'TEST-APPAREL-001',
        category: 'apparel',
        subcategory: 'shirts',
        role: 'better',
        vendor: 'TEST',
        cost: 20,
        MSRP: 40,
        MAP: 35,
        yearTarget: 2000,
        features: [],
        imageUrl: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        attributes: { size: 'M', color: 'blue', material: 'cotton', season: 'summer', gender: 'men' }
      } as ApparelProduct
    ];

    products.forEach(product => {
      expect(product.product_id).toBeDefined();
      expect(product.category).toBeDefined();
      expect(product.subcategory).toBeDefined();
      expect(product.role).toBeDefined();
      expect(product.vendor).toBeDefined();
      expect(typeof product.cost).toBe('number');
      expect(typeof product.MSRP).toBe('number');
      expect(typeof product.MAP).toBe('number');
      expect(typeof product.yearTarget).toBe('number');
      expect(Array.isArray(product.features)).toBe(true);
      expect(product.imageUrl).toBeDefined();
      expect(product.createdAt).toBeDefined();
      expect(product.updatedAt).toBeDefined();
      expect(product.attributes).toBeDefined();
    });
  });
});