/**
 * @fileoverview GraphQL resolver for category statistics aggregation.
 * 
 * Handles category statistics calculation including product counts,
 * role distribution, subcategory distribution, and price ranges.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Lambda handler for getCategoryStats GraphQL resolver.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Category statistics
 */
const handler = async (event) => {
  console.log('CategoryStats resolver event:', JSON.stringify(event, null, 2));
  
  const { category } = event.arguments;
  
  try {
    // Validate inputs
    if (!category) {
      throw new Error('Category is required');
    }
    
    // Query all products for the category
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
    
    // Calculate statistics
    const stats = calculateCategoryStats(category, result.Items);
    
    return stats;
    
  } catch (error) {
    console.error('CategoryStats resolver error:', error);
    throw error;
  }
};

/**
 * Calculates category statistics from product items.
 */
function calculateCategoryStats(category, items) {
  if (!items || items.length === 0) {
    return {
      category,
      totalProducts: 0,
      productsByRole: [],
      productsBySubcategory: [],
      priceRange: {
        min: 0,
        max: 0,
        average: 0
      }
    };
  }
  
  // Initialize counters
  const roleCounts = {};
  const subcategoryCounts = {};
  let minPrice = Number.MAX_VALUE;
  let maxPrice = 0;
  let totalPrice = 0;
  
  // Process each product
  items.forEach(item => {
    // Count by role
    if (item.role) {
      roleCounts[item.role] = (roleCounts[item.role] || 0) + 1;
    }
    
    // Count by subcategory
    if (item.subcategory) {
      subcategoryCounts[item.subcategory] = (subcategoryCounts[item.subcategory] || 0) + 1;
    }
    
    // Price calculations
    if (item.MSRP && typeof item.MSRP === 'number') {
      minPrice = Math.min(minPrice, item.MSRP);
      maxPrice = Math.max(maxPrice, item.MSRP);
      totalPrice += item.MSRP;
    }
  });
  
  // Calculate average price
  const averagePrice = items.length > 0 ? totalPrice / items.length : 0;
  
  // Format role counts
  const productsByRole = Object.entries(roleCounts).map(([role, count]) => ({
    role,
    count
  }));
  
  // Format subcategory counts
  const productsBySubcategory = Object.entries(subcategoryCounts).map(([subcategory, count]) => ({
    subcategory,
    count
  }));
  
  // Handle edge case where no valid prices found
  if (minPrice === Number.MAX_VALUE) {
    minPrice = 0;
  }
  
  return {
    category,
    totalProducts: items.length,
    productsByRole,
    productsBySubcategory,
    priceRange: {
      min: minPrice,
      max: maxPrice,
      average: Math.round(averagePrice * 100) / 100 // Round to 2 decimal places
    }
  };
}

module.exports = { handler };