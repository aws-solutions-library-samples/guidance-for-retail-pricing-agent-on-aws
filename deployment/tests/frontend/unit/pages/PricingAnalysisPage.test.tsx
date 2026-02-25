/**
 * @fileoverview Unit tests for PricingAnalysisPage component.
 * 
 * Tests component rendering with valid sessionId, loading states, error handling,
 * analysis results display, missing data handling, and navigation functionality.
 * 
 * Requirements addressed:
 * - 2.1: Component renders with valid sessionId route parameter
 * - 2.2: Component displays loading state while data is loading
 * - 2.3: Component displays error state when query/subscription fails
 * - 2.4: Component displays analysis results when data is received
 * - 2.5: Component handles missing data fields gracefully (shows placeholders)
 * - 8.1: Component displays session status in page header
 * - 8.2: Navigation buttons (back to products, home) work correctly
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PricingAnalysisPage } from '../../../../src/frontend/src/pages/PricingAnalysisPage';

// Mock the usePricingAnalysis hook (new hook used by the component)
jest.mock('../../../../src/frontend/src/hooks/usePricingAnalysis', () => ({
  usePricingAnalysis: jest.fn()
}));

import { usePricingAnalysis } from '../../../../src/frontend/src/hooks/usePricingAnalysis';

describe('PricingAnalysisPage Component', () => {
  const mockSessionId = 'session-123';
  const mockProductId = 'CMAN-SAW-PRO725';

  const createMockPricingAnalysis = (overrides = {}) => ({
    id: 'pricing-1',
    sessionId: mockSessionId,
    userId: 'user-456',
    productId: mockProductId,
    product: JSON.stringify({
      id: mockProductId,
      product_id: mockProductId,
      category: 'powertools',
      name: 'Craftsman Professional Saw'
    }),
    status: 'in_progress' as const,
    demandForecast: JSON.stringify({
      recommendedPrice: 89.99,
      priceFloor: 75.00,
      priceCeiling: 110.00,
      confidence: 0.85,
      rationale: 'Based on historical demand patterns'
    }),
    competitiveAnalysis: JSON.stringify({
      marketStats: { min: 70, max: 120, average: 89.99, median: 85 },
      primaryCompetitor: { name: 'Competitor A', price: 92.99, matchConfidence: 0.9 },
      marketPosition: 'competitive',
      pricingStrategy: 'match'
    }),
    marginAnalysis: JSON.stringify({
      suggestedPrice: 89.99,
      minPrice: 75.00,
      maxPrice: 110.00,
      calculatedMargin: 0.35,
      baseMarginRate: 0.30,
      adjustedMarginRate: 0.35,
      mapCompliant: true,
      marginCompliant: true,
      requiresReview: false
    }),
    finalRecommendation: null,
    currentAgent: 'demand-agent',
    agentStatus: 'processing',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:31:00Z',
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering with Valid SessionId', () => {
    it('should render component with valid sessionId route parameter', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display session information in header
      expect(screen.getByText(new RegExp(mockSessionId))).toBeInTheDocument();
    });

    it('should call usePricingAnalysis hook with correct sessionId', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(usePricingAnalysis).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: mockSessionId,
            enabled: true
          })
        );
      });
    });

    it('should handle missing sessionId gracefully', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: null,
        connectionState: 'disconnected',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={['/pricing/analysis/']}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/pricing/analysis/" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('No Session ID Provided')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State Display', () => {
    it('should display loading state while data is loading', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: true,
        error: null,
        connectionState: 'connecting',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Connecting to pricing analysis session...')).toBeInTheDocument();
      });
    });
  });

  describe('Error State Display', () => {
    it('should display error state when query/subscription fails', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Failed to connect to subscription'),
        connectionState: 'error',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Should display error message
      expect(screen.getByText(/Failed to connect to subscription/)).toBeInTheDocument();
    });

    it('should display error alert with error message', async () => {
      const mockRetry = jest.fn();

      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Connection failed'),
        connectionState: 'error',
        connected: false,
        retry: mockRetry,
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message should be displayed
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();

      // Error alert should be present (mock doesn't render action buttons)
      const errorAlert = screen.getByTestId('cloudscape-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveAttribute('data-type', 'error');
    });
  });

  describe('Analysis Results Display', () => {
    it('should display analysis results when data is received', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display session ID in header
      expect(screen.getByText(new RegExp(mockSessionId))).toBeInTheDocument();
    });

    it('should display product information from session data', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display product ID
      expect(screen.getByText(new RegExp(mockProductId))).toBeInTheDocument();
    });

    it('should display session status in header', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({ status: 'in_progress' }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display status indicator (may appear multiple times due to WorkflowVisualization)
      const inProgressElements = screen.getAllByText('In Progress');
      expect(inProgressElements.length).toBeGreaterThan(0);
    });
  });

  describe('Missing Data Handling', () => {
    it('should handle missing analysisData gracefully', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          demandForecast: null,
          competitiveAnalysis: null,
          marginAnalysis: null
        }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should still display tabs
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);
    });

    it('should handle missing product data gracefully', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          product: null
        }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display "Unknown" for product ID
      expect(screen.getByText(/Product: Unknown/)).toBeInTheDocument();
    });
  });

  describe('Analysis Panels Display', () => {
    it('should display all analysis panels: demand, competitive, margin', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // All tabs should be visible
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);

      const allDemandForecastTabs = screen.getAllByText('Demand Forecast');
      expect(allDemandForecastTabs.length).toBeGreaterThan(0);

      const allMarginAnalysisTabs = screen.getAllByText('Margin Analysis');
      expect(allMarginAnalysisTabs.length).toBeGreaterThan(0);
    });

    it('should render tabs component with all analysis types', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Tabs component should be rendered with all tab labels
      const tabsComponent = screen.getByTestId('cloudscape-tabs');
      expect(tabsComponent).toBeInTheDocument();

      // All tab labels should be present
      expect(screen.getAllByText('Competitive Analysis').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Demand Forecast').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Margin Analysis').length).toBeGreaterThan(0);
    });
  });

  describe('Navigation Buttons', () => {
    it('should display back to products button', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/products" element={<div>Products Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Back to products button should be available
      const backButton = screen.getByRole('button', { name: /Back to Products/ });
      expect(backButton).toBeInTheDocument();
    });

    it('should display home button', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/" element={<div>Home Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Home button should be available
      const homeButton = screen.getByRole('button', { name: 'Home' });
      expect(homeButton).toBeInTheDocument();
    });

    it('should navigate to products page when back button is clicked', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/products" element={<div>Products Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Click back to products button
      const backButton = screen.getByRole('button', { name: /Back to Products/ });
      fireEvent.click(backButton);

      // Should navigate to products page
      await waitFor(() => {
        expect(screen.getByText('Products Page')).toBeInTheDocument();
      });
    });

    it('should navigate to home page when home button is clicked', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/" element={<div>Home Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Click home button
      const homeButton = screen.getByRole('button', { name: 'Home' });
      fireEvent.click(homeButton);

      // Should navigate to home page
      await waitFor(() => {
        expect(screen.getByText('Home Page')).toBeInTheDocument();
      });
    });

    it('should display error state with session ID', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Connection failed'),
        connectionState: 'error',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
            <Route path="/products" element={<div>Products Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message and session ID should be displayed
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(mockSessionId))).toBeInTheDocument();
    });
  });

  describe('Status Display', () => {
    it('should display completed status correctly', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({ status: 'completed' }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display completed status (may appear multiple times due to WorkflowVisualization)
      const completedElements = screen.getAllByText('Completed');
      expect(completedElements.length).toBeGreaterThan(0);
    });

    it('should display failed status correctly', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({ status: 'failed' }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display failed status (may appear multiple times due to WorkflowVisualization)
      const failedElements = screen.getAllByText('Failed');
      expect(failedElements.length).toBeGreaterThan(0);
    });
  });
});
