/**
 * @fileoverview AgentCore Runtime agent invoker.
 * 
 * Invokes AgentCore agents using BedrockAgentCoreClient.
 * This is a simple pass-through wrapper that allows Step Functions
 * to invoke AgentCore agents (which Step Functions cannot call directly).
 * 
 * Architecture:
 * Step Functions → Lambda Wrapper (this invoker) → AgentCore Agent (Python)
 * 
 * Requirements: FR-1, FR-7, NFR-2, NFR-5
 */

const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = require('@aws-sdk/client-bedrock-agentcore');

// Initialize BedrockAgentCore client
const agentCoreClient = new BedrockAgentCoreClient({ 
  region: process.env.AWS_REGION || 'us-east-1'
});

/**
 * Invokes an AgentCore Runtime agent.
 * 
 * This function acts as a simple pass-through wrapper that allows Step Functions
 * to invoke AgentCore agents. Step Functions cannot directly invoke AgentCore agents,
 * so this Lambda wrapper receives the input from Step Functions and passes it to
 * the AgentCore agent using BedrockAgentCoreClient.
 * 
 * @param {Object} params - Invocation parameters
 * @param {string} params.agentCoreId - AgentCore agent ID (e.g., "demand_forecast-6Sxcbx9kz1")
 * @param {string} params.sessionId - Session identifier
 * @param {Object} params.input - Input data from Step Functions (passed directly to agent)
 * @param {string} params.input.sessionId - Session ID
 * @param {string} params.input.userId - User ID
 * @param {Object} params.input.product - Product data
 * @param {string} params.agentName - Human-readable agent name for logging
 * 
 * @returns {Promise<Object>} Agent execution result
 * @throws {Error} If agent invocation fails
 * 
 * Requirements: FR-1, FR-7, NFR-2, NFR-5
 * 
 * @example
 * const result = await invokeAgentCoreAgent({
 *   agentCoreId: 'demand_forecast-6Sxcbx9kz1',
 *   sessionId: 'session-123',
 *   input: {
 *     sessionId: 'session-123',
 *     userId: 'user-456',
 *     product: { product_id: 'PROD-001', cost: 50.00, MSRP: 99.99, ... }
 *   },
 *   agentName: 'Demand Forecast Agent'
 * });
 */
async function invokeAgentCoreAgent(params) {
  const { agentCoreId, sessionId, input, agentName } = params;
  
  // Validate required parameters
  if (!agentCoreId) {
    throw new Error(`${agentName} AgentCore ID is required`);
  }
  if (!sessionId) {
    throw new Error('Session ID is required');
  }
  if (!input) {
    throw new Error('Input data is required');
  }
  
  console.log(`[AgentCore Invoker] Invoking ${agentName}`, {
    agentCoreId,
    sessionId,
    inputKeys: Object.keys(input),
    productId: input.product?.product_id,
    timestamp: new Date().toISOString()
  });
  
  const startTime = Date.now();
  
  try {
    // Prepare input text for AgentCore agent
    // AgentCore agents expect a text input, so we serialize the input object
    const inputText = JSON.stringify(input);
    
    console.log(`[AgentCore Invoker] Prepared input for ${agentName}`, {
      inputLength: inputText.length,
      inputPreview: inputText.substring(0, 200) + '...'
    });
    
    // Construct AgentCore Runtime ARN from agent ID
    // AgentCore agent IDs are in format: "agent_name-randomId" (e.g., "demand_forecast-6Sxcbx9kz1")
    // Correct ARN format: arn:aws:bedrock-agentcore:{region}:{account}:runtime/{agentRuntimeId}/runtime-endpoint/DEFAULT
    // Note: "runtime" not "agent-runtime", and includes endpoint path
    const region = process.env.AWS_REGION || 'us-east-1';
    const account = process.env.AWS_ACCOUNT_ID;
    
    if (!account) {
      throw new Error('AWS_ACCOUNT_ID environment variable is required');
    }
    
    // Construct ARN with DEFAULT endpoint
    // const agentRuntimeArn = `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentCoreId}/runtime-endpoint/DEFAULT`;
    const agentRuntimeArn = `arn:aws:bedrock-agentcore:${region}:${account}:runtime/${agentCoreId}`;
    
    console.log(`[AgentCore Invoker] Constructed ARN for ${agentName}`);
    
    // Invoke AgentCore agent using BedrockAgentCoreClient
    // Per AWS documentation: use agentRuntimeArn, runtimeSessionId, and payload (as Buffer)
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: agentRuntimeArn,
      runtimeSessionId: sessionId,
      payload: Buffer.from(inputText)
    });
    
    console.log(`[AgentCore Invoker] Sending InvokeAgentRuntimeCommand`);
    
    const response = await agentCoreClient.send(command);
    
    const duration = Date.now() - startTime;
    
    console.log(`[AgentCore Invoker] ${agentName} invocation initiated`, {
      agentCoreId,
      sessionId,
      duration,
      hasResponse: !!response.response,
      contentType: response.contentType,
      timestamp: new Date().toISOString()
    });
    
    // Log response details for debugging
    console.log(`[AgentCore Invoker] Response Details:`, JSON.stringify({
      agentCoreId,
      sessionId,
      duration,
      responseKeys: Object.keys(response),
      contentType: response.contentType
    }, null, 2));
    
    // Process streaming response
    // AgentCore returns a streaming response that needs to be collected
    let responseContent = '';
    
    if (response.response) {
      // Response is a stream - collect all chunks
      for await (const chunk of response.response) {
        if (chunk) {
          const chunkStr = Buffer.from(chunk).toString('utf-8');
          responseContent += chunkStr;
        }
      }
    }
    
    console.log(`[AgentCore Invoker] ${agentName} completed successfully`, {
      agentCoreId,
      sessionId,
      duration: Date.now() - startTime,
      responseLength: responseContent.length,
      timestamp: new Date().toISOString()
    });
    
    // Parse and return agent response
    let result;
    try {
      result = JSON.parse(responseContent);
    } catch (parseError) {
      // If not JSON, return as text
      result = { output: responseContent };
    }
    
    return {
      status: 'success',
      result: result,
      sessionId: sessionId,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`[AgentCore Invoker] Failed to invoke ${agentName}`, {
      agentCoreId,
      sessionId,
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Log full error details for debugging
    console.error(`[AgentCore Invoker] Error Details:`, {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });
    
    // Re-throw with enhanced context
    const enhancedError = new Error(`Failed to invoke ${agentName}: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.agentCoreId = agentCoreId;
    enhancedError.sessionId = sessionId;
    enhancedError.duration = duration;
    throw enhancedError;
  }
}

/**
 * Validates that an AgentCore agent ID is properly configured.
 * 
 * @param {string} agentCoreId - AgentCore agent ID to validate
 * @param {string} agentName - Human-readable agent name for error messages
 * @throws {Error} If agent ID is not configured or invalid
 */
function validateAgentCoreId(agentCoreId, agentName) {
  if (!agentCoreId) {
    throw new Error(
      `${agentName} AgentCore ID is not configured. ` +
      `Set the appropriate environment variable (e.g., DEMAND_FORECAST_AGENTCORE_ID).`
    );
  }
  
  // AgentCore Runtime generates IDs in format: {agent_name}-{random_id}
  // Example: "demand_forecast-6Sxcbx9kz1"
  // Just verify it's a non-empty string - AWS will validate the actual ID
  if (typeof agentCoreId !== 'string' || agentCoreId.trim().length === 0) {
    throw new Error(`${agentName} AgentCore ID must be a non-empty string`);
  }
  
  console.log(`[AgentCore Invoker] Validated ${agentName} AgentCore ID: ${agentCoreId}`);
}

module.exports = {
  invokeAgentCoreAgent,
  validateAgentCoreId
};
