/**
 * @fileoverview Lambda Resolver for pricing analysis requests.
 * 
 * Entry point that validates input, creates a session, and starts Step Functions execution.
 * Handles GraphQL mutation invocation from AppSync and returns immediately with session ID
 * and execution ARN for asynchronous workflow processing.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { createSession } = require('./session-manager');
const { logError, logInfo, logWarning } = require('./error-logger');

const sfnClient = new SFNClient({ region: process.env.AWS_REGION });

/**
 * Validates user ID parameter.
 * 
 * @param {string} userID - User identifier to validate
 * @returns {Object} Validation result with isValid flag and error message if invalid
 */
function validateUserID(userID) {
  if (!userID) {
    return {
      isValid: false,
      error: 'userID is required'
    };
  }

  if (typeof userID !== 'string' || userID.trim().length === 0) {
    return {
      isValid: false,
      error: 'userID must be a non-empty string'
    };
  }

  return { isValid: true };
}

/**
 * Validates product data parameter.
 * 
 * @param {Object} product - Product data to validate
 * @returns {Object} Validation result with isValid flag and error message if invalid
 */
function validateProduct(product) {
  if (!product) {
    return {
      isValid: false,
      error: 'product data is required'
    };
  }

  if (typeof product !== 'object') {
    return {
      isValid: false,
      error: 'product must be an object'
    };
  }

  if (!product.product_id) {
    return {
      isValid: false,
      error: 'product.product_id is required'
    };
  }

  if (typeof product.product_id !== 'string' || product.product_id.trim().length === 0) {
    return {
      isValid: false,
      error: 'product.product_id must be a non-empty string'
    };
  }

  return { isValid: true };
}

/**
 * Lambda handler for resolverLambda GraphQL mutation.
 * 
 * Validates input parameters, creates or retrieves a session, and starts Step Functions
 * execution for the pricing analysis workflow. Returns immediately with session ID and
 * execution ARN for asynchronous processing.
 * 
 * @param {Object} event - AppSync resolver event containing arguments
 * @param {Object} event.arguments - GraphQL mutation arguments
 * @param {string} event.arguments.userID - User identifier (required)
 * @param {string} event.arguments.sessionID - Optional existing session ID
 * @param {Object} event.arguments.product - Product data (required)
 * @param {string} event.arguments.product.product_id - Product identifier (required)
 * @returns {Promise<Object>} Response object with status, sessionId, executionArn, and statusCode
 */
async function handler(event) {
  console.log('Received pricing analysis request:', JSON.stringify(event, null, 2));

  try {
    // Extract arguments from AppSync event
    const args = event.arguments || {};
    const { userID, sessionID, product } = args;

    // Validate userID (Requirement 10.2)
    const userIDValidation = validateUserID(userID);
    if (!userIDValidation.isValid) {
      console.warn(`Validation failed - userID: ${userIDValidation.error}`);
      return {
        status: 'error',
        message: userIDValidation.error,
        statusCode: 400
      };
    }

    // Validate product data (Requirement 10.2)
    const productValidation = validateProduct(product);
    if (!productValidation.isValid) {
      console.warn(`Validation failed - product: ${productValidation.error}`);
      return {
        status: 'error',
        message: productValidation.error,
        statusCode: 400
      };
    }

    // Create or use existing session (Requirement 10.3)
    let finalSessionId;
    if (sessionID) {
      console.log(`Using existing session: ${sessionID}`);
      finalSessionId = sessionID;
    } else {
      console.log('Creating new session');
      finalSessionId = await createSession(userID, product);
    }

    // Prepare Step Functions execution input
    const executionInput = {
      sessionId: finalSessionId,
      userId: userID,
      product: product
    };

    // Start Step Functions execution (Requirement 10.3)
    console.log(`Starting Step Functions execution for session ${finalSessionId}`);
    const startExecutionResponse = await sfnClient.send(new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      name: `pricing-${finalSessionId}-${Date.now()}`,
      input: JSON.stringify(executionInput)
    }));

    console.log(`Successfully started Step Functions execution: ${startExecutionResponse.executionArn}`);

    // Return immediately with session ID and execution ARN (Requirement 10.4)
    return {
      status: 'success',
      sessionId: finalSessionId,
      message: 'Pricing analysis started',
      executionArn: startExecutionResponse.executionArn,
      statusCode: 200
    };

  } catch (error) {
    console.error('Lambda resolver error:', error);

    // Log error to CloudWatch with structured format (Requirement 8.1)
    logError('unknown', 'ResolverHandler', error, {
      context: 'Failed to start pricing analysis workflow'
    });

    // Determine appropriate error status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.name === 'ValidationException') {
      statusCode = 400;
      errorMessage = 'Invalid input parameters';
      logWarning('unknown', 'ResolverHandler', 'Validation error in resolver', {
        errorMessage: error.message
      });
    } else if (error.name === 'ExecutionLimitExceededException') {
      statusCode = 429;
      errorMessage = 'Too many concurrent executions';
      logWarning('unknown', 'ResolverHandler', 'Execution limit exceeded', {
        errorMessage: error.message
      });
    } else if (error.name === 'StateMachineDoesNotExist') {
      statusCode = 500;
      errorMessage = 'State machine configuration error';
      logError('unknown', 'ResolverHandler', error, {
        context: 'State machine not found'
      });
    }

    // Return error response (Requirement 10.5)
    return {
      status: 'error',
      message: errorMessage,
      error: error.message,
      statusCode: statusCode
    };
  }
}

module.exports = { handler };
