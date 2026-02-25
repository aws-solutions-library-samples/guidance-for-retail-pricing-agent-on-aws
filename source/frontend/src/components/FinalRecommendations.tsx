/**
 * @fileoverview FinalRecommendations component for pricing dashboard.
 * 
 * Displays final pricing recommendations prominently with suggested price,
 * price range, confidence score, compliance status, and warning banners.
 * Uses CloudScape components for consistent design and accessibility.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import React from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Badge,
  Alert,
  ProgressBar
} from '@cloudscape-design/components';
import { formatPrice } from '../types/product-types';

/**
 * Props for FinalRecommendations component.
 */
export interface FinalRecommendationsProps {
  /** Suggested price from analysis */
  suggestedPrice: number;
  
  /** Price range (min-max) */
  priceRange: {
    min: number;
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
  
  /** Optional reason for manual review */
  reviewReason?: string;
}

/**
 * FinalRecommendations component.
 * 
 * Displays final pricing recommendations with prominent suggested price,
 * visual price range indicator, confidence gauge, compliance badges,
 * and warning banners when manual review is required.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const FinalRecommendations: React.FC<FinalRecommendationsProps> = ({
  suggestedPrice,
  priceRange,
  confidence,
  mapCompliant,
  marginCompliant,
  requiresReview,
  reviewReason
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
   * Calculates the position of suggested price within the range.
   * 
   * @returns Percentage position (0-100)
   */
  const calculatePricePosition = (): number => {
    const range = priceRange.max - priceRange.min;
    if (range === 0) return 50; // Center if no range
    
    const position = ((suggestedPrice - priceRange.min) / range) * 100;
    return Math.max(0, Math.min(100, position)); // Clamp between 0-100
  };

  // Determine overall compliance status
  const isFullyCompliant = mapCompliant && marginCompliant;
  const hasComplianceIssues = !mapCompliant || !marginCompliant;

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Final pricing recommendation based on comprehensive analysis"
        >
          Final Recommendations
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {/* Warning Banner for Manual Review */}
        {requiresReview && (
          <Alert
            statusIconAriaLabel="Warning"
            type="warning"
            header="Manual Review Required"
          >
            {reviewReason || 'This pricing recommendation requires manual review before implementation.'}
            <Box margin={{ top: 's' }} color="text-body-secondary">
              Please review the analysis details and compliance status before finalizing the price.
            </Box>
          </Alert>
        )}

        {/* Compliance Issues Alert */}
        {hasComplianceIssues && !requiresReview && (
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header="Compliance Issues Detected"
          >
            {!mapCompliant && !marginCompliant && 'Both MAP and margin compliance issues detected.'}
            {!mapCompliant && marginCompliant && 'MAP compliance issue detected.'}
            {mapCompliant && !marginCompliant && 'Margin compliance issue detected.'}
            <Box margin={{ top: 's' }} color="text-body-secondary">
              Review the margin analysis section for detailed compliance information.
            </Box>
          </Alert>
        )}

        {/* Success Alert for Full Compliance */}
        {isFullyCompliant && !requiresReview && (
          <Alert
            statusIconAriaLabel="Success"
            type="success"
            header="All Compliance Checks Passed"
          >
            The recommended price meets all MAP and margin compliance requirements.
          </Alert>
        )}

        {/* Suggested Price - Prominent Display */}
        <Box textAlign="center" padding={{ vertical: 'l' }}>
          <Box variant="awsui-key-label" margin={{ bottom: 's' }}>
            Suggested Price
          </Box>
          <div
            data-testid="suggested-price"
            className="suggested-price-mobile"
            style={{
              fontSize: '48px',
              lineHeight: '1.2',
              fontWeight: 'bold',
              color: isFullyCompliant ? '#037f0c' : hasComplianceIssues ? '#d13212' : 'inherit'
            }}
          >
            {formatPrice(suggestedPrice)}
          </div>
          {!isFullyCompliant && (
            <Box
              margin={{ top: 's' }}
              color="text-status-error"
              fontSize="body-s"
            >
              ⚠ Compliance issues detected
            </Box>
          )}
        </Box>

        {/* Price Range with Visual Indicator */}
        <div>
          <Box variant="h3" margin={{ bottom: 's' }}>
            Price Range
          </Box>
          <SpaceBetween direction="vertical" size="s">
            {/* Range Labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Box variant="awsui-key-label">Minimum</Box>
                <Box fontWeight="bold">{formatPrice(priceRange.min)}</Box>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Box variant="awsui-key-label">Suggested</Box>
                <Box fontWeight="bold" color="text-status-info">
                  {formatPrice(suggestedPrice)}
                </Box>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Box variant="awsui-key-label">Maximum</Box>
                <Box fontWeight="bold">{formatPrice(priceRange.max)}</Box>
              </div>
            </div>

            {/* Visual Range Bar */}
            <div
              className="price-range-bar"
              role="img"
              aria-label={`Price range from ${formatPrice(priceRange.min)} to ${formatPrice(priceRange.max)}, with suggested price at ${formatPrice(suggestedPrice)}`}
            >
              {/* Range Bar Background */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(to right, #d1ecf1 0%, #bee5eb 50%, #d1ecf1 100%)'
                }}
              />

              {/* Suggested Price Marker */}
              <div
                style={{
                  position: 'absolute',
                  left: `${calculatePricePosition()}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '4px',
                  height: '100%',
                  backgroundColor: isFullyCompliant ? '#0972d3' : '#d13212',
                  zIndex: 2
                }}
                data-testid="price-marker"
              />

              {/* Suggested Price Label */}
              <div
                className="price-range-label"
                style={{
                  position: 'absolute',
                  left: `${calculatePricePosition()}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: isFullyCompliant ? '#0972d3' : '#d13212',
                  color: 'white',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  zIndex: 3
                }}
              >
                {formatPrice(suggestedPrice)}
              </div>
            </div>

            {/* Range Description */}
            <Box color="text-body-secondary" fontSize="body-s" textAlign="center">
              Recommended price range based on demand, competitive, and margin analysis
            </Box>
          </SpaceBetween>
        </div>

        {/* Overall Confidence Score with Circular Gauge */}
        <div>
          <Box variant="h3" margin={{ bottom: 's' }}>
            Overall Confidence
          </Box>
          <SpaceBetween direction="vertical" size="m">
            {/* Circular Gauge Visualization */}
            <div className="confidence-gauge-container">
              <div
                className="confidence-gauge"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                role="img"
                aria-label={`Confidence score: ${confidence}% - ${getConfidenceLevel(confidence)}`}
              >
                {/* Background Circle */}
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 160 160"
                  style={{ position: 'absolute', transform: 'rotate(-90deg)' }}
                >
                  {/* Background track */}
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="#e9ecef"
                    strokeWidth="12"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke={
                      confidence >= 80 ? '#037f0c' :
                      confidence >= 60 ? '#0972d3' :
                      confidence >= 40 ? '#f89406' :
                      '#d13212'
                    }
                    strokeWidth="12"
                    strokeDasharray={`${(confidence / 100) * 439.8} 439.8`}
                    strokeLinecap="round"
                    data-testid="confidence-gauge"
                  />
                </svg>

                {/* Center Text */}
                <div style={{ textAlign: 'center', zIndex: 1 }}>
                  <div
                    className="confidence-gauge-value"
                    style={{
                      fontSize: '36px',
                      fontWeight: 'bold',
                      color: confidence >= 80 ? '#037f0c' :
                             confidence >= 60 ? '#0972d3' :
                             confidence >= 40 ? '#f89406' :
                             '#d13212'
                    }}
                  >
                    {confidence}%
                  </div>
                  <Box
                    className="confidence-gauge-label"
                    fontSize="body-s"
                    color="text-body-secondary"
                    fontWeight="bold"
                  >
                    {getConfidenceLevel(confidence)}
                  </Box>
                </div>
              </div>
            </div>

            {/* Confidence Progress Bar (Alternative View) */}
            <div>
              <ProgressBar
                value={confidence}
                label="Confidence Score"
                description={`${getConfidenceLevel(confidence)} confidence in pricing recommendation`}
                additionalInfo={`${confidence}%`}
                resultText={`${confidence}%`}
              />
            </div>

            {/* Confidence Description */}
            <Box color="text-body-secondary" fontSize="body-s" textAlign="center">
              Based on data quality, model accuracy, and analysis consistency across all agents
            </Box>
          </SpaceBetween>
        </div>

        {/* Compliance Status with Color-Coded Badges */}
        <div>
          <Box variant="h3" margin={{ bottom: 's' }}>
            Compliance Status
          </Box>
          <SpaceBetween direction="horizontal" size="l">
            {/* MAP Compliance Badge */}
            <div style={{ flex: 1 }}>
              <Box variant="awsui-key-label" margin={{ bottom: 'xs' }}>
                MAP Compliance
              </Box>
              <Badge
                color={mapCompliant ? 'green' : 'red'}
                data-testid="map-compliance-badge"
              >
                {mapCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
              </Badge>
              <Box margin={{ top: 'xs' }} color="text-body-secondary" fontSize="body-s">
                {mapCompliant
                  ? 'Price meets minimum advertised price requirements'
                  : 'Price is below minimum advertised price threshold'}
              </Box>
            </div>

            {/* Margin Compliance Badge */}
            <div style={{ flex: 1 }}>
              <Box variant="awsui-key-label" margin={{ bottom: 'xs' }}>
                Margin Compliance
              </Box>
              <Badge
                color={marginCompliant ? 'green' : 'red'}
                data-testid="margin-compliance-badge"
              >
                {marginCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
              </Badge>
              <Box margin={{ top: 'xs' }} color="text-body-secondary" fontSize="body-s">
                {marginCompliant
                  ? 'Price meets minimum margin requirements'
                  : 'Price does not meet minimum margin threshold'}
              </Box>
            </div>

            {/* Manual Review Status Badge */}
            <div style={{ flex: 1 }}>
              <Box variant="awsui-key-label" margin={{ bottom: 'xs' }}>
                Review Status
              </Box>
              <Badge
                color={requiresReview ? 'severity-medium' : 'green'}
                data-testid="review-status-badge"
              >
                {requiresReview ? '⚠ Review Required' : '✓ No Review Needed'}
              </Badge>
              <Box margin={{ top: 'xs' }} color="text-body-secondary" fontSize="body-s">
                {requiresReview
                  ? 'Manual review recommended before implementation'
                  : 'Recommendation can be implemented directly'}
              </Box>
            </div>
          </SpaceBetween>
        </div>

        {/* Summary Box */}
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}
        >
          <SpaceBetween direction="vertical" size="s">
            <Box variant="h3">Recommendation Summary</Box>
            <Box>
              The suggested price of <strong>{formatPrice(suggestedPrice)}</strong> is based on
              comprehensive analysis of demand forecasting, competitive intelligence, and margin
              compliance. This price falls within the recommended range of{' '}
              <strong>{formatPrice(priceRange.min)}</strong> to{' '}
              <strong>{formatPrice(priceRange.max)}</strong> with an overall confidence of{' '}
              <strong>{confidence}%</strong>.
            </Box>
            {isFullyCompliant && !requiresReview && (
              <Box color="text-status-success">
                ✓ This recommendation meets all compliance requirements and can be implemented.
              </Box>
            )}
            {hasComplianceIssues && (
              <Box color="text-status-error">
                ⚠ Compliance issues detected. Review the margin analysis section before proceeding.
              </Box>
            )}
            {requiresReview && (
              <Box color="text-status-warning">
                ⚠ Manual review is recommended before implementing this pricing recommendation.
              </Box>
            )}
          </SpaceBetween>
        </div>
      </SpaceBetween>
    </Container>
  );
};
