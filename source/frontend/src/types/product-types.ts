/**
 * @fileoverview Product type definitions for multi-category retail catalog.
 * 
 * Defines TypeScript interfaces for products across multiple categories
 * (Power Tools, Apparel, Footwear, Kitchen Appliances) with flexible
 * category-specific attributes while maintaining common pricing fields.
 */

// Product category enum
export type ProductCategory = 'powertools' | 'apparel' | 'footwear' | 'kitchen';

// Product tier/role enum
export type ProductRole = 'best' | 'better' | 'good' | 'entry';

/**
 * Base product interface with common fields across all categories.
 * Contains essential fields required for pricing analysis and catalog display.
 */
export interface BaseProductType {
  /** Unique product identifier */
  product_id: string;
  
  /** Product category */
  category: ProductCategory;
  
  /** Product subcategory within the main category */
  subcategory: string;
  
  /** Product tier for margin calculations */
  role: ProductRole;
  
  /** Vendor/manufacturer name */
  vendor: string;
  
  /** Cost price (numeric for calculations) */
  cost: number;
  
  /** Manufacturer's suggested retail price */
  MSRP: number;
  
  /** Minimum advertised price */
  MAP: number;
  
  /** Annual sales target */
  yearTarget: number;
  
  /** Product features list */
  features: string[];
  
  /** CloudFront URL for product image */
  imageUrl: string;
  
  /** ISO timestamp of creation */
  createdAt: string;
  
  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * Power Tools product interface with category-specific attributes.
 * Includes power specifications, motor details, and tool-specific features.
 */
export interface PowerToolProduct extends BaseProductType {
  category: 'powertools';
  attributes: {
    /** Power source type */
    powerType: 'cordless' | 'corded' | 'pneumatic';
    
    /** Battery voltage specification (e.g., "60V MAX") */
    batteryVoltage?: string;
    
    /** Motor type specification (e.g., "brushless") */
    motorType?: string;
    
    /** Blade speed specification (e.g., "5200 RPM") */
    bladeSpeed?: string;
    
    /** Cutting depth capability (e.g., "2.5 inches") */
    cuttingDepth?: string;
    
    /** Bevel capacity (e.g., "50 degrees") */
    bevelCapacity?: string;
    
    /** Product color */
    color?: string;
    
    /** Tool size (e.g., blade size in inches) */
    size?: number;
  };
}

/**
 * Apparel product interface with clothing-specific attributes.
 * Includes sizing, materials, and seasonal information.
 */
export interface ApparelProduct extends BaseProductType {
  category: 'apparel';
  attributes: {
    /** Clothing size (e.g., "M", "L", "XL") */
    size: string;
    
    /** Product color */
    color: string;
    
    /** Material composition (e.g., "cotton", "polyester") */
    material: string;
    
    /** Seasonal category */
    season: 'spring' | 'summer' | 'fall' | 'winter' | 'all-season';
    
    /** Target gender */
    gender: 'men' | 'women' | 'unisex' | 'kids';
    
    /** Fit type (e.g., "regular", "slim", "loose") */
    fit?: string;
    
    /** Sleeve type (e.g., "short", "long", "sleeveless") */
    sleeve?: string;
  };
}

/**
 * Footwear product interface with shoe-specific attributes.
 * Includes sizing, width, and style specifications.
 */
export interface FootwearProduct extends BaseProductType {
  category: 'footwear';
  attributes: {
    /** Shoe size (e.g., "10", "10.5") */
    size: string;
    
    /** Shoe width (e.g., "D", "EE", "B") */
    width: string;
    
    /** Product color */
    color: string;
    
    /** Material type (e.g., "leather", "synthetic") */
    material: string;
    
    /** Shoe style (e.g., "running", "casual", "dress") */
    style: string;
    
    /** Closure type (e.g., "lace-up", "slip-on", "velcro") */
    closure?: string;
    
    /** Sole material (e.g., "rubber", "leather") */
    sole?: string;
  };
}

/**
 * Kitchen Appliances product interface with appliance-specific attributes.
 * Includes capacity, power, and dimensional specifications.
 */
export interface KitchenProduct extends BaseProductType {
  category: 'kitchen';
  attributes: {
    /** Capacity specification (e.g., "64oz", "12 cups") */
    capacity?: string;
    
    /** Power specification (e.g., "1000W") */
    power?: string;
    
    /** Primary material (e.g., "stainless steel", "plastic") */
    material: string;
    
    /** Product color */
    color?: string;
    
    /** Dimensions (e.g., "8.5x7.5x15.5") */
    dimensions?: string;
    
    /** Weight specification (e.g., "8.2lbs") */
    weight?: string;
    
    /** Speed settings (e.g., "10", "variable") */
    speeds?: string;
  };
}

/**
 * Union type for all product categories.
 * Enables type-safe handling of products across different categories.
 */
export type ProductType = PowerToolProduct | ApparelProduct | FootwearProduct | KitchenProduct;

/**
 * Category information interface for catalog metadata.
 * Contains display information and statistics for each category.
 */
export interface CategoryInfo {
  /** Category identifier */
  categoryId: ProductCategory;
  
  /** Display name for the category */
  categoryName: string;
  
  /** Category description */
  description: string;
  
  /** Icon identifier for UI display */
  icon: string;
  
  /** Total number of products in category */
  productCount: number;
  
  /** Available subcategories within this category */
  subcategories: string[];
  
  /** Last update timestamp */
  lastUpdated?: string;
}
/**

 * Base filter interface with common filter options across all categories.
 */
export interface BaseFilters {
  /** Selected product roles/tiers */
  roles: ProductRole[];
  
  /** Selected subcategories */
  subcategories: string[];
}

/**
 * Power Tools specific filter interface.
 * Includes power type and battery voltage filtering.
 */
export interface PowerToolFilters extends BaseFilters {
  /** Selected power types */
  powerTypes: ('cordless' | 'corded' | 'pneumatic')[];
  
  /** Selected battery voltages */
  batteryVoltages: string[];
  
  /** Selected colors */
  colors: string[];
  
  /** Selected size ranges */
  sizes: string[];
}

/**
 * Apparel specific filter interface.
 * Includes size, color, material, and demographic filtering.
 */
export interface ApparelFilters extends BaseFilters {
  /** Selected clothing sizes */
  sizes: string[];
  
  /** Selected colors */
  colors: string[];
  
  /** Selected materials */
  materials: string[];
  
  /** Selected target genders */
  genders: ('men' | 'women' | 'unisex' | 'kids')[];
  
  /** Selected seasons */
  seasons: ('spring' | 'summer' | 'fall' | 'winter' | 'all-season')[];
  
  /** Selected fit types */
  fits: string[];
}

/**
 * Footwear specific filter interface.
 * Includes size, width, and style filtering.
 */
export interface FootwearFilters extends BaseFilters {
  /** Selected shoe sizes */
  sizes: string[];
  
  /** Selected shoe widths */
  widths: string[];
  
  /** Selected colors */
  colors: string[];
  
  /** Selected materials */
  materials: string[];
  
  /** Selected shoe styles */
  styles: string[];
  
  /** Selected closure types */
  closures: string[];
}

/**
 * Kitchen Appliances specific filter interface.
 * Includes capacity, material, and feature filtering.
 */
export interface KitchenFilters extends BaseFilters {
  /** Selected capacity ranges */
  capacities: string[];
  
  /** Selected materials */
  materials: string[];
  
  /** Selected colors */
  colors: string[];
  
  /** Selected power ranges */
  powers: string[];
  
  /** Selected speed options */
  speeds: string[];
}

/**
 * Union type for category-specific filters.
 * Enables type-safe filter handling across different categories.
 */
export type CategorySpecificFilters = PowerToolFilters | ApparelFilters | FootwearFilters | KitchenFilters;

/**
 * Available filter options for each category.
 * Contains all possible filter values that can be selected.
 */
export interface CategoryFilterOptions {
  /** Category these options apply to */
  category: ProductCategory;
  
  /** Available product roles */
  roles: ProductRole[];
  
  /** Available subcategories */
  subcategories: string[];
  
  /** Category-specific filter options */
  categorySpecific: {
    /** Power Tools filter options */
    powertools?: {
      powerTypes: ('cordless' | 'corded' | 'pneumatic')[];
      batteryVoltages: string[];
      colors: string[];
      sizes: number[];
    };
    
    /** Apparel filter options */
    apparel?: {
      sizes: string[];
      colors: string[];
      materials: string[];
      genders: ('men' | 'women' | 'unisex' | 'kids')[];
      seasons: ('spring' | 'summer' | 'fall' | 'winter' | 'all-season')[];
      fits: string[];
    };
    
    /** Footwear filter options */
    footwear?: {
      sizes: string[];
      widths: string[];
      colors: string[];
      materials: string[];
      styles: string[];
      closures: string[];
    };
    
    /** Kitchen Appliances filter options */
    kitchen?: {
      capacities: string[];
      materials: string[];
      colors: string[];
      powers: string[];
      speeds: string[];
    };
  };
}

/**
 * Type guard to check if a product is a Power Tool product.
 * 
 * @param product - Product to check
 * @returns True if product is a PowerToolProduct
 */
export function isPowerToolProduct(product: ProductType): product is PowerToolProduct {
  return product.category === 'powertools';
}

/**
 * Type guard to check if a product is an Apparel product.
 * 
 * @param product - Product to check
 * @returns True if product is an ApparelProduct
 */
export function isApparelProduct(product: ProductType): product is ApparelProduct {
  return product.category === 'apparel';
}

/**
 * Type guard to check if a product is a Footwear product.
 * 
 * @param product - Product to check
 * @returns True if product is a FootwearProduct
 */
export function isFootwearProduct(product: ProductType): product is FootwearProduct {
  return product.category === 'footwear';
}

/**
 * Type guard to check if a product is a Kitchen Appliance product.
 * 
 * @param product - Product to check
 * @returns True if product is a KitchenProduct
 */
export function isKitchenProduct(product: ProductType): product is KitchenProduct {
  return product.category === 'kitchen';
}

/**
 * Type guard to check if filters are Power Tool filters.
 * 
 * @param filters - Filters to check
 * @returns True if filters are PowerToolFilters
 */
export function isPowerToolFilters(filters: CategorySpecificFilters): filters is PowerToolFilters {
  return 'powerTypes' in filters && 'batteryVoltages' in filters;
}

/**
 * Type guard to check if filters are Apparel filters.
 * 
 * @param filters - Filters to check
 * @returns True if filters are ApparelFilters
 */
export function isApparelFilters(filters: CategorySpecificFilters): filters is ApparelFilters {
  return 'genders' in filters && 'seasons' in filters;
}

/**
 * Type guard to check if filters are Footwear filters.
 * 
 * @param filters - Filters to check
 * @returns True if filters are FootwearFilters
 */
export function isFootwearFilters(filters: CategorySpecificFilters): filters is FootwearFilters {
  return 'widths' in filters && 'styles' in filters;
}

/**
 * Type guard to check if filters are Kitchen filters.
 * 
 * @param filters - Filters to check
 * @returns True if filters are KitchenFilters
 */
export function isKitchenFilters(filters: CategorySpecificFilters): filters is KitchenFilters {
  return 'capacities' in filters && 'powers' in filters;
}

/**
 * Validates that a product has all required fields for pricing analysis.
 * 
 * Note: MAP and MSRP can be 0 or null as the backend can handle products
 * without these values. Only cost and yearTarget are strictly required.
 * 
 * @param product - Product to validate
 * @returns True if product has required pricing data
 */
export function hasRequiredPricingData(product: ProductType): boolean {
  return (
    typeof product.cost === 'number' && product.cost > 0 &&
    typeof product.yearTarget === 'number' && product.yearTarget > 0
  );
}

/**
 * Gets the display name for a product category.
 * 
 * @param category - Product category
 * @returns Human-readable category name
 */
export function getCategoryDisplayName(category: ProductCategory): string {
  const categoryNames: Record<ProductCategory, string> = {
    powertools: 'Power Tools',
    apparel: 'Apparel',
    footwear: 'Footwear',
    kitchen: 'Kitchen Appliances'
  };
  
  return categoryNames[category];
}

/**
 * Gets the role badge color for UI display.
 * 
 * @param role - Product role/tier
 * @returns Color identifier for role badge
 */
export function getRoleBadgeColor(role: ProductRole): 'blue' | 'grey' | 'green' | 'red' | 'severity-critical' | 'severity-high' | 'severity-medium' | 'severity-low' | 'severity-neutral' {
  const roleColors: Record<ProductRole, 'blue' | 'grey' | 'green' | 'red' | 'severity-critical' | 'severity-high' | 'severity-medium' | 'severity-low' | 'severity-neutral'> = {
    best: 'green',
    better: 'blue',
    good: 'grey',
    entry: 'severity-neutral'
  };
  
  return roleColors[role];
}

/**
 * Competitive analysis output interface.
 * Contains market statistics, competitor information, and pricing recommendations.
 */
export interface CompetitiveAnalysisOutput {
  /** Minimum market price across all competitors */
  lowest_market_price: number;
  
  /** Maximum market price across all competitors */
  highest_market_price: number;
  
  /** Average market price */
  average_market_price: number;
  
  /** Median market price */
  median_market_price: number;
  
  /** Primary competitor name */
  primary_competitor: string;
  
  /** Overall confidence score (0-100) */
  competitive_confidence_score: number;
  
  /** Primary competitor's price point */
  competitor_price_point: number;
  
  /** Our market position assessment */
  market_position_assessment: 'premium' | 'mid-premium' | 'mid-range' | 'value';
  
  /** Recommended base price */
  recommended_base_price: number;
  
  /** Recommended pricing strategy */
  price_position_strategy: 'undercut' | 'match' | 'premium_position' | 'value_leader';
}

/**
 * Market statistics interface for detailed market analysis.
 */
export interface MarketStatistics {
  /** Lowest market price */
  lowest_market_price: number;
  
  /** Highest market price */
  highest_market_price: number;
  
  /** Average market price */
  average_market_price: number;
  
  /** Median market price */
  median_market_price: number;
  
  /** Market volatility index (0-1) */
  market_volatility?: number;
  
  /** Number of competitors analyzed */
  competitor_count?: number;
}

/**
 * Competitor information interface.
 */
export interface CompetitorInfo {
  /** Competitor name */
  name: string;
  
  /** Competitor's price point */
  price_point: number;
  
  /** Competitive relevance score (0-1) */
  relevance_score?: number;
  
  /** Market share estimate (0-1) */
  market_share?: number;
  
  /** Competitive advantages */
  advantages?: string[];
}

/**
 * Pricing strategy recommendation interface.
 */
export interface PricingStrategyRecommendation {
  /** Recommended strategy */
  strategy: 'undercut' | 'match' | 'premium_position' | 'value_leader';
  
  /** Recommended base price */
  recommended_price: number;
  
  /** Strategy rationale */
  rationale: string;
  
  /** Confidence score (0-100) */
  confidence: number;
  
  /** ML evidence supporting the recommendation */
  ml_evidence?: string[];
}

/**
 * Market position assessment interface.
 */
export interface MarketPositionAssessment {
  /** Position classification */
  position: 'premium' | 'mid-premium' | 'mid-range' | 'value';
  
  /** Position percentile in market (0-100) */
  percentile: number;
  
  /** Confidence score (0-100) */
  confidence: number;
  
  /** ML evidence supporting the assessment */
  ml_evidence?: string[];
}

/**
 * Detailed competitive analysis interface with all components.
 */
export interface DetailedCompetitiveAnalysis {
  /** Basic competitive analysis output */
  analysis: CompetitiveAnalysisOutput;
  
  /** Detailed market statistics */
  market_statistics: MarketStatistics;
  
  /** Primary competitor information */
  primary_competitor_info: CompetitorInfo;
  
  /** Pricing strategy recommendation */
  pricing_strategy: PricingStrategyRecommendation;
  
  /** Market position assessment */
  market_position: MarketPositionAssessment;
  
  /** Analysis timestamp */
  analyzed_at: string;
  
  /** Model information */
  model_info?: {
    model_name: string;
    model_accuracy: number;
    analysis_type: string;
  };
}

/**
 * Creates empty filters for a specific category.
 * 
 * @param category - Product category
 * @returns Empty filter object for the category
 */
export function createEmptyFilters(category: ProductCategory): CategorySpecificFilters {
  const baseFilters = {
    roles: [] as ProductRole[],
    subcategories: [] as string[]
  };

  switch (category) {
    case 'powertools':
      return {
        ...baseFilters,
        powerTypes: [],
        batteryVoltages: [],
        colors: [],
        sizes: []
      } as PowerToolFilters;
      
    case 'apparel':
      return {
        ...baseFilters,
        sizes: [],
        colors: [],
        materials: [],
        genders: [],
        seasons: [],
        fits: []
      } as ApparelFilters;
      
    case 'footwear':
      return {
        ...baseFilters,
        sizes: [],
        widths: [],
        colors: [],
        materials: [],
        styles: [],
        closures: []
      } as FootwearFilters;
      
    case 'kitchen':
      return {
        ...baseFilters,
        capacities: [],
        materials: [],
        colors: [],
        powers: [],
        speeds: []
      } as KitchenFilters;
      
    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * Formats a price value for display.
 * 
 * @param price - Price value to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price);
}

/**
 * Gets the display name for a pricing strategy.
 * 
 * @param strategy - Pricing strategy
 * @returns Human-readable strategy name
 */
export function getPricingStrategyDisplayName(strategy: string): string {
  const strategyNames: Record<string, string> = {
    undercut: 'Undercut Competition',
    match: 'Match Competition',
    premium_position: 'Premium Positioning',
    value_leader: 'Value Leadership'
  };
  
  return strategyNames[strategy] || strategy;
}

/**
 * Gets the display name for a market position.
 * 
 * @param position - Market position
 * @returns Human-readable position name
 */
export function getMarketPositionDisplayName(position: string): string {
  const positionNames: Record<string, string> = {
    premium: 'Premium',
    'mid-premium': 'Mid-Premium',
    'mid-range': 'Mid-Range',
    value: 'Value'
  };
  
  return positionNames[position] || position;
}

/**
 * Gets the confidence level description based on score.
 * 
 * @param confidence - Confidence score (0-100)
 * @returns Confidence level description
 */
export function getConfidenceLevel(confidence: number): { level: string; color: 'green' | 'blue' | 'grey' | 'red' } {
  if (confidence >= 90) {
    return { level: 'Very High', color: 'green' };
  } else if (confidence >= 75) {
    return { level: 'High', color: 'green' };
  } else if (confidence >= 60) {
    return { level: 'Medium', color: 'blue' };
  } else if (confidence >= 40) {
    return { level: 'Low', color: 'grey' };
  } else {
    return { level: 'Very Low', color: 'red' };
  }
}