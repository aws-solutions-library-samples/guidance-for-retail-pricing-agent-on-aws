/**
 * @fileoverview Home page component for the Retail Pricing Agent Orchestrator.
 * 
 * Provides the main landing page with navigation to the product catalog
 * and overview of the application features.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Box,
  Grid,
  ColumnLayout,
  Cards,
  Badge,
  Link
} from '@cloudscape-design/components';

/**
 * Feature card data for the home page.
 */
interface FeatureCard {
  id: string;
  title: string;
  description: string;
  status: 'available' | 'coming-soon';
  icon: string;
}

const features: FeatureCard[] = [
  {
    id: 'product-catalog',
    title: 'Product Catalog Management',
    description: 'Browse and select products from multiple categories including power tools, apparel, footwear, and kitchen appliances.',
    status: 'available',
    icon: 'folder'
  },
  {
    id: 'demand-analysis',
    title: 'Demand-Based Pricing Analysis',
    description: 'AI-powered analysis of historical demand patterns with seasonality and trend detection.',
    status: 'available',
    icon: 'analytics'
  },
  {
    id: 'competitive-intelligence',
    title: 'Competitive Intelligence',
    description: 'Market analysis and competitor pricing insights to inform pricing decisions.',
    status: 'available',
    icon: 'search'
  },
  {
    id: 'margin-compliance',
    title: 'Margin Rules & Compliance',
    description: 'Automated margin validation and compliance checking against business rules.',
    status: 'available',
    icon: 'status-positive'
  },
  {
    id: 'multi-agent',
    title: 'Multi-Agent Orchestration',
    description: 'Coordinated AI agents working together for comprehensive pricing analysis.',
    status: 'available',
    icon: 'settings'
  },
  {
    id: 'pricing-dashboard',
    title: 'Pricing Dashboard',
    description: 'Real-time pricing recommendations with comprehensive drill-down capabilities.',
    status: 'available',
    icon: 'view-full'
  }
];

/**
 * Home page component with feature overview and navigation.
 * 
 * @returns JSX element
 */
export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  /**
   * Handles navigation to the product catalog.
   */
  const handleNavigateToProducts = () => {
    navigate('/products');
  };

  /**
   * Renders a feature card.
   * 
   * @param feature - Feature data
   * @returns JSX element
   */
  const renderFeatureCard = (feature: FeatureCard) => (
    <Box key={feature.id}>
      <SpaceBetween direction="vertical" size="xs">
        <Box>
          <SpaceBetween direction="horizontal" size="xs">
            <Box fontSize="heading-m" fontWeight="bold">
              {feature.title}
            </Box>
            <Badge color={feature.status === 'available' ? 'green' : 'grey'}>
              {feature.status === 'available' ? 'Available' : 'Coming Soon'}
            </Badge>
          </SpaceBetween>
        </Box>
        <Box color="text-body-secondary">
          {feature.description}
        </Box>
      </SpaceBetween>
    </Box>
  );

  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        {/* Header Section */}
        <Header
          variant="h1"
          description="AI-powered retail pricing system with multi-agent orchestration for comprehensive pricing analysis and recommendations."
          actions={
            <Button
              variant="primary"
              iconName="arrow-right"
              onClick={handleNavigateToProducts}
            >
              Browse Product Catalog
            </Button>
          }
        >
          Retail Pricing Agent Orchestrator
        </Header>

        {/* Quick Start Section */}
        <Container>
          <Header variant="h2">Quick Start</Header>
          <SpaceBetween direction="vertical" size="m">
            <Box>
              Get started with pricing analysis in just a few steps:
            </Box>
            <ColumnLayout columns={3} variant="text-grid">
              <Box>
                <SpaceBetween direction="vertical" size="xs">
                  <Box fontSize="heading-s" fontWeight="bold">
                    1. Select Product
                  </Box>
                  <Box color="text-body-secondary">
                    Browse the product catalog and select a product for pricing analysis.
                  </Box>
                </SpaceBetween>
              </Box>
              <Box>
                <SpaceBetween direction="vertical" size="xs">
                  <Box fontSize="heading-s" fontWeight="bold">
                    2. AI Analysis
                  </Box>
                  <Box color="text-body-secondary">
                    Our AI agents analyze demand, competition, and margin rules automatically.
                  </Box>
                </SpaceBetween>
              </Box>
              <Box>
                <SpaceBetween direction="vertical" size="xs">
                  <Box fontSize="heading-s" fontWeight="bold">
                    3. Get Recommendations
                  </Box>
                  <Box color="text-body-secondary">
                    Review comprehensive pricing recommendations with confidence scores.
                  </Box>
                </SpaceBetween>
              </Box>
            </ColumnLayout>
            <Box textAlign="center">
              <Button
                variant="primary"
                iconName="arrow-right"
                onClick={handleNavigateToProducts}
              >
                Start Pricing Analysis
              </Button>
            </Box>
          </SpaceBetween>
        </Container>

        {/* Features Section */}
        <Container>
          <Header variant="h2">Features</Header>
          <Cards
            cardDefinition={{
              header: (item) => (
                <SpaceBetween direction="horizontal" size="xs">
                  <Box fontSize="heading-s" fontWeight="bold">
                    {item.title}
                  </Box>
                  <Badge color={item.status === 'available' ? 'green' : 'grey'}>
                    {item.status === 'available' ? 'Available' : 'Coming Soon'}
                  </Badge>
                </SpaceBetween>
              ),
              sections: [
                {
                  content: (item) => (
                    <Box color="text-body-secondary">
                      {item.description}
                    </Box>
                  )
                }
              ]
            }}
            cardsPerRow={[
              { cards: 1 },
              { minWidth: 500, cards: 2 },
              { minWidth: 800, cards: 3 }
            ]}
            items={features}
            loadingText="Loading features"
            empty={
              <Box textAlign="center" color="inherit">
                <Box variant="strong" textAlign="center" color="inherit">
                  No features available
                </Box>
              </Box>
            }
          />
        </Container>

        {/* Footer Section */}
        <Container>
          <Box textAlign="center" color="text-body-secondary">
            <SpaceBetween direction="vertical" size="xs">
              <Box>
                Built with AWS serverless architecture for scalability and performance.
              </Box>
              <Box>
                <Link href="#" variant="secondary">Documentation</Link>
                {' • '}
                <Link href="#" variant="secondary">Support</Link>
                {' • '}
                <Link href="#" variant="secondary">API Reference</Link>
              </Box>
            </SpaceBetween>
          </Box>
        </Container>
      </SpaceBetween>
    </Container>
  );
};