/**
 * @fileoverview Pricing Dashboard main page component.
 * 
 * Displays comprehensive pricing analysis results with real-time updates via GraphQL subscriptions.
 * Shows product details, demand analysis, competitive analysis, margin analysis, and final
 * recommendations in an organized dashboard with progressive data updates.
 * 
 * Requirements addressed:
 * - 1.1: Display comprehensive dashboard when pricing analysis completes
 * - 1.2: Show product details card
 * - 1.3: Show demand analysis panel
 * - 1.4: Show competitive analysis panel
 * - 1.5: Show margin analysis panel
 * - 1.6: Show final recommendations summary
 * - 1.7: Display loading indicators when data is loading
 * - 10.1: Subscribe to pricing updates when dashboard loads
 * - 10.2: Update relevant panels when subscription receives updates
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Box,
  Alert,
  Spinner,
  ContentLayout
} from '@cloudscape-design/components';
import { usePricingSubscription, PricingSession } from '../hooks/usePricingSubscription';
import { DemandAnalysisPanel } from '../components/DemandAnalysisPanel';
import { CompetitiveAnalysisPanel } from '../components/CompetitiveAnalysisResults';
import { MarginAnalysisPanel } from '../components/MarginAnalysisPanel';
import { AgentChatPanel } from '../components/AgentChatPanel';
import { WorkflowVisualization } from '../components/WorkflowVisualization';
import { ExportButton } from '../components/ExportButton';
import { useAccessibility, useKeyboardShortcuts } from '../components/AccessibilityProvider';
import { createLiveRegionAttributes, handleKeyboardNavigation } from '../utils/accessibility';
import '../styles/animations.css';
import '../styles/responsive.css';
import { ProductDetailsCard, ProductDetailsCardProps } from '@/components';

/**
 * Parsed product data interface.
 */
interface ProductData {
  product_id: string;
  category: string;
  subcategory: string;
  role: string;
  vendor: string;
  cost: number;
  MSRP: number;
  MAP: number;
  yearTarget: number;
  features: string[];
  imageUrl: string;
  attributes?: Record<string, any>;
}

/**
 * Parsed demand forecast data interface.
 */
interface DemandForecastData {
  recommendedPrice?: number;
  priceFloor?: number;
  priceCeiling?: number;
  confidence?: number;
  confidenceIntervals?: {
    p10: number;
    p50: number;
    p90: number;
  };
  rationale?: string;
  [key: string]: any;
}

/**
 * Parsed competitive analysis data interface.
 */
interface CompetitiveAnalysisData {
  lowest_market_price?: number;
  highest_market_price?: number;
  average_market_price?: number;
  median_market_price?: number;
  primary_competitor?: string;
  competitive_confidence_score?: number;
  competitor_price_point?: number;
  market_position_assessment?: string;
  recommended_base_price?: number;
  price_position_strategy?: string;
  [key: string]: any;
}

/**
 * Parsed margin analysis data interface.
 */
interface MarginAnalysisData {
  suggestedPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  calculatedMargin?: number;
  baseMarginRate?: number;
  adjustedMarginRate?: number;
  mapCompliant?: boolean;
  marginCompliant?: boolean;
  requiresReview?: boolean;
  reviewReason?: string;
  [key: string]: any;
}

/**
 * Dashboard state interface.
 */
interface DashboardState {
  product: ProductData | null;
  demandForecast: DemandForecastData | null;
  competitiveAnalysis: CompetitiveAnalysisData | null;
  marginAnalysis: MarginAnalysisData | null;
  botResponses: string | null;
  status: 'initiated' | 'in_progress' | 'success' | 'error';
}

/**
 * Animation state interface for tracking which panels have been updated.
 */
interface AnimationState {
  demandUpdated: boolean;
  competitiveUpdated: boolean;
  marginUpdated: boolean;
  chatUpdated: boolean;
  workflowUpdated: boolean;
}

/**
 * Agent information for workflow visualization.
 */
interface AgentInfo {
  id: string;
  name: string;
  type: 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin';
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  startTime?: string;
  endTime?: string;
  error?: string;
}

/**
 * Chat message structure.
 */
interface ChatMessage {
  id: string;
  agentName: string;
  agentType: 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin';
  content: string;
  timestamp: string;
}

/**
 * Pricing Dashboard Page component.
 * 
 * Main container component that manages subscription to pricing updates and
 * coordinates display of all analysis panels with progressive data updates.
 * 
 * @returns JSX element
 */
export const PricingDashboardPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { announce } = useAccessibility();

  // Dashboard state
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    product: null,
    demandForecast: null,
    competitiveAnalysis: null,
    marginAnalysis: null,
    botResponses: null,
    status: 'initiated'
  });

  // Animation state to track which panels have been updated
  const [animationState, setAnimationState] = useState<AnimationState>({
    demandUpdated: false,
    competitiveUpdated: false,
    marginUpdated: false,
    chatUpdated: false,
    workflowUpdated: false
  });

  // Agent statuses for workflow visualization
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentInfo>>(
    new Map([
      ['chain', { id: 'chain', name: 'Chain Agent', type: 'chain', status: 'pending' }],
      ['supervisor', { id: 'supervisor', name: 'Supervisor Agent', type: 'supervisor', status: 'pending' }],
      ['demand', { id: 'demand', name: 'Demand Agent', type: 'demand', status: 'pending' }],
      ['competitive', { id: 'competitive', name: 'Competitive Agent', type: 'competitive', status: 'pending' }],
      ['margin', { id: 'margin', name: 'Margin Agent', type: 'margin', status: 'pending' }]
    ])
  );

  // Chat messages for agent chat panel
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Previous state ref to detect changes
  const prevStateRef = useRef<DashboardState | null>(null);

  /**
   * Handles navigation back to product selector.
   */
  const handleBackToProducts = useCallback(() => {
    navigate('/products');
  }, [navigate]);

  /**
   * Handles subscription data updates.
   * Parses JSON fields and updates dashboard state progressively with animations.
   * 
   * Requirements: 10.3, 10.4, 10.5, 10.6
   */
  const handleSubscriptionData = useCallback((session: PricingSession) => {
    console.log('Processing subscription update:', {
      id: session.id,
      status: session.status,
      hasData: {
        product: !!session.product,
        demandForecast: !!session.analysisData?.demandForecast,
        competitiveAnalysis: !!session.analysisData?.competitiveAnalysis,
        marginAnalysis: !!session.analysisData?.marginAnalysis,
        botResponses: !!session.botResponses
      }
    });

    const prevState = prevStateRef.current;

    // Parse product data
    let productData: ProductData | null = null;
    if (session.product) {
      try {
        const tmp = JSON.parse(JSON.parse(session.product)); 
        tmp.attributes = JSON.parse(JSON.parse(tmp.attributes as string));
        productData = tmp;

      } catch (error) {
        console.error('Error parsing product data:', error);
      }
    }

    // Parse demand forecast data from analysisData
    let demandData: DemandForecastData | null = null;
    if (session.analysisData?.demandForecast) {
      try {
        // Check if it's already an object or needs parsing
        demandData = typeof session.analysisData.demandForecast === 'string'
          ? JSON.parse(session.analysisData.demandForecast)
          : session.analysisData.demandForecast;
      } catch (error) {
        console.error('Error parsing demand forecast data:', error);
      }
    }

    // Parse competitive analysis data from analysisData
    let competitiveData: CompetitiveAnalysisData | null = null;
    if (session.analysisData?.competitiveAnalysis) {
      try {
        // Check if it's already an object or needs parsing
        competitiveData = typeof session.analysisData.competitiveAnalysis === 'string'
          ? JSON.parse(session.analysisData.competitiveAnalysis)
          : session.analysisData.competitiveAnalysis;
      } catch (error) {
        console.error('Error parsing competitive analysis data:', error);
      }
    }

    // Parse margin analysis data from analysisData
    let marginData: MarginAnalysisData | null = null;
    if (session.analysisData?.marginAnalysis) {
      try {
        // Check if it's already an object or needs parsing
        marginData = typeof session.analysisData.marginAnalysis === 'string'
          ? JSON.parse(session.analysisData.marginAnalysis)
          : session.analysisData.marginAnalysis;
      } catch (error) {
        console.error('Error parsing margin analysis data:', error);
      }
    }

    // Parse bot responses for chat messages
    let messages: ChatMessage[] = [];
    if (session.botResponses && Array.isArray(session.botResponses)) {
      try {
        messages = session.botResponses.map((msg: any, index: number) => ({
          id: `msg-${index}-${Date.now()}`,
          agentName: msg.agentName || 'Unknown Agent',
          agentType: msg.agentType || 'chain',
          content: msg.content || msg.message || '',
          timestamp: msg.timestamp || new Date().toISOString()
        }));
      } catch (error) {
        console.error('Error parsing bot responses:', error);
      }
    }

    // Detect changes and trigger animations
    const newAnimationState: AnimationState = {
      demandUpdated: false,
      competitiveUpdated: false,
      marginUpdated: false,
      chatUpdated: false,
      workflowUpdated: false
    };

    // Check if demand forecast data arrived (Requirement 10.3)
    if (demandData && (!prevState || !prevState.demandForecast)) {
      console.log('Demand forecast data arrived - triggering animation');
      newAnimationState.demandUpdated = true;
      
      // Announce to screen readers
      announce(
        `Demand analysis complete. Recommended price: ${demandData.recommendedPrice ? `$${demandData.recommendedPrice.toFixed(2)}` : 'calculating'}`,
        'polite'
      );
      
      // Update agent status
      setAgentStatuses(prev => {
        const updated = new Map(prev);
        const current = prev.get('demand');
        if (current) {
          updated.set('demand', {
            ...current,
            status: 'complete',
            endTime: new Date().toISOString()
          });
        }
        return updated;
      });
    }

    // Check if competitive analysis data arrived (Requirement 10.4)
    if (competitiveData && (!prevState || !prevState.competitiveAnalysis)) {
      console.log('Competitive analysis data arrived - triggering animation');
      newAnimationState.competitiveUpdated = true;
      
      // Announce to screen readers
      announce(
        `Competitive analysis complete. Market position: ${competitiveData.market_position_assessment || 'analyzing'}`,
        'polite'
      );
      
      // Update agent status
      setAgentStatuses(prev => {
        const updated = new Map(prev);
        const current = prev.get('competitive');
        if (current) {
          updated.set('competitive', {
            ...current,
            status: 'complete',
            endTime: new Date().toISOString()
          });
        }
        return updated;
      });
    }

    // Check if margin analysis data arrived (Requirement 10.5)
    if (marginData && (!prevState || !prevState.marginAnalysis)) {
      console.log('Margin analysis data arrived - triggering animation');
      newAnimationState.marginUpdated = true;
      
      // Announce to screen readers
      const complianceStatus = marginData.mapCompliant && marginData.marginCompliant 
        ? 'All compliance checks passed' 
        : 'Compliance issues detected';
      announce(
        `Margin analysis complete. ${complianceStatus}. Suggested price: ${marginData.suggestedPrice ? `$${marginData.suggestedPrice.toFixed(2)}` : 'calculating'}`,
        marginData.mapCompliant && marginData.marginCompliant ? 'polite' : 'assertive'
      );
      
      // Update agent status
      setAgentStatuses(prev => {
        const updated = new Map(prev);
        const current = prev.get('margin');
        if (current) {
          updated.set('margin', {
            ...current,
            status: 'complete',
            endTime: new Date().toISOString()
          });
        }
        return updated;
      });
    }

    // Check if bot responses arrived (Requirement 10.6)
    const prevMessagesCount = prevState?.botResponses ? 
      (typeof prevState.botResponses === 'string' ? JSON.parse(prevState.botResponses).length : 0) : 0;
    if (messages.length > 0 && messages.length !== prevMessagesCount) {
      console.log('Bot responses arrived - triggering animation');
      newAnimationState.chatUpdated = true;
      setChatMessages(messages);
    }

    // Update workflow visualization when status changes
    if (!prevState || prevState.status !== session.status) {
      console.log('Status changed - updating workflow visualization');
      newAnimationState.workflowUpdated = true;
      
      // Update agent statuses based on overall status
      if (session.status === 'in_progress') {
        setAgentStatuses(prev => {
          const updated = new Map(prev);
          const chain = prev.get('chain');
          const supervisor = prev.get('supervisor');
          if (chain) {
            updated.set('chain', { ...chain, status: 'in-progress', startTime: new Date().toISOString() });
          }
          if (supervisor) {
            updated.set('supervisor', { ...supervisor, status: 'in-progress', startTime: new Date().toISOString() });
          }
          return updated;
        });
      } else if (session.status === 'success') {
        setAgentStatuses(prev => {
          const updated = new Map(prev);
          const chain = prev.get('chain');
          const supervisor = prev.get('supervisor');
          if (chain) {
            updated.set('chain', { ...chain, status: 'complete', endTime: new Date().toISOString() });
          }
          if (supervisor) {
            updated.set('supervisor', { ...supervisor, status: 'complete', endTime: new Date().toISOString() });
          }
          return updated;
        });
      } else if (session.status === 'error') {
        setAgentStatuses(prev => {
          const updated = new Map(prev);
          // Mark any pending agents as failed
          prev.forEach((value, key) => {
            if (value.status === 'pending' || value.status === 'in-progress') {
              updated.set(key, { ...value, status: 'failed', error: 'Analysis failed' });
            }
          });
          return updated;
        });
      }
    }

    // Update dashboard state with parsed data
    const newState: DashboardState = {
      product: productData,
      demandForecast: demandData,
      competitiveAnalysis: competitiveData,
      marginAnalysis: marginData,
      botResponses: session.botResponses ? JSON.stringify(session.botResponses) : null,
      status: session.status
    };

    setDashboardState(newState);
    prevStateRef.current = newState;

    // Trigger animations
    setAnimationState(newAnimationState);

    // Reset animation state after animation completes
    setTimeout(() => {
      setAnimationState({
        demandUpdated: false,
        competitiveUpdated: false,
        marginUpdated: false,
        chatUpdated: false,
        workflowUpdated: false
      });
    }, 600); // Match animation duration
  }, [chatMessages.length]);

  /**
   * Handles subscription errors.
   */
  const handleSubscriptionError = useCallback((error: any) => {
    console.error('Subscription error:', error);
  }, []);

  // Subscribe to pricing updates
  const {
    data: subscriptionData,
    loading: subscriptionLoading,
    error: subscriptionError,
    connected: subscriptionConnected,
    retry: retrySubscription
  } = usePricingSubscription({
    sessionId: sessionId || '',
    enabled: !!sessionId,
    onData: handleSubscriptionData,
    onError: handleSubscriptionError
  });

  /**
   * Handles retry of failed subscription.
   */
  const handleRetry = useCallback(() => {
    retrySubscription();
  }, [retrySubscription]);

  // ALL useMemo hooks MUST be called before early returns
  // Determine if analysis is in progress (memoized for performance - Requirement 15.3)
  const isAnalysisInProgress = useMemo(
    () => dashboardState.status === 'in_progress' || dashboardState.status === 'initiated',
    [dashboardState.status]
  );
  
  const isAnalysisComplete = useMemo(
    () => dashboardState.status === 'success',
    [dashboardState.status]
  );
  
  const isAnalysisError = useMemo(
    () => dashboardState.status === 'error',
    [dashboardState.status]
  );

  // Get product ID for display (memoized - Requirement 15.3)
  const productId = useMemo(
    () => dashboardState.product?.product_id || 'Unknown',
    [dashboardState.product?.product_id]
  );

  // Prepare final recommendations data for PDF export (memoized - Requirement 15.3)
  const finalRecommendationsData = useMemo(() => {
    if (!dashboardState.marginAnalysis || !dashboardState.demandForecast) {
      return null;
    }
    
    return {
      suggestedPrice: dashboardState.marginAnalysis.suggestedPrice || 0,
      priceRange: {
        min: dashboardState.marginAnalysis.minPrice || 0,
        max: dashboardState.marginAnalysis.maxPrice || 0
      },
      confidence: dashboardState.demandForecast.confidence || 0,
      mapCompliant: dashboardState.marginAnalysis.mapCompliant || false,
      marginCompliant: dashboardState.marginAnalysis.marginCompliant || false,
      requiresReview: dashboardState.marginAnalysis.requiresReview || false,
      reviewReason: dashboardState.marginAnalysis.reviewReason
    };
  }, [
    dashboardState.marginAnalysis,
    dashboardState.demandForecast
  ]);

  // Memoized demand analysis data transformation (Requirement 15.3)
  const demandAnalysisData = useMemo(() => {
    if (!dashboardState.demandForecast) return null;
    
    return {
      recommendedPrice: dashboardState.demandForecast.recommendedPrice || 0,
      priceFloor: dashboardState.demandForecast.priceFloor || 0,
      priceCeiling: dashboardState.demandForecast.priceCeiling || 0,
      confidence: dashboardState.demandForecast.confidence || 0,
      confidenceIntervals: dashboardState.demandForecast.confidenceIntervals || {
        p10: 0,
        p50: 0,
        p90: 0
      },
      rationale: dashboardState.demandForecast.rationale || '',
      historicalData: dashboardState.demandForecast.historicalData
    };
  }, [dashboardState.demandForecast]);

  // Memoized competitive analysis data transformation (Requirement 15.3)
  const competitiveAnalysisData = useMemo(() => {
    if (!dashboardState.competitiveAnalysis) return null;
    
    return {
      marketStats: {
        min: dashboardState.competitiveAnalysis.lowest_market_price || 0,
        max: dashboardState.competitiveAnalysis.highest_market_price || 0,
        average: dashboardState.competitiveAnalysis.average_market_price || 0,
        median: dashboardState.competitiveAnalysis.median_market_price || 0
      },
      primaryCompetitor: {
        name: dashboardState.competitiveAnalysis.primary_competitor || 'Unknown',
        price: dashboardState.competitiveAnalysis.competitor_price_point || 0,
        matchConfidence: dashboardState.competitiveAnalysis.competitive_confidence_score || 0
      },
      marketPosition: dashboardState.competitiveAnalysis.market_position_assessment || '',
      pricingStrategy: dashboardState.competitiveAnalysis.price_position_strategy || '',
      screenshots: []
    };
  }, [dashboardState.competitiveAnalysis]);

  // Memoized margin analysis data transformation (Requirement 15.3)
  const marginAnalysisData = useMemo(() => {
    if (!dashboardState.marginAnalysis) return null;
    
    return {
      suggestedPrice: dashboardState.marginAnalysis.suggestedPrice || 0,
      minPrice: dashboardState.marginAnalysis.minPrice || 0,
      maxPrice: dashboardState.marginAnalysis.maxPrice || 0,
      calculatedMargin: dashboardState.marginAnalysis.calculatedMargin || 0,
      baseMarginRate: dashboardState.marginAnalysis.baseMarginRate || 0,
      adjustedMarginRate: dashboardState.marginAnalysis.adjustedMarginRate || 0,
      mapCompliant: dashboardState.marginAnalysis.mapCompliant || false,
      marginCompliant: dashboardState.marginAnalysis.marginCompliant || false,
      requiresReview: dashboardState.marginAnalysis.requiresReview || false,
      reviewReason: dashboardState.marginAnalysis.reviewReason
    };
  }, [dashboardState.marginAnalysis]);

  /**
   * Register keyboard shortcuts for dashboard navigation.
   * MUST be called LAST after all other hooks.
   */
  useKeyboardShortcuts(
    new Map([
      ['b', { handler: handleBackToProducts, description: 'Back to products' }],
      ['e', { handler: () => {
        const exportButton = document.querySelector('[aria-label*="Export"]') as HTMLElement;
        if (exportButton) exportButton.click();
      }, description: 'Export PDF' }],
      ['r', { handler: () => {
        if (subscriptionError) handleRetry();
      }, description: 'Retry failed analysis' }]
    ])
  );

  // ALL HOOKS CALLED - Now safe to do early returns
  // Validate session ID
  if (!sessionId) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h1">Pricing Dashboard</Header>
          <Alert
            statusIconAriaLabel="Warning"
            type="warning"
            header="No Session ID Provided"
            action={
              <Button variant="primary" onClick={handleBackToProducts}>
                Select a Product
              </Button>
            }
          >
            To view pricing analysis results, please select a product from the catalog
            and start a pricing analysis session.
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  // Handle subscription error
  if (subscriptionError) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header
            variant="h1"
            description={`Session: ${sessionId}`}
            actions={
              <Button
                variant="normal"
                iconName="arrow-left"
                onClick={handleBackToProducts}
              >
                Back to Products
              </Button>
            }
          >
            Pricing Dashboard
          </Header>
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header="Failed to Load Pricing Data"
            action={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="primary" onClick={handleRetry}>
                  Retry
                </Button>
                <Button variant="normal" onClick={handleBackToProducts}>
                  Back to Products
                </Button>
              </SpaceBetween>
            }
          >
            {subscriptionError.message || 'An error occurred while loading pricing data.'}
            <Box variant="p" margin={{ top: 's' }} color="text-body-secondary">
              Error code: {subscriptionError.code || 'UNKNOWN'}
            </Box>
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  // Handle loading state
  if (subscriptionLoading || !subscriptionConnected) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header
            variant="h1"
            description={`Session: ${sessionId}`}
            actions={
              <Button
                variant="normal"
                iconName="arrow-left"
                onClick={handleBackToProducts}
              >
                Back to Products
              </Button>
            }
          >
            Pricing Dashboard
          </Header>
          <Box textAlign="center" padding={{ vertical: 'xxl' }}>
            <SpaceBetween direction="vertical" size="m">
              <Spinner size="large" />
              <Box variant="h3" color="text-body-secondary">
                Connecting to pricing analysis...
              </Box>
              <Box color="text-body-secondary" fontSize="body-s">
                Establishing real-time connection for session {sessionId}
              </Box>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Container>
    );
  }

  return (
    <div 
      className="pricing-dashboard-container"
      id="main-content"
      role="main"
      aria-label="Pricing Analysis Dashboard"
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            description={
              dashboardState.product
                ? `Product: ${productId} • Category: ${dashboardState.product.category} • Status: ${dashboardState.status}`
                : `Session: ${sessionId} • Status: ${dashboardState.status}`
            }
            actions={
              <div className="dashboard-header-actions">
                <ExportButton
                  product={dashboardState.product}
                  demandAnalysis={dashboardState.demandForecast}
                  competitiveAnalysis={dashboardState.competitiveAnalysis}
                  marginAnalysis={dashboardState.marginAnalysis}
                  finalRecommendations={finalRecommendationsData}
                  sessionId={sessionId}
                />
                <Button
                  variant="normal"
                  iconName="arrow-left"
                  onClick={handleBackToProducts}
                >
                  Back to Products
                </Button>
              </div>
            }
          >
            Pricing Analysis Dashboard
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
        {/* Analysis Status Alert */}
        <div className="dashboard-grid-full">
          {isAnalysisInProgress && (
            <div {...createLiveRegionAttributes('polite', true)}>
              <Alert
                type="info"
                header="Analysis in Progress"
                className="responsive-alert"
              >
                Pricing analysis is currently running. Results will appear below as they become available.
                <Box margin={{ top: 's' }}>
                  <SpaceBetween direction="horizontal" size="xs">
                    <Spinner size="normal" />
                    <Box color="text-body-secondary">
                      Waiting for analysis results...
                    </Box>
                  </SpaceBetween>
                </Box>
              </Alert>
            </div>
          )}

          {isAnalysisComplete && (
            <div {...createLiveRegionAttributes('polite', true)}>
              <Alert
                type="success"
                header="Analysis Complete"
                className="responsive-alert"
              >
                Pricing analysis has completed successfully. Review the recommendations below.
              </Alert>
            </div>
          )}

          {isAnalysisError && (
            <div {...createLiveRegionAttributes('assertive', true)}>
              <Alert
                type="error"
                header="Analysis Failed"
                className="responsive-alert"
                action={
                  <Button 
                    variant="primary" 
                    onClick={handleRetry}
                    aria-label="Retry pricing analysis"
                  >
                    Retry Analysis
                  </Button>
                }
              >
                The pricing analysis encountered an error. Please try again or contact support if the problem persists.
              </Alert>
            </div>
          )}
        </div>

        {/* Product Details Section */}
        {dashboardState.product && (<ProductDetailsCard product={dashboardState.product}/>)}

        {/* Workflow and Chat Grid */}
        <div className="workflow-chat-grid">
          {/* Workflow Visualization */}
          <div className={animationState.workflowUpdated ? 'fade-in' : ''}>
            <WorkflowVisualization agentStatuses={agentStatuses} />
          </div>

          {/* Agent Chat Panel */}
          <div className={animationState.chatUpdated ? 'fade-in' : ''}>
            <AgentChatPanel
              messages={chatMessages}
              isAnalysisInProgress={isAnalysisInProgress}
            />
          </div>
        </div>

        {/* Analysis Panels Grid */}
        <div 
          className="analysis-panels-grid"
          role="region"
          aria-label="Pricing analysis results"
        >
          {/* Demand Analysis Panel */}
          <div 
            className={animationState.demandUpdated ? 'fade-in' : ''}
            {...(animationState.demandUpdated && createLiveRegionAttributes('polite', false))}
          >
            <DemandAnalysisPanel
              analysis={demandAnalysisData}
              loading={!dashboardState.demandForecast && isAnalysisInProgress}
              error={null}
              onRetry={handleRetry}
            />
          </div>

          {/* Competitive Analysis Panel */}
          <div 
            className={animationState.competitiveUpdated ? 'fade-in' : ''}
            {...(animationState.competitiveUpdated && createLiveRegionAttributes('polite', false))}
          >
            <CompetitiveAnalysisPanel
              analysis={competitiveAnalysisData}
              loading={!dashboardState.competitiveAnalysis && isAnalysisInProgress}
              error={null}
              onRetry={handleRetry}
            />
          </div>

          {/* Margin Analysis Panel */}
          <div 
            className={animationState.marginUpdated ? 'fade-in' : ''}
            {...(animationState.marginUpdated && createLiveRegionAttributes('polite', false))}
          >
            <MarginAnalysisPanel
              analysis={marginAnalysisData}
              loading={!dashboardState.marginAnalysis && isAnalysisInProgress}
              error={null}
              onRetry={handleRetry}
            />
          </div>
        </div>

        {/* Final Recommendations Section */}
        <div className="dashboard-grid-full">
          {isAnalysisComplete && (
            <Container
              header={
                <Header variant="h2">
                  Final Recommendations
                </Header>
              }
            >
              <Alert
                statusIconAriaLabel="Success"
                type="success"
                header="Pricing Analysis Complete"
                className="responsive-alert"
              >
                All analysis components have completed successfully. Review the recommendations above
                and consider the compliance status before finalizing pricing decisions.
              </Alert>
            </Container>
          )}
        </div>
      </SpaceBetween>
      </ContentLayout>
    </div>
  );
};

export default PricingDashboardPage;
