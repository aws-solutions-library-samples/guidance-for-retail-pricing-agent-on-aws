/**
 * @fileoverview Centralized GraphQL query operations for pricing data.
 * 
 * Defines typed query operations for fetching pricing analysis data,
 * user sessions, and chat messages from the AppSync GraphQL API.
 * 
 * Requirements: 6.1, 6.4, 6.5
 */

/**
 * Query to fetch a single pricing analysis record by sessionId.
 * Returns PRICING# record data including all analysis results.
 * 
 * Note: PRICING# records are updated by AgentCore agents via AppSync mutations,
 * which trigger the onPricingAnalysisById subscription for real-time updates.
 */
export const GET_PRICING_ANALYSIS = `
  query GetPricingAnalysis($sessionId: ID!) {
    getPricingAnalysis(sessionId: $sessionId) {
      id
      sessionId
      userId
      productId
      product
      status
      demandForecast
      competitiveAnalysis
      marginAnalysis
      finalRecommendation
      createdAt
      updatedAt
    }
  }
`;

/**
 * Query to fetch pricing sessions for a specific user.
 * Returns PricingSession records (from PRICING# items) with pagination support.
 * Note: This returns PricingSession type, not PricingAnalysis type.
 */
export const PRICING_BY_USER_ID = `
  query PricingByUserId($userId: ID!, $limit: Int, $nextToken: String) {
    pricingByUserId(userId: $userId, limit: $limit, nextToken: $nextToken) {
      items {
        id
        sessionId
        userId
        productId
        product
        status
        currentAgent
        agentStatus
        analysisData {
          demandForecast
          competitiveAnalysis
          marginAnalysis
          supervisorResults
        }
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

/**
 * Query to fetch chat messages for a specific session.
 * Returns messages in chronological order with pagination support.
 */
export const LIST_CHAT_MESSAGES = `
  query ListChatMessages($sessionId: ID!, $limit: Int, $nextToken: String) {
    listChatMessages(sessionId: $sessionId, limit: $limit, nextToken: $nextToken) {
      items {
        id
        sessionId
        timestamp
        agentId
        agentName
        message
        senderType
        metadata
      }
      nextToken
    }
  }
`;

/**
 * Response type for GetPricingAnalysis query.
 */
export interface GetPricingAnalysisResponse {
  getPricingAnalysis: PricingAnalysisQueryResult | null;
}

/**
 * Response type for PricingByUserId query.
 */
export interface PricingByUserIdResponse {
  pricingByUserId: {
    items: PricingAnalysisQueryResult[];
    nextToken: string | null;
  };
}

/**
 * Response type for ListChatMessages query.
 */
export interface ListChatMessagesResponse {
  listChatMessages: {
    items: ChatMessageQueryResult[];
    nextToken: string | null;
  };
}

/**
 * Analysis data structure from PricingSession.
 */
export interface AnalysisData {
  /** Demand forecast data as JSON string */
  demandForecast?: string;
  /** Competitive analysis data as JSON string */
  competitiveAnalysis?: string;
  /** Margin analysis data as JSON string */
  marginAnalysis?: string;
  /** Supervisor results data as JSON string */
  supervisorResults?: string;
}

/**
 * Pricing analysis result from query (PRICING# records).
 * This matches the PricingAnalysis type from GraphQL schema.
 * 
 * Note: PRICING# records are updated by AgentCore agents via AppSync mutations,
 * which trigger the onPricingAnalysisById subscription for real-time updates.
 */
export interface PricingAnalysisQueryResult {
  /** Unique record identifier */
  id: string;
  /** Session identifier */
  sessionId: string;
  /** User identifier */
  userId: string;
  /** Product identifier */
  productId: string;
  /** Product data as JSON string */
  product: string;
  /** Current analysis status */
  status: PricingAnalysisStatus;
  /** Currently active agent */
  currentAgent?: string;
  /** Current agent status */
  agentStatus?: string;
  /** Nested analysis data (from PricingSession type) */
  analysisData?: AnalysisData;
  /** Demand forecast data as JSON string (from PricingAnalysis type) */
  demandForecast?: string;
  /** Competitive analysis data as JSON string (from PricingAnalysis type) */
  competitiveAnalysis?: string;
  /** Margin analysis data as JSON string (from PricingAnalysis type) */
  marginAnalysis?: string;
  /** Final recommendation data as JSON string (from PricingAnalysis type) */
  finalRecommendation?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Chat message result from query.
 */
export interface ChatMessageQueryResult {
  /** Unique message identifier */
  id: string;
  /** Session identifier */
  sessionId: string;
  /** Message timestamp */
  timestamp: string;
  /** Agent identifier */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Message content */
  message: string;
  /** Sender type (agent or system) */
  senderType: 'agent' | 'system';
  /** Optional metadata as JSON string */
  metadata?: string;
}

/**
 * Pricing analysis status values.
 */
export type PricingAnalysisStatus =
  | 'initiated'
  | 'in_progress'
  | 'demand_analysis_complete'
  | 'competitive_analysis_complete'
  | 'margin_analysis_complete'
  | 'completed'
  | 'failed'
  | 'success'
  | 'error';

/**
 * Query variables for GetPricingAnalysis.
 */
export interface GetPricingAnalysisVariables {
  sessionId: string;
}

/**
 * Query variables for PricingByUserId.
 */
export interface PricingByUserIdVariables {
  userId: string;
  limit?: number;
  nextToken?: string;
}

/**
 * Query variables for ListChatMessages.
 */
export interface ListChatMessagesVariables {
  sessionId: string;
  limit?: number;
  nextToken?: string;
}
