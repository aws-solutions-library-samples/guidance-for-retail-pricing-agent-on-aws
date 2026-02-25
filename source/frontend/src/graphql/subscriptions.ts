/**
 * @fileoverview Centralized GraphQL subscription operations for real-time updates.
 * 
 * Defines typed subscription operations for receiving real-time pricing analysis
 * updates and chat messages from the AppSync GraphQL API via WebSocket.
 * 
 * Requirements: 6.3, 6.4, 6.5
 */

import type { PricingAnalysisStatus } from './queries';

/**
 * Subscription to receive real-time pricing analysis updates by session ID.
 * Receives updates whenever the PRICING# record is modified via updatePricingAnalysis mutation.
 * 
 * Note: AgentCore agents update PRICING# records via AppSync mutations, which trigger
 * this subscription for real-time updates to the frontend.
 */
export const ON_PRICING_ANALYSIS_BY_ID = `
  subscription OnPricingAnalysisById($sessionId: String!) {
    onPricingAnalysisById(sessionId: $sessionId) {
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
 * Subscription to receive real-time chat messages for a session.
 * Receives new messages as they are created by agents.
 */
export const ON_CHAT_MESSAGE_BY_SESSION = `
  subscription OnChatMessageBySession($sessionId: ID!) {
    onChatMessageBySession(sessionId: $sessionId) {
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
 * Response type for OnPricingAnalysisById subscription.
 */
export interface OnPricingAnalysisByIdResponse {
  onPricingAnalysisById: PricingAnalysisSubscriptionResult | null;
}

/**
 * Response type for OnChatMessageBySession subscription.
 */
export interface OnChatMessageBySessionResponse {
  onChatMessageBySession: ChatMessageSubscriptionResult | null;
}

/**
 * Pricing analysis result from subscription.
 */
export interface PricingAnalysisSubscriptionResult {
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
  /** Demand forecast data as JSON string */
  demandForecast?: string;
  /** Competitive analysis data as JSON string */
  competitiveAnalysis?: string;
  /** Margin analysis data as JSON string */
  marginAnalysis?: string;
  /** Final recommendation data as JSON string */
  finalRecommendation?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Chat message result from subscription.
 */
export interface ChatMessageSubscriptionResult {
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
 * Subscription variables for OnPricingAnalysisById.
 */
export interface OnPricingAnalysisByIdVariables {
  sessionId: string;
}

/**
 * Subscription variables for OnChatMessageBySession.
 */
export interface OnChatMessageBySessionVariables {
  sessionId: string;
}

/**
 * Subscription connection state.
 */
export type SubscriptionConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * Subscription error details.
 */
export interface SubscriptionError {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Error timestamp */
  timestamp: string;
}
