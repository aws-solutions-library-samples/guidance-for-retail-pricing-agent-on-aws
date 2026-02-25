/**
 * @fileoverview GraphQL operations and types barrel export.
 * 
 * Exports all GraphQL queries, mutations, subscriptions, and types
 * from a single entry point for convenient imports.
 * 
 * Requirements: 6.5
 */

// Query operations
export {
  GET_PRICING_ANALYSIS,
  PRICING_BY_USER_ID,
  LIST_CHAT_MESSAGES
} from './queries';

// Query types
export type {
  GetPricingAnalysisResponse,
  PricingByUserIdResponse,
  ListChatMessagesResponse,
  PricingAnalysisQueryResult,
  ChatMessageQueryResult,
  GetPricingAnalysisVariables,
  PricingByUserIdVariables,
  ListChatMessagesVariables
} from './queries';

// Mutation operations
export {
  CREATE_PRICING,
  APPSYNC_RESOLVER,
  UPDATE_PRICING_STATUS,
  SEND_CHAT_MESSAGE
} from './mutations';

// Mutation types
export type {
  CreatePricingInput,
  CreatePricingResponse,
  AppsyncResolverVariables,
  AppsyncResolverResponse,
  UpdatePricingStatusVariables,
  UpdatePricingStatusResponse,
  SendChatMessageInput,
  SendChatMessageResponse
} from './mutations';

// Subscription operations
export {
  ON_PRICING_ANALYSIS_BY_ID,
  ON_CHAT_MESSAGE_BY_SESSION
} from './subscriptions';

// Subscription types
export type {
  OnPricingAnalysisByIdResponse,
  OnChatMessageBySessionResponse,
  PricingAnalysisSubscriptionResult,
  ChatMessageSubscriptionResult,
  OnPricingAnalysisByIdVariables,
  OnChatMessageBySessionVariables,
  SubscriptionConnectionState,
  SubscriptionError
} from './subscriptions';

// Core types
export type {
  PricingAnalysisStatus,
  PricingAnalysis,
  ChatMessage,
  ConfidenceIntervals,
  DemandForecastData,
  MarketStatistics,
  PrimaryCompetitor,
  CompetitiveAnalysisData,
  MarginAnalysisData,
  FinalRecommendationData,
  AgentInfo,
  ParsedProductData
} from './types';

// Parser utilities
export {
  safeParseJson,
  parseDemandForecast,
  parseCompetitiveAnalysis,
  parseMarginAnalysis,
  parseFinalRecommendation,
  parseProduct,
  parseMetadata,
  isTerminalStatus,
  isSuccessStatus,
  isFailureStatus,
  isInProgressStatus
} from './types';

// Re-export client
export { client, getAuthStatus, testConnection } from './client';
