/**
 * @fileoverview Lambda resolver for fetching user-specific pricing sessions.
 * 
 * Retrieves pricing sessions for a specific user with pagination support.
 * Uses GSI1 for efficient user-based queries with proper error handling.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Fetches pricing sessions for a specific user.
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.arguments - Resolver arguments
 * @param {string} event.arguments.userId - User ID to fetch sessions for
 * @param {number} event.arguments.limit - Maximum number of results (default: 20)
 * @param {string} event.arguments.nextToken - Pagination token
 * @param {Object} event.identity - User identity from Cognito
 * @returns {Promise<Object>} Paginated pricing sessions
 */
const handler = async (event) => {
  try {
    const { userId, limit = 20, nextToken } = event.arguments;
    
    // Get authenticated user ID
    const authenticatedUserId = event.identity?.sub || event.identity?.username;
    if (!authenticatedUserId) {
      throw new Error('User authentication required');
    }

    // Validate user can only access their own sessions
    if (userId !== authenticatedUserId) {
      throw new Error('Access denied: Can only access your own pricing sessions');
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    // Build query parameters for PricingOrchestration table
    // 
    // Table Design (see research/PricingOrchestration_flow.md):
    // - SESSION# records: Workflow state created by Step Functions orchestrator
    //   Contains: workflow status, agent progress, bot responses, analysisData
    //   Purpose: Track "where are we in the process?"
    // 
    // - PRICING# records: Business data created by AgentCore agents
    //   Contains: demandForecast, competitiveAnalysis, marginAnalysis (as top-level fields)
    //   Purpose: Store "what did we calculate?"
    // 
    // For the sessions list, we query SESSION# records to show user's initiated workflows
    const params = {
      TableName: process.env.ORCHESTRATION_TABLE_NAME,
      IndexName: 'UserSessionIndex',
      KeyConditionExpression: 'GSI1PK = :userPK AND begins_with(GSI1SK, :sessionPrefix)',
      ExpressionAttributeValues: {
        ':userPK': `USER#${userId}`,
        ':sessionPrefix': 'SESSION#' // Query SESSION# records for workflow tracking
      },
      ScanIndexForward: false, // Most recent first
      Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
      try {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      } catch (parseError) {
        throw new Error('Invalid pagination token');
      }
    }

    // Query DynamoDB
    const command = new QueryCommand(params);
    const result = await dynamodb.send(command);

    // Transform items to match GraphQL schema
    // Note: SESSION# records have 'sessionId' field (not 'id')
    // PRICING# records have 'id' field (not 'sessionId')
    // The product field is stored as a Map type, needs to be stringified for GraphQL AWSJSON
    const items = result.Items.map(item => {
      // Get sessionId - SESSION# records use 'sessionId', PRICING# records use 'id'
      const sessionId = item.sessionId || item.id;
      
      // Extract productId - SESSION# records have it directly, PRICING# may need extraction
      let productId = item.productId;
      if (!productId && item.product) {
        // Product is stored as Map type, extract product_id
        productId = typeof item.product === 'object' 
          ? item.product.product_id 
          : JSON.parse(item.product).product_id;
      }
      
      // Stringify product if it's an object (Map type from DynamoDB)
      const productJson = typeof item.product === 'object' 
        ? JSON.stringify(item.product) 
        : item.product;
      
      return {
        id: sessionId,
        sessionId: sessionId,
        userId: item.userId,
        productId: productId || '',
        product: productJson,
        status: item.status,
        analysisData: item.analysisData || null, // Return null instead of {} for GraphQL schema
        botResponses: item.botResponses || [],
        currentAgent: item.currentAgent,
        agentStatus: item.agentStatus,
        error: item.error,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    });

    // Generate next token if there are more results
    let responseNextToken = null;
    if (result.LastEvaluatedKey) {
      responseNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return {
      items,
      nextToken: responseNextToken
    };

  } catch (error) {
    console.error('Failed to fetch pricing sessions:', error);
    
    // Return user-friendly error messages
    if (error.message.includes('authentication')) {
      throw new Error('Authentication required to access pricing sessions');
    } else if (error.message.includes('Access denied')) {
      throw new Error(error.message);
    } else if (error.message.includes('Invalid')) {
      throw new Error(error.message);
    } else {
      throw new Error('Failed to fetch pricing sessions. Please try again.');
    }
  }
};

module.exports = { handler };