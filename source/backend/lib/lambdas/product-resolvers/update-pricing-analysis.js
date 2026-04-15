/**
 * @fileoverview Lambda resolver for updating pricing analysis (PRICING# records).
 * 
 * Updates pricing analysis results in the PricingOrchestration DynamoDB table.
 * This mutation triggers the onPricingAnalysisById subscription for real-time
 * updates to the frontend.
 * 
 * This resolver handles updates from agents as they complete their analysis:
 * - Demand Forecast Agent: Updates demandForecast field
 * - Competitive Analysis Agent: Updates competitiveAnalysis field
 * - Margin Analysis Agent: Updates marginAnalysis field
 * 
 * Requirements: Agent updates to PRICING# records via AppSync
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
// Configure DocumentClient to automatically remove undefined values
const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

/**
 * Updates pricing analysis results in the PRICING# record.
 * 
 * Reads from and writes to the PricingOrchestration table using the PRICING#{sessionId}
 * partition key format. Supports incremental updates as agents complete their analysis.
 * 
 * Authorization:
 * - IAM authentication (agents): Allowed to update any session (no ownership check)
 * - Cognito authentication (users): Can only update their own sessions
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.arguments - Resolver arguments
 * @param {Object} event.arguments.input - UpdatePricingAnalysisInput
 * @param {string} event.arguments.input.id - Session ID
 * @param {Object} [event.arguments.input.demandForecast] - Demand forecast results (AWSJSON)
 * @param {Object} [event.arguments.input.competitiveAnalysis] - Competitive analysis results (AWSJSON)
 * @param {Object} [event.arguments.input.marginAnalysis] - Margin analysis results (AWSJSON)
 * @param {string} [event.arguments.input.status] - Analysis status enum
 * @param {Object} event.identity - User identity from Cognito or IAM
 * @returns {Promise<Object>} Updated pricing analysis matching GraphQL PricingAnalysis type
 */
const handler = async (event) => {
  console.log('Updating pricing analysis (PRICING# record):', JSON.stringify(event, null, 2));

  try {
    const { input } = event.arguments;
    const { 
      id, 
      demandForecast, 
      competitiveAnalysis, 
      marginAnalysis,
      finalRecommendation,
      status 
    } = input;
    
    // Determine authentication type and get user ID
    // IAM authentication: event.identity contains accountId and userArn (but NOT sub)
    // Cognito authentication: event.identity contains sub (Cognito user ID)
    const isIamAuth = event.identity?.accountId && event.identity?.userArn && !event.identity?.sub;
    const isCognitoAuth = !!event.identity?.sub;
    const userId = event.identity?.sub || event.identity?.username;
    
    // Log authentication type for debugging
    console.log('Authentication type:', isIamAuth ? 'IAM' : (isCognitoAuth ? 'Cognito' : 'Unknown'));
    console.log('Identity details:', JSON.stringify({
      accountId: event.identity?.accountId,
      userArn: event.identity?.userArn,
      sub: event.identity?.sub,
      username: event.identity?.username
    }));
    
    // Require authentication (either IAM or Cognito)
    if (!isIamAuth && !isCognitoAuth) {
      throw new Error('Authentication required (IAM or Cognito)');
    }

    // Validate session ID
    if (!id) {
      throw new Error('Session ID is required');
    }

    // Always use PricingOrchestration table
    const tableName = process.env.ORCHESTRATION_TABLE_NAME;
    if (!tableName) {
      throw new Error('ORCHESTRATION_TABLE_NAME environment variable not configured');
    }
    
    // Use PRICING# prefix to match records created by createPricing mutation
    const partitionKey = `PRICING#${id}`;

    // Get existing record to verify it exists (and ownership for Cognito users)
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: {
        PK: partitionKey,
        SK: 'METADATA'
      }
    });
    const getResult = await dynamodb.send(getCommand);

    if (!getResult.Item) {
      throw new Error('Pricing analysis record not found');
    }

    // Authorization check:
    // - IAM auth (agents): Skip ownership check - agents can update any session
    // - Cognito auth (users): Verify user owns this session
    if (isCognitoAuth && getResult.Item.userId !== userId) {
      throw new Error('Unauthorized: You can only update your own pricing analysis');
    }
    
    // Log successful authorization
    if (isIamAuth) {
      console.log(`IAM-authenticated request authorized for session ${id}`);
    } else {
      console.log(`Cognito user ${userId} authorized for session ${id}`);
    }

    // Build update expression dynamically based on provided fields
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Always update the timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    // Update demandForecast if provided (AWSJSON scalar - may be string or object)
    if (demandForecast !== undefined) {
      updateExpressions.push('#demandForecast = :demandForecast');
      expressionAttributeNames['#demandForecast'] = 'demandForecast';
      expressionAttributeValues[':demandForecast'] = typeof demandForecast === 'string' 
        ? JSON.parse(demandForecast) 
        : demandForecast;
    }

    // Update competitiveAnalysis if provided (AWSJSON scalar - may be string or object)
    if (competitiveAnalysis !== undefined) {
      updateExpressions.push('#competitiveAnalysis = :competitiveAnalysis');
      expressionAttributeNames['#competitiveAnalysis'] = 'competitiveAnalysis';
      expressionAttributeValues[':competitiveAnalysis'] = typeof competitiveAnalysis === 'string' 
        ? JSON.parse(competitiveAnalysis) 
        : competitiveAnalysis;
    }

    // Update marginAnalysis if provided (AWSJSON scalar - may be string or object)
    if (marginAnalysis !== undefined) {
      updateExpressions.push('#marginAnalysis = :marginAnalysis');
      expressionAttributeNames['#marginAnalysis'] = 'marginAnalysis';
      expressionAttributeValues[':marginAnalysis'] = typeof marginAnalysis === 'string' 
        ? JSON.parse(marginAnalysis) 
        : marginAnalysis;
    }

    // Update finalRecommendation if provided (AWSJSON scalar - may be string or object)
    if (finalRecommendation !== undefined) {
      updateExpressions.push('#finalRecommendation = :finalRecommendation');
      expressionAttributeNames['#finalRecommendation'] = 'finalRecommendation';
      expressionAttributeValues[':finalRecommendation'] = typeof finalRecommendation === 'string' 
        ? JSON.parse(finalRecommendation) 
        : finalRecommendation;
    }

    // Update status if provided (PricingAnalysisStatus enum)
    // Valid values: initiated, demand_analysis_complete, competitive_analysis_complete, completed, failed
    if (status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    // Ensure we have at least one field to update (besides timestamp)
    if (updateExpressions.length === 1) {
      throw new Error('At least one field must be provided for update');
    }

    // Update the record in DynamoDB
    const updateCommand = new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: partitionKey,
        SK: 'METADATA'
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW'
    });

    const updateResult = await dynamodb.send(updateCommand);
    const updatedItem = updateResult.Attributes;

    console.log(`Pricing analysis updated successfully in ${tableName}: ${id}`);

    // Return response matching GraphQL PricingAnalysis type
    return {
      id: updatedItem.id || updatedItem.sessionId || id,
      sessionId: updatedItem.sessionId || updatedItem.id || id,
      userId: updatedItem.userId,
      productId: updatedItem.productId || '',
      product: updatedItem.product,
      status: updatedItem.status,
      demandForecast: updatedItem.demandForecast,
      competitiveAnalysis: updatedItem.competitiveAnalysis,
      marginAnalysis: updatedItem.marginAnalysis,
      finalRecommendation: updatedItem.finalRecommendation,
      createdAt: updatedItem.createdAt,
      updatedAt: updatedItem.updatedAt
    };

  } catch (error) {
    console.error('Failed to update pricing analysis:', error);
    
    // Return user-friendly error messages
    if (error.message.includes('authentication') || error.message.includes('Unauthorized')) {
      throw new Error(error.message);
    } else if (error.message.includes('not found')) {
      throw new Error('Pricing analysis record not found');
    } else if (error.message.includes('required')) {
      throw new Error(error.message);
    } else if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Pricing analysis record not found');
    } else {
      throw new Error(`Failed to update pricing analysis: ${error.message}`);
    }
  }
};

module.exports = { handler };
