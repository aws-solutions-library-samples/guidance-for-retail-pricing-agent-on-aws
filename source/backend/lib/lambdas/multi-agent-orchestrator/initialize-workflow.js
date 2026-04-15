/**
 * @fileoverview Initialize workflow Lambda function.
 * 
 * Initializes the pricing analysis workflow by creating a session and updating
 * its status to in-progress. This is the first step in the Step Functions state machine.
 * Includes performance tracking initialization for workflow execution time monitoring.
 * 
 * Requirements: 5.2, 5.3, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { logError, logInfo } = require('./error-logger');
const { createPerformanceMonitor } = require('./performance-monitor');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true // Remove undefined values from objects
  }
});
const TABLE_NAME = process.env.PRICING_TABLE;

/**
 * Lambda handler for workflow initialization.
 * 
 * Updates the session status to 'in-progress' and initializes workflow metadata.
 * This function is called at the start of the Step Functions state machine execution.
 * Initializes performance monitoring for tracking workflow execution time.
 * 
 * Requirements: 5.2, 5.3, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5
 * 
 * @param {Object} event - Step Functions task input
 * @param {string} event.sessionId - Unique session identifier
 * @param {string} event.userId - User identifier
 * @param {Object} event.product - Product data for analysis
 * @returns {Promise<Object>} Initialization result with session metadata and performance tracking
 * @throws {Error} If session update fails
 */
exports.handler = async (event) => {
  const { sessionId, userId, product } = event;
  const timestamp = new Date().toISOString();
  
  // Create performance monitor for tracking workflow execution time (Requirement 9.1, 9.2, 9.3)
  const perfMonitor = createPerformanceMonitor(sessionId, 'WorkflowOrchestration');
  
  console.log(`Initializing workflow for session ${sessionId}, user ${userId}`);
  
  try {
    // Track initialization operation
    const initOp = perfMonitor.startOperation('session-initialization');
    
    // Update session status to in-progress and initialize workflow metadata
    const updateResult = await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      },
      UpdateExpression: `
        SET #status = :inProgress,
            workflowStartTime = :timestamp,
            workflowStartTimeMs = :timestampMs,
            #agents = :agentsList,
            performanceMonitor = :perfMonitor,
            updatedAt = :timestamp
      `,
      ExpressionAttributeNames: {
        '#status': 'status',
        '#agents': 'agents'
      },
      ExpressionAttributeValues: {
        ':inProgress': 'in-progress',
        ':timestamp': timestamp,
        ':timestampMs': Date.now(),
        ':agentsList': {
          demandForecast: { status: 'pending', startTime: null, endTime: null, result: null },
          competitiveAnalysis: { status: 'pending', startTime: null, endTime: null, result: null },
          marginAnalysis: { status: 'pending', startTime: null, endTime: null, result: null }
        },
        ':perfMonitor': {
          initialized: true,
          startTime: timestamp,
          startTimeMs: Date.now()
        }
      }
    }));
    console.log('after update', updateResult);
    initOp.stop();
    
    console.log(`Workflow initialized for session ${sessionId}`);
    
    // Log initialization info (Requirement 9.1, 9.2, 9.3)
    logInfo(sessionId, 'InitializeWorkflow', 
      `Workflow initialization completed for session ${sessionId}`,
      {
        userId,
        product: product.product_id,
        category: product.category,
        performanceMetrics: perfMonitor.getSummary()
      }
    );
    
    return {
      sessionId,
      userId,
      product,
      status: 'initialized',
      timestamp,
      workflowStartTimeMs: Date.now(),
      performanceMetrics: perfMonitor.getSummary()
    };
    
  } catch (error) {
    console.error(`Failed to initialize workflow for session ${sessionId}:`, error);
    
    // Log error to CloudWatch with structured format (Requirement 8.1)
    logError(sessionId, 'InitializeWorkflow', error, {
      context: 'Failed to initialize workflow in DynamoDB',
      performanceMetrics: perfMonitor.getSummary()
    });
    
    throw error;
  }
};
