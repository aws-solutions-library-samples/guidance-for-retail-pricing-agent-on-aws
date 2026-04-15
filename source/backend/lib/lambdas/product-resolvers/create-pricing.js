/**
 * @fileoverview Lambda resolver for creating pricing sessions.
 * 
 * Creates new pricing sessions in DynamoDB with proper validation
 * and error handling. Generates unique session IDs and stores
 * product data for agent orchestration.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
// Configure DocumentClient to automatically remove undefined values
// This follows AWS best practices - undefined attributes are omitted rather than stored as NULL
const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

/**
 * Generate a simple UUID v4 without external dependencies.
 * 
 * @returns {string} UUID v4 string
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};



/**
 * Creates a new pricing session in DynamoDB.
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.arguments - Resolver arguments
 * @param {Object} event.arguments.input - CreatePricingInput
 * @param {Object} event.identity - User identity from Cognito
 * @returns {Promise<Object>} Created pricing session response
 */
const handler = async (event) => {
  console.log('Creating pricing session:', JSON.stringify(event, null, 2));

  try {
    // Validate environment variable for orchestration table
    const tableName = process.env.ORCHESTRATION_TABLE_NAME;
    if (!tableName) {
      const errorMsg = 'ORCHESTRATION_TABLE_NAME environment variable is not configured';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.log(`Using DynamoDB table: ${tableName}`);

    const { input } = event.arguments;
    const { product } = input;
    
    // Get user ID from Cognito identity
    const userId = event.identity?.sub || event.identity?.username;
    if (!userId) {
      throw new Error('User authentication required');
    }

    // Validate product data
    if (!product) {
      throw new Error('Product data is required');
    }

    // Parse product JSON if it's a string
    let productData;
    try {
      productData = typeof product === 'string' ? JSON.parse(product) : product;
    } catch (parseError) {
      throw new Error('Invalid product data format');
    }

    // Apply default values for missing pricing fields
    const defaultsApplied = [];
    if (productData.cost === undefined || productData.cost === null) {
      productData.cost = 0;
      defaultsApplied.push('cost');
    }
    if (productData.MSRP === undefined || productData.MSRP === null) {
      productData.MSRP = 0;
      defaultsApplied.push('MSRP');
    }
    if (productData.MAP === undefined || productData.MAP === null) {
      productData.MAP = 0;
      defaultsApplied.push('MAP');
    }

    // Log which fields used defaults
    if (defaultsApplied.length > 0) {
      console.log(`Applied default values for fields: ${defaultsApplied.join(', ')}`);
    }

    // Validate required product fields (product_id is still required)
    if (!productData.product_id) {
      throw new Error('Missing required product field: product_id');
    }

    // Generate unique session ID
    const sessionId = generateUUID();
    const timestamp = new Date().toISOString();

    // Create pricing session item
    // Note: demandForecast, competitiveAnalysis, and marginAnalysis are intentionally
    // omitted (not set to null) until agents populate them. This follows DynamoDB
    // best practices - omitted attributes don't consume storage and allow for sparse
    // indexing. AppSync will add these as Map types when agents update the session.
    const pricingSession = {
      PK: `PRICING#${sessionId}`,
      SK: 'METADATA',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `PRICING#${timestamp}`,
      entityType: 'PRICING_SESSION',
      id: sessionId,
      userId,
      product: productData, // Store as Map type, not stringified JSON
      status: 'initiated',
      createdAt: timestamp,
      updatedAt: timestamp,
      
      // TTL: 30 days from creation
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };

    // Store in DynamoDB using the correct orchestration table
    const putCommand = new PutCommand({
      TableName: tableName,
      Item: pricingSession,
      ConditionExpression: 'attribute_not_exists(PK)'
    });
    await dynamodb.send(putCommand);

    console.log(`Pricing session created successfully: ${sessionId} in table ${tableName}`);

    // Return response matching GraphQL schema
    // Note: GraphQL AWSJSON type expects stringified JSON for the product field
    return {
      id: sessionId,
      userId,
      product: JSON.stringify(productData), // Stringify for GraphQL AWSJSON type
      status: 'initiated',
      createdAt: timestamp
    };

  } catch (error) {
    console.error('Failed to create pricing session:', error);
    
    // Return user-friendly error messages
    if (error.message.includes('authentication')) {
      throw new Error('Authentication required to create pricing session');
    } else if (error.message.includes('ORCHESTRATION_TABLE_NAME')) {
      throw new Error('Server configuration error: Pricing orchestration table not configured');
    } else if (error.message.includes('required')) {
      throw new Error(error.message);
    } else if (error.message.includes('Invalid')) {
      throw new Error(error.message);
    } else {
      throw new Error('Failed to create pricing session. Please try again.');
    }
  }
};

module.exports = { handler };