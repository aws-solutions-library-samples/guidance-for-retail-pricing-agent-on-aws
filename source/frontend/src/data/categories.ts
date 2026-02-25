/**
 * @fileoverview Static category data bundled with the frontend build.
 * 
 * Categories are bundled at build time since they change infrequently.
 * This eliminates runtime API calls and provides instant loading.
 */

import { CategoryInfo } from '../types/product-types';

/**
 * Static category data - bundled with the application.
 * This data is loaded at build time and doesn't require API calls.
 */
export const PRODUCT_CATEGORIES: CategoryInfo[] = [
  {
    categoryId: 'powertools',
    categoryName: 'Power Tools',
    description: 'Professional and consumer power tools for construction and DIY projects',
    icon: 'drill',
    productCount: 0, // Will be updated by GraphQL query
    subcategories: ['saws', 'drills', 'sanders', 'grinders'],
    lastUpdated: '2024-01-15T10:30:00Z'
  },
  {
    categoryId: 'apparel',
    categoryName: 'Apparel',
    description: 'Clothing and garments for men, women, and children',
    icon: 'shirt',
    productCount: 0,
    subcategories: ['shirts', 'hoodies', 't-shirts', 'polo-shirts'],
    lastUpdated: '2024-01-15T10:30:00Z'
  },
  {
    categoryId: 'footwear',
    categoryName: 'Footwear',
    description: 'Shoes, boots, and athletic footwear for all occasions',
    icon: 'shoe',
    productCount: 0,
    subcategories: ['running', 'casual', 'walking', 'boots'],
    lastUpdated: '2024-01-15T10:30:00Z'
  },
  {
    categoryId: 'kitchen',
    categoryName: 'Kitchen Appliances',
    description: 'Small kitchen appliances and cooking equipment',
    icon: 'blender',
    productCount: 0,
    subcategories: ['blenders', 'mixers', 'coffee-makers', 'toasters'],
    lastUpdated: '2024-01-15T10:30:00Z'
  }
];

/**
 * Get category information by ID.
 * 
 * @param categoryId - Category ID to look up
 * @returns Category information or undefined if not found
 */
export function getCategoryById(categoryId: string): CategoryInfo | undefined {
  return PRODUCT_CATEGORIES.find(cat => cat.categoryId === categoryId);
}

/**
 * Get all available category IDs.
 * 
 * @returns Array of category IDs
 */
export function getCategoryIds(): string[] {
  return PRODUCT_CATEGORIES.map(cat => cat.categoryId);
}

/**
 * Get subcategories for a specific category.
 * 
 * @param categoryId - Category ID
 * @returns Array of subcategory names
 */
export function getSubcategories(categoryId: string): string[] {
  const category = getCategoryById(categoryId);
  return category?.subcategories || [];
}