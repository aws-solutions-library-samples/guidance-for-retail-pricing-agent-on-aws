/**
 * @fileoverview Tests for static category utilities.
 * 
 * Tests the bundled category data and utility functions
 * to ensure proper category management functionality.
 */

import { 
  PRODUCT_CATEGORIES, 
  getCategoryById, 
  getCategoryIds, 
  getSubcategories 
} from '@/data/categories';
import { CategoryInfo } from '@/types/product-types';

describe('Static Category Utilities', () => {
  describe('PRODUCT_CATEGORIES', () => {
    it('should contain all expected categories', () => {
      expect(PRODUCT_CATEGORIES).toHaveLength(4);
      
      const categoryIds = PRODUCT_CATEGORIES.map(cat => cat.categoryId);
      expect(categoryIds).toContain('powertools');
      expect(categoryIds).toContain('apparel');
      expect(categoryIds).toContain('footwear');
      expect(categoryIds).toContain('kitchen');
    });

    it('should have valid category structure', () => {
      PRODUCT_CATEGORIES.forEach((category: CategoryInfo) => {
        expect(category).toHaveProperty('categoryId');
        expect(category).toHaveProperty('categoryName');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('icon');
        expect(category).toHaveProperty('productCount');
        expect(category).toHaveProperty('subcategories');
        expect(category).toHaveProperty('lastUpdated');
        
        expect(typeof category.categoryId).toBe('string');
        expect(typeof category.categoryName).toBe('string');
        expect(typeof category.description).toBe('string');
        expect(typeof category.icon).toBe('string');
        expect(typeof category.productCount).toBe('number');
        expect(Array.isArray(category.subcategories)).toBe(true);
        expect(typeof category.lastUpdated).toBe('string');
      });
    });

    it('should have non-empty subcategories for each category', () => {
      PRODUCT_CATEGORIES.forEach((category: CategoryInfo) => {
        expect(category.subcategories.length).toBeGreaterThan(0);
        category.subcategories.forEach(subcategory => {
          expect(typeof subcategory).toBe('string');
          expect(subcategory.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have valid ISO timestamp format for lastUpdated', () => {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
      
      PRODUCT_CATEGORIES.forEach((category: CategoryInfo) => {
        expect(category.lastUpdated).toMatch(isoRegex);
        expect(new Date(category.lastUpdated).toISOString()).toBe(category.lastUpdated);
      });
    });
  });

  describe('getCategoryById', () => {
    it('should return correct category for valid ID', () => {
      const powertools = getCategoryById('powertools');
      expect(powertools).toBeDefined();
      expect(powertools?.categoryId).toBe('powertools');
      expect(powertools?.categoryName).toBe('Power Tools');
      expect(powertools?.subcategories).toContain('saws');
      expect(powertools?.subcategories).toContain('drills');
    });

    it('should return correct category for all valid IDs', () => {
      const testCases = [
        { id: 'powertools', name: 'Power Tools' },
        { id: 'apparel', name: 'Apparel' },
        { id: 'footwear', name: 'Footwear' },
        { id: 'kitchen', name: 'Kitchen Appliances' }
      ];

      testCases.forEach(({ id, name }) => {
        const category = getCategoryById(id);
        expect(category).toBeDefined();
        expect(category?.categoryId).toBe(id);
        expect(category?.categoryName).toBe(name);
      });
    });

    it('should return undefined for invalid ID', () => {
      expect(getCategoryById('invalid')).toBeUndefined();
      expect(getCategoryById('')).toBeUndefined();
      expect(getCategoryById('POWERTOOLS')).toBeUndefined(); // Case sensitive
    });

    it('should handle edge cases', () => {
      expect(getCategoryById(null as any)).toBeUndefined();
      expect(getCategoryById(undefined as any)).toBeUndefined();
      expect(getCategoryById(123 as any)).toBeUndefined();
    });
  });

  describe('getCategoryIds', () => {
    it('should return all category IDs', () => {
      const ids = getCategoryIds();
      expect(ids).toHaveLength(4);
      expect(ids).toContain('powertools');
      expect(ids).toContain('apparel');
      expect(ids).toContain('footwear');
      expect(ids).toContain('kitchen');
    });

    it('should return IDs in the same order as PRODUCT_CATEGORIES', () => {
      const ids = getCategoryIds();
      const expectedIds = PRODUCT_CATEGORIES.map(cat => cat.categoryId);
      expect(ids).toEqual(expectedIds);
    });

    it('should return a new array each time', () => {
      const ids1 = getCategoryIds();
      const ids2 = getCategoryIds();
      expect(ids1).toEqual(ids2);
      expect(ids1).not.toBe(ids2); // Different array instances
    });
  });

  describe('getSubcategories', () => {
    it('should return correct subcategories for powertools', () => {
      const subcategories = getSubcategories('powertools');
      expect(subcategories).toEqual(['saws', 'drills', 'sanders', 'grinders']);
    });

    it('should return correct subcategories for apparel', () => {
      const subcategories = getSubcategories('apparel');
      expect(subcategories).toEqual(['shirts', 'hoodies', 't-shirts', 'polo-shirts']);
    });

    it('should return correct subcategories for footwear', () => {
      const subcategories = getSubcategories('footwear');
      expect(subcategories).toEqual(['running', 'casual', 'walking', 'boots']);
    });

    it('should return correct subcategories for kitchen', () => {
      const subcategories = getSubcategories('kitchen');
      expect(subcategories).toEqual(['blenders', 'mixers', 'coffee-makers', 'toasters']);
    });

    it('should return empty array for invalid category ID', () => {
      expect(getSubcategories('invalid')).toEqual([]);
      expect(getSubcategories('')).toEqual([]);
      expect(getSubcategories('POWERTOOLS')).toEqual([]);
    });

    it('should handle edge cases', () => {
      expect(getSubcategories(null as any)).toEqual([]);
      expect(getSubcategories(undefined as any)).toEqual([]);
      expect(getSubcategories(123 as any)).toEqual([]);
    });

    it('should return a new array each time', () => {
      const subcategories1 = getSubcategories('powertools');
      const subcategories2 = getSubcategories('powertools');
      expect(subcategories1).toEqual(subcategories2);
      expect(subcategories1).not.toBe(subcategories2); // Different array instances
    });
  });

  describe('Data Integrity', () => {
    it('should have unique category IDs', () => {
      const ids = PRODUCT_CATEGORIES.map(cat => cat.categoryId);
      const uniqueIds = [...new Set(ids)];
      expect(ids).toEqual(uniqueIds);
    });

    it('should have unique category names', () => {
      const names = PRODUCT_CATEGORIES.map(cat => cat.categoryName);
      const uniqueNames = [...new Set(names)];
      expect(names).toEqual(uniqueNames);
    });

    it('should have consistent subcategory data', () => {
      PRODUCT_CATEGORIES.forEach(category => {
        const subcategoriesFromUtil = getSubcategories(category.categoryId);
        expect(subcategoriesFromUtil).toEqual(category.subcategories);
      });
    });

    it('should have valid icon names', () => {
      const validIcons = ['drill', 'shirt', 'shoe', 'blender'];
      PRODUCT_CATEGORIES.forEach(category => {
        expect(validIcons).toContain(category.icon);
      });
    });

    it('should initialize productCount to 0', () => {
      PRODUCT_CATEGORIES.forEach(category => {
        expect(category.productCount).toBe(0);
      });
    });
  });
});