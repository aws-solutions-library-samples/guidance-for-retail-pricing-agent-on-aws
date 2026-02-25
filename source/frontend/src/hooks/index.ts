/**
 * @fileoverview Barrel export for all application hooks.
 * 
 * Provides a single import point for all hooks including
 * authentication, product catalog management, and GraphQL integration.
 */

// Authentication hooks
export { 
  useAuth,
  default as useAuthDefault
} from './useAuth';

export {
  useTokenRefresh,
  default as useTokenRefreshDefault
} from './useTokenRefresh';

export {
  useSessionPersistence,
  default as useSessionPersistenceDefault
} from './useSessionPersistence';

// Main catalog hook
export { 
  useProductCatalog, 
  useCategories 
} from './useProductCatalog';

// Individual specialized hooks
export { 
  useProducts, 
  type ProductFilter, 
  type UseProductsResult 
} from './useProducts';

export { 
  useCategoryStats, 
  type CategoryStats,
  type UseCategoryStatsResult 
} from './useCategoryStats';

export { 
  useCategoryFilters, 
  type CategoryFilterOptions,
  type UseCategoryFiltersResult 
} from './useCategoryFilters';

// Demo reset hook
export {
  useDemoReset,
  type ResetDemoResponse,
  type ResetDemoError
} from './useDemoReset';

// Pricing subscription hook
export {
  usePricingSubscription,
  type PricingSession,
  type PricingStatus,
  type SubscriptionError,
  type UsePricingSubscriptionResult,
  type UsePricingSubscriptionOptions
} from './usePricingSubscription';

// Pricing service hook
export {
  usePricingService,
  type PricingSessionWithParsedProduct
} from './usePricingService';

// Pricing analysis hook with load-then-subscribe pattern
export {
  usePricingAnalysis,
  calculateBackoffDelay,
  mergePricingAnalysisData,
  type UsePricingAnalysisOptions,
  type UsePricingAnalysisResult
} from './usePricingAnalysis';

// Chat messages hook with load-then-subscribe pattern
export {
  useChatMessages,
  sortMessagesByTimestamp,
  appendMessage,
  type UseChatMessagesOptions,
  type UseChatMessagesResult
} from './useChatMessages';
