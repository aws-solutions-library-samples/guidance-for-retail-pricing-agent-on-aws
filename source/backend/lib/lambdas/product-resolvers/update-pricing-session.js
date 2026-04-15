/**
 * @fileoverview Lambda resolver for updating pricing sessions in PricingOrchestration table.
 * 
 * Updates pricing sessions in the PricingOrchestration DynamoDB table with progressive
 * analysis results. This mutation triggers the onPricingById subscription for real-time
 * updates to the frontend.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Updates a pricing session with new analysis results.
 * 
 * Reads from and writes to the PricingOrchestration table using the SESSION#{sessionId}
 * partition key format. Supports incremental updates as agents complete their analysis.
 * Supports partial updates - only provided fields are updated.
 * 
 * Authorization:
 * - IAM authentication (agents): Allowed to update any session (no ownership check)
 * - Cognito authentication (users): Can only update their own sessions
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.arguments - Resolver arguments
 * @param {Object} event.arguments.input - UpdatePricingSessionInput
 * @param {string} event.arguments.input.id - Session ID (used as sessionId)
 * @param {Object} [event.arguments.input.demandForecast] - Demand forecast results (legacy)
 * @param {Object} [event.arguments.input.competitiveAnalysis] - Competitive analysis results (legacy)
 * @param {Object} [event.arguments.input.marginAnalysis] - Margin analysis results (legacy)
 * @param {Object} [event.arguments.input.analysisData] - Complete analysis data object
 * @param {Object} [event.arguments.input.botResponses] - Agent chat messages (legacy)
 * @param {string} [event.arguments.input.currentAgent] - Currently executing agent
 * @param {Object} [event.arguments.input.agentStatus] - Status of each agent
 * @param {Object} [event.arguments.input.errorDetails] - Error details if analysis fails
 * @param {string} [event.arguments.input.status] - Session status
 * @param {Object} event.identity - User identity from Cognito or IAM
 * @returns {Promise<Object>} Updated pricing session matching GraphQL PricingSession type
 */
const handler = async (event) => {
  console.log('Updating pricing session in PricingOrchestration table:', JSON.stringify(event, null, 2));

  try {
    const { input } = event.arguments;
    const { 
      id, 
      demandForecast, 
      competitiveAnalysis, 
      marginAnalysis,
      analysisData,
      botResponses, 
      currentAgent,
      agentStatus,
      errorDetails,
      status 
    } = input;
    
    // Determine authentication type and get user ID
    // IAM authentication: event.identity contains accountId and userArn (but NOT sub)
    // Cognito authentication: event.identity contains sub (Cognito user ID)
    // 
    // IMPORTANT: For IAM auth, AppSync sets username to the assumed role session name, so we cannot
    // use username to distinguish between IAM and Cognito auth. We must check for 'sub' field.
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
    // Note: SESSION# records are created by Step Functions orchestrator (legacy)
    const partitionKey = `SESSION#${id}`;

    // Get existing session to verify it exists (and ownership for Cognito users)
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: {
        PK: partitionKey,
        SK: 'METADATA'
      }
    });
    const getResult = await dynamodb.send(getCommand);

    if (!getResult.Item) {
      throw new Error('Pricing session not found');
    }

    // Authorization check:
    // - IAM auth (agents): Skip ownership check - agents can update any session
    // - Cognito auth (users): Verify user owns this session
    if (isCognitoAuth && getResult.Item.userId !== userId) {
      throw new Error('Unauthorized: You can only update your own pricing sessions');
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

    // Handle analysisData field - supports both direct update and nested field updates
    // Priority: analysisData (new) > individual fields (legacy)
    if (analysisData !== undefined) {
      // Direct update of entire analysisData object
      updateExpressions.push('#analysisData = :analysisData');
      expressionAttributeNames['#analysisData'] = 'analysisData';
      expressionAttributeValues[':analysisData'] = typeof analysisData === 'string' 
        ? JSON.parse(analysisData) 
        : analysisData;
    } else {
      // Legacy support: Handle nested analysisData structure for individual fields
      const analysisDataUpdates = [];
      
      if (demandForecast !== undefined) {
        analysisDataUpdates.push('demandForecast');
        expressionAttributeValues[':demandForecast'] = typeof demandForecast === 'string' 
          ? JSON.parse(demandForecast) 
          : demandForecast;
      }

      if (competitiveAnalysis !== undefined) {
        analysisDataUpdates.push('competitiveAnalysis');
        expressionAttributeValues[':competitiveAnalysis'] = typeof competitiveAnalysis === 'string' 
          ? JSON.parse(competitiveAnalysis) 
          : competitiveAnalysis;
      }

      if (marginAnalysis !== undefined) {
        analysisDataUpdates.push('marginAnalysis');
        expressionAttributeValues[':marginAnalysis'] = typeof marginAnalysis === 'string' 
          ? JSON.parse(marginAnalysis) 
          : marginAnalysis;
      }

      // Build analysisData update expression if there are updates
      if (analysisDataUpdates.length > 0) {
        const analysisSetExpressions = analysisDataUpdates.map(field => `#analysisData.#${field} = :${field}`);
        updateExpressions.push(...analysisSetExpressions);
        expressionAttributeNames['#analysisData'] = 'analysisData';
        analysisDataUpdates.forEach(field => {
          expressionAttributeNames[`#${field}`] = field;
        });
      }
    }

    // Update bot responses (agent conversation messages) - legacy field
    if (botResponses !== undefined) {
      updateExpressions.push('#botResponses = :botResponses');
      expressionAttributeNames['#botResponses'] = 'botResponses';
      expressionAttributeValues[':botResponses'] = typeof botResponses === 'string' 
        ? JSON.parse(botResponses) 
        : botResponses;
    }

    // Update current agent information
    if (currentAgent !== undefined) {
      updateExpressions.push('#currentAgent = :currentAgent');
      expressionAttributeNames['#currentAgent'] = 'currentAgent';
      expressionAttributeValues[':currentAgent'] = currentAgent;
    }

    // Update agent status (status of each agent: pending, in-progress, complete, failed)
    if (agentStatus !== undefined) {
      updateExpressions.push('#agentStatus = :agentStatus');
      expressionAttributeNames['#agentStatus'] = 'agentStatus';
      expressionAttributeValues[':agentStatus'] = typeof agentStatus === 'string' 
        ? JSON.parse(agentStatus) 
        : agentStatus;
    }

    // Update error details if provided
    if (errorDetails !== undefined) {
      updateExpressions.push('#errorDetails = :errorDetails');
      expressionAttributeNames['#errorDetails'] = 'errorDetails';
      expressionAttributeValues[':errorDetails'] = typeof errorDetails === 'string' 
        ? JSON.parse(errorDetails) 
        : errorDetails;
    }

    // Update session status
    if (status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    // Update the session in DynamoDB
    const updateCommand = new UpdateCommand({
      TableName: tableName,
      Key: {
        PK: partitionKey,
        SK: 'METADATA'
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const updateResult = await dynamodb.send(updateCommand);
    const updatedItem = updateResult.Attributes;

    console.log(`Pricing session updated successfully in ${tableName}: ${id}`);

    // Return response matching GraphQL PricingSession type
    // Note: id field must always be the session ID from input (non-nullable in GraphQL schema)
    return {
      id: id,  // Always use the session ID from input
      sessionId: id,  // sessionId matches id
      userId: updatedItem.userId,
      productId: updatedItem.productId,
      product: updatedItem.product,
      status: updatedItem.status,
      analysisData: updatedItem.analysisData || {},
      botResponses: updatedItem.botResponses || [],
      currentAgent: updatedItem.currentAgent,
      agentStatus: updatedItem.agentStatus,
      errorDetails: updatedItem.errorDetails,
      createdAt: updatedItem.createdAt,
      updatedAt: updatedItem.updatedAt
    };

  } catch (error) {
    console.error('Failed to update pricing session:', error);
    
    // Return user-friendly error messages
    if (error.message.includes('authentication') || error.message.includes('Unauthorized')) {
      throw new Error(error.message);
    } else if (error.message.includes('not found')) {
      throw new Error('Pricing session not found');
    } else if (error.message.includes('required')) {
      throw new Error(error.message);
    } else {
      throw new Error('Failed to update pricing session. Please try again.');
    }
  }
};

module.exports = { handler };
