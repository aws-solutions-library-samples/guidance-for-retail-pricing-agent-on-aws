/**
 * @fileoverview Lambda resolver for invoking agent orchestration workflow via Step Functions.
 * 
 * Triggers the multi-agent pricing analysis workflow by starting a Step Functions
 * state machine execution with proper error handling and CloudWatch logging.
 * 
 * This resolver exclusively uses AWS Step Functions for orchestration.
 * No fallback methods are supported.
 */

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { createSession } = require('../multi-agent-orchestrator/session-manager');

const sfnClient = new SFNClient({});

/**
 * Invokes the Step Functions state machine for agent orchestration.
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.arguments - Resolver arguments
 * @param {string} event.arguments.userID - User ID
 * @param {string} event.arguments.sessionID - Pricing session ID
 * @param {Object} event.arguments.product - Product data for analysis
 * @param {Object} event.identity - User identity from Cognito
 * @returns {Promise<Object>} Resolver response with execution details
 * 
 * @throws {Error} If authentication fails
 * @throws {Error} If required parameters are missing
 * @throws {Error} If Step Functions is not configured
 * @throws {Error} If Step Functions execution fails
 */
const handler = async (event) => {
  try {
    const { userID, sessionID, product } = event.arguments;
    
    // ============================================================
    // STEP 1: Authentication and Authorization
    // ============================================================
    
    const authenticatedUserId = event.identity?.sub || event.identity?.username;
    if (!authenticatedUserId) {
      throw new Error('User authentication required');
    }

    // Validate user can only invoke for their own sessions
    if (userID !== authenticatedUserId) {
      throw new Error('Access denied: Can only invoke resolver for your own sessions');
    }

    // ============================================================
    // STEP 2: Input Validation
    // ============================================================
    
    if (!sessionID) {
      throw new Error('Session ID is required');
    }

    if (!product) {
      throw new Error('Product data is required');
    }

    // Parse product data if it's a string
    let productData;
    try {
      productData = typeof product === 'string' ? JSON.parse(product) : product;
    } catch (parseError) {
      throw new Error('Invalid product data format');
    }

    // Validate required product fields
    // Note: MAP and MSRP are optional and can be 0 or null. The backend agents
    // can handle products without these values for pricing analysis.
    // Only product_id and cost are strictly required.
    if (!productData.product_id) {
      throw new Error('Missing required product field: product_id');
    }
    
    if (typeof productData.cost !== 'number' || productData.cost <= 0) {
      throw new Error('Missing required product field: cost (must be a number greater than 0)');
    }

    // ============================================================
    // STEP 3: Configuration Validation
    // ============================================================
    
    if (!process.env.STATE_MACHINE_ARN) {
      console.error('STATE_MACHINE_ARN environment variable is not configured');
      throw new Error('Pricing workflow is not configured. Please contact support.');
    }

    // ============================================================
    // STEP 4: Create SESSION# Record in DynamoDB
    // ============================================================
    
    // The Step Functions workflow expects a SESSION# record to exist before it starts
    // The initialize-workflow Lambda uses UpdateCommand, so the record must exist first
    // Create the SESSION# record here with userId properly populated
    
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
    
    const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
    
    const timestamp = new Date().toISOString();
    const sessionItem = {
      PK: `SESSION#${sessionID}`,
      SK: 'METADATA',
      GSI1PK: `USER#${userID}`,
      GSI1SK: `SESSION#${timestamp}`,
      sessionId: sessionID,
      userId: userID,
      productId: productData.product_id,
      product: productData,
      status: 'initiated',
      botResponses: [],
      analysisData: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    try {
      await dynamoClient.send(new PutCommand({
        TableName: process.env.ORCHESTRATION_TABLE_NAME,
        Item: sessionItem,
        ConditionExpression: 'attribute_not_exists(PK)'
      }));
    } catch (putError) {
      if (putError.name === 'ConditionalCheckFailedException') {
        // Session already exists, continue
      } else {
        console.error('Failed to create SESSION# record:', putError);
        throw new Error('Failed to initialize pricing session');
      }
    }
    
    // ============================================================
    // STEP 5: Start Step Functions Execution
    // ============================================================
    
    // Prepare input for Step Functions state machine
    const stateMachineInput = {
      sessionId: sessionID,
      userId: userID,
      product: productData,
      timestamp: new Date().toISOString(),
      source: 'appsync-resolver'
    };

    // Generate unique execution name (max 80 chars, alphanumeric + hyphens)
    const executionName = `pricing-${sessionID.substring(0, 40)}-${Date.now()}`;

    // Start Step Functions execution
    const startExecutionParams = {
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify(stateMachineInput)
    };

    const startExecutionCommand = new StartExecutionCommand(startExecutionParams);
    const executionResult = await sfnClient.send(startExecutionCommand);
    
    // ============================================================
    // STEP 6: Return Success Response
    // ============================================================
    
    return {
      status: 'success',
      message: 'Pricing analysis workflow started successfully',
      executionArn: executionResult.executionArn,
      sessionId: sessionID
    };

  } catch (error) {
    // ============================================================
    // ERROR HANDLING
    // ============================================================
    
    console.error('Resolver invocation failed:', error.message);

    // Return user-friendly error messages based on error type
    if (error.message.includes('authentication') || error.message.includes('Authentication')) {
      throw new Error('Authentication required to start pricing analysis');
    }
    
    if (error.message.includes('Access denied')) {
      throw new Error(error.message);
    }
    
    if (error.message.includes('required') || error.message.includes('Missing')) {
      throw new Error(error.message);
    }
    
    if (error.message.includes('Invalid')) {
      throw new Error(error.message);
    }
    
    if (error.message.includes('not configured')) {
      throw new Error(error.message);
    }
    
    // Step Functions specific errors
    if (error.name === 'ExecutionLimitExceeded') {
      throw new Error('Too many pricing analyses in progress. Please try again in a moment.');
    }
    
    if (error.name === 'ExecutionAlreadyExists') {
      throw new Error('A pricing analysis is already running for this session.');
    }
    
    if (error.name === 'StateMachineDoesNotExist') {
      console.error('Step Functions state machine does not exist:', process.env.STATE_MACHINE_ARN);
      throw new Error('Pricing workflow is not available. Please contact support.');
    }
    
    if (error.name === 'InvalidExecutionInput') {
      throw new Error('Invalid pricing analysis request. Please check your product data.');
    }
    
    // Generic Step Functions error
    if (error.name && error.name.includes('States')) {
      throw new Error('Failed to start pricing analysis workflow. Please try again.');
    }
    
    // Generic error fallback
    throw new Error('Failed to start pricing analysis. Please try again or contact support.');
  }
};

module.exports = { handler };