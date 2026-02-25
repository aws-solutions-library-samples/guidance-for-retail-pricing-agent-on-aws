/**
 * @fileoverview Integration tests for competitive analysis display functionality.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PricingAnalysisPage } from '../../../src/frontend/src/pages/PricingAnalysisPage';

// Mock the pricing service hook
jest.mock('../../../src/frontend/src/hooks/usePricingService', () => ({
  usePricingService: () => ({
    usePricingSessions: () => ({
      data: {
        items: [
          {
            id: 'test-session-123',
            userId: 'test-user',
            product: JSON.stringify({
              product_id: 'CMAN-SAW-PRO725',
              category: 'powertools'
            }),
            competitiveAnalysis: JSON.stringify({
              lowest_market_price: 159.99,
              highest_market_price: 229.99,
              average_market_price: 189.45,
              median_market_price: 185.99,
              primary_competitor: 'DeWalt Pro Series',
              competitive_confidence_score: 89,
              competitor_price_point: 185.99,
              market_position_assessment: 'mid-premium',
              recommended_base_price: 189.99,
              price_position_strategy: 'premium_position'
            }),
            status: 'success',
            createdAt: '2024-01-15T10:30:00Z',
            updatedAt: '2024-01-15T10:30:00Z'
          }
        ]
      },
      isLoading: false,
      error: null
    })
  })
}));

describe('Competitive Analysis Display Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  it('should display competitive analysis results in pricing analysis page', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pricing/analysis/test-session-123']}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Should show the pricing analysis page
    expect(screen.getByText('Pricing Analysis Results')).toBeInTheDocument();

    // Should show competitive analysis tab
    expect(screen.getByText('Competitive Analysis')).toBeInTheDocument();

    // Should display analysis results
    await waitFor(() => {
      expect(screen.getByText('89%')).toBeInTheDocument();
      expect(screen.getByText('Mid-Premium')).toBeInTheDocument();
      expect(screen.getByText('$189.99')).toBeInTheDocument();
    });
  });

  it('should allow expanding sections for detailed analysis', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pricing/analysis/test-session-123']}>
          <Routes>
            <Route path="/pricing/analysis/:sessionId" element={<PricingAnalysisPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Find and click on market statistics section
    const marketStatsSection = screen.getByText('Market Statistics');
    fireEvent.click(marketStatsSection);

    // Should show detailed market statistics
    await waitFor(() => {
      expect(screen.getByText('$159.99')).toBeInTheDocument();
      expect(screen.getByText('$229.99')).toBeInTheDocument();
    });
  });

  // Note: Test for missing data handling is covered in the unit tests
  // Integration test focuses on successful data flow
});