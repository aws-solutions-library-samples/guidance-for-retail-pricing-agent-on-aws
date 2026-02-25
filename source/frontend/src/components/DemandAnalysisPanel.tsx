/**
 * @fileoverview DemandAnalysisPanel component for pricing dashboard.
 * 
 * Displays demand-based pricing recommendations with confidence intervals,
 * pricing rationale, and detailed analysis. Shows all information immediately
 * for better user experience and accessibility.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 7.1, 7.2, 7.3, 7.4
 */

import React from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Alert,
  ProgressBar,
  ColumnLayout,
  Button,
  StatusIndicator
} from '@cloudscape-design/components';
import { formatPrice } from '../types/product-types';

/**
 * Confidence intervals data structure.
 */
export interface ConfidenceIntervals {
  /** 10th percentile price */
  p10: number;
  /** 50th percentile (median) price */
  p50: number;
  /** 90th percentile price */
  p90: number;
}

/**
 * Demand analysis result data structure.
 */
export interface DemandAnalysisResult {
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
  /** Optional historical demand data for charts */
  historicalData?: Array<{ date: string; demand: number }>;
}

/**
 * Props for DemandAnalysisPanel component.
 */
export interface DemandAnalysisPanelProps {
  /** Demand analysis result data */
  analysis: DemandAnalysisResult | null;
  /** Loading state indicator */
  loading: boolean;
  /** Error object if analysis failed */
  error: Error | null;
  /** Callback to retry failed analysis */
  onRetry: () => void;
}

/**
 * DemandAnalysisPanel component.
 * 
 * Displays demand-based pricing recommendations with all details visible.
 * Shows key metrics, confidence intervals, and pricing rationale immediately.
 * Highlights low confidence warnings and provides comprehensive demand insights.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const DemandAnalysisPanel: React.FC<DemandAnalysisPanelProps> = ({
  analysis,
  loading,
  error,
  onRetry
}) => {

  /**
   * Gets the confidence level color based on score.
   * 
   * @param score - Confidence score (0-100)
   * @returns Color identifier for progress bar
   */
  const getConfidenceColor = (score: number): 'success' | 'info' | 'warning' | 'error' => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'info';
    if (score >= 40) return 'warning';
    return 'error';
  };

  /**
   * Gets the confidence level description.
   * 
   * @param score - Confidence score (0-100)
   * @returns Confidence level text
   */
  const getConfidenceLevel = (score: number): string => {
    if (score >= 90) return 'Very High';
    if (score >= 75) return 'High';
    if (score >= 60) return 'Medium';
    if (score >= 40) return 'Low';
    return 'Very Low';
  };

  /**
   * Determines if confidence is low (below 60%).
   * 
   * @param score - Confidence score (0-100)
   * @returns True if confidence is low
   */
  const isLowConfidence = (score: number): boolean => {
    return score < 60;
  };

  // Handle error state
  if (error) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            description="Demand-based pricing recommendations"
          >
            Demand Analysis
          </Header>
        }
      >
        <Alert
          statusIconAriaLabel="Error"
          type="error"
          header="Demand Analysis Failed"
          action={
            <Button variant="primary" onClick={onRetry}>
              Retry Analysis
            </Button>
          }
        >
          {error.message || 'An error occurred while analyzing demand patterns.'}
          <Box margin={{ top: 's' }} color="text-body-secondary">
            The demand forecasting agent encountered an error. Please try again or contact support if the problem persists.
          </Box>
        </Alert>
      </Container>
    );
  }

  // Handle loading state
  if (loading || !analysis) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            description="Demand-based pricing recommendations"
          >
            Demand Analysis
          </Header>
        }
      >
        <Box textAlign="center" padding={{ vertical: 'xxl' }}>
          <SpaceBetween direction="vertical" size="m">
            <StatusIndicator type="loading">
              Analyzing demand patterns...
            </StatusIndicator>
            <Box color="text-body-secondary" fontSize="body-s">
              Processing historical sales data and forecasting demand trends
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  }

  // Render analysis results
  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Demand-based pricing recommendations with confidence analysis"
        >
          Demand Analysis
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {/* Low Confidence Warning */}
        {isLowConfidence(analysis.confidence) && (
          <Alert
            statusIconAriaLabel="Warning"
            type="warning"
            header="Low Confidence Warning"
          >
            The demand analysis has a confidence score of {analysis.confidence}%, which is below the recommended threshold.
            <Box margin={{ top: 's' }} color="text-body-secondary">
              This may be due to limited historical data, high demand volatility, or seasonal patterns.
              Consider reviewing the detailed analysis and rationale before making pricing decisions.
            </Box>
          </Alert>
        )}

        {/* Summary View - Always Visible */}
        <div>
          <SpaceBetween direction="vertical" size="m">
            {/* Recommended Price - Prominent Display */}
            <Box textAlign="center" padding={{ vertical: 'm' }}>
              <Box variant="awsui-key-label" margin={{ bottom: 's' }}>
                Recommended Price
              </Box>
              <div
                data-testid="demand-recommended-price"
                style={{
                  fontSize: '36px',
                  lineHeight: '1.2',
                  fontWeight: 'bold',
                  color: isLowConfidence(analysis.confidence) ? '#f89406' : '#0972d3'
                }}
              >
                {formatPrice(analysis.recommendedPrice)}
              </div>
              <Box
                margin={{ top: 's' }}
                color="text-body-secondary"
                fontSize="body-s"
              >
                Based on demand forecasting and historical patterns
              </Box>
            </Box>

            {/* Key Metrics Grid */}
            <ColumnLayout columns={3} variant="text-grid">
              {/* Price Floor */}
              <div>
                <Box variant="awsui-key-label">Price Floor</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {formatPrice(analysis.priceFloor)}
                </Box>
                <Box color="text-body-secondary" fontSize="body-s">
                  Minimum recommended price
                </Box>
              </div>

              {/* Price Ceiling */}
              <div>
                <Box variant="awsui-key-label">Price Ceiling</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {formatPrice(analysis.priceCeiling)}
                </Box>
                <Box color="text-body-secondary" fontSize="body-s">
                  Maximum recommended price
                </Box>
              </div>

              {/* Confidence Score */}
              <div>
                <Box variant="awsui-key-label">Confidence Score</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {analysis.confidence}%
                </Box>
                <Box color="text-body-secondary" fontSize="body-s">
                  {getConfidenceLevel(analysis.confidence)} confidence
                </Box>
              </div>
            </ColumnLayout>

            {/* Confidence Score Progress Bar */}
            <div>
              <ProgressBar
                value={analysis.confidence}
                label="Confidence Score"
                description={`${getConfidenceLevel(analysis.confidence)} confidence in demand-based pricing recommendation`}
                additionalInfo={`${analysis.confidence}%`}
                resultText={`${analysis.confidence}%`}
                status={
                  analysis.confidence >= 80 ? 'success' :
                  analysis.confidence >= 60 ? 'in-progress' :
                  'error'
                }
              />
            </div>
          </SpaceBetween>
        </div>

        {/* Detailed Analysis Section */}
        <Container
          header={
            <Header
              variant="h3"
              description="Complete demand analysis with confidence intervals and rationale"
            >
              Detailed Analysis
            </Header>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            {/* Confidence Intervals */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Confidence Intervals
              </Box>
              <Box margin={{ bottom: 'm' }} color="text-body-secondary" fontSize="body-s">
                Statistical price predictions at different confidence levels
              </Box>
              
              <ColumnLayout columns={3} variant="text-grid">
                {/* P10 - 10th Percentile */}
                <div>
                  <Box variant="awsui-key-label">P10 (Conservative)</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.confidenceIntervals.p10)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    10th percentile - Lower bound estimate with 90% confidence
                  </Box>
                </div>

                {/* P50 - 50th Percentile (Median) */}
                <div>
                  <Box variant="awsui-key-label">P50 (Median)</Box>
                  <Box fontSize="heading-l" fontWeight="bold" color="text-status-info">
                    {formatPrice(analysis.confidenceIntervals.p50)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    50th percentile - Median estimate with balanced confidence
                  </Box>
                </div>

                {/* P90 - 90th Percentile */}
                <div>
                  <Box variant="awsui-key-label">P90 (Optimistic)</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.confidenceIntervals.p90)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    90th percentile - Upper bound estimate with 90% confidence
                  </Box>
                </div>
              </ColumnLayout>

              {/* Visual Confidence Interval Range */}
              <Box margin={{ top: 'm' }}>
                <div
                  style={{
                    position: 'relative',
                    height: '60px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}
                  role="img"
                  aria-label={`Confidence interval range from ${formatPrice(analysis.confidenceIntervals.p10)} to ${formatPrice(analysis.confidenceIntervals.p90)}`}
                >
                  {/* Confidence Range Background */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'linear-gradient(to right, #d1ecf1 0%, #0972d3 50%, #d1ecf1 100%)',
                      opacity: 0.3
                    }}
                  />

                  {/* P10 Marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '10%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '2px',
                      height: '80%',
                      backgroundColor: '#6c757d'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '10%',
                      top: '10px',
                      transform: 'translateX(-50%)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#6c757d'
                    }}
                  >
                    P10
                  </div>

                  {/* P50 Marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '3px',
                      height: '100%',
                      backgroundColor: '#0972d3'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '10px',
                      transform: 'translateX(-50%)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#0972d3'
                    }}
                  >
                    P50
                  </div>

                  {/* P90 Marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '90%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '2px',
                      height: '80%',
                      backgroundColor: '#6c757d'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '90%',
                      top: '10px',
                      transform: 'translateX(-50%)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#6c757d'
                    }}
                  >
                    P90
                  </div>
                </div>
              </Box>
            </div>

            {/* Pricing Rationale */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Pricing Rationale
              </Box>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}
              >
                <Box fontSize="body-m">
                  {analysis.rationale}
                </Box>
              </div>
            </div>

            {/* Price Range Summary */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Price Range Summary
              </Box>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}
              >
                <SpaceBetween direction="vertical" size="s">
                  <Box>
                    The demand analysis recommends a price of{' '}
                    <strong>{formatPrice(analysis.recommendedPrice)}</strong> based on
                    historical demand patterns and forecasting models.
                  </Box>
                  <Box>
                    The acceptable price range is between{' '}
                    <strong>{formatPrice(analysis.priceFloor)}</strong> (floor) and{' '}
                    <strong>{formatPrice(analysis.priceCeiling)}</strong> (ceiling), with
                    a confidence score of <strong>{analysis.confidence}%</strong>.
                  </Box>
                  <Box>
                    Confidence intervals provide statistical bounds: P10 at{' '}
                    <strong>{formatPrice(analysis.confidenceIntervals.p10)}</strong>, P50 at{' '}
                    <strong>{formatPrice(analysis.confidenceIntervals.p50)}</strong>, and P90 at{' '}
                    <strong>{formatPrice(analysis.confidenceIntervals.p90)}</strong>.
                  </Box>
                  {isLowConfidence(analysis.confidence) && (
                    <Box color="text-status-warning">
                      ⚠ Note: The confidence score is below 60%, indicating higher uncertainty
                      in the demand forecast. Consider additional market research or wait for
                      more historical data before finalizing pricing decisions.
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            </div>

            {/* Historical Data Section (if available) */}
            {analysis.historicalData && analysis.historicalData.length > 0 && (
              <div>
                <Box variant="h3" margin={{ bottom: 's' }}>
                  Historical Demand Data
                </Box>
                <Box color="text-body-secondary" fontSize="body-s" margin={{ bottom: 'm' }}>
                  {analysis.historicalData.length} data points analyzed
                </Box>
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef'
                  }}
                >
                  <Box color="text-body-secondary">
                    Historical demand chart visualization would be displayed here.
                    Data includes {analysis.historicalData.length} historical demand records
                    used for forecasting analysis.
                  </Box>
                </div>
              </div>
            )}
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Container>
  );
};
