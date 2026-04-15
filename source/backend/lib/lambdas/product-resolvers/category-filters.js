/**
 * @fileoverview GraphQL resolver for category filter options.
 * 
 * Handles retrieval of available filter options for a category
 * by analyzing existing products and extracting unique values.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Lambda handler for getCategoryFilters GraphQL resolver.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Category filter options
 */
const handler = async (event) => {
  console.log('CategoryFilters resolver event:', JSON.stringify(event, null, 2));
  
  const { category } = event.arguments;
  
  try {
    // Validate inputs
    if (!category) {
      throw new Error('Category is required');
    }
    
    // Query all products for the category to extract filter options
    const params = {
      TableName: process.env.PRODUCT_TABLE_NAME,
      KeyConditionExpression: 'PK = :categoryPK AND begins_with(SK, :productPrefix)',
      ExpressionAttributeValues: {
        ':categoryPK': `CATEGORY#${category}`,
        ':productPrefix': 'PRODUCT#'
      }
    };
    
    console.log('DynamoDB query params:', JSON.stringify(params, null, 2));
    
    // Execute DynamoDB query
    const command = new QueryCommand(params);
    const result = await dynamodb.send(command);
    
    console.log(`Query returned ${result.Items.length} items for category ${category}`);
    
    // Extract filter options from products
    const filterOptions = extractFilterOptions(category, result.Items);
    
    return filterOptions;
    
  } catch (error) {
    console.error('CategoryFilters resolver error:', error);
    throw error;
  }
};

/**
 * Extracts available filter options from product items.
 */
function extractFilterOptions(category, items) {
  if (!items || items.length === 0) {
    return {
      category,
      availableRoles: [],
      availableSubcategories: [],
      availableVendors: [],
      priceRange: {
        min: 0,
        max: 0,
        average: 0
      },
      categorySpecificFilters: JSON.stringify({})
    };
  }
  
  // Initialize sets for unique values
  const roles = new Set();
  const subcategories = new Set();
  const vendors = new Set();
  const categorySpecificAttributes = {};
  
  let minPrice = Number.MAX_VALUE;
  let maxPrice = 0;
  let totalPrice = 0;
  let priceCount = 0;
  
  // Process each product to extract unique values
  items.forEach(item => {
    // Collect roles
    if (item.role) {
      roles.add(item.role);
    }
    
    // Collect subcategories
    if (item.subcategory) {
      subcategories.add(item.subcategory);
    }
    
    // Collect vendors
    if (item.vendor) {
      vendors.add(item.vendor);
    }
    
    // Price calculations
    if (item.MSRP && typeof item.MSRP === 'number') {
      minPrice = Math.min(minPrice, item.MSRP);
      maxPrice = Math.max(maxPrice, item.MSRP);
      totalPrice += item.MSRP;
      priceCount++;
    }
    
    // Extract category-specific attributes
    if (item.attributes && typeof item.attributes === 'object') {
      Object.entries(item.attributes).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (!categorySpecificAttributes[key]) {
            categorySpecificAttributes[key] = new Set();
          }
          categorySpecificAttributes[key].add(String(value));
        }
      });
    }
  });
  
  // Calculate average price
  const averagePrice = priceCount > 0 ? totalPrice / priceCount : 0;
  
  // Handle edge case where no valid prices found
  if (minPrice === Number.MAX_VALUE) {
    minPrice = 0;
  }
  
  // Convert category-specific attributes sets to arrays
  const categorySpecificFilters = {};
  Object.entries(categorySpecificAttributes).forEach(([key, valueSet]) => {
    categorySpecificFilters[key] = Array.from(valueSet).sort();
  });
  
  // Add category-specific filter structure based on category type
  const enhancedCategoryFilters = enhanceCategorySpecificFilters(category, categorySpecificFilters);
  
  return {
    category,
    availableRoles: Array.from(roles).sort(),
    availableSubcategories: Array.from(subcategories).sort(),
    availableVendors: Array.from(vendors).sort(),
    priceRange: {
      min: minPrice,
      max: maxPrice,
      average: Math.round(averagePrice * 100) / 100 // Round to 2 decimal places
    },
    categorySpecificFilters: JSON.stringify(enhancedCategoryFilters)
  };
}

/**
 * Enhances category-specific filters with structured data based on category type.
 */
function enhanceCategorySpecificFilters(category, extractedFilters) {
  const enhanced = { ...extractedFilters };
  
  switch (category) {
    case 'powertools':
      return {
        powerTypes: enhanced.powerType || [],
        batteryVoltages: enhanced.batteryVoltage || [],
        motorTypes: enhanced.motorType || [],
        colors: enhanced.color || [],
        sizes: enhanced.size || []
      };
      
    case 'apparel':
      return {
        sizes: enhanced.size || [],
        colors: enhanced.color || [],
        materials: enhanced.material || [],
        genders: enhanced.gender || [],
        seasons: enhanced.season || [],
        fits: enhanced.fit || [],
        sleeves: enhanced.sleeve || []
      };
      
    case 'footwear':
      return {
        sizes: enhanced.size || [],
        widths: enhanced.width || [],
        colors: enhanced.color || [],
        materials: enhanced.material || [],
        styles: enhanced.style || [],
        closures: enhanced.closure || [],
        soles: enhanced.sole || []
      };
      
    case 'kitchen':
      return {
        capacities: enhanced.capacity || [],
        powers: enhanced.power || [],
        materials: enhanced.material || [],
        colors: enhanced.color || [],
        dimensions: enhanced.dimensions || [],
        weights: enhanced.weight || [],
        speeds: enhanced.speeds || []
      };
      
    default:
      return enhanced;
  }
}

module.exports = { handler };