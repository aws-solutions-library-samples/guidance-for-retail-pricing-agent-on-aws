/**
 * @fileoverview Demand Forecast Agent handler.
 * 
 * Invokes AgentCore Runtime Demand Forecast Agent deployed as a Lambda function.
 * Handles Step Functions task input reception, AgentCore agent invocation,
 * response processing, and DynamoDB updates.
 * Includes performance monitoring with CloudWatch metrics and duration tracking.
 * 
 * Requirements: FR-2, FR-7, FR-8, NFR-1, NFR-2, NFR-5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { logError, logInfo, formatErrorForStorage } = require('./error-logger');
const { createPerformanceMonitor, validateAgentExecutionTime } = require('./performance-monitor');
const { invokeAgentCoreAgent, validateAgentCoreId } = require('./agentcore-invoker');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true // Remove undefined values from objects
  }
});

const TABLE_NAME = process.env.PRICING_TABLE || 'PricingTable';
const AGENTCORE_ID = process.env.DEMAND_FORECAST_AGENTCORE_ID;
const AGENT_NAME = 'Demand Forecast Agent';

// Validate AgentCore ID on module load to fail fast
validateAgentCoreId(AGENTCORE_ID, AGENT_NAME);

/**
 * Updates session status and analysis data in DynamoDB.
 * 
 * @param {string} sessionId - Session identifier
 * @param {string} status - New status (initiated, in-progress, success, error)
 * @param {Object} data - Additional data to store
 * @returns {Promise<void>}
 */
async function updateSessionStatus(sessionId, status, data = {}) {
  const timestamp = new Date().toISOString();
  
  try {
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      },
      UpdateExpression: 'SET #status = :status, #data = :data, updatedAt = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#data': 'analysisData'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':data': data,
        ':timestamp': timestamp
      }
    }));
    
    console.log(`Updated session ${sessionId} status to ${status}`);
  } catch (error) {
    console.error(`Failed to update session status: ${error.message}`);
    throw error;
  }
}

/**
 * Appends bot responses (agent messages) to DynamoDB session record.
 * 
 * @param {string} sessionId - Session identifier
 * @param {Array<Object>} messages - Messages to append
 * @returns {Promise<void>}
 */
async function appendBotResponses(sessionId, messages) {
  if (!messages || messages.length === 0) {
    return;
  }
  
  try {
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      },
      UpdateExpression: 'SET botResponses = list_append(if_not_exists(botResponses, :emptyList), :messages)',
      ExpressionAttributeValues: {
        ':messages': messages,
        ':emptyList': []
      }
    }));
    
    console.log(`Appended ${messages.length} bot responses to session ${sessionId}`);
  } catch (error) {
    console.error(`Failed to append bot responses: ${error.message}`);
    throw error;
  }
}



// Removed pollAgentCompletion - AgentCore agents now use synchronous Lambda invocation

/**
 * Lambda handler for Demand Forecast Agent invocation via AgentCore Runtime.
 * 
 * Receives Step Functions task input, invokes AgentCore Runtime agent (deployed as Lambda),
 * processes response, updates DynamoDB, and returns results to Step Functions.
 * Includes performance monitoring with duration tracking and CloudWatch metrics.
 * 
 * Requirements: FR-2, FR-7, FR-8, NFR-1, NFR-2, NFR-5
 * 
 * @param {Object} event - Step Functions task input
 * @param {string} event.sessionId - Session identifier
 * @param {string} event.userId - User identifier
 * @param {Object} event.product - Product data
 * @returns {Promise<Object>} Agent execution result with performance metrics
 * @throws {Error} If agent invocation fails
 */
exports.handler = async (event) => {
  const { sessionId, userId, product } = event;
  
  // Create performance monitor for tracking execution time (Requirement NFR-1, NFR-5)
  const perfMonitor = createPerformanceMonitor(sessionId, 'DemandForecastAgent');
  
  console.log(`[Demand Forecast Handler] Invoking ${AGENT_NAME} for session ${sessionId}`);
  console.log(`[Demand Forecast Handler] Event:`, JSON.stringify(event, null, 2));
  
  try {
    // Validate input
    if (!sessionId || !product) {
      throw new Error('Missing required parameters: sessionId and product');
    }
    
    // Track initialization operation
    const initOp = perfMonitor.startOperation('initialization');
    
    // Update session status to in-progress
    await updateSessionStatus(sessionId, 'in-progress', {
      currentAgent: AGENT_NAME,
      agentStatus: 'started',
      startTime: new Date().toISOString()
    });
    
    initOp.stop();
    
    // Track AgentCore invocation
    const invokeOp = perfMonitor.startOperation('agentcore-invocation');
    
    // Invoke AgentCore agent using shared invoker utility
    // Pass Step Functions input directly to AgentCore agent
    const response = await invokeAgentCoreAgent({
      agentCoreId: AGENTCORE_ID,
      sessionId: sessionId,
      input: { sessionId, userId, product }, // Pass Step Functions input directly
      agentName: AGENT_NAME
    });
    
    const result = response.result;
    const invokeDuration = invokeOp.stop();

    console.log('Invocation Result', result);
    
    console.log(`[Demand Forecast Handler] Agent invocation completed`, {
      status: response.status,
      duration: response.duration,
      dataSource: result.data_source,
      confidenceScore: result.confidence_score,
      messageCount: result.messages?.length || 0
    });
    
    // Check if agent execution failed
    if (response.status === 'failed') {
      throw new Error(result.error || 'Agent execution failed without error message');
    }
    
    // Validate execution time against threshold (Requirement NFR-1)
    const timeValidation = validateAgentExecutionTime(result.duration || invokeDuration, AGENT_NAME);
    logInfo(sessionId, 'DemandForecastAgent', timeValidation.message, {
      duration: response.duration || invokeDuration,
      threshold: timeValidation.threshold
    });
    
    // Update session with agent messages (Requirement FR-7)
    if (result.messages && result.messages.length > 0) {
      await appendBotResponses(sessionId, result.messages);
    }
    
    // Update session with final results including performance metrics (Requirement FR-7)
    await updateSessionStatus(sessionId, 'success', {
      currentAgent: AGENT_NAME,
      agentStatus: 'completed',
      demandForecast: result.analysis,
      dataSource: result.data_source,
      confidenceScore: result.confidence_score,
      endTime: new Date().toISOString(),
      duration: response.duration || invokeDuration,
      performanceMetrics: perfMonitor.getSummary()
    });
    
    console.log(`[Demand Forecast Handler] ${AGENT_NAME} completed successfully for session ${sessionId}`);
    
    // Log performance summary (Requirement NFR-5)
    perfMonitor.logSummary();
    
    // Publish metrics to CloudWatch (Requirement NFR-5)
    await perfMonitor.publishAllMetrics();
    
    // Return result to Step Functions
    return {
      status: 'success',
      agentName: AGENT_NAME,
      result: result.analysis,
      dataSource: result.data_source,
      confidenceScore: result.confidence_score,
      duration: response.duration || invokeDuration,
      messageCount: result.messages?.length || 0,
      performanceMetrics: perfMonitor.getSummary()
    };
    
  } catch (error) {
    console.error(`[Demand Forecast Handler] ${AGENT_NAME} failed:`, error.message);
    
    // Log performance warning if approaching timeout (Requirement NFR-1)
    perfMonitor.logPerformanceWarning();
    
    // Log error to CloudWatch with structured format (Requirement NFR-2, NFR-5)
    logError(sessionId, 'DemandForecastAgent', error, {
      agentCoreId: AGENTCORE_ID,
      agentName: AGENT_NAME,
      elapsedTime: perfMonitor.getElapsedTime(),
      performanceMetrics: perfMonitor.getSummary()
    });
    
    // Update session with error status (Requirement FR-7, NFR-2)
    try {
      await updateSessionStatus(sessionId, 'error', {
        currentAgent: AGENT_NAME,
        agentStatus: 'failed',
        error: formatErrorForStorage(error, 'DemandForecastAgent'),
        endTime: new Date().toISOString(),
        elapsedTime: perfMonitor.getElapsedTime(),
        performanceMetrics: perfMonitor.getSummary()
      });
    } catch (updateError) {
      // Log error update failure but don't throw - we need to throw the original error
      logError(sessionId, 'DemandForecastAgent', updateError, {
        context: 'Failed to update session error status'
      });
    }
    
    // Re-throw error for Step Functions to handle
    throw error;
  }
};

// Export helper functions without overwriting the handler export
exports.updateSessionStatus = updateSessionStatus;
exports.appendBotResponses = appendBotResponses;
