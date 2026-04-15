/**
 * @fileoverview Update session status Lambda function.
 * 
 * Updates the session status and stores workflow results in DynamoDB.
 * Called at various points in the Step Functions state machine to track progress
 * and store final results. Supports success, partial success, and error states.
 * Includes performance logging for workflow execution times.
 * 
 * Requirements: 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { logError, logInfo, logWarning } = require('./error-logger');
const { validateWorkflowExecutionTime, PERFORMANCE_THRESHOLDS } = require('./performance-monitor');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true // Remove undefined values from objects
  }
});
const TABLE_NAME = process.env.PRICING_TABLE;

/**
 * Lambda handler for updating session status.
 * 
 * Updates the session record in DynamoDB with new status and results.
 * This function is called at multiple points in the workflow:
 * - After Supervisor agents complete (success or partial success)
 * - After Margin Analysis completes (success or failure)
 * - On workflow errors (error status)
 * 
 * Includes performance validation and logging for workflow execution times.
 * 
 * Requirements:
 * - 5.2: Store session record in DynamoDB
 * - 5.3: Update session record with new data
 * - 5.4: Update status to 'success' when all agents complete successfully
 * - 5.5: Update status to 'error' when errors occur
 * - 8.1: Log error details to CloudWatch with ERROR severity
 * - 8.6: Update session status to 'error' and include error details
 * - 9.1, 9.2, 9.3: Log agent execution times to CloudWatch
 * - 9.4: Log performance warning if exceeding 75 seconds
 * - 9.5: Enforce 90-second timeout
 * 
 * @param {Object} event - Step Functions task input
 * @param {string} event.sessionId - Unique session identifier
 * @param {string} event.status - New status (success, partial_success, error)
 * @param {Object} [event.results] - Workflow results to store
 * @param {Object} [event.error] - Error details if status is 'error'
 * @param {number} [event.workflowStartTime] - Workflow start time for performance tracking
 * @returns {Promise<Object>} Update confirmation with performance metrics
 * @throws {Error} If session update fails
 */
exports.handler = async (event) => {
  const { sessionId, status, results, error, workflowStartTime } = event;
  const timestamp = new Date().toISOString();
  
  console.log(`Updating session ${sessionId} status to: ${status}`);
  
  try {
    // Validate status
    const validStatuses = ['success', 'partial_success', 'error'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
    // Calculate workflow duration if start time provided (Requirement 9.1, 9.2, 9.3)
    let workflowDuration = null;
    if (workflowStartTime) {
      workflowDuration = Date.now() - workflowStartTime;
      
      // Validate workflow execution time (Requirement 9.1, 9.4, 9.5)
      const timeValidation = validateWorkflowExecutionTime(workflowDuration);
      
      logInfo(sessionId, 'UpdateSessionStatus', 
        `Workflow execution time: ${workflowDuration}ms`,
        {
          duration: workflowDuration,
          threshold: timeValidation.threshold,
          isValid: timeValidation.isValid,
          isWarning: timeValidation.isWarning
        }
      );
      
      // Log warning if approaching timeout (Requirement 9.4)
      if (timeValidation.isWarning) {
        logWarning(sessionId, 'UpdateSessionStatus',
          `Workflow execution time exceeds warning threshold (${workflowDuration}ms > ${PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING}ms)`,
          {
            duration: workflowDuration,
            warningThreshold: PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING,
            timeoutThreshold: PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT,
            percentOfTimeout: Math.round((workflowDuration / PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT) * 100)
          }
        );
      }
      
      // Check if workflow exceeded timeout (Requirement 9.5)
      if (!timeValidation.isValid) {
        logError(sessionId, 'UpdateSessionStatus', 
          new Error(`Workflow execution timeout: ${workflowDuration}ms > ${PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT}ms`),
          {
            duration: workflowDuration,
            threshold: PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT,
            statusCode: 504
          }
        );
      }
    }
    
    // Log error details if status is error (Requirement 8.1, 8.6)
    if (status === 'error' && error) {
      logError(sessionId, 'UpdateSessionStatus', new Error(error.message || 'Unknown error'), {
        errorCode: error.code || 'UNKNOWN_ERROR',
        errorDetails: error.details || null,
        context: 'Workflow error status update',
        workflowDuration
      });
    }
    
    // Build update expression and values based on status
    const updateData = buildUpdateData(status, results, error, timestamp, workflowDuration);
    
    // Update session in DynamoDB
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      },
      UpdateExpression: updateData.expression,
      ExpressionAttributeNames: updateData.names,
      ExpressionAttributeValues: updateData.values
    }));
    
    console.log(`Successfully updated session ${sessionId} status to: ${status}`);
    
    return {
      sessionId,
      status,
      timestamp,
      workflowDuration,
      message: `Session status updated to ${status}`
    };
    
  } catch (error) {
    console.error(`Failed to update session ${sessionId} status:`, error);
    
    // Log error to CloudWatch with structured format (Requirement 8.1)
    logError(sessionId, 'UpdateSessionStatus', error, {
      context: 'Failed to update session status in DynamoDB',
      attemptedStatus: status
    });
    
    throw error;
  }
};

/**
 * Builds DynamoDB update expression and values based on status.
 * 
 * Constructs the appropriate UpdateExpression, ExpressionAttributeNames,
 * and ExpressionAttributeValues for different workflow states.
 * Includes performance metrics in the update when available.
 * 
 * Requirement 9.1, 9.2, 9.3: Store performance metrics in session record
 * 
 * @param {string} status - Workflow status
 * @param {Object} results - Workflow results
 * @param {Object} error - Error details
 * @param {string} timestamp - Current timestamp
 * @param {number} [workflowDuration] - Total workflow duration in milliseconds
 * @returns {Object} Update data with expression, names, and values
 */
function buildUpdateData(status, results, error, timestamp, workflowDuration) {
  // Only include attribute names that are actually used in the expression
  const names = {
    '#status': 'status',
    '#endTime': 'workflowEndTime'
  };
  
  const values = {
    ':status': status,
    ':timestamp': timestamp
  };
  
  let expression = 'SET #status = :status, #endTime = :timestamp, updatedAt = :timestamp';
  
  // Add results if provided
  if (results) {
    names['#results'] = 'workflowResults';
    values[':results'] = results;
    expression += ', #results = :results';
  }
  
  // Add error details if status is error
  if (status === 'error' && error) {
    names['#error'] = 'errorDetails';
    values[':error'] = {
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN_ERROR',
      details: error.details || null,
      timestamp
    };
    expression += ', #error = :error';
  }
  
  // Add performance metrics if workflow duration provided (Requirement 9.1, 9.2, 9.3)
  if (workflowDuration !== null && workflowDuration !== undefined) {
    names['#perfMetrics'] = 'performanceMetrics';
    values[':perfMetrics'] = {
      workflowDuration,
      timestamp,
      withinThreshold: workflowDuration <= PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT
    };
    expression += ', #perfMetrics = :perfMetrics';
  }
  
  return {
    expression,
    names,
    values
  };
}

/**
 * Determines if a workflow should be retried based on error type.
 * 
 * Some errors are transient and can be retried, while others are permanent.
 * This helper function can be used by Step Functions retry logic.
 * 
 * @param {Object} error - Error object
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  const retryableErrorCodes = [
    'ThrottlingException',
    'ServiceUnavailableException',
    'RequestLimitExceeded',
    'TimeoutError'
  ];
  
  return retryableErrorCodes.includes(error.code);
}

// Export helper function without overwriting the handler export
exports.isRetryableError = isRetryableError;
