/**
 * @fileoverview Session Manager for pricing analysis workflows.
 * 
 * Manages session lifecycle, status tracking, and data persistence in DynamoDB.
 * Provides functions for creating sessions, updating status, and managing bot responses.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true // Remove undefined values from objects
  }
});
const TABLE_NAME = process.env.PRICING_TABLE || 'PricingTable';

/**
 * Creates a new pricing analysis session.
 * 
 * Generates a unique session ID using UUID format and stores the session record
 * in DynamoDB with initial status "initiated".
 * 
 * @param {string} userId - User identifier
 * @param {Object} product - Product data containing product_id and other details
 * @returns {Promise<string>} Session ID
 * @throws {Error} If session creation fails
 */
async function createSession(userId, product) {
  const sessionId = uuidv4();
  const timestamp = new Date().toISOString();
  
  try {
    const item = {
      PK: `SESSION#${sessionId}`,
      SK: 'METADATA',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `SESSION#${timestamp}`,
      
      sessionId,
      userId,
      productId: product.product_id,
      product,
      status: 'initiated',
      botResponses: [],
      analysisData: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)'
    }));

    console.log(`Created session ${sessionId} for user ${userId}`);
    return sessionId;
  } catch (error) {
    console.error('Failed to create session:', error);
    throw new Error(`Session creation failed: ${error.message}`);
  }
}

/**
 * Updates session status and analysis data in DynamoDB.
 * 
 * Updates the status field and stores additional analysis data. Automatically
 * updates the updatedAt timestamp.
 * 
 * @param {string} sessionId - Session identifier
 * @param {string} status - New status (initiated, in-progress, success, error, partial_success)
 * @param {Object} data - Additional data to store in analysisData field
 * @returns {Promise<void>}
 * @throws {Error} If update fails
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
    console.error('Failed to update session status:', error);
    throw new Error(`Status update failed: ${error.message}`);
  }
}

/**
 * Appends bot responses (agent messages) to the session.
 * 
 * Adds new messages to the botResponses array in DynamoDB. Each message includes
 * the agent ID, agent name, message content, and timestamp.
 * 
 * @param {string} sessionId - Session identifier
 * @param {Array<Object>} messages - Array of message objects with agentId, agentName, message, timestamp
 * @returns {Promise<void>}
 * @throws {Error} If append fails
 */
async function appendBotResponses(sessionId, messages) {
  if (!messages || messages.length === 0) {
    return;
  }

  try {
    // Get current responses
    const result = await dynamoClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      }
    }));

    const currentResponses = result.Item?.botResponses || [];
    const updatedResponses = [...currentResponses, ...messages];

    // Update with new responses
    await dynamoClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      },
      UpdateExpression: 'SET botResponses = :responses, updatedAt = :timestamp',
      ExpressionAttributeValues: {
        ':responses': updatedResponses,
        ':timestamp': new Date().toISOString()
      }
    }));

    console.log(`Appended ${messages.length} bot responses to session ${sessionId}`);
  } catch (error) {
    console.error('Failed to append bot responses:', error);
    throw new Error(`Bot response append failed: ${error.message}`);
  }
}

/**
 * Retrieves a session record from DynamoDB.
 * 
 * Fetches the complete session record including status, analysis data, and bot responses.
 * 
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Session record or null if not found
 * @throws {Error} If retrieval fails
 */
async function getSession(sessionId) {
  try {
    const result = await dynamoClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `SESSION#${sessionId}`,
        SK: 'METADATA'
      }
    }));

    if (!result.Item) {
      console.log(`Session ${sessionId} not found`);
      return null;
    }

    console.log(`Retrieved session ${sessionId}`);
    return result.Item;
  } catch (error) {
    console.error('Failed to retrieve session:', error);
    throw new Error(`Session retrieval failed: ${error.message}`);
  }
}

module.exports = {
  createSession,
  updateSessionStatus,
  appendBotResponses,
  getSession
};
