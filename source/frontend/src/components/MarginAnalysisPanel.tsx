/**
 * @fileoverview MarginAnalysisPanel component for pricing dashboard.
 * 
 * Displays margin analysis results with compliance status, calculated margins,
 * and detailed breakdown. Shows all information immediately for better user
 * experience and accessibility.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 7.2, 7.3, 7.4
 */

import React from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Alert,
  ColumnLayout,
  Button,
  StatusIndicator,
  Badge
} from '@cloudscape-design/components';
import { formatPrice } from '../types/product-types';

/**
 * Margin analysis result data structure.
 */
export interface MarginAnalysisResult {
  /** Suggested price from margin analysis */
  suggestedPrice: number;
  /** Minimum acceptable price */
  minPrice: number;
  /** Maximum acceptable price */
  maxPrice: number;
  /** Calculated margin percentage */
  calculatedMargin: number;
  /** Base margin rate (before adjustments) */
  baseMarginRate: number;
  /** Adjusted margin rate (after adjustments) */
  adjustedMarginRate: number;
  /** MAP compliance status */
  mapCompliant: boolean;
  /** Margin compliance status */
  marginCompliant: boolean;
  /** Whether manual review is required */
  requiresReview: boolean;
  /** Optional reason for review requirement */
  reviewReason?: string;
}

/**
 * Props for MarginAnalysisPanel component.
 */
export interface MarginAnalysisPanelProps {
  /** Margin analysis result data */
  analysis: MarginAnalysisResult | null;
  /** Loading state indicator */
  loading: boolean;
  /** Error object if analysis failed */
  error: Error | null;
  /** Callback to retry failed analysis */
  onRetry: () => void;
}

/**
 * MarginAnalysisPanel component.
 * 
 * Displays margin analysis results with summary and detailed views.
 * Summary view shows key metrics and compliance status by default,
 * with expandable section for detailed margin breakdown and calculations.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const MarginAnalysisPanel: React.FC<MarginAnalysisPanelProps> = ({
  analysis,
  loading,
  error,
  onRetry
}) => {
  /**
   * Gets the margin status color based on compliance.
   * 
   * @param margin - Margin percentage
   * @param compliant - Whether margin is compliant
   * @returns Color identifier
   */
  const getMarginColor = (margin: number, compliant: boolean): string => {
    if (!compliant) return '#d13212'; // Red for non-compliant
    if (margin >= 40) return '#037f0c'; // Green for healthy margin
    if (margin >= 25) return '#0972d3'; // Blue for acceptable margin
    return '#f89406'; // Orange for low margin
  };

  /**
   * Gets the margin status description.
   * 
   * @param margin - Margin percentage
   * @param compliant - Whether margin is compliant
   * @returns Status description
   */
  const getMarginStatus = (margin: number, compliant: boolean): string => {
    if (!compliant) return 'Below Minimum';
    if (margin >= 40) return 'Healthy';
    if (margin >= 25) return 'Acceptable';
    return 'Low';
  };

  // Handle error state
  if (error) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            description="Margin compliance and profitability analysis"
          >
            Margin Analysis
          </Header>
        }
      >
        <Alert
          statusIconAriaLabel="Error"
          type="error"
          header="Margin Analysis Failed"
          action={
            <Button variant="primary" onClick={onRetry}>
              Retry Analysis
            </Button>
          }
        >
          {error.message || 'An error occurred while analyzing margins and compliance.'}
          <Box margin={{ top: 's' }} color="text-body-secondary">
            The margin analysis agent encountered an error. Please try again or contact support if the problem persists.
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
            description="Margin compliance and profitability analysis"
          >
            Margin Analysis
          </Header>
        }
      >
        <Box textAlign="center" padding={{ vertical: 'xxl' }}>
          <SpaceBetween direction="vertical" size="m">
            <StatusIndicator type="loading">
              Analyzing margins and compliance...
            </StatusIndicator>
            <Box color="text-body-secondary" fontSize="body-s">
              Validating MAP compliance and calculating profit margins
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  }

  // Determine overall compliance status
  const isFullyCompliant = analysis.mapCompliant && analysis.marginCompliant;
  const hasComplianceIssues = !analysis.mapCompliant || !analysis.marginCompliant;

  // Render analysis results
  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Margin compliance and profitability analysis with detailed breakdown"
        >
          Margin Analysis
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {/* Compliance Issues Warning */}
        {hasComplianceIssues && (
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header="Compliance Issues Detected"
          >
            {!analysis.mapCompliant && !analysis.marginCompliant && 
              'Both MAP and margin compliance requirements are not met.'}
            {!analysis.mapCompliant && analysis.marginCompliant && 
              'MAP compliance requirement is not met.'}
            {analysis.mapCompliant && !analysis.marginCompliant && 
              'Margin compliance requirement is not met.'}
            <Box margin={{ top: 's' }} color="text-body-secondary">
              Review the detailed breakdown below for specific compliance violations and recommendations.
            </Box>
          </Alert>
        )}

        {/* Manual Review Required Warning */}
        {analysis.requiresReview && (
          <Alert
            statusIconAriaLabel="Warning"
            type="warning"
            header="Manual Review Required"
          >
            {analysis.reviewReason || 'This pricing recommendation requires manual review before implementation.'}
            <Box margin={{ top: 's' }} color="text-body-secondary">
              Please review the margin calculations and compliance status carefully before proceeding.
            </Box>
          </Alert>
        )}

        {/* Summary View - Always Visible */}
        <div>
          <SpaceBetween direction="vertical" size="m">
            {/* Suggested Price - Prominent Display */}
            <Box textAlign="center" padding={{ vertical: 'm' }}>
              <Box variant="awsui-key-label" margin={{ bottom: 's' }}>
                Suggested Price
              </Box>
              <div
                data-testid="margin-suggested-price"
                style={{
                  fontSize: '36px',
                  lineHeight: '1.2',
                  fontWeight: 'bold',
                  color: isFullyCompliant ? '#037f0c' : '#d13212'
                }}
              >
                {formatPrice(analysis.suggestedPrice)}
              </div>
              <Box
                margin={{ top: 's' }}
                color="text-body-secondary"
                fontSize="body-s"
              >
                Based on margin requirements and compliance rules
              </Box>
            </Box>

            {/* Key Metrics Grid */}
            <ColumnLayout columns={3} variant="text-grid">
              {/* Calculated Margin */}
              <div>
                <Box variant="awsui-key-label">Calculated Margin</Box>
                <div
                  style={{ 
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: getMarginColor(analysis.calculatedMargin, analysis.marginCompliant) 
                  }}
                >
                  {analysis.calculatedMargin.toFixed(2)}%
                </div>
                <Box color="text-body-secondary" fontSize="body-s">
                  {getMarginStatus(analysis.calculatedMargin, analysis.marginCompliant)} margin
                </Box>
              </div>

              {/* MAP Compliance */}
              <div>
                <Box variant="awsui-key-label">MAP Compliance</Box>
                <Badge
                  color={analysis.mapCompliant ? 'green' : 'red'}
                  data-testid="map-compliance-badge"
                >
                  {analysis.mapCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
                </Badge>
                <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                  {analysis.mapCompliant 
                    ? 'Meets MAP requirements' 
                    : 'Below MAP threshold'}
                </Box>
              </div>

              {/* Margin Compliance */}
              <div>
                <Box variant="awsui-key-label">Margin Compliance</Box>
                <Badge
                  color={analysis.marginCompliant ? 'green' : 'red'}
                  data-testid="margin-compliance-badge"
                >
                  {analysis.marginCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
                </Badge>
                <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                  {analysis.marginCompliant 
                    ? 'Meets margin requirements' 
                    : 'Below margin threshold'}
                </Box>
              </div>
            </ColumnLayout>

            {/* Compliance Status Summary */}
            {isFullyCompliant && !analysis.requiresReview && (
              <Alert
                statusIconAriaLabel="Success"
                type="success"
                header="All Compliance Checks Passed"
              >
                The suggested price meets all MAP and margin compliance requirements.
              </Alert>
            )}
          </SpaceBetween>
        </div>

        {/* Detailed Margin Breakdown Section */}
        <Container
          header={
            <Header
              variant="h3"
              description="Complete margin calculations and compliance details"
            >
              Detailed Margin Breakdown
            </Header>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            {/* Price Range Details */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Price Range
              </Box>
              <Box margin={{ bottom: 'm' }} color="text-body-secondary" fontSize="body-s">
                Acceptable price range based on margin requirements
              </Box>
              
              <ColumnLayout columns={3} variant="text-grid">
                {/* Minimum Price */}
                <div>
                  <Box variant="awsui-key-label">Minimum Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.minPrice)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Lowest acceptable price meeting margin requirements
                  </Box>
                </div>

                {/* Suggested Price */}
                <div>
                  <Box variant="awsui-key-label">Suggested Price</Box>
                  <div
                    style={{ 
                      fontSize: '28px',
                      fontWeight: 'bold',
                      color: isFullyCompliant ? '#037f0c' : '#d13212'
                    }}
                  >
                    {formatPrice(analysis.suggestedPrice)}
                  </div>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Recommended price balancing margin and competitiveness
                  </Box>
                </div>

                {/* Maximum Price */}
                <div>
                  <Box variant="awsui-key-label">Maximum Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.maxPrice)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Highest acceptable price before market resistance
                  </Box>
                </div>
              </ColumnLayout>

              {/* Visual Price Range Bar */}
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
                  aria-label={`Price range from ${formatPrice(analysis.minPrice)} to ${formatPrice(analysis.maxPrice)}`}
                >
                  {/* Range Background */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: isFullyCompliant 
                        ? 'linear-gradient(to right, #d4edda 0%, #c3e6cb 50%, #d4edda 100%)'
                        : 'linear-gradient(to right, #f8d7da 0%, #f5c6cb 50%, #f8d7da 100%)',
                      opacity: 0.5
                    }}
                  />

                  {/* Min Price Marker */}
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
                    Min
                  </div>

                  {/* Suggested Price Marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '3px',
                      height: '100%',
                      backgroundColor: isFullyCompliant ? '#037f0c' : '#d13212'
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
                      color: isFullyCompliant ? '#037f0c' : '#d13212'
                    }}
                  >
                    Suggested
                  </div>

                  {/* Max Price Marker */}
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
                    Max
                  </div>
                </div>
              </Box>
            </div>

            {/* Margin Breakdown */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Margin Breakdown
              </Box>
              <Box margin={{ bottom: 'm' }} color="text-body-secondary" fontSize="body-s">
                Detailed margin rate calculations and adjustments
              </Box>
              
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}
              >
                <SpaceBetween direction="vertical" size="m">
                  {/* Base Margin Rate */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Box variant="awsui-key-label">Base Margin Rate</Box>
                      <Box color="text-body-secondary" fontSize="body-s">
                        Standard margin requirement for product category
                      </Box>
                    </div>
                    <Box fontSize="heading-m" fontWeight="bold">
                      {analysis.baseMarginRate.toFixed(2)}%
                    </Box>
                  </div>

                  {/* Adjusted Margin Rate */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Box variant="awsui-key-label">Adjusted Margin Rate</Box>
                      <Box color="text-body-secondary" fontSize="body-s">
                        Margin rate after applying adjustments and rules
                      </Box>
                    </div>
                    <Box fontSize="heading-m" fontWeight="bold">
                      {analysis.adjustedMarginRate.toFixed(2)}%
                    </Box>
                  </div>

                  {/* Calculated Margin */}
                  <div 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      paddingTop: '12px',
                      borderTop: '2px solid #dee2e6'
                    }}
                  >
                    <div>
                      <Box variant="awsui-key-label">Calculated Margin</Box>
                      <Box color="text-body-secondary" fontSize="body-s">
                        Actual margin at suggested price
                      </Box>
                    </div>
                    <div
                      style={{ 
                        fontSize: '28px',
                        fontWeight: 'bold',
                        color: getMarginColor(analysis.calculatedMargin, analysis.marginCompliant) 
                      }}
                    >
                      {analysis.calculatedMargin.toFixed(2)}%
                    </div>
                  </div>
                </SpaceBetween>
              </div>
            </div>

            {/* MAP Compliance Details */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                MAP Compliance Details
              </Box>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: analysis.mapCompliant ? '#d4edda' : '#f8d7da',
                  borderRadius: '8px',
                  border: `1px solid ${analysis.mapCompliant ? '#c3e6cb' : '#f5c6cb'}`
                }}
              >
                <SpaceBetween direction="vertical" size="s">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge color={analysis.mapCompliant ? 'green' : 'red'}>
                      {analysis.mapCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
                    </Badge>
                    <Box fontWeight="bold">
                      Minimum Advertised Price (MAP) Compliance
                    </Box>
                  </div>
                  <Box>
                    {analysis.mapCompliant 
                      ? 'The suggested price meets or exceeds the minimum advertised price requirements set by the manufacturer.'
                      : 'The suggested price is below the minimum advertised price threshold. This price cannot be advertised publicly and may violate manufacturer agreements.'}
                  </Box>
                  {!analysis.mapCompliant && (
                    <Box color="text-status-error" fontWeight="bold">
                      ⚠ Action Required: Adjust price to meet MAP requirements or obtain manufacturer approval.
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            </div>

            {/* Margin Compliance Details */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Margin Compliance Details
              </Box>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: analysis.marginCompliant ? '#d4edda' : '#f8d7da',
                  borderRadius: '8px',
                  border: `1px solid ${analysis.marginCompliant ? '#c3e6cb' : '#f5c6cb'}`
                }}
              >
                <SpaceBetween direction="vertical" size="s">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge color={analysis.marginCompliant ? 'green' : 'red'}>
                      {analysis.marginCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
                    </Badge>
                    <Box fontWeight="bold">
                      Margin Requirement Compliance
                    </Box>
                  </div>
                  <Box>
                    {analysis.marginCompliant 
                      ? `The calculated margin of ${analysis.calculatedMargin.toFixed(2)}% meets or exceeds the minimum margin requirement of ${analysis.adjustedMarginRate.toFixed(2)}%.`
                      : `The calculated margin of ${analysis.calculatedMargin.toFixed(2)}% is below the minimum margin requirement of ${analysis.adjustedMarginRate.toFixed(2)}%.`}
                  </Box>
                  {!analysis.marginCompliant && (
                    <Box color="text-status-error" fontWeight="bold">
                      ⚠ Action Required: Increase price to meet minimum margin requirements or obtain approval for exception.
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            </div>

            {/* Requires Review Flag */}
            {analysis.requiresReview && (
              <div>
                <Box variant="h3" margin={{ bottom: 's' }}>
                  Manual Review Required
                </Box>
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#fff3cd',
                    borderRadius: '8px',
                    border: '1px solid #ffeaa7'
                  }}
                >
                  <SpaceBetween direction="vertical" size="s">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Badge color="severity-medium">
                        ⚠ Review Required
                      </Badge>
                      <Box fontWeight="bold">
                        Manual Review Recommended
                      </Box>
                    </div>
                    <Box>
                      {analysis.reviewReason || 
                        'This pricing recommendation requires manual review due to compliance issues, unusual margin calculations, or other factors that need human oversight.'}
                    </Box>
                    <Box fontWeight="bold">
                      Please review all compliance details and margin calculations before implementing this price.
                    </Box>
                  </SpaceBetween>
                </div>
              </div>
            )}

            {/* Detailed Calculations Summary */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Calculation Summary
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
                    The margin analysis evaluated the suggested price of{' '}
                    <strong>{formatPrice(analysis.suggestedPrice)}</strong> against margin
                    requirements and MAP compliance rules.
                  </Box>
                  <Box>
                    The acceptable price range is between{' '}
                    <strong>{formatPrice(analysis.minPrice)}</strong> (minimum) and{' '}
                    <strong>{formatPrice(analysis.maxPrice)}</strong> (maximum), with a
                    calculated margin of <strong>{analysis.calculatedMargin.toFixed(2)}%</strong>.
                  </Box>
                  <Box>
                    The base margin rate of <strong>{analysis.baseMarginRate.toFixed(2)}%</strong>{' '}
                    was adjusted to <strong>{analysis.adjustedMarginRate.toFixed(2)}%</strong>{' '}
                    based on product category, market conditions, and business rules.
                  </Box>
                  {isFullyCompliant && !analysis.requiresReview && (
                    <Box color="text-status-success">
                      ✓ All compliance checks passed. This price meets MAP and margin requirements
                      and can be implemented without additional approval.
                    </Box>
                  )}
                  {hasComplianceIssues && (
                    <Box color="text-status-error">
                      ⚠ Compliance issues detected. Price adjustments or management approval
                      required before implementation.
                    </Box>
                  )}
                  {analysis.requiresReview && (
                    <Box color="text-status-warning">
                      ⚠ Manual review recommended. Please verify all calculations and compliance
                      status before finalizing this pricing decision.
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            </div>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Container>
  );
};
