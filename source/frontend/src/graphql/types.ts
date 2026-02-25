/**
 * @fileoverview GraphQL type definitions for pricing analysis data.
 * 
 * Defines TypeScript interfaces for pricing analysis records, chat messages,
 * and parsed data types that match the backend GraphQL schema.
 * 
 * Requirements: 6.4
 */

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
 * Main pricing analysis interface matching the GraphQL schema.
 * Represents a PRICING# record from the PricingOrchestration table.
 */
export interface PricingAnalysis {
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
 * Chat message interface matching the GraphQL schema.
 * Represents a CHAT# record from the PricingOrchestration table.
 */
export interface ChatMessage {
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
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Confidence intervals for demand forecast predictions.
 */
export interface ConfidenceIntervals {
  /** 10th percentile price (conservative estimate) */
  p10: number;
  /** 50th percentile price (median estimate) */
  p50: number;
  /** 90th percentile price (optimistic estimate) */
  p90: number;
}

/**
 * Parsed demand forecast data from the demandForecast JSON field.
 */
export interface DemandForecastData {
  /** Recommended price based on demand analysis */
  recommendedPrice: number;
  /** Minimum price floor */
  priceFloor: number;
  /** Maximum price ceiling */
  priceCeiling: number;
  /** Confidence score (0-100) */
  confidence: number;
  /** Confidence intervals for price predictions */
  confidenceIntervals: ConfidenceIntervals;
  /** Detailed pricing rationale text */
  rationale: string;
  /** Optional historical demand data */
  historicalData?: Array<{ date: string; demand: number }>;
}

/**
 * Market statistics from competitive analysis.
 */
export interface MarketStatistics {
  /** Lowest market price */
  min: number;
  /** Highest market price */
  max: number;
  /** Average market price */
  average: number;
  /** Median market price */
  median: number;
  /** Market volatility index (0-1) */
  volatility?: number;
  /** Number of competitors analyzed */
  competitorCount?: number;
}

/**
 * Primary competitor information.
 */
export interface PrimaryCompetitor {
  /** Competitor name */
  name: string;
  /** Competitor's price point */
  price: number;
  /** Match confidence score (0-100) */
  matchConfidence: number;
  /** Market share estimate (0-1) */
  marketShare?: number;
  /** Competitive advantages */
  advantages?: string[];
}

/**
 * Parsed competitive analysis data from the competitiveAnalysis JSON field.
 */
export interface CompetitiveAnalysisData {
  /** Market statistics */
  marketStats: MarketStatistics;
  /** Primary competitor information */
  primaryCompetitor: PrimaryCompetitor;
  /** Market position assessment */
  marketPosition: 'premium' | 'mid-premium' | 'mid-range' | 'value';
  /** Recommended pricing strategy */
  pricingStrategy: 'undercut' | 'match' | 'premium_position' | 'value_leader';
  /** Recommended base price */
  recommendedPrice?: number;
  /** Confidence score (0-100) */
  confidence?: number;
  /** ML evidence supporting the analysis */
  mlEvidence?: string[];
}

/**
 * Parsed margin analysis data from the marginAnalysis JSON field.
 */
export interface MarginAnalysisData {
  /** Suggested price from margin analysis */
  suggestedPrice: number;
  /** Minimum acceptable price */
  minPrice: number;
  /** Maximum acceptable price */
  maxPrice: number;
  /** Calculated margin percentage */
  calculatedMargin: number;
  /** Base margin rate */
  baseMarginRate: number;
  /** Adjusted margin rate after rules */
  adjustedMarginRate: number;
  /** MAP compliance status */
  mapCompliant: boolean;
  /** Margin compliance status */
  marginCompliant: boolean;
  /** Whether manual review is required */
  requiresReview: boolean;
  /** Reason for manual review */
  reviewReason?: string;
  /** Compliance details */
  complianceDetails?: {
    mapThreshold: number;
    marginThreshold: number;
    violations: string[];
  };
}

/**
 * Parsed final recommendation data from the finalRecommendation JSON field.
 */
export interface FinalRecommendationData {
  /** Suggested final price */
  suggestedPrice: number;
  /** Recommended price range */
  priceRange: {
    /** Minimum recommended price */
    min: number;
    /** Maximum recommended price */
    max: number;
  };
  /** Overall confidence score (0-100) */
  confidence: number;
  /** MAP compliance status */
  mapCompliant: boolean;
  /** Margin compliance status */
  marginCompliant: boolean;
  /** Whether manual review is required */
  requiresReview: boolean;
  /** Reason for manual review */
  reviewReason?: string;
  /** Summary of the recommendation */
  summary?: string;
  /** Contributing factors to the recommendation */
  factors?: {
    demandWeight: number;
    competitiveWeight: number;
    marginWeight: number;
  };
}

/**
 * Agent information for workflow visualization.
 */
export interface AgentInfo {
  /** Agent identifier */
  id: string;
  /** Agent display name */
  name: string;
  /** Agent status */
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  /** Start timestamp */
  startedAt?: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Parsed product data from the product JSON field.
 */
export interface ParsedProductData {
  /** Product identifier */
  product_id: string;
  /** Product category */
  category: string;
  /** Product subcategory */
  subcategory: string;
  /** Product tier/role */
  role: string;
  /** Vendor name */
  vendor: string;
  /** Cost price */
  cost: number;
  /** MSRP */
  MSRP: number;
  /** MAP */
  MAP: number;
  /** Year target */
  yearTarget: number;
  /** Product features */
  features: string[];
  /** Image URL */
  imageUrl: string;
  /** Category-specific attributes */
  attributes: Record<string, unknown>;
}

/**
 * Helper function to safely parse JSON string to typed object.
 * 
 * @param jsonString - JSON string to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed object or default value
 */
export function safeParseJson<T>(jsonString: string | undefined | null, defaultValue: T): T {
  if (!jsonString) {
    return defaultValue;
  }
  
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return defaultValue;
  }
}

/**
 * Parses demand forecast JSON string to typed object.
 * 
 * Handles the actual backend data structure and maps field names correctly.
 * 
 * @param demandForecast - JSON string from GraphQL response
 * @returns Parsed DemandForecastData or null
 */
export function parseDemandForecast(demandForecast: string | undefined | null): DemandForecastData | null {
  const rawData = safeParseJson<any>(demandForecast, null);
  
  if (!rawData) {
    return null;
  }
  
  // Map backend field names to frontend expectations
  return {
    recommendedPrice: rawData.recommended_price || 0,
    priceFloor: rawData.price_floor || 0,
    priceCeiling: rawData.price_ceiling || 0,
    confidence: (rawData.current_confidence_score || 0) * 100, // Convert 0-1 to 0-100
    confidenceIntervals: {
      p10: rawData.confidence_p10 || 0,
      p50: rawData.confidence_p50 || 0,
      p90: rawData.confidence_p90 || 0
    },
    rationale: rawData.pricing_rationale || 'No rationale provided',
    historicalData: rawData.historical_data
  };
}

/**
 * Parses competitive analysis JSON string to typed object.
 * 
 * Handles the actual backend data structure where primary_competitor is a string,
 * not an object. Transforms the backend format to match frontend expectations.
 * 
 * @param competitiveAnalysis - JSON string from GraphQL response
 * @returns Parsed CompetitiveAnalysisData or null
 */
export function parseCompetitiveAnalysis(competitiveAnalysis: string | undefined | null): CompetitiveAnalysisData | null {
  const rawData = safeParseJson<any>(competitiveAnalysis, null);
  
  if (!rawData) {
    return null;
  }
  
  // Transform backend data structure to frontend expectations
  // Backend sends primary_competitor as a string, but frontend expects an object
  const primaryCompetitorName = typeof rawData.primary_competitor === 'string' 
    ? rawData.primary_competitor 
    : rawData.primary_competitor?.name || 'Unknown';
  
  // Extract market statistics with proper field mapping
  const marketStats: MarketStatistics = {
    min: rawData.market_statistics?.lowest_market_price || rawData.market_statistics?.min || 0,
    max: rawData.market_statistics?.highest_market_price || rawData.market_statistics?.max || 0,
    average: rawData.market_statistics?.average_market_price || rawData.market_statistics?.average || 0,
    median: rawData.market_statistics?.median_market_price || rawData.market_statistics?.median || 0,
    volatility: rawData.market_statistics?.market_volatility,
    competitorCount: rawData.competitor_count || rawData.market_statistics?.competitor_count
  };
  
  // Create primary competitor object from backend data
  const primaryCompetitor: PrimaryCompetitor = {
    name: primaryCompetitorName,
    price: rawData.recommended_price || marketStats.median || 0,
    matchConfidence: (rawData.confidence_score || 0) * 100, // Convert 0-1 to 0-100
    marketShare: rawData.market_share_implications?.estimated_market_share,
    advantages: rawData.competitive_advantages
  };
  
  // Map backend field names to frontend expectations
  return {
    marketStats,
    primaryCompetitor,
    marketPosition: rawData.market_position_assessment || 'mid-range',
    pricingStrategy: rawData.price_position_strategy || 'match',
    recommendedPrice: rawData.recommended_price,
    confidence: (rawData.confidence_score || 0) * 100, // Convert 0-1 to 0-100
    mlEvidence: rawData.competitive_advantages
  };
}

/**
 * Parses margin analysis JSON string to typed object.
 * 
 * Handles the actual backend data structure and maps field names correctly.
 * 
 * @param marginAnalysis - JSON string from GraphQL response
 * @returns Parsed MarginAnalysisData or null
 */
export function parseMarginAnalysis(marginAnalysis: string | undefined | null): MarginAnalysisData | null {
  const rawData = safeParseJson<any>(marginAnalysis, null);
  
  if (!rawData) {
    return null;
  }
  
  // Extract pricing boundaries
  const boundaries = rawData.pricing_boundaries || {};
  
  // Map backend field names to frontend expectations
  return {
    suggestedPrice: rawData.suggested_price || 0,
    minPrice: boundaries.minimum_price || 0,
    maxPrice: boundaries.maximum_price || 0,
    calculatedMargin: (rawData.calculated_margin || 0) * 100, // Convert 0-1 to 0-100
    baseMarginRate: (rawData.margin_analysis?.min_margin || 0) * 100, // Convert 0-1 to 0-100
    adjustedMarginRate: (rawData.margin_analysis?.target_margin || 0) * 100, // Convert 0-1 to 0-100
    mapCompliant: rawData.is_map_compliant || false,
    marginCompliant: rawData.is_margin_compliant || false,
    requiresReview: rawData.requires_review || false,
    reviewReason: rawData.review_reasons?.join(', '),
    complianceDetails: {
      mapThreshold: rawData.compliance_details?.map_check?.map_price || 0,
      marginThreshold: (rawData.compliance_details?.margin_check?.min_margin || 0) * 100,
      violations: rawData.review_reasons || []
    }
  };
}

/**
 * Parses final recommendation JSON string to typed object.
 * 
 * Handles the actual backend data structure and maps field names correctly.
 * 
 * @param finalRecommendation - JSON string from GraphQL response
 * @returns Parsed FinalRecommendationData or null
 */
export function parseFinalRecommendation(finalRecommendation: string | undefined | null): FinalRecommendationData | null {
  const rawData = safeParseJson<any>(finalRecommendation, null);
  
  if (!rawData) {
    return null;
  }
  
  // Map backend field names to frontend expectations
  return {
    suggestedPrice: rawData.recommended_price || 0,
    priceRange: {
      min: rawData.price_range?.min || 0,
      max: rawData.price_range?.max || 0
    },
    confidence: (rawData.confidence || 0) * 100, // Convert 0-1 to 0-100
    mapCompliant: true, // Default to true if not specified
    marginCompliant: true, // Default to true if not specified
    requiresReview: false, // Default to false if not specified
    reviewReason: undefined,
    summary: undefined,
    factors: undefined
  };
}

/**
 * Parses product JSON string to typed object.
 * 
 * @param product - JSON string from GraphQL response
 * @returns Parsed ParsedProductData or null
 */
export function parseProduct(product: string | undefined | null): ParsedProductData | null {
  return safeParseJson<ParsedProductData | null>(product, null);
}

/**
 * Parses chat message metadata JSON string to typed object.
 * 
 * @param metadata - JSON string from GraphQL response
 * @returns Parsed metadata object or empty object
 */
export function parseMetadata(metadata: string | undefined | null): Record<string, unknown> {
  return safeParseJson<Record<string, unknown>>(metadata, {});
}

/**
 * Checks if a pricing analysis status is terminal (completed or failed).
 * 
 * @param status - Pricing analysis status
 * @returns True if status is terminal
 */
export function isTerminalStatus(status: PricingAnalysisStatus): boolean {
  return ['completed', 'failed', 'success', 'error'].includes(status);
}

/**
 * Checks if a pricing analysis status indicates success.
 * 
 * @param status - Pricing analysis status
 * @returns True if status indicates success
 */
export function isSuccessStatus(status: PricingAnalysisStatus): boolean {
  return ['completed', 'success'].includes(status);
}

/**
 * Checks if a pricing analysis status indicates failure.
 * 
 * @param status - Pricing analysis status
 * @returns True if status indicates failure
 */
export function isFailureStatus(status: PricingAnalysisStatus): boolean {
  return ['failed', 'error'].includes(status);
}

/**
 * Checks if a pricing analysis status indicates in-progress.
 * 
 * @param status - Pricing analysis status
 * @returns True if status indicates in-progress
 */
export function isInProgressStatus(status: PricingAnalysisStatus): boolean {
  return [
    'initiated',
    'in_progress',
    'demand_analysis_complete',
    'competitive_analysis_complete',
    'margin_analysis_complete'
  ].includes(status);
}

/**
 * Agent status type for workflow visualization.
 */
export type AgentStatusType = 'pending' | 'in-progress' | 'complete' | 'failed';

/**
 * Agent type for workflow visualization.
 */
export type AgentType = 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin';

/**
 * Extended agent information for workflow visualization.
 * Compatible with WorkflowVisualization component's AgentInfo interface.
 */
export interface WorkflowAgentInfo {
  /** Agent identifier */
  id: string;
  /** Agent display name */
  name: string;
  /** Agent type */
  type: AgentType;
  /** Current agent status */
  status: AgentStatusType;
  /** Start time (ISO timestamp) */
  startTime?: string;
  /** End time (ISO timestamp) */
  endTime?: string;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
  /** Whether partial results are available */
  hasPartialResults?: boolean;
}

/**
 * Agent configuration for mapping.
 */
interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  aliases: string[];
}

/**
 * Agent configurations for the pricing workflow.
 * Maps agent identifiers to their display names and types.
 */
const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'chain',
    name: 'Chain Agent',
    type: 'chain',
    aliases: ['chain', 'chain-agent', 'orchestrator']
  },
  {
    id: 'supervisor',
    name: 'Supervisor Agent',
    type: 'supervisor',
    aliases: ['supervisor', 'supervisor-agent', 'coordinator']
  },
  {
    id: 'demand',
    name: 'Demand Agent',
    type: 'demand',
    aliases: ['demand', 'demand-agent', 'demand_forecast', 'Demand Forecast Agent']
  },
  {
    id: 'competitive',
    name: 'Competitive Agent',
    type: 'competitive',
    aliases: ['competitive', 'competitive-agent', 'competitive_analysis', 'Competitive Analysis Agent']
  },
  {
    id: 'margin',
    name: 'Margin Agent',
    type: 'margin',
    aliases: ['margin', 'margin-agent', 'margin_analysis', 'Margin Analysis Agent']
  }
];

/**
 * Finds agent config by matching against aliases.
 * 
 * @param agentIdentifier - Agent identifier string from subscription data
 * @returns Matching agent config or undefined
 */
function findAgentConfig(agentIdentifier: string): AgentConfig | undefined {
  const normalizedId = agentIdentifier.toLowerCase().trim();
  return AGENT_CONFIGS.find(config => 
    config.aliases.some(alias => alias.toLowerCase() === normalizedId)
  );
}

/**
 * Maps agent status string to AgentStatusType.
 * 
 * @param agentStatus - Agent status string from subscription data
 * @returns Mapped agent status type
 */
function mapAgentStatusString(agentStatus: string | undefined): AgentStatusType {
  if (!agentStatus) return 'pending';
  
  const normalizedStatus = agentStatus.toLowerCase().trim();
  
  if (['complete', 'completed', 'success', 'done', 'finished'].includes(normalizedStatus)) {
    return 'complete';
  }
  if (['failed', 'error', 'failure'].includes(normalizedStatus)) {
    return 'failed';
  }
  if (['in_progress', 'in-progress', 'running', 'started', 'processing', 'active'].includes(normalizedStatus)) {
    return 'in-progress';
  }
  
  return 'pending';
}

/**
 * Determines agent status based on overall session status and analysis data.
 * 
 * @param agentType - Type of agent
 * @param sessionStatus - Overall session status
 * @param currentAgent - Currently active agent identifier
 * @param agentStatusStr - Current agent status string
 * @param hasAnalysisData - Whether the agent's analysis data is available
 * @returns Agent status type
 */
function determineAgentStatus(
  agentType: AgentType,
  sessionStatus: PricingAnalysisStatus,
  currentAgent: string | undefined,
  agentStatusStr: string | undefined,
  hasAnalysisData: boolean
): AgentStatusType {
  // If session failed, check if this agent was the one that failed
  if (isFailureStatus(sessionStatus)) {
    const currentConfig = currentAgent ? findAgentConfig(currentAgent) : undefined;
    if (currentConfig?.type === agentType) {
      return 'failed';
    }
    // If agent has data, it completed before failure
    if (hasAnalysisData) {
      return 'complete';
    }
    return 'pending';
  }

  // If session completed successfully, all agents are complete
  if (isSuccessStatus(sessionStatus)) {
    return 'complete';
  }

  // Check if this is the currently active agent
  const currentConfig = currentAgent ? findAgentConfig(currentAgent) : undefined;
  if (currentConfig?.type === agentType) {
    return mapAgentStatusString(agentStatusStr);
  }

  // Check if agent has completed based on analysis data
  if (hasAnalysisData) {
    return 'complete';
  }

  // Determine status based on session status progression
  switch (sessionStatus) {
    case 'initiated':
      // Chain agent starts first
      if (agentType === 'chain') return 'in-progress';
      return 'pending';
    
    case 'in_progress':
      // Supervisor is active after chain
      if (agentType === 'chain') return 'complete';
      if (agentType === 'supervisor') return 'in-progress';
      return 'pending';
    
    case 'demand_analysis_complete':
      if (agentType === 'chain') return 'complete';
      if (agentType === 'supervisor') return 'in-progress';
      if (agentType === 'demand') return 'complete';
      return 'pending';
    
    case 'competitive_analysis_complete':
      if (agentType === 'chain') return 'complete';
      if (agentType === 'supervisor') return 'in-progress';
      if (agentType === 'demand') return 'complete';
      if (agentType === 'competitive') return 'complete';
      return 'pending';
    
    case 'margin_analysis_complete':
      if (agentType === 'chain') return 'complete';
      if (agentType === 'supervisor') return 'complete';
      if (agentType === 'demand') return 'complete';
      if (agentType === 'competitive') return 'complete';
      if (agentType === 'margin') return 'complete';
      return 'pending';
    
    default:
      return 'pending';
  }
}

/**
 * Creates agent status map from pricing analysis subscription data.
 * 
 * Maps the currentAgent, agentStatus, and overall status from subscription data
 * to a Map<string, WorkflowAgentInfo> for use with WorkflowVisualization component.
 * 
 * Requirements addressed:
 * - 3.1: Display WorkflowVisualization with initial agent statuses from loaded data
 * - 3.2: Update agent node status on subscription updates
 * - 3.4: Update agent node to show complete status with green indicator
 * - 3.5: Update agent node to show failed status with red indicator
 * 
 * @param pricingAnalysis - Pricing analysis data from query or subscription
 * @returns Map of agent IDs to WorkflowAgentInfo objects
 * 
 * @example
 * ```typescript
 * const agentStatuses = createAgentStatusMap(sessionData);
 * // Returns Map with entries like:
 * // 'chain' => { id: 'chain', name: 'Chain Agent', type: 'chain', status: 'complete' }
 * // 'demand' => { id: 'demand', name: 'Demand Agent', type: 'demand', status: 'in-progress' }
 * ```
 */
export function createAgentStatusMap(
  pricingAnalysis: PricingAnalysis | null
): Map<string, WorkflowAgentInfo> {
  const agentMap = new Map<string, WorkflowAgentInfo>();

  // Initialize all agents with default pending status
  for (const config of AGENT_CONFIGS) {
    agentMap.set(config.id, {
      id: config.id,
      name: config.name,
      type: config.type,
      status: 'pending'
    });
  }

  // If no data, return default pending states
  if (!pricingAnalysis) {
    return agentMap;
  }

  const { 
    status, 
    currentAgent, 
    agentStatus,
    demandForecast,
    competitiveAnalysis,
    marginAnalysis
  } = pricingAnalysis;

  // Determine status for each agent
  for (const config of AGENT_CONFIGS) {
    let hasAnalysisData = false;
    
    // Check if agent has completed analysis data
    switch (config.type) {
      case 'demand':
        hasAnalysisData = !!demandForecast;
        break;
      case 'competitive':
        hasAnalysisData = !!competitiveAnalysis;
        break;
      case 'margin':
        hasAnalysisData = !!marginAnalysis;
        break;
      case 'chain':
      case 'supervisor':
        // Chain and supervisor don't produce analysis data directly
        // Their status is inferred from overall progress
        hasAnalysisData = false;
        break;
    }

    const agentStatusType = determineAgentStatus(
      config.type,
      status,
      currentAgent,
      agentStatus,
      hasAnalysisData
    );

    const agentInfo: WorkflowAgentInfo = {
      id: config.id,
      name: config.name,
      type: config.type,
      status: agentStatusType,
      hasPartialResults: hasAnalysisData && agentStatusType === 'failed'
    };

    // Add timestamps if available
    if (pricingAnalysis.createdAt && agentStatusType !== 'pending') {
      agentInfo.startTime = pricingAnalysis.createdAt;
    }
    if (agentStatusType === 'complete' || agentStatusType === 'failed') {
      agentInfo.endTime = pricingAnalysis.updatedAt;
    }

    agentMap.set(config.id, agentInfo);
  }

  return agentMap;
}
