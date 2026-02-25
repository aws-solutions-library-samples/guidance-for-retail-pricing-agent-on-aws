/**
 * @fileoverview DynamoDB table construct for agent chat messages.
 * 
 * Implements durable message storage for agent-to-user communication with support
 * for real-time updates via AppSync subscriptions. Uses composite sort key pattern
 * for efficient agent filtering without additional GSI overhead.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode, StreamViewType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export class SessionChatTableConstruct extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    /**
     * DynamoDB table for agent chat message storage.
     * 
     * Primary key design with composite sort key:
     * - PK: sessionId - Groups all messages for a session
     * - SK: agentId#timestamp - Composite key for efficient agent filtering
     * 
     * Composite Sort Key Benefits:
     * - Efficient agent filtering using begins_with(agentId)
     * - Chronological ordering within each agent
     * - No additional GSI needed for common queries
     * - Lower cost and better performance
     * 
     * Example sort keys:
     * - "demand-forecast#2025-12-05T23:35:42.592Z"
     * - "competitive-analysis#2025-12-05T23:36:15.123Z"
     * - "margin-analysis#2025-12-05T23:37:01.456Z"
     */
    this.table = new Table(this, 'SessionChatTable', {
      tableName: 'SessionChat',
      
      // Primary key with composite sort key (Requirement 4.1, 4.2)
      partitionKey: { 
        name: 'sessionId', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'agentId_timestamp', 
        type: AttributeType.STRING 
      },
      
      // Serverless billing for cost optimization (Requirement 6.1)
      billingMode: BillingMode.PAY_PER_REQUEST,
      
      // Enable streams for future analytics (Requirement 4.3)
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      
      // Point-in-time recovery for data protection (Requirement 6.2)
      pointInTimeRecovery: true,
      
      // TTL for automatic cleanup of old messages (30 days) (Requirement 4.4)
      timeToLiveAttribute: 'ttl',
      
      // Removal policy (adjust for production)
      removalPolicy: RemovalPolicy.DESTROY
    });

    /**
     * Global Secondary Index for cross-session agent queries.
     * 
     * Optional GSI for analytics and reporting use cases:
     * - Query all messages from a specific agent across ALL sessions
     * - Sort by timestamp for chronological analysis
     * - Support for agent performance monitoring
     * 
     * Key structure:
     * - GSI1PK: agentId - Agent identifier
     * - GSI1SK: timestamp - Message timestamp for sorting
     * 
     * Note: This GSI is NOT required for real-time dashboard functionality.
     * It's only needed for analytics, reporting, and cross-session queries.
     * (Requirement 6.3, 6.4)
     */
    this.table.addGlobalSecondaryIndex({
      indexName: 'AgentIndex',
      partitionKey: { 
        name: 'agentId', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'timestamp', 
        type: AttributeType.STRING 
      },
      projectionType: ProjectionType.ALL
    });
  }
}

/**
 * DynamoDB item structure for chat messages.
 * 
 * Stores agent messages with:
 * - Composite sort key for efficient filtering
 * - Duplicate timestamp attribute for convenience
 * - Extensible metadata for future features
 * - TTL for automatic cleanup
 */
export interface ChatMessageItem {
  // Primary key structure with composite sort key
  sessionId: string;              // PK: Session identifier
  agentId_timestamp: string;      // SK: Composite key "{agentId}#{timestamp}"
  
  // Message attributes
  id: string;                     // Unique message ID (UUID)
  agentId: string;                // Agent identifier (extracted from SK for convenience)
  agentName: string;              // Human-readable agent name
  timestamp: string;              // ISO 8601 timestamp (extracted from SK for convenience)
  message: string;                // Message content
  senderType: string;             // "agent" or "user" (for future interactive features)
  
  // Optional metadata (Requirement 6.5)
  metadata?: {
    confidence?: number;          // Confidence score if applicable
    analysisType?: string;        // Type of analysis being performed
    [key: string]: any;           // Extensible for future needs
  };
  
  // TTL for automatic cleanup (30 days) (Requirement 4.4)
  ttl: number;                    // Unix timestamp for expiration
}

/**
 * Example chat message item showing the structure.
 */
export const EXAMPLE_CHAT_MESSAGE: ChatMessageItem = {
  // Primary key with composite sort key
  sessionId: '550e8400-e29b-41d4-a716-446655440000',  // OK: Example UUID for documentation
  agentId_timestamp: 'demand-forecast#2025-12-05T23:35:42.592Z',
  
  // Message attributes
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  agentId: 'demand-forecast',
  agentName: 'Demand Forecast Agent',
  timestamp: '2025-12-05T23:35:42.592Z',
  message: 'Analyzing historical sales data for CMAN-SAW-PRO725...',
  senderType: 'agent',
  
  // Optional metadata
  metadata: {
    analysisType: 'demand-forecasting',
    confidence: 0.85
  },
  
  // TTL: 30 days from creation
  ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
};

/**
 * Access patterns supported by this table design:
 * 
 * 1. Get all messages for a session (chronological)
 *    Query: PK = sessionId
 *    Result: All messages ordered by agentId, then timestamp
 *    (Requirement 6.6)
 *    
 * 2. Get messages from specific agent in a session
 *    Query: PK = sessionId AND SK begins_with "demand-forecast#"
 *    Result: All demand-forecast messages in chronological order
 *    (Requirement 6.7)
 *    
 * 3. Get messages after a timestamp for specific agent
 *    Query: PK = sessionId AND SK begins_with "demand-forecast#" 
 *           AND SK > "demand-forecast#2025-12-05T23:35:00.000Z"
 *    Result: Recent demand-forecast messages
 *    
 * 4. Get latest N messages for a session
 *    Query: PK = sessionId
 *    ScanIndexForward: false
 *    Limit: N
 *    Result: Most recent N messages across all agents
 *    
 * 5. Get all messages from an agent across sessions (requires GSI)
 *    Query GSI1: PK = agentId
 *    Result: All messages from this agent across all sessions
 *    Use case: Analytics and reporting only
 */

/**
 * Query examples for common access patterns.
 */
export const QUERY_EXAMPLES = {
  // Get all messages for a session
  getAllMessages: {
    TableName: 'SessionChat',
    KeyConditionExpression: 'sessionId = :sessionId',
    ExpressionAttributeValues: {
      ':sessionId': 'session-123'
    }
  },
  
  // Get only demand-forecast messages
  getDemandMessages: {
    TableName: 'SessionChat',
    KeyConditionExpression: 'sessionId = :sessionId AND begins_with(agentId_timestamp, :agentPrefix)',
    ExpressionAttributeValues: {
      ':sessionId': 'session-123',
      ':agentPrefix': 'demand-forecast#'
    }
  },
  
  // Get recent messages from competitive-analysis agent
  getRecentCompetitiveMessages: {
    TableName: 'SessionChat',
    KeyConditionExpression: 'sessionId = :sessionId AND agentId_timestamp > :startKey',
    ExpressionAttributeValues: {
      ':sessionId': 'session-123',
      ':startKey': 'competitive-analysis#2025-12-05T23:30:00.000Z'
    }
  },
  
  // Get latest 10 messages (most recent first)
  getLatestMessages: {
    TableName: 'SessionChat',
    KeyConditionExpression: 'sessionId = :sessionId',
    ExpressionAttributeValues: {
      ':sessionId': 'session-123'
    },
    ScanIndexForward: false,
    Limit: 10
  },
  
  // Get all messages from an agent across sessions (GSI query)
  getAgentMessagesAcrossSessions: {
    TableName: 'SessionChat',
    IndexName: 'AgentIndex',
    KeyConditionExpression: 'agentId = :agentId',
    ExpressionAttributeValues: {
      ':agentId': 'demand-forecast'
    },
    ScanIndexForward: false
  }
};
