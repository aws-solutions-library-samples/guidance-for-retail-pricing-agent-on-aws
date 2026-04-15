/**
 * @fileoverview GraphQL resolver for getting a single product by ID.
 * 
 * Handles single product retrieval with proper error handling
 * and data transformation for GraphQL response.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Lambda handler for getProduct GraphQL resolver.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Single product or null
 */
const handler = async (event) => {
  console.log('GetProduct resolver event:', JSON.stringify(event, null, 2));
  
  const { id } = event.arguments;
  
  try {
    // Validate inputs
    if (!id) {
      throw new Error('Product ID is required');
    }
    
    // Query product by ID using scan (since we don't know the category)
    // In a production system, you might want to include category in the ID
    const params = {
      TableName: process.env.PRODUCT_TABLE_NAME,
      FilterExpression: 'id = :productId AND entityType = :entityType',
      ExpressionAttributeValues: {
        ':productId': id,
        ':entityType': 'PRODUCT'
      },
      Limit: 1
    };
    
    console.log('DynamoDB scan params:', JSON.stringify(params, null, 2));
    
    // Execute DynamoDB scan
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const command = new ScanCommand(params);
    const result = await dynamodb.send(command);
    
    if (!result.Items || result.Items.length === 0) {
      console.log(`Product not found: ${id}`);
      return null;
    }
    
    const product = result.Items[0];
    console.log(`Found product: ${product.product_id}`);
    
    // Transform to GraphQL Product type
    return transformProduct(product);
    
  } catch (error) {
    console.error('GetProduct resolver error:', error);
    throw error;
  }
};

/**
 * Transforms DynamoDB item to GraphQL Product type.
 */
function transformProduct(item) {
  return {
    id: item.id,
    product_id: item.product_id,
    category: item.category,
    subcategory: item.subcategory,
    role: item.role,
    vendor: item.vendor,
    cost: item.cost,
    MSRP: item.MSRP,
    MAP: item.MAP,
    yearTarget: item.yearTarget,
    attributes: JSON.stringify(item.attributes || {}),
    features: item.features || [],
    imageUrl: item.imageUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

module.exports = { handler };