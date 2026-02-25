/**
 * @fileoverview Competitive Analysis Panel component.
 * 
 * Displays competitive pricing analysis with summary and detailed views.
 * Shows market statistics, primary competitor information, market position,
 * pricing strategy recommendations, and competitor screenshots in an
 * expandable panel format matching the pricing dashboard design spec.
 */

import React from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  Badge,
  Button,
  ColumnLayout,
  Alert,
  Spinner,
  Grid
} from '@cloudscape-design/components';

/**
 * Market statistics data structure.
 */
export interface MarketStats {
  min: number;
  max: number;
  average: number;
  median: number;
}

/**
 * Primary competitor information.
 */
export interface PrimaryCompetitor {
  name: string;
  price: number;
  matchConfidence: number;
}

/**
 * Competitor screenshot data.
 */
export interface CompetitorScreenshot {
  url: string;
  competitor: string;
}

/**
 * Competitive analysis data structure.
 */
export interface CompetitiveAnalysis {
  marketStats: MarketStats;
  primaryCompetitor: PrimaryCompetitor;
  marketPosition: string;
  pricingStrategy: string;
  screenshots?: CompetitorScreenshot[];
}

/**
 * Props for the CompetitiveAnalysisPanel component.
 */
export interface CompetitiveAnalysisPanelProps {
  /** Competitive analysis data */
  analysis: CompetitiveAnalysis | null;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: Error | null;
  
  /** Callback when user requests retry */
  onRetry: () => void;
}

/**
 * Formats a price value as currency.
 * 
 * @param price - Price value to format
 * @returns Formatted price string
 */
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price);
};

/**
 * Gets confidence level information based on score.
 * 
 * @param score - Confidence score (0-100)
 * @returns Confidence level info
 */
const getConfidenceLevel = (score: number): { level: string; color: 'green' | 'blue' | 'red' } => {
  if (score >= 80) return { level: 'High', color: 'green' };
  if (score >= 60) return { level: 'Medium', color: 'blue' };
  return { level: 'Low', color: 'red' };
};

/**
 * Competitive Analysis Panel component.
 * 
 * Displays competitive pricing analysis with expandable sections for
 * summary and detailed views. Matches the pricing dashboard design spec.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const CompetitiveAnalysisPanel: React.FC<CompetitiveAnalysisPanelProps> = ({
  analysis,
  loading,
  error,
  onRetry
}) => {

  // Handle loading state
  if (loading) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h2">Competitive Analysis</Header>
          <Box textAlign="center">
            <SpaceBetween direction="vertical" size="m">
              <Spinner size="large" />
              <Box color="text-body-secondary">
                Analyzing competitive landscape and market positioning...
              </Box>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Container>
    );
  }

  // Handle error state
  if (error) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h2">Competitive Analysis</Header>
          <Alert
            type="error"
            header="Competitive Analysis Failed"
            action={
              <Button variant="primary" onClick={onRetry}>
                Retry Analysis
              </Button>
            }
          >
            {error.message || 'An error occurred during competitive analysis.'}
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  // Handle missing data
  if (!analysis) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h2">Competitive Analysis</Header>
          <Alert
            type="info"
            header="No Analysis Available"
          >
            Competitive analysis data is not yet available. Please wait for the analysis to complete.
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  const confidenceInfo = getConfidenceLevel(analysis.primaryCompetitor.matchConfidence);

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Competitive pricing analysis and market positioning"
        >
          Competitive Analysis
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {/* Summary View - Always Visible */}
        <div>
          <SpaceBetween direction="vertical" size="m">
            <ColumnLayout columns={3} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">Market Position</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {analysis.marketPosition}
                </Box>
              </div>
              
              <div>
                <Box variant="awsui-key-label">Primary Competitor</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {analysis.primaryCompetitor.name}
                </Box>
                <Box color="text-body-secondary">
                  {formatPrice(analysis.primaryCompetitor.price)}
                </Box>
              </div>
              
              <div>
                <Box variant="awsui-key-label">Recommended Strategy</Box>
                <Box fontSize="heading-m" fontWeight="bold">
                  {analysis.pricingStrategy}
                </Box>
              </div>
            </ColumnLayout>

            {/* Match Confidence Badge */}
            <div>
              <Box variant="awsui-key-label">Match Confidence</Box>
              <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                <Badge color={confidenceInfo.color}>
                  {confidenceInfo.level}
                </Badge>
                <Box fontSize="heading-m" fontWeight="bold">
                  {analysis.primaryCompetitor.matchConfidence}%
                </Box>
              </SpaceBetween>
            </div>
          </SpaceBetween>
        </div>

        {/* Detailed Analysis Section */}
        <Container
          header={
            <Header
              variant="h3"
              description="Complete competitive analysis with market statistics and competitor details"
            >
              Detailed Analysis
            </Header>
          }
        >
          <SpaceBetween direction="vertical" size="l">
            {/* Market Price Statistics */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Market Price Statistics
              </Box>
              <ColumnLayout columns={4} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">Minimum Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.marketStats.min)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Lowest market price
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">Maximum Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.marketStats.max)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Highest market price
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">Average Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.marketStats.average)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Mean market price
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">Median Price</Box>
                  <Box fontSize="heading-l" fontWeight="bold">
                    {formatPrice(analysis.marketStats.median)}
                  </Box>
                  <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                    Middle market price
                  </Box>
                </div>
              </ColumnLayout>
            </div>

            {/* Primary Competitor Details */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Primary Competitor Details
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
                    <Box variant="awsui-key-label">Competitor Name</Box>
                    <Box fontSize="heading-m" fontWeight="bold">
                      {analysis.primaryCompetitor.name}
                    </Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">Competitor Price</Box>
                    <Box fontSize="heading-m" fontWeight="bold">
                      {formatPrice(analysis.primaryCompetitor.price)}
                    </Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">Match Confidence</Box>
                    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                      <Badge color={confidenceInfo.color}>
                        {confidenceInfo.level}
                      </Badge>
                      <Box fontSize="heading-m" fontWeight="bold">
                        {analysis.primaryCompetitor.matchConfidence}%
                      </Box>
                    </SpaceBetween>
                    <Box color="text-body-secondary" fontSize="body-s" margin={{ top: 'xs' }}>
                      Confidence in competitor product match accuracy
                    </Box>
                  </Box>
                </SpaceBetween>
              </div>
            </div>

            {/* Market Position Assessment */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Market Position Assessment
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
                  {analysis.marketPosition}
                </Box>
              </div>
            </div>

            {/* Pricing Strategy Recommendations */}
            <div>
              <Box variant="h3" margin={{ bottom: 's' }}>
                Pricing Strategy Recommendations
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
                  {analysis.pricingStrategy}
                </Box>
              </div>
            </div>

            {/* Competitor Screenshots */}
            {analysis.screenshots && analysis.screenshots.length > 0 && (
              <div>
                <Box variant="h3" margin={{ bottom: 's' }}>
                  Competitor Screenshots
                </Box>
                <Grid
                  gridDefinition={[
                    { colspan: { default: 12, xs: 6, s: 4 } },
                    { colspan: { default: 12, xs: 6, s: 4 } },
                    { colspan: { default: 12, xs: 6, s: 4 } }
                  ]}
                >
                  {analysis.screenshots.map((screenshot, index) => (
                    <Box key={index}>
                      <SpaceBetween direction="vertical" size="xs">
                        <img
                          src={screenshot.url}
                          alt={`${screenshot.competitor} screenshot`}
                          style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: '8px',
                            border: '1px solid #e9ebed'
                          }}
                        />
                        <Box fontSize="body-s" color="text-body-secondary">
                          {screenshot.competitor}
                        </Box>
                      </SpaceBetween>
                    </Box>
                  ))}
                </Grid>
              </div>
            )}
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Container>
  );
};

/**
 * Backward-compatible export with original component name.
 * @deprecated Use CompetitiveAnalysisPanel instead
 */
export const CompetitiveAnalysisResults = CompetitiveAnalysisPanel;
