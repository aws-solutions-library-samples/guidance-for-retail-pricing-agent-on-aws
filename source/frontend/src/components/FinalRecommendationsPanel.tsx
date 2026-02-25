/**
 * @fileoverview FinalRecommendationsPanel wrapper component.
 * 
 * Wraps the FinalRecommendations component to handle:
 * - Parsing finalRecommendation JSON from subscription data
 * - Conditional rendering based on analysis status
 * - Loading/waiting states for incomplete analysis
 * - Error handling for parsing failures
 * 
 * Requirements addressed:
 * - 9.1: Display panel only when status is 'completed'
 * - 9.2: Parse and display finalRecommendation data
 * - 9.3: Display suggested price prominently
 * - 9.4: Show price range (min/max)
 * - 9.5: Display confidence gauge and compliance badges
 * - 9.6: Display warning banner when requiresReview is true
 * - 9.7: Hide/disable panel with appropriate messaging for non-completed status
 */

import React from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Spinner,
  Alert,
  Button
} from '@cloudscape-design/components';
import { FinalRecommendations } from './FinalRecommendations';
import type { PricingAnalysisStatus, FinalRecommendationData } from '../graphql/types';
import { parseFinalRecommendation, isSuccessStatus, isFailureStatus, isInProgressStatus } from '../graphql/types';

/**
 * Props for FinalRecommendationsPanel wrapper component.
 */
export interface FinalRecommendationsPanelProps {
  /** Final recommendation JSON string from subscription data */
  finalRecommendationJson: string | null | undefined;
  /** Current analysis status */
  status: PricingAnalysisStatus;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
}

/**
 * Gets status-specific message for non-completed states.
 * 
 * @param status - Current analysis status
 * @param hasFinalRecommendation - Whether final recommendation data is available
 * @returns Status-specific message
 */
const getStatusMessage = (status: PricingAnalysisStatus, hasFinalRecommendation: boolean): string => {
  const messages: Record<PricingAnalysisStatus, string> = {
    'initiated': 'Analysis has been initiated. Waiting for agents to process...',
    'in_progress': 'Analysis is in progress. Final recommendations will appear when complete.',
    'demand_analysis_complete': 'Demand analysis complete. Waiting for competitive and margin analysis...',
    'competitive_analysis_complete': 'Competitive analysis complete. Waiting for margin analysis...',
    'margin_analysis_complete': hasFinalRecommendation 
      ? 'Final recommendations ready.' 
      : 'Margin analysis complete. Generating final recommendations...',
    'completed': 'Analysis complete.',
    'success': 'Analysis complete.',
    'failed': 'Analysis failed. Unable to generate recommendations.',
    'error': 'An error occurred during analysis.'
  };
  return messages[status] || 'Waiting for analysis to complete...';
};

/**
 * Gets progress percentage for status display.
 * 
 * @param status - Current analysis status
 * @param hasFinalRecommendation - Whether final recommendation data is available
 * @returns Progress percentage (0-100)
 */
const getProgressPercentage = (status: PricingAnalysisStatus, hasFinalRecommendation: boolean): number => {
  const progressMap: Record<PricingAnalysisStatus, number> = {
    'initiated': 10,
    'in_progress': 25,
    'demand_analysis_complete': 50,
    'competitive_analysis_complete': 70,
    'margin_analysis_complete': hasFinalRecommendation ? 100 : 90,
    'completed': 100,
    'success': 100,
    'failed': 0,
    'error': 0
  };
  return progressMap[status] ?? 0;
};

/**
 * FinalRecommendationsPanel wrapper component.
 * 
 * Handles parsing of finalRecommendation JSON and conditional rendering
 * based on analysis status. Shows appropriate loading/waiting states
 * when analysis is not yet complete.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const FinalRecommendationsPanel: React.FC<FinalRecommendationsPanelProps> = ({
  finalRecommendationJson,
  status,
  loading = false,
  error = null,
  onRetry
}) => {
  /**
   * Parse the final recommendation JSON data.
   * Returns null if parsing fails or data is not available.
   */
  const parsedData: FinalRecommendationData | null = React.useMemo(() => {
    if (!finalRecommendationJson) {
      return null;
    }
    return parseFinalRecommendation(finalRecommendationJson);
  }, [finalRecommendationJson]);

  /**
   * Renders the loading state.
   */
  const renderLoadingState = () => (
    <Container
      header={
        <Header
          variant="h2"
          description="Loading final recommendations..."
        >
          Final Recommendations
        </Header>
      }
    >
      <Box textAlign="center" padding={{ vertical: 'xl' }}>
        <SpaceBetween direction="vertical" size="m">
          <Spinner size="large" />
          <Box color="text-body-secondary">
            Loading recommendation data...
          </Box>
        </SpaceBetween>
      </Box>
    </Container>
  );

  /**
   * Renders the error state.
   */
  const renderErrorState = () => (
    <Container
      header={
        <Header
          variant="h2"
          description="Unable to load final recommendations"
        >
          Final Recommendations
        </Header>
      }
    >
      <Alert
        statusIconAriaLabel="Error"
        type="error"
        header="Failed to Load Recommendations"
        action={
          onRetry && (
            <Button onClick={onRetry}>
              Retry
            </Button>
          )
        }
      >
        {error?.message || 'An error occurred while loading the final recommendations.'}
      </Alert>
    </Container>
  );

  /**
   * Renders the waiting state for in-progress analysis.
   * 
   * Requirements addressed:
   * - 9.7: Hide/disable panel with appropriate messaging for non-completed status
   */
  const renderWaitingState = () => {
    const progress = getProgressPercentage(status, !!finalRecommendationJson);
    const message = getStatusMessage(status, !!finalRecommendationJson);

    return (
      <Container
        header={
          <Header
            variant="h2"
            description="Waiting for analysis to complete"
          >
            Final Recommendations
          </Header>
        }
      >
        <Box textAlign="center" padding={{ vertical: 'xl' }}>
          <SpaceBetween direction="vertical" size="l">
            {/* Progress indicator */}
            <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
              <Box variant="awsui-key-label" margin={{ bottom: 'xs' }}>
                Analysis Progress
              </Box>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#0972d3',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-in-out'
                  }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Analysis progress: ${progress}%`}
                />
              </div>
              <Box
                fontSize="body-s"
                color="text-body-secondary"
                textAlign="center"
                margin={{ top: 'xs' }}
              >
                {progress}% complete
              </Box>
            </div>

            {/* Status message */}
            <Box color="text-body-secondary">
              {message}
            </Box>

            {/* Animated waiting indicator */}
            <Box>
              <Spinner size="normal" />
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  };

  /**
   * Renders the failed state.
   * 
   * Requirements addressed:
   * - 9.7: Display appropriate messaging for failed status
   */
  const renderFailedState = () => (
    <Container
      header={
        <Header
          variant="h2"
          description="Analysis failed"
        >
          Final Recommendations
        </Header>
      }
    >
      <Alert
        statusIconAriaLabel="Error"
        type="error"
        header="Analysis Failed"
        action={
          onRetry && (
            <Button onClick={onRetry}>
              Retry Analysis
            </Button>
          )
        }
      >
        The pricing analysis failed and could not generate final recommendations.
        Please try starting a new analysis or contact support if the issue persists.
      </Alert>
    </Container>
  );

  /**
   * Renders the parsing error state when data exists but cannot be parsed.
   */
  const renderParsingErrorState = () => (
    <Container
      header={
        <Header
          variant="h2"
          description="Unable to parse recommendation data"
        >
          Final Recommendations
        </Header>
      }
    >
      <Alert
        statusIconAriaLabel="Warning"
        type="warning"
        header="Data Format Error"
        action={
          onRetry && (
            <Button onClick={onRetry}>
              Refresh
            </Button>
          )
        }
      >
        The final recommendation data could not be parsed. This may indicate a 
        data format issue. Please try refreshing or contact support.
      </Alert>
    </Container>
  );

  // Handle loading state
  if (loading) {
    return renderLoadingState();
  }

  // Handle error state
  if (error) {
    return renderErrorState();
  }

  // Handle failed/error status
  if (isFailureStatus(status)) {
    return renderFailedState();
  }

  // Handle margin_analysis_complete with final recommendation data
  // The backend sets status to 'margin_analysis_complete' AND includes finalRecommendation
  // at the same time, so we should show the recommendations immediately
  if (status === 'margin_analysis_complete' && parsedData) {
    return (
      <FinalRecommendations
        suggestedPrice={parsedData.suggestedPrice}
        priceRange={parsedData.priceRange}
        confidence={parsedData.confidence}
        mapCompliant={parsedData.mapCompliant}
        marginCompliant={parsedData.marginCompliant}
        requiresReview={parsedData.requiresReview}
        reviewReason={parsedData.reviewReason}
      />
    );
  }

  // Handle in-progress status - show waiting state
  // Requirements: 9.1, 9.7 - Show panel only when status is 'completed'
  if (isInProgressStatus(status) || status === 'initiated') {
    return renderWaitingState();
  }

  // Handle completed status but no data (edge case)
  if (isSuccessStatus(status) && !finalRecommendationJson) {
    return renderWaitingState();
  }

  // Handle completed status but parsing failed
  if (isSuccessStatus(status) && finalRecommendationJson && !parsedData) {
    return renderParsingErrorState();
  }

  // Handle completed status with valid data
  // Requirements: 9.2, 9.3, 9.4, 9.5, 9.6 - Display all recommendation fields
  if (isSuccessStatus(status) && parsedData) {
    return (
      <FinalRecommendations
        suggestedPrice={parsedData.suggestedPrice}
        priceRange={parsedData.priceRange}
        confidence={parsedData.confidence}
        mapCompliant={parsedData.mapCompliant}
        marginCompliant={parsedData.marginCompliant}
        requiresReview={parsedData.requiresReview}
        reviewReason={parsedData.reviewReason}
      />
    );
  }

  // Default: show waiting state
  return renderWaitingState();
};

export default FinalRecommendationsPanel;
