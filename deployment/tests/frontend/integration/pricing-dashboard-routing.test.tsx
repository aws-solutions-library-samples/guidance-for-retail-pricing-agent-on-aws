/**
 * @fileoverview Integration tests for pricing dashboard routing.
 * 
 * Tests the routing configuration for the pricing dashboard including:
 * - Route protection with authentication
 * - Navigation from ProductSelector to PricingDashboard
 * - Back button functionality
 * - Invalid session ID handling
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { AuthProvider } from '../../../src/frontend/src/contexts/AuthContext';
import { PricingDashboardPage } from '../../../src/frontend/src/pages/PricingDashboardPage';
import { ProductSelector } from '../../../src/frontend/src/components/ProductSelector';

// Mock Amplify
jest.mock('aws-amplify', () => ({
  Amplify: {
    configure: jest.fn()
  }
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: {
      username: 'testuser',
      attributes: {
        email: 'test@example.com'
      }
    },
    signOut: jest.fn()
  })
}));

// Mock GraphQL client
jest.mock('../../../src/frontend/src/graphql/client', () => ({
  graphqlClient: {
    request: jest.fn(),
    subscribe: jest.fn()
  }
}));

// Mock subscription hook
jest.mock('../../../src/frontend/src/hooks/usePricingSubscription', () => ({
  usePricingSubscription: () => ({
    data: null,
    loading: true,
    error: null,
    connected: false,
    retry: jest.fn()
  })
}));

// Mock usePricingAnalysis hook (in case it's imported transitively)
jest.mock('../../../src/frontend/src/hooks/usePricingAnalysis', () => ({
  usePricingAnalysis: () => ({
    data: null,
    loading: true,
    error: null,
    connectionState: 'connecting',
    connected: false,
    retry: jest.fn(),
    refetch: jest.fn()
  })
}));

// Mock useChatMessages hook (in case it's imported transitively)
jest.mock('../../../src/frontend/src/hooks/useChatMessages', () => ({
  useChatMessages: () => ({
    messages: [],
    loading: true,
    error: null,
    connectionState: 'connecting',
    connected: false,
    retry: jest.fn(),
    refetch: jest.fn(),
    clearMessages: jest.fn()
  })
}));

// Mock accessibility provider
jest.mock('../../../src/frontend/src/components/AccessibilityProvider', () => ({
  AccessibilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAccessibility: () => ({
    announce: jest.fn(),
    setFocusToMain: jest.fn()
  }),
  useKeyboardShortcuts: jest.fn()
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false
    }
  }
});

/**
 * Wrapper component with all required providers.
 */
const TestWrapper: React.FC<{ children: React.ReactNode; initialRoute?: string }> = ({ 
  children, 
  initialRoute = '/' 
}) => (
  <QueryClientProvider client={queryClient}>
    <JotaiProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          {children}
        </MemoryRouter>
      </AuthProvider>
    </JotaiProvider>
  </QueryClientProvider>
);

describe('Pricing Dashboard Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Configuration', () => {
    it('should render PricingDashboardPage at /pricing/:sessionId route', async () => {
      const sessionId = 'test-session-123';
      
      render(
        <TestWrapper initialRoute={`/pricing/${sessionId}`}>
          <Routes>
            <Route path="/pricing/:sessionId" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Dashboard')).toBeInTheDocument();
      });
    });

    it('should render PricingDashboardPage at /pricing route without session ID', async () => {
      render(
        <TestWrapper initialRoute="/pricing">
          <Routes>
            <Route path="/pricing" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Dashboard')).toBeInTheDocument();
      });
    });

    it('should show warning when no session ID is provided', async () => {
      render(
        <TestWrapper initialRoute="/pricing">
          <Routes>
            <Route path="/pricing" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('No Session ID Provided')).toBeInTheDocument();
        expect(screen.getByText(/To view pricing analysis results/)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should provide back button to return to product selector', async () => {
      const sessionId = 'test-session-123';
      
      render(
        <TestWrapper initialRoute={`/pricing/${sessionId}`}>
          <Routes>
            <Route path="/pricing/:sessionId" element={<PricingDashboardPage />} />
            <Route path="/products" element={<div>Product Selector</div>} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /Back to Products/i });
        expect(backButton).toBeInTheDocument();
      });
    });

    it('should show "Select a Product" button when no session ID', async () => {
      render(
        <TestWrapper initialRoute="/pricing">
          <Routes>
            <Route path="/pricing" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        const selectButton = screen.getByRole('button', { name: /Select a Product/i });
        expect(selectButton).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session IDs gracefully', async () => {
      const invalidSessionId = 'invalid-session-999';
      
      render(
        <TestWrapper initialRoute={`/pricing/${invalidSessionId}`}>
          <Routes>
            <Route path="/pricing/:sessionId" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        // Should show loading state initially
        expect(screen.getByText('Pricing Dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('Route Protection', () => {
    it('should be accessible when authenticated', async () => {
      const sessionId = 'test-session-123';
      
      render(
        <TestWrapper initialRoute={`/pricing/${sessionId}`}>
          <Routes>
            <Route path="/pricing/:sessionId" element={<PricingDashboardPage />} />
          </Routes>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Pricing Dashboard')).toBeInTheDocument();
      });
    });
  });
});
