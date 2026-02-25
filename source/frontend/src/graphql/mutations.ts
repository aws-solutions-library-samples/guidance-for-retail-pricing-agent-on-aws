/**
 * @fileoverview Centralized GraphQL mutation operations for pricing data.
 * 
 * Defines typed mutation operations for creating pricing sessions,
 * invoking resolvers, and managing pricing analysis workflows.
 * 
 * Requirements: 6.2, 6.4, 6.5
 */

/**
 * Mutation to create a new pricing session.
 * Creates a new record in the PricingOrchestration table.
 */
export const CREATE_PRICING = `
  mutation CreatePricing($input: CreatePricingInput!) {
    createPricing(input: $input) {
      id
      userId
      product
      status
      createdAt
    }
  }
`;

/**
 * Mutation to invoke the AppSync resolver for pricing analysis.
 * Triggers the Step Functions workflow for multi-agent orchestration.
 */
export const APPSYNC_RESOLVER = `
  mutation AppsyncResolver(
    $userID: String!
    $sessionID: String!
    $product: AWSJSON!
  ) {
    appsyncResolver(
      userID: $userID
      sessionID: $sessionID
      product: $product
    ) {
      status
      message
      executionArn
      sessionId
    }
  }
`;

/**
 * Mutation to update pricing session status.
 * Updates the status field of an existing pricing record.
 */
export const UPDATE_PRICING_STATUS = `
  mutation UpdatePricingStatus($sessionId: ID!, $status: String!) {
    updatePricingStatus(sessionId: $sessionId, status: $status) {
      id
      sessionId
      status
      updatedAt
    }
  }
`;

/**
 * Mutation to send a chat message in a pricing session.
 * Creates a new chat message record associated with the session.
 */
export const SEND_CHAT_MESSAGE = `
  mutation SendChatMessage($input: SendChatMessageInput!) {
    sendChatMessage(input: $input) {
      id
      sessionId
      timestamp
      agentId
      agentName
      message
      senderType
      metadata
    }
  }
`;

/**
 * Input type for CreatePricing mutation.
 */
export interface CreatePricingInput {
  /** Product data as JSON string */
  product: string;
}

/**
 * Response type for CreatePricing mutation.
 */
export interface CreatePricingResponse {
  createPricing: {
    /** Created session ID */
    id: string;
    /** User ID */
    userId: string;
    /** Product data as JSON string */
    product: string;
    /** Initial status */
    status: 'initiated' | 'in_progress' | 'success' | 'error';
    /** Creation timestamp */
    createdAt: string;
  };
}

/**
 * Variables for AppsyncResolver mutation.
 */
export interface AppsyncResolverVariables {
  /** User identifier */
  userID: string;
  /** Session identifier */
  sessionID: string;
  /** Product data as JSON string */
  product: string;
}

/**
 * Response type for AppsyncResolver mutation.
 */
export interface AppsyncResolverResponse {
  appsyncResolver: {
    /** Operation status */
    status: string;
    /** Status message */
    message: string;
    /** Step Functions execution ARN */
    executionArn?: string;
    /** Session identifier */
    sessionId?: string;
  };
}

/**
 * Variables for UpdatePricingStatus mutation.
 */
export interface UpdatePricingStatusVariables {
  /** Session identifier */
  sessionId: string;
  /** New status value */
  status: string;
}

/**
 * Response type for UpdatePricingStatus mutation.
 */
export interface UpdatePricingStatusResponse {
  updatePricingStatus: {
    /** Record ID */
    id: string;
    /** Session ID */
    sessionId: string;
    /** Updated status */
    status: string;
    /** Update timestamp */
    updatedAt: string;
  };
}

/**
 * Input type for SendChatMessage mutation.
 */
export interface SendChatMessageInput {
  /** Session identifier */
  sessionId: string;
  /** Agent identifier */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Message content */
  message: string;
  /** Sender type */
  senderType: 'agent' | 'system';
  /** Optional metadata as JSON string */
  metadata?: string;
}

/**
 * Response type for SendChatMessage mutation.
 */
export interface SendChatMessageResponse {
  sendChatMessage: {
    /** Message ID */
    id: string;
    /** Session ID */
    sessionId: string;
    /** Message timestamp */
    timestamp: string;
    /** Agent ID */
    agentId: string;
    /** Agent name */
    agentName: string;
    /** Message content */
    message: string;
    /** Sender type */
    senderType: 'agent' | 'system';
    /** Optional metadata */
    metadata?: string;
  };
}
