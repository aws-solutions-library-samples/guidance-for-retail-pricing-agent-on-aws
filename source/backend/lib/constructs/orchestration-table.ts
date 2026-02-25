/**
 * @fileoverview DynamoDB table construct for multi-agent orchestration sessions.
 * 
 * Implements session management with support for real-time updates via DynamoDB Streams
 * and GraphQL subscriptions. Stores session metadata, agent results, and bot responses.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode, StreamViewType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export class OrchestrationTableConstruct extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    /**
     * DynamoDB table for orchestration session management.
     * 
     * Primary key design:
     * - PK: SESSION#{sessionId} - Unique session identifier
     * - SK: METADATA - Fixed sort key for session metadata
     * 
     * This design allows:
     * - Direct session lookup by sessionId
     * - Future expansion with additional sort keys (e.g., AGENT_RESULT#{agentId})
     * - Efficient DynamoDB Streams processing for subscriptions
     */
    this.table = new Table(this, 'OrchestrationTable', {
      tableName: 'PricingOrchestration',
      
      // Primary key for session-based access
      partitionKey: { 
        name: 'PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'SK', 
        type: AttributeType.STRING 
      },
      
      // Serverless billing for cost optimization (Requirement 5.1)
      billingMode: BillingMode.PAY_PER_REQUEST,
      
      // Enable streams for real-time GraphQL subscriptions (Requirement 5.2)
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      
      // Point-in-time recovery for data protection (Requirement 5.3)
      pointInTimeRecovery: true,
      
      // TTL for automatic cleanup of old sessions (30 days)
      timeToLiveAttribute: 'ttl',
      
      // Removal policy (adjust for production)
      removalPolicy: RemovalPolicy.DESTROY
    });

    /**
     * Global Secondary Index for user-based session queries.
     * 
     * Enables:
     * - Query all sessions for a specific user
     * - Sort by session creation timestamp (most recent first)
     * - Support for pagination across user's sessions
     * 
     * Key structure:
     * - GSI1PK: USER#{userId} - User identifier
     * - GSI1SK: SESSION#{timestamp} - Session creation time for sorting
     */
    this.table.addGlobalSecondaryIndex({
      indexName: 'UserSessionIndex',
      partitionKey: { 
        name: 'GSI1PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI1SK', 
        type: AttributeType.STRING 
      },
      projectionType: ProjectionType.ALL
    });
  }
}

/**
 * DynamoDB item structure for orchestration sessions.
 * 
 * Stores complete session state including:
 * - Session metadata (id, user, product, timestamps)
 * - Workflow status (initiated, in-progress, success, error)
 * - Agent results and analysis data
 * - Bot responses (agent conversation messages)
 * - Error details if workflow fails
 */
export interface OrchestrationSessionItem {
  // Primary key structure
  PK: string;                    // SESSION#{sessionId}
  SK: string;                    // METADATA (fixed)
  
  // GSI1: User-based session queries
  GSI1PK: string;               // USER#{userId}
  GSI1SK: string;               // SESSION#{timestamp}
  
  // Session metadata
  entityType: 'SESSION';
  sessionId: string;            // UUID for session identifier
  userId: string;               // User who initiated the analysis
  productId: string;            // Product being analyzed
  
  // Product data
  product: {
    product_id: string;
    category: string;
    cost: number;
    MSRP: number;
    MAP: number;
    [key: string]: any;
  };
  
  // Workflow status (Requirement 5.1, 5.2, 5.3)
  status: 'initiated' | 'in-progress' | 'success' | 'error' | 'partial_success';
  
  // Current agent being executed
  currentAgent?: string;
  agentStatus?: string;
  
  // Analysis results
  analysisData?: {
    demandForecast?: any;
    competitiveAnalysis?: any;
    marginAnalysis?: any;
    [key: string]: any;
  };
  
  // Bot responses - agent conversation messages (Requirement 5.2)
  botResponses: Array<{
    agentId: string;
    agentName: string;
    message: string;
    timestamp: string;
  }>;
  
  // Error details if workflow fails (Requirement 5.3)
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  
  // Timestamps
  createdAt: string;            // ISO timestamp when session created
  updatedAt: string;            // ISO timestamp of last update
  
  // TTL for automatic cleanup (30 days)
  ttl: number;                  // Unix timestamp for expiration
}

/**
 * Example orchestration session item showing the structure.
 */
export const EXAMPLE_SESSION_ITEM: OrchestrationSessionItem = {
  // Primary key structure
  PK: 'SESSION#550e8400-e29b-41d4-a716-446655440000',  // OK: Example UUID for documentation
  SK: 'METADATA',
  
  // GSI1: User-based queries
  GSI1PK: 'USER#user123',
  GSI1SK: 'SESSION#2024-01-15T10:30:00.000Z',
  
  // Session metadata
  entityType: 'SESSION',
  sessionId: '550e8400-e29b-41d4-a716-446655440000',  // OK: Example UUID for documentation
  userId: 'user123',
  productId: 'CMAN-SAW-PRO725',
  
  // Product data
  product: {
    product_id: 'CMAN-SAW-PRO725',
    category: 'powertools',
    cost: 89.99,
    MSRP: 179.99,
    MAP: 149.99
  },
  
  // Workflow status
  status: 'in-progress',
  currentAgent: 'Demand Forecast Agent',
  agentStatus: 'started',
  
  // Analysis results (populated as agents complete)
  analysisData: {
    demandForecast: {
      forecastedDemand: 1250,
      confidence: 0.85,
      seasonalFactor: 1.2
    }
  },
  
  // Bot responses - agent conversation messages
  botResponses: [
    {
      agentId: 'agentcore-dev-demandforecastagent',
      agentName: 'Demand Forecast Agent',
      message: 'Analyzing historical sales data for CMAN-SAW-PRO725...',
      timestamp: '2024-01-15T10:30:05.000Z'
    },
    {
      agentId: 'agentcore-dev-demandforecastagent',
      agentName: 'Demand Forecast Agent',
      message: 'Detected strong seasonal demand pattern with 20% increase in Q4.',
      timestamp: '2024-01-15T10:30:10.000Z'
    }
  ],
  
  // Timestamps
  createdAt: '2024-01-15T10:30:00.000Z',
  updatedAt: '2024-01-15T10:30:10.000Z',
  
  // TTL: 30 days from creation
  ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
};

/**
 * Access patterns supported by this table design:
 * 
 * 1. Get session by ID (direct lookup)
 *    PK = SESSION#{sessionId}
 *    SK = METADATA
 *    
 * 2. List all sessions for a user (paginated)
 *    GSI1PK = USER#{userId}
 *    GSI1SK begins_with SESSION#
 *    ScanIndexForward = false (most recent first)
 *    
 * 3. Update session status during workflow
 *    PK = SESSION#{sessionId}
 *    SK = METADATA
 *    UpdateExpression to modify status, analysisData, botResponses
 *    
 * 4. Append bot responses during agent execution
 *    PK = SESSION#{sessionId}
 *    SK = METADATA
 *    UpdateExpression to append to botResponses array
 *    
 * 5. DynamoDB Streams trigger GraphQL subscriptions
 *    Stream captures NEW_AND_OLD_IMAGES for all updates
 *    Lambda processes stream records and publishes to AppSync
 */
