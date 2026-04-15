/**
 * @fileoverview Check Supervisor results Lambda function.
 * 
 * Evaluates the results from parallel Demand Forecast and Competitive Analysis agents.
 * Determines if the workflow can proceed to Margin Analysis based on success/failure status.
 * Implements partial failure handling and result aggregation.
 * Includes performance logging for supervisor execution times.
 * 
 * Requirements: 2.3, 2.4, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { logError, logInfo, logWarning } = require('./error-logger');
const { createPerformanceMonitor } = require('./performance-monitor');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true // Remove undefined values from objects
  }
});
const TABLE_NAME = process.env.PRICING_TABLE;

/**
 * Lambda handler for checking Supervisor parallel results.
 * 
 * Evaluates the results from both parallel agents and determines:
 * - If both agents succeeded: aggregates results and allows workflow to proceed
 * - If one agent failed: continues with successful agent's results (partial success)
 * - If both agents failed: terminates workflow without proceeding to Margin Analysis
 * 
 * Includes performance logging for supervisor execution times.
 * 
 * Requirements:
 * - 2.3: Return combined results from both agents when both succeed
 * - 2.4: Continue processing with successful agent's results if one fails
 * - 8.2: Handle Demand Forecast Agent failure
 * - 8.3: Handle Competitive Analysis Agent failure
 * - 8.4: Terminate workflow if both agents fail
 * - 9.1, 9.2, 9.3: Log agent execution times to CloudWatch
 * - 9.4: Log performance warning if exceeding 75 seconds
 * - 9.5: Enforce 90-second timeout
 * 
 * @param {Object} event - Step Functions task input
 * @param {string} event.sessionId - Unique session identifier
 * @param {Array} event.supervisorResults - Results from parallel agent execution
 * @returns {Promise<Object>} Evaluation result with aggregated data and proceed flag
 * @throws {Error} If session update fails
 */
exports.handler = async (event) => {
  const { sessionId, supervisorResults } = event;
  const timestamp = new Date().toISOString();
  
  // Create performance monitor for tracking supervisor evaluation (Requirement 9.1, 9.2, 9.3)
  const perfMonitor = createPerformanceMonitor(sessionId, 'CheckSupervisorResults');
  
  console.log(`Checking Supervisor results for session ${sessionId}`);
  console.log(`Supervisor results: ${JSON.stringify(supervisorResults, null, 2)}`);
  
  try {
    // Track result evaluation operation
    const evalOp = perfMonitor.startOperation('result-evaluation');
    
    // Extract results from parallel branches
    const demandForecastResult = supervisorResults[0];
    const competitiveAnalysisResult = supervisorResults[1];
    
    // Log individual agent performance metrics (Requirement 9.1, 9.2, 9.3)
    if (demandForecastResult?.Payload?.performanceMetrics) {
      logInfo(sessionId, 'CheckSupervisorResults', 
        'Demand Forecast Agent performance metrics',
        demandForecastResult.Payload.performanceMetrics
      );
    }
    
    if (competitiveAnalysisResult?.Payload?.performanceMetrics) {
      logInfo(sessionId, 'CheckSupervisorResults', 
        'Competitive Analysis Agent performance metrics',
        competitiveAnalysisResult.Payload.performanceMetrics
      );
    }
    
    // Determine success/failure status for each agent
    const demandForecastSuccess = demandForecastResult?.Payload?.status === 'success' && !demandForecastResult?.demandError;
    const competitiveAnalysisSuccess = competitiveAnalysisResult?.Payload?.status === 'success' && !competitiveAnalysisResult?.competitiveError;
    
    console.log(`Demand Forecast success: ${demandForecastSuccess}`);
    console.log(`Competitive Analysis success: ${competitiveAnalysisSuccess}`);
    
    // Requirement 8.4: Check if both agents failed
    if (!demandForecastSuccess && !competitiveAnalysisSuccess) {
      console.error('Both Demand Forecast and Competitive Analysis agents failed');
      
      // Log error to CloudWatch (Requirement 8.1)
      logError(sessionId, 'CheckSupervisorResults', new Error('Both agents failed'), {
        demandForecastError: demandForecastResult?.demandError?.message,
        competitiveAnalysisError: competitiveAnalysisResult?.competitiveError?.message,
        context: 'Supervisor parallel execution resulted in complete failure',
        performanceMetrics: perfMonitor.getSummary()
      });
      
      // Update session with failure status
      await updateSessionWithResults(sessionId, {
        supervisorStatus: 'failed',
        demandForecastStatus: 'failed',
        competitiveAnalysisStatus: 'failed',
        error: {
          message: 'Both Demand Forecast and Competitive Analysis agents failed',
          code: 'SUPERVISOR_FAILURE'
        },
        performanceMetrics: perfMonitor.getSummary()
      }, timestamp);
      
      return {
        canProceed: false,
        aggregatedResults: null,
        supervisorStatus: 'failed',
        error: {
          message: 'Both Demand Forecast and Competitive Analysis agents failed',
          code: 'SUPERVISOR_FAILURE'
        },
        performanceMetrics: perfMonitor.getSummary()
      };
    }
    
    // Aggregate successful results
    const aggregatedResults = aggregateResults(
      demandForecastResult,
      competitiveAnalysisResult,
      demandForecastSuccess,
      competitiveAnalysisSuccess
    );
    
    evalOp.stop();
    
    // Determine overall supervisor status
    const supervisorStatus = (demandForecastSuccess && competitiveAnalysisSuccess) ? 'success' : 'partial_success';
    
    console.log('before reporting');
    console.log(`Supervisor status: ${supervisorStatus}`);
    
    // Log partial success if applicable (Requirement 8.2, 8.3)
    if (supervisorStatus === 'partial_success') {
      logWarning(sessionId, 'CheckSupervisorResults', 'Supervisor partial success - one agent failed', {
        demandForecastSuccess,
        competitiveAnalysisSuccess,
        performanceMetrics: perfMonitor.getSummary()
      });
    }
    console.log('before logSummary');
    // Log performance summary (Requirement 9.1, 9.2, 9.3)
    perfMonitor.logSummary();
    
    console.log('before updating');
    // Update session with aggregated results
    await updateSessionWithResults(sessionId, {
      supervisorStatus,
      demandForecastStatus: demandForecastSuccess ? 'success' : 'failed',
      competitiveAnalysisStatus: competitiveAnalysisSuccess ? 'success' : 'failed',
      aggregatedResults,
      performanceMetrics: perfMonitor.getSummary()
    }, timestamp);
    
    console.log('before return');
    return {
      canProceed: true,
      aggregatedResults,
      supervisorStatus,
      demandForecastSuccess,
      competitiveAnalysisSuccess,
      performanceMetrics: perfMonitor.getSummary()
    };
    
  } catch (error) {
    console.error(`Failed to check Supervisor results for session ${sessionId}:`, error);
    
    // Log performance warning if approaching timeout (Requirement 9.4)
    perfMonitor.logPerformanceWarning();
    
    // Log error to CloudWatch with structured format (Requirement 8.1)
    logError(sessionId, 'CheckSupervisorResults', error, {
      context: 'Failed to evaluate supervisor parallel results',
      performanceMetrics: perfMonitor.getSummary()
    });
    
    throw error;
  }
};

/**
 * Aggregates results from both parallel agents.
 * 
 * Combines successful results from Demand Forecast and Competitive Analysis agents.
 * If one agent failed, includes only the successful agent's results.
 * 
 * Requirements: 2.3, 2.4
 * 
 * @param {Object} demandForecastResult - Result from Demand Forecast Agent
 * @param {Object} competitiveAnalysisResult - Result from Competitive Analysis Agent
 * @param {boolean} demandForecastSuccess - Whether Demand Forecast succeeded
 * @param {boolean} competitiveAnalysisSuccess - Whether Competitive Analysis succeeded
 * @returns {Object} Aggregated results for Margin Analysis Agent
 */
function aggregateResults(
  demandForecastResult,
  competitiveAnalysisResult,
  demandForecastSuccess,
  competitiveAnalysisSuccess
) {
  const aggregated = {
    timestamp: new Date().toISOString(),
    demandForecast: null,
    competitiveAnalysis: null
  };
  
  // Include Demand Forecast results if successful
  if (demandForecastSuccess && demandForecastResult?.Payload?.result) {
    aggregated.demandForecast = {
      status: 'success',
      data: demandForecastResult.Payload.result,
      duration: demandForecastResult.Payload.duration,
      agentName: demandForecastResult.Payload.agentName
    };
  } else if (!demandForecastSuccess) {
    aggregated.demandForecast = {
      status: 'failed',
      error: demandForecastResult?.demandError?.message || 'Unknown error'
    };
  }
  
  // Include Competitive Analysis results if successful
  if (competitiveAnalysisSuccess && competitiveAnalysisResult?.Payload?.result) {
    aggregated.competitiveAnalysis = {
      status: 'success',
      data: competitiveAnalysisResult.Payload.result,
      duration: competitiveAnalysisResult.Payload.duration,
      agentName: competitiveAnalysisResult.Payload.agentName
    };
  } else if (!competitiveAnalysisSuccess) {
    aggregated.competitiveAnalysis = {
      status: 'failed',
      error: competitiveAnalysisResult?.competitiveError?.message || 'Unknown error'
    };
  }
  
  return aggregated;
}

/**
 * Updates session with Supervisor results.
 * 
 * Stores the aggregated results and status in DynamoDB for later retrieval
 * by the Margin Analysis Agent and for real-time UI updates.
 * 
 * @param {string} sessionId - Session identifier
 * @param {Object} results - Results to store
 * @param {string} timestamp - Current timestamp
 * @returns {Promise<void>}
 */
async function updateSessionWithResults(sessionId, results, timestamp) {
  console.log(sessionId, results, timestamp);
  await dynamoClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `SESSION#${sessionId}`,
      SK: 'METADATA'
    },
    UpdateExpression: `
      SET supervisorResults = :results,
          #agents.demandForecast.#status = :demandStatus,
          #agents.competitiveAnalysis.#status = :competitiveStatus,
          updatedAt = :timestamp
    `,
    ExpressionAttributeNames: {
      '#agents': 'agents',
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':results': results,
      ':demandStatus': results.demandForecastStatus,
      ':competitiveStatus': results.competitiveAnalysisStatus,
      ':timestamp': timestamp
    }
  }));
  
  console.log(`Updated session ${sessionId} with Supervisor results`);
}
