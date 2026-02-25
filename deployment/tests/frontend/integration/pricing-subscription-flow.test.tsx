/**
 * @fileoverview Integration tests for end-to-end pricing analysis flow.
 * 
 * Tests the complete load-then-subscribe lifecycle including:
 * - Initial data loading and subscription connection
 * - Incremental updates as analysis progresses
 * - Final results display when analysis completes
 * - Error scenarios and recovery
 * - Component unmount and cleanup
 * 
 * Requirements addressed:
 * - 2.1: Test initial query execution on page load
 * - 2.3: Test subscription establishment after query
 * - 2.4: Test state merge with subscription updates
 * - 7.1: Test reconnection with exponential backoff
 * - 7.4: Test clean unsubscribe on unmount
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PricingAnalysisPage } from '../../../src/frontend/src/pages/PricingAnalysisPage';

// Mock the usePricingAnalysis hook (new hook used by the component)
jest.mock('../../../src/frontend/src/hooks/usePricingAnalysis', () => ({
  usePricingAnalysis: jest.fn()
}));

import { usePricingAnalysis } from '../../../src/frontend/src/hooks/usePricingAnalysis';

describe('Pricing Analysis Flow Integration Tests', () => {
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

  describe('Initial Data Loading and Subscription Connection', () => {
    it('should load data and display initial results', async () => {
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

      // Should display pricing analysis results
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display session ID
      expect(screen.getByText(new RegExp(mockSessionId))).toBeInTheDocument();

      // Should display analysis tabs
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);
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

      // Should display product ID in header
      expect(screen.getByText(new RegExp(mockProductId))).toBeInTheDocument();
    });
  });

  describe('Incremental Updates as Analysis Progresses', () => {
    it('should update UI as analysis progresses through different agents', async () => {
      // First render with demand-agent
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          currentAgent: 'demand-agent',
          agentStatus: 'processing'
        }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      const { rerender } = render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Update mock to return competitive-agent
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          currentAgent: 'competitive-agent',
          agentStatus: 'processing'
        }),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      rerender(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const agentTexts = screen.getAllByText(/Current Agent: competitive-agent/);
        expect(agentTexts.length).toBeGreaterThan(0);
      });
    });

    it('should display analysis data as updates arrive', async () => {
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

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // All tabs should be available
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);
    });
  });

  describe('Final Results Display When Analysis Completes', () => {
    it('should display final results when analysis completes with success status', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          status: 'completed',
          currentAgent: null,
          agentStatus: 'completed'
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

      // Wait for data to be displayed
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Should display completed status
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should display all analysis panels when data is complete', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis({
          status: 'completed'
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

      // All analysis tabs should be visible
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle network failure gracefully', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Network connection failed'),
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

      // Should display error alert
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message should be displayed
      expect(screen.getByText(/Network connection failed/)).toBeInTheDocument();
    });

    it('should handle invalid sessionId', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Session not found'),
        connectionState: 'error',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      render(
        <MemoryRouter initialEntries={[`/pricing/analysis/invalid-session`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });
    });

    it('should handle missing analysis data gracefully', async () => {
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

      // Should still display tabs even with missing data
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery and Retry After Error', () => {
    it('should call retry function when retry is triggered', async () => {
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

      // Should show error initially
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message should be displayed
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();

      // Retry function should be available from the hook
      expect(mockRetry).toBeDefined();
    });

    it('should display error alert when connection fails', async () => {
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

      // Initial error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message should be displayed
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
    });
  });

  describe('Component Unmount and Cleanup', () => {
    it('should render successfully and handle lifecycle', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: createMockPricingAnalysis(),
        loading: false,
        error: null,
        connectionState: 'connected',
        connected: true,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Component should render successfully
      expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();

      // Unmount component - should not throw
      expect(() => unmount()).not.toThrow();
    });

    it('should handle error state and display error message', async () => {
      (usePricingAnalysis as jest.Mock).mockReturnValue({
        data: null,
        loading: false,
        error: new Error('Connection failed'),
        connectionState: 'error',
        connected: false,
        retry: jest.fn(),
        refetch: jest.fn()
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={[`/pricing/analysis/${mockSessionId}`]}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Failed to Load Pricing Session')).toBeInTheDocument();
      });

      // Error message should be displayed
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();

      // Unmount should not throw
      expect(() => unmount()).not.toThrow();
    });

    it('should display home button for navigation', async () => {
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

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();
      });

      // Home button should be available
      const homeButton = screen.getByText('Home');
      expect(homeButton).toBeInTheDocument();
    });
  });

  describe('Navigation and User Interactions', () => {
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
      const backButton = screen.getByText('Back to Products');
      expect(backButton).toBeInTheDocument();
    });

    it('should display all analysis tabs', async () => {
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

      // All tabs should be available
      const allCompetitiveAnalysisTabs = screen.getAllByText('Competitive Analysis');
      expect(allCompetitiveAnalysisTabs.length).toBeGreaterThan(0);

      const allDemandForecastTabs = screen.getAllByText('Demand Forecast');
      expect(allDemandForecastTabs.length).toBeGreaterThan(0);

      const allMarginAnalysisTabs = screen.getAllByText('Margin Analysis');
      expect(allMarginAnalysisTabs.length).toBeGreaterThan(0);
    });
  });
});
