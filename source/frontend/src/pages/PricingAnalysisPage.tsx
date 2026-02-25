/**
 * @fileoverview Pricing analysis page component.
 * 
 * Displays comprehensive pricing analysis results including competitive intelligence,
 * demand forecasting, and margin analysis with real-time updates from AppSync subscriptions.
 * 
 * Implements the load-then-subscribe pattern: first loads existing data via query,
 * then subscribes for real-time updates. This ensures users see current state
 * immediately while receiving live updates as analysis progresses.
 * 
 * Requirements addressed:
 * - 2.1: Execute getPricingAnalysis query on page load
 * - 2.2: Populate analysis panels with available data
 * - 2.3: Subscribe to onPricingAnalysisById for real-time updates
 * - 2.4: Merge subscription data with existing state
 * - 2.5: Display appropriate loading states when no data
 * - 8.1: Display session status in page header
 * - 8.2: Update status on subscription changes
 * - 8.3: Show progress indicator for in_progress status
 * - 8.4: Display error details for failed status
 * - 8.5: Provide retry and back navigation options
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Box,
  Alert,
  Spinner,
  Tabs,
  TabsProps,
  StatusIndicator,
  ProgressBar,
  ColumnLayout
} from '@cloudscape-design/components';
import { CompetitiveAnalysisPanel } from '../components/CompetitiveAnalysisResults';
import { DemandAnalysisPanel } from '../components/DemandAnalysisPanel';
import { MarginAnalysisPanel } from '../components/MarginAnalysisPanel';
import { AgentChatPanel } from '../components/AgentChatPanel';
import type { ChatMessage as AgentChatMessage, AgentType as AgentChatAgentType } from '../components/AgentChatPanel';
import { usePricingAnalysis } from '../hooks/usePricingAnalysis';
import { useChatMessages } from '../hooks/useChatMessages';
import type { PricingAnalysis, PricingAnalysisStatus, WorkflowAgentInfo, ChatMessage } from '../graphql/types';
import { 
  parseProduct, 
  parseCompetitiveAnalysis,
  parseDemandForecast,
  parseMarginAnalysis,
  isTerminalStatus,
  isSuccessStatus,
  isFailureStatus,
  isInProgressStatus,
  createAgentStatusMap
} from '../graphql/types';
import { WorkflowVisualization } from '../components/WorkflowVisualization';
import { FinalRecommendationsPanel } from '../components/FinalRecommendationsPanel';

/**
 * Debug flag - set to false to silence debug console logs.
 * Can be controlled via environment variable or set to false for production.
 */
const DEBUG_ENABLED = process.env.NODE_ENV === 'development' && false; // Set to true to enable debug logs

/**
 * Maps pricing analysis status to display text.
 * 
 * @param status - Pricing analysis status
 * @returns Human-readable status text
 */
const getStatusDisplayText = (status: PricingAnalysisStatus): string => {
  const statusMap: Record<PricingAnalysisStatus, string> = {
    'initiated': 'Initiated',
    'in_progress': 'In Progress',
    'demand_analysis_complete': 'Demand Analysis Complete',
    'competitive_analysis_complete': 'Competitive Analysis Complete',
    'margin_analysis_complete': 'Margin Analysis Complete',
    'completed': 'Completed',
    'failed': 'Failed',
    'success': 'Success',
    'error': 'Error'
  };
  return statusMap[status] || status;
};

/**
 * Maps pricing analysis status to StatusIndicator type.
 * 
 * @param status - Pricing analysis status
 * @returns StatusIndicator type
 */
const getStatusIndicatorType = (status: PricingAnalysisStatus): 'success' | 'error' | 'warning' | 'info' | 'in-progress' | 'pending' | 'stopped' => {
  if (isSuccessStatus(status)) return 'success';
  if (isFailureStatus(status)) return 'error';
  if (isInProgressStatus(status)) return 'in-progress';
  return 'pending';
};

/**
 * Calculates progress percentage based on status.
 * 
 * Margin analysis completion marks the workflow as complete (100%) since it's
 * the final step in the analysis pipeline. Error/failure states show 0% progress.
 * 
 * @param status - Pricing analysis status
 * @returns Progress percentage (0-100)
 */
const getProgressPercentage = (status: PricingAnalysisStatus): number => {
  const progressMap: Record<PricingAnalysisStatus, number> = {
    'initiated': 10,
    'in_progress': 25,
    'demand_analysis_complete': 50,
    'competitive_analysis_complete': 70,
    'margin_analysis_complete': 100, // Margin analysis is the final step - workflow complete
    'completed': 100,
    'success': 100,
    'failed': 0, // Error states show 0% progress
    'error': 0
  };
  return progressMap[status] ?? 0;
};

/**
 * Maps agent name/ID to AgentChatAgentType for color coding.
 * 
 * @param agentName - Agent name or ID from chat message
 * @param agentId - Agent ID from chat message
 * @returns AgentChatAgentType for badge color coding
 */
const mapAgentType = (agentName: string, agentId: string): AgentChatAgentType => {
  const normalizedName = (agentName || agentId || '').toLowerCase();
  
  if (normalizedName.includes('chain')) return 'chain';
  if (normalizedName.includes('supervisor')) return 'supervisor';
  if (normalizedName.includes('demand')) return 'demand';
  if (normalizedName.includes('competitive')) return 'competitive';
  if (normalizedName.includes('margin')) return 'margin';
  if (normalizedName.includes('system')) return 'system';
  
  return 'system';
};

/**
 * Transforms ChatMessage from GraphQL types to AgentChatPanel format.
 * 
 * Requirements addressed:
 * - 5.2: Display messages in chronological order
 * - 5.5: Show agent name, message content, and relative timestamp
 * 
 * @param message - ChatMessage from useChatMessages hook
 * @returns AgentChatMessage for AgentChatPanel component
 */
const transformChatMessage = (message: ChatMessage): AgentChatMessage => {
  const metadata = message.metadata || {};
  const isError = metadata.isError === true || message.senderType === 'system' && message.message.toLowerCase().includes('error');
  const errorCode = typeof metadata.errorCode === 'string' ? metadata.errorCode : undefined;

  return {
    id: message.id,
    agentName: message.agentName || message.agentId || 'Unknown Agent',
    agentType: mapAgentType(message.agentName, message.agentId),
    content: message.message,
    timestamp: message.timestamp,
    isError,
    errorCode
  };
};


/**
 * Pricing analysis page component.
 * 
 * Implements the load-then-subscribe pattern for real-time pricing analysis updates.
 * First fetches existing data via GraphQL query, then subscribes for real-time updates.
 * 
 * @returns JSX element
 */
export const PricingAnalysisPage: React.FC = () => {
  if (DEBUG_ENABLED) console.log('[PricingAnalysisPage] Component rendering');
  
  const { sessionId } = useParams<{ sessionId?: string }>();
  if (DEBUG_ENABLED) console.log('[PricingAnalysisPage] sessionId from params:', sessionId);
  
  const navigate = useNavigate();
  
  const [activeTabId, setActiveTabId] = useState('demand');

  /**
   * Callback when status changes.
   * Logs status transitions with timestamp.
   */
  const handleStatusChange = useCallback((status: PricingAnalysisStatus) => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] PricingAnalysisPage: Status changed to ${status}`, {
        sessionId,
        status,
        timestamp
      });
    }
  }, [sessionId]);

  /**
   * Callback when data is received.
   * Logs data updates with timestamp.
   */
  const handleData = useCallback((data: PricingAnalysis) => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] PricingAnalysisPage: Data received`, {
        sessionId: data.sessionId,
        status: data.status,
        currentAgent: data.currentAgent,
        hasDemandForecast: !!data.demandForecast,
        hasCompetitiveAnalysis: !!data.competitiveAnalysis,
        hasMarginAnalysis: !!data.marginAnalysis,
        hasFinalRecommendation: !!data.finalRecommendation,
        timestamp
      });
    }
  }, []);

  /**
   * Callback when error occurs.
   * Logs errors with timestamp and details.
   */
  const handleError = useCallback((error: Error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] PricingAnalysisPage: Error occurred`, {
      sessionId,
      error: error.message,
      stack: error.stack,
      timestamp
    });
  }, [sessionId]);

  /**
   * Use the load-then-subscribe hook for pricing analysis data.
   * 
   * Requirements addressed:
   * - 2.1: Execute getPricingAnalysis query on page load
   * - 2.3: Subscribe to onPricingAnalysisById for real-time updates
   * - 2.4: Merge subscription data with existing state
   */
  const { 
    data: sessionData, 
    loading, 
    error, 
    connected,
    retry,
    refetch
  } = usePricingAnalysis({
    sessionId: sessionId || '',
    enabled: !!sessionId,
    onStatusChange: handleStatusChange,
    onData: handleData,
    onError: handleError
  });

  /**
   * Callback when new chat message is received.
   * Logs message details with timestamp.
   * 
   * @param message - New chat message
   */
  const handleChatMessage = useCallback((message: ChatMessage) => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] PricingAnalysisPage: Chat message received`, {
        sessionId,
        messageId: message.id,
        agentName: message.agentName,
        senderType: message.senderType,
        timestamp
      });
    }
  }, [sessionId]);

  /**
   * Callback when chat error occurs.
   * Logs errors for monitoring.
   * 
   * @param chatError - Chat error
   */
  const handleChatError = useCallback((chatError: Error) => {
    console.error('PricingAnalysisPage: Chat error', {
      sessionId,
      error: chatError.message
    });
  }, [sessionId]);

  /**
   * Use the load-then-subscribe hook for chat messages.
   * 
   * Requirements addressed:
   * - 5.1: Execute listChatMessages query on page load
   * - 5.3: Subscribe to onChatMessageBySession for real-time updates
   * - 5.4: Append new messages without removing existing ones
   */
  const {
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    connected: chatConnected
  } = useChatMessages({
    sessionId: sessionId || '',
    enabled: !!sessionId,
    autoScroll: true,
    onMessage: handleChatMessage,
    onError: handleChatError
  });

  /**
   * Transforms chat messages from GraphQL format to AgentChatPanel format.
   * Maintains chronological order as provided by useChatMessages hook.
   * 
   * Requirements addressed:
   * - 5.2: Display messages in chronological order
   * - 5.5: Show agent name, message content, and relative timestamp
   */
  const transformedChatMessages = React.useMemo((): AgentChatMessage[] => {
    if (DEBUG_ENABLED) {
      console.log('[PricingAnalysisPage] Chat messages:', {
        count: chatMessages.length,
        messages: chatMessages,
        sessionId,
        chatLoading,
        chatError: chatError?.message
      });
    }
    return chatMessages.map(transformChatMessage);
  }, [chatMessages, sessionId, chatLoading, chatError]);

  /**
   * Determines if analysis is currently in progress based on session status.
   * Used to control auto-scroll behavior in AgentChatPanel.
   */
  const isAnalysisInProgress = React.useMemo((): boolean => {
    if (!sessionData) return false;
    return isInProgressStatus(sessionData.status);
  }, [sessionData]);

  /**
   * Creates agent status map from subscription data for WorkflowVisualization.
   * 
   * Requirements addressed:
   * - 3.1: Display WorkflowVisualization with initial agent statuses from loaded data
   * - 3.2: Update agent node status on subscription updates
   * 
   * @returns Map of agent IDs to AgentInfo objects
   */
  const agentStatuses = React.useMemo(() => {
    return createAgentStatusMap(sessionData);
  }, [sessionData]);

  /**
   * Validates that sessionId exists on component mount.
   * Logs validation result with timestamp.
   */
  useEffect(() => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      
      if (!sessionId) {
        console.warn(`[${timestamp}] PricingAnalysisPage: No session ID provided on mount`);
        return;
      }
      
      console.log(`[${timestamp}] PricingAnalysisPage: Mounted with sessionId: ${sessionId}`);
    }
  }, [sessionId]);

  /**
   * Handles workflow node click events.
   * Logs agent details when a node is clicked.
   * 
   * @param agentId - Agent identifier
   * @param agentInfo - Agent information
   */
  const handleWorkflowNodeClick = useCallback((agentId: string, agentInfo: WorkflowAgentInfo) => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Workflow node clicked:`, {
        agentId,
        agentInfo,
        sessionId
      });
    }
  }, [sessionId]);

  /**
   * Handles navigation back to the product catalog.
   */
  const handleBackToProducts = () => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Navigating back to products from sessionId: ${sessionId}`);
    }
    navigate('/products');
  };

  /**
   * Handles navigation back to the home page.
   */
  const handleBackToHome = () => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Navigating to home from sessionId: ${sessionId}`);
    }
    navigate('/');
  };

  /**
   * Gets the product ID from the session data.
   * 
   * @returns Product ID or undefined if not available
   */
  const getProductId = (): string | undefined => {
    if (sessionData?.product) {
      const productData = parseProduct(sessionData.product);
      return productData?.product_id;
    }
    return undefined;
  };

  /**
   * Parses competitive analysis data from session data.
   * Transforms to CompetitiveAnalysis format for the component.
   * 
   * Requirements addressed:
   * - 4.2: Parse competitiveAnalysis JSON from subscription data
   * 
   * @returns Formatted competitive analysis or null
   */
  const getCompetitiveAnalysis = () => {
    const analysisData = parseCompetitiveAnalysis(sessionData?.competitiveAnalysis);
    if (!analysisData) return null;

    // Transform to CompetitiveAnalysis format expected by CompetitiveAnalysisPanel
    return {
      marketStats: analysisData.marketStats,
      primaryCompetitor: analysisData.primaryCompetitor,
      marketPosition: analysisData.marketPosition,
      pricingStrategy: analysisData.pricingStrategy,
      screenshots: undefined // Optional field, not typically in subscription data
    };
  };

  /**
   * Gets demand forecast data from session data.
   * 
   * @returns Demand forecast data or null
   */
  const getDemandForecast = () => {
    return parseDemandForecast(sessionData?.demandForecast);
  };

  /**
   * Gets margin analysis data from session data.
   * 
   * @returns Margin analysis data or null
   */
  const getMarginAnalysis = () => {
    return parseMarginAnalysis(sessionData?.marginAnalysis);
  };

  /**
   * Handles tab change.
   * 
   * @param detail - Tab change detail
   */
  const handleTabChange: TabsProps['onChange'] = ({ detail }) => {
    if (DEBUG_ENABLED) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Tab changed for sessionId: ${sessionId}`, {
        activeTabId: detail.activeTabId,
        sessionId,
        timestamp
      });
    }
    setActiveTabId(detail.activeTabId);
  };

  /**
   * Builds the header description with status information.
   * 
   * Requirements addressed:
   * - 8.1: Display session status in page header
   * - 8.2: Update status on subscription changes
   */
  const getHeaderDescription = (): string => {
    if (!sessionId) {
      return 'No session ID provided';
    }

    if (!sessionData) {
      return `Session: ${sessionId} • Status: Connecting...`;
    }

    const productId = getProductId();
    const status = sessionData.status;
    const currentAgent = sessionData.currentAgent;

    let description = `Session: ${sessionId} • Product: ${productId || 'Unknown'} • Status: ${getStatusDisplayText(status)}`;
    
    if (currentAgent && isInProgressStatus(status)) {
      description += ` • Current Agent: ${currentAgent}`;
    }
    
    if (!connected && !isTerminalStatus(status)) {
      description += ' • Reconnecting...';
    }

    return description;
  };


  /**
   * Transforms demand forecast data to the format expected by DemandAnalysisPanel.
   * Handles loading state when data is null.
   * 
   * Requirements addressed:
   * - 4.1: Parse demandForecast JSON from subscription data
   * - 4.5: Handle loading state when data is null
   */
  const getDemandAnalysisForPanel = () => {
    const demandData = getDemandForecast();
    if (!demandData) return null;

    // Transform to DemandAnalysisResult format expected by DemandAnalysisPanel
    return {
      recommendedPrice: demandData.recommendedPrice,
      priceFloor: demandData.priceFloor,
      priceCeiling: demandData.priceCeiling,
      confidence: demandData.confidence,
      confidenceIntervals: demandData.confidenceIntervals,
      rationale: demandData.rationale,
      historicalData: demandData.historicalData
    };
  };

  /**
   * Transforms margin analysis data to the format expected by MarginAnalysisPanel.
   * Handles compliance status display.
   * 
   * Requirements addressed:
   * - 4.3: Parse marginAnalysis JSON from subscription data
   */
  const getMarginAnalysisForPanel = () => {
    const marginData = getMarginAnalysis();
    if (!marginData) return null;

    // Transform to MarginAnalysisResult format expected by MarginAnalysisPanel
    return {
      suggestedPrice: marginData.suggestedPrice,
      minPrice: marginData.minPrice,
      maxPrice: marginData.maxPrice,
      calculatedMargin: marginData.calculatedMargin,
      baseMarginRate: marginData.baseMarginRate,
      adjustedMarginRate: marginData.adjustedMarginRate,
      mapCompliant: marginData.mapCompliant,
      marginCompliant: marginData.marginCompliant,
      requiresReview: marginData.requiresReview,
      reviewReason: marginData.reviewReason
    };
  };

  /**
   * Define tabs for different analysis types.
   * Uses useMemo to prevent unnecessary re-renders and safely handle sessionData.
   */
  const analysisTabs: TabsProps.Tab[] = React.useMemo(() => [
    {
      id: 'demand',
      label: 'Demand Forecast',
      content: (
        <DemandAnalysisPanel
          analysis={getDemandAnalysisForPanel()}
          loading={loading && !getDemandAnalysisForPanel()}
          error={error}
          onRetry={retry}
        />
      )
    },
    {
      id: 'competitive',
      label: 'Competitive Analysis',
      content: (
        <CompetitiveAnalysisPanel
          analysis={getCompetitiveAnalysis()}
          loading={loading && !getCompetitiveAnalysis()}
          error={error}
          onRetry={retry}
        />
      )
    },
    {
      id: 'margin',
      label: 'Margin Analysis',
      content: (
        <MarginAnalysisPanel
          analysis={getMarginAnalysisForPanel()}
          loading={loading && !getMarginAnalysisForPanel()}
          error={error}
          onRetry={retry}
        />
      )
    },
    {
      id: 'final-recommendations',
      label: 'Final Recommendations',
      content: (
        <FinalRecommendationsPanel
          finalRecommendationJson={sessionData?.finalRecommendation || null}
          status={sessionData?.status || 'initiated'}
          loading={loading}
          error={error}
          onRetry={retry}
        />
      )
    }
  ], [sessionData, loading, error, retry]);

  /**
   * Renders the error state UI.
   * 
   * Requirements addressed:
   * - 8.4: Display error details for failed status
   * - 8.5: Provide retry and back navigation options
   */
  const renderErrorState = () => {
    const errorMessage = error?.message || 'An error occurred while connecting to the pricing session.';
    
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h1">Pricing Analysis</Header>
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header="Failed to Load Pricing Session"
            action={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="primary"
                  onClick={retry}
                >
                  Retry
                </Button>
                <Button
                  variant="normal"
                  onClick={handleBackToProducts}
                >
                  Back to Products
                </Button>
              </SpaceBetween>
            }
          >
            {errorMessage}
            {sessionId && (
              <Box fontSize="body-s" color="text-body-secondary" margin={{ top: 's' }}>
                Session ID: {sessionId}
              </Box>
            )}
          </Alert>
        </SpaceBetween>
      </Container>
    );
  };

  /**
   * Renders the loading state UI.
   */
  const renderLoadingState = () => (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        <Header variant="h1">Pricing Analysis</Header>
        <Box textAlign="center">
          <SpaceBetween direction="vertical" size="m">
            <Spinner size="large" />
            <Box color="text-body-secondary">
              Connecting to pricing analysis session...
            </Box>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </Container>
  );

  /**
   * Renders the failed analysis state UI.
   * 
   * Requirements addressed:
   * - 8.4: Display error details for failed status
   * - 8.5: Provide retry and back navigation options
   */
  const renderFailedAnalysisState = () => (
    <Alert
      statusIconAriaLabel="Error"
      type="error"
      header="Analysis Failed"
      action={
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            variant="primary"
            onClick={handleBackToProducts}
          >
            Start New Analysis
          </Button>
          <Button
            variant="normal"
            onClick={refetch}
          >
            Refresh
          </Button>
        </SpaceBetween>
      }
    >
      The pricing analysis for this session has failed. You can start a new analysis 
      by selecting a product from the catalog.
      {sessionData?.agentStatus && (
        <Box fontSize="body-s" color="text-body-secondary" margin={{ top: 's' }}>
          Last agent status: {sessionData.agentStatus}
        </Box>
      )}
    </Alert>
  );

  /**
   * Renders the progress indicator for in-progress status and completion status.
   * 
   * Requirements addressed:
   * - 8.3: Show progress indicator for in_progress status
   * - Show completion status when analysis finishes (success or failure)
   */
  const renderProgressIndicator = () => {
    if (!sessionData) {
      return null;
    }

    const progress = getProgressPercentage(sessionData.status);
    const currentAgent = sessionData.currentAgent;
    const agentStatus = sessionData.agentStatus;

    // Margin analysis complete is the final step - treat as completion
    const isComplete = sessionData.status === 'margin_analysis_complete' || 
                       isSuccessStatus(sessionData.status);

    // Show completion status for success states or margin analysis complete
    if (isComplete) {
      return (
        <ProgressBar
          value={100}
          label="Analysis Progress"
          description="Completed"
          status="success"
          additionalInfo="All analysis steps completed successfully"
        />
      );
    }

    // Show completion status for failure states
    if (isFailureStatus(sessionData.status)) {
      return (
        <ProgressBar
          value={0}
          label="Analysis Progress"
          description="Completed - Failed"
          status="error"
          additionalInfo="Analysis encountered an error"
        />
      );
    }

    // Show progress for in-progress states
    if (isInProgressStatus(sessionData.status)) {
      return (
        <SpaceBetween direction="vertical" size="s">
          <ProgressBar
            value={progress}
            label="Analysis Progress"
            description={currentAgent ? `Current agent: ${currentAgent}` : 'Processing...'}
            additionalInfo={agentStatus ? `Status: ${agentStatus}` : undefined}
          />
          {currentAgent && (
            <Alert
              statusIconAriaLabel="Info"
              type="info"
              header={`Current Agent: ${currentAgent}`}
            >
              {agentStatus || 'Processing...'}
            </Alert>
          )}
        </SpaceBetween>
      );
    }

    return null;
  };

  /**
   * Renders the no session ID state.
   */
  const renderNoSessionState = () => (
    <Container>
      <Alert
        statusIconAriaLabel="Warning"
        type="warning"
        header="No Session ID Provided"
        action={
          <Button
            variant="primary"
            onClick={handleBackToProducts}
          >
            Select a Product
          </Button>
        }
      >
        To view pricing analysis results, please select a product from the catalog 
        and start a pricing analysis session.
      </Alert>
    </Container>
  );

  /**
   * Renders the session not found state.
   */
  const renderSessionNotFoundState = () => (
    <Container>
      <Alert
        statusIconAriaLabel="Warning"
        type="warning"
        header="Session Not Found"
        action={
          <Button
            variant="primary"
            onClick={handleBackToProducts}
          >
            Select a Product
          </Button>
        }
      >
        The pricing session with ID <strong>{sessionId}</strong> was not found. 
        It may have been deleted or you may not have permission to access it.
      </Alert>
    </Container>
  );


  // Handle initial loading state (before any data is loaded)
  if (loading && !sessionData) {
    if (DEBUG_ENABLED) console.log('[PricingAnalysisPage] Rendering loading state');
    return renderLoadingState();
  }

  // Handle error state (when error occurs and no data is available)
  if (error && !sessionData) {
    if (DEBUG_ENABLED) console.log('[PricingAnalysisPage] Rendering error state');
    return renderErrorState();
  }

  if (DEBUG_ENABLED) {
    console.log('[PricingAnalysisPage] Rendering main content', {
      hasSessionId: !!sessionId,
      hasSessionData: !!sessionData,
      loading,
      error,
      sessionData
    });
  }

  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        {/* Header Section with Status Display */}
        <Header
          variant="h1"
          description={getHeaderDescription()}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="normal"
                iconName="refresh"
                onClick={refetch}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                variant="normal"
                iconName="arrow-left"
                onClick={handleBackToProducts}
              >
                Back to Products
              </Button>
              <Button
                variant="link"
                onClick={handleBackToHome}
              >
                Home
              </Button>
            </SpaceBetween>
          }
        >
          Pricing Analysis Results
        </Header>

        {/* Content Section */}
        {!sessionId ? (
          renderNoSessionState()
        ) : !sessionData && !loading ? (
          renderSessionNotFoundState()
        ) : sessionData ? (
          <SpaceBetween direction="vertical" size="l">
            {/* Show failed analysis alert if status is failed/error */}
            {isFailureStatus(sessionData.status) && renderFailedAnalysisState()}

            {/* Show progress indicator for in-progress status */}
            {renderProgressIndicator()}

            {/* Workflow Visualization and Chat Panel - Side by side layout
                Requirements addressed:
                - 3.1: Display WorkflowVisualization with initial agent statuses
                - 3.2: Update agent node status on subscription updates
                - 3.4: Show complete status with green indicator
                - 3.5: Show failed status with red indicator
                - 5.1-5.5: Agent Chat Panel with real-time messages
            */}
            <ColumnLayout columns={2} variant="default">
              <div>
                <WorkflowVisualization
                  agentStatuses={agentStatuses}
                  onNodeClick={handleWorkflowNodeClick}
                  onRetry={retry}
                  hasError={isFailureStatus(sessionData.status)}
                />
              </div>
              <div>
                <AgentChatPanel
                  messages={transformedChatMessages}
                  isAnalysisInProgress={isAnalysisInProgress}
                />
              </div>
            </ColumnLayout>

            {/* Display analysis tabs - Including Final Recommendations as fourth tab
                Requirements addressed:
                - 3.1-3.7: Demand Forecast tab
                - 4.1-4.7: Competitive Analysis tab
                - 5.1-5.7: Margin Analysis tab
                - 9.1-9.7: Final Recommendations tab (now integrated as fourth tab)
            */}
            <Tabs
              tabs={analysisTabs}
              activeTabId={activeTabId}
              onChange={handleTabChange}
            />
          </SpaceBetween>
        ) : null}
      </SpaceBetween>
    </Container>
  );
};

export default PricingAnalysisPage;
