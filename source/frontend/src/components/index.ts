/**
 * @fileoverview Component exports for product catalog management.
 * 
 * Exports all components related to product catalog functionality
 * including the main ProductSelector container and all child components.
 */

export { ProductSelector } from './ProductSelector';
export type { ProductSelectorProps } from './ProductSelector';

export { CategorySelector } from './CategorySelector';
export type { CategorySelectorProps } from './CategorySelector';

export { ProductCard } from './ProductCard';
export type { ProductCardProps } from './ProductCard';

export { ProductCatalogGrid } from './ProductCatalogGrid';
export type { ProductCatalogGridProps } from './ProductCatalogGrid';

export { ProductFilters } from './ProductFilters';
export type { ProductFiltersProps } from './ProductFilters';

export { ProductSearch } from './ProductSearch';
export type { ProductSearchProps } from './ProductSearch';

export { ProductDetailModal } from './ProductDetailModal';
export type { ProductDetailModalProps } from './ProductDetailModal';

export { ProfileDropdown } from './ProfileDropdown';
export type { ProfileDropdownProps } from './ProfileDropdown';

export { ProtectedRoute } from './ProtectedRoute';
export type { ProtectedRouteProps } from '../types/auth-types';

export { UserProfile } from './UserProfile';

export { AppLayout } from './AppLayout';
export type { AppLayoutProps } from './AppLayout';

export { AuthTransition } from './AuthTransition';
export type { AuthTransitionProps } from './AuthTransition';

export { AuthButton } from './AuthButton';
export type { AuthButtonProps } from './AuthButton';

export { 
  CompetitiveAnalysisPanel,
  CompetitiveAnalysisResults 
} from './CompetitiveAnalysisResults';
export type { 
  CompetitiveAnalysisPanelProps,
  CompetitiveAnalysis,
  MarketStats,
  PrimaryCompetitor,
  CompetitorScreenshot
} from './CompetitiveAnalysisResults';

export { DemoResetButton } from './DemoResetButton';
export type { DemoResetButtonProps } from './DemoResetButton';

export { ProductDetailsCard } from './ProductDetailsCard';
export type { ProductDetailsCardProps } from './ProductDetailsCard';

export { FinalRecommendations } from './FinalRecommendations';
export type { FinalRecommendationsProps } from './FinalRecommendations';

export { FinalRecommendationsPanel } from './FinalRecommendationsPanel';
export type { FinalRecommendationsPanelProps } from './FinalRecommendationsPanel';

export { DemandAnalysisPanel } from './DemandAnalysisPanel';
export type { 
  DemandAnalysisPanelProps,
  DemandAnalysisResult,
  ConfidenceIntervals
} from './DemandAnalysisPanel';

export { MarginAnalysisPanel } from './MarginAnalysisPanel';
export type {
  MarginAnalysisPanelProps,
  MarginAnalysisResult
} from './MarginAnalysisPanel';

export { AgentChatPanel } from './AgentChatPanel';
export type {
  AgentChatPanelProps,
  ChatMessage,
  AgentType
} from './AgentChatPanel';

export { WorkflowVisualization } from './WorkflowVisualization';
export type {
  WorkflowVisualizationProps,
  AgentInfo,
  AgentStatus
} from './WorkflowVisualization';

export { ErrorDisplay } from './ErrorDisplay';
export type {
  ErrorDisplayProps,
  ErrorDetails
} from './ErrorDisplay';

export { ExportButton } from './ExportButton';
export type { ExportButtonProps } from './ExportButton';

export { ErrorBoundary } from './ErrorBoundary';
