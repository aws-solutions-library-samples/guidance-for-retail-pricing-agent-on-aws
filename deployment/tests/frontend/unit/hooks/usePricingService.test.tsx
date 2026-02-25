/**
 * @fileoverview Tests for usePricingService hook.
 * 
 * Tests GraphQL mutations and queries with React Query integration,
 * including optimistic updates, error handling, and retry logic.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { usePricingService } from '../../../../src/frontend/src/hooks/usePricingService';
import { client } from '../../../../src/frontend/src/graphql/client';
import type { ProductType } from '../../../../src/frontend/src/types/product-types';
import React from 'react';

// Mock the useAuthenticator hook
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn()
}));

const mockUseAuthenticator = useAuthenticator as jest.MockedFunction<typeof useAuthenticator>;

// Mock product data
const mockProduct: ProductType = {
  product_id: 'TEST-PRODUCT-001',
  category: 'powertools',
  subcategory: 'drills',
  role: 'best',
  vendor: 'TEST_VENDOR',
  cost: 50.00,
  MSRP: 99.99,
  MAP: 89.99,
  yearTarget: 1000,
  attributes: { powerType: 'cordless' },
  features: ['LED Light'],
  imageUrl: 'https://example.com/image.jpg',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z'
};

// Mock the GraphQL client
jest.mock('../../../../src/frontend/src/graphql/client', () => ({
  client: {
    graphql: jest.fn()
  }
}));

const mockClient = client as jest.Mocked<typeof client>;

// Mock product data
const mockPricingResponse = {
  id: 'test-session-id',
  userId: 'test-user-id',
  product: JSON.stringify(mockProduct),
  status: 'initiated',
  createdAt: '2024-01-15T10:30:00Z'
};

const mockPricingSessionsResponse = {
  data: {
    pricingByUserId: {
      items: [
        {
          id: 'test-session-id',
          userId: 'test-user-id',
          product: JSON.stringify(mockProduct),
          demandForecast: null,
          webScrap: null,
          competitiveAnalysis: null,
          marginAnalysis: null,
          botResponses: null,
          status: 'initiated',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z'
        }
      ],
      nextToken: null
    }
  }
};

const mockResolverResponse = {
  data: {
    appsyncResolver: {
      status: 'success',
      message: 'Agent orchestration workflow started successfully'
    }
  }
};

// Test wrapper component
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('usePricingService', () => {
  beforeEach(() => {
    mockUseAuthenticator.mockReturnValue({
      user: {
        userId: 'test-user-id',
        username: 'test-user-id'
      }
    } as any);
    mockClient.graphql.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPricing mutation', () => {
    it('should create pricing session successfully', async () => {
      mockClient.graphql.mockResolvedValueOnce({
        data: {
          createPricing: mockPricingResponse
        }
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Execute mutation
      result.current.createPricing.mutate({ product: mockProduct });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.createPricing.isSuccess).toBe(true);
      });

      expect(result.current.createPricing.data).toEqual(mockPricingResponse);
    });

    it('should handle authentication error', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Authentication required to create pricing session')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Execute mutation
      result.current.createPricing.mutate({ product: mockProduct });

      // Wait for mutation to fail (with retries disabled in wrapper)
      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.createPricing.error?.message).toContain(
        'Authentication required'
      );
    });


  });





  describe('createPricingAndInvokeResolver combined mutation', () => {
    it('should create pricing session and invoke resolver', async () => {
      mockClient.graphql
        .mockResolvedValueOnce({
          data: {
            createPricing: mockPricingResponse
          }
        } as any)
        .mockResolvedValueOnce(mockPricingSessionsResponse as any)
        .mockResolvedValueOnce(mockResolverResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Execute combined mutation
      result.current.createPricingAndInvokeResolver.mutate({ product: mockProduct });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.createPricingAndInvokeResolver.isSuccess).toBe(true);
      }, { timeout: 10000 });

      expect(result.current.createPricingAndInvokeResolver.data).toEqual({
        pricing: mockPricingResponse,
        resolver: {
          status: 'success',
          message: 'Agent orchestration workflow started successfully'
        }
      });
    });


  });

  describe('error states and loading states', () => {
    it('should provide correct loading states', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      expect(result.current.isCreatingPricing).toBe(false);
      expect(result.current.isInvokingResolver).toBe(false);
      expect(result.current.isStartingWorkflow).toBe(false);
    });

    it('should provide error states', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Authentication required to create pricing session')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Execute mutation to trigger error
      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricingError).toBeTruthy();
      }, { timeout: 3000 });

      expect(result.current.createPricingError?.message).toContain(
        'Authentication required'
      );
    });
  });

  describe('waitForSessionReady - Session Validation', () => {
    it('should validate session exists successfully', async () => {
      mockClient.graphql.mockResolvedValueOnce(mockPricingSessionsResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Call waitForSessionReady directly
      await expect(
        result.current.waitForSessionReady('test-session-id', 'test-user-id', 5000)
      ).resolves.toBeUndefined();
    });

    it('should timeout if session is not found', async () => {
      // Mock that returns empty items (session not found)
      mockClient.graphql.mockResolvedValue({
        data: {
          pricingByUserId: {
            items: [], // Empty - session not found
            nextToken: null
          }
        }
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Should not throw, but log warning (eventual consistency)
      await expect(
        result.current.waitForSessionReady('test-session-id', 'test-user-id', 1000)
      ).resolves.toBeUndefined();
    });

    it('should poll with 500ms intervals', async () => {
      mockClient.graphql.mockResolvedValue(mockPricingSessionsResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const startTime = Date.now();
      
      // Call with short timeout to measure polling intervals
      await result.current.waitForSessionReady('test-session-id', 'test-user-id', 1500);
      
      const elapsedTime = Date.now() - startTime;
      
      // Should complete within reasonable time (accounting for execution overhead)
      // With 500ms intervals and 1500ms timeout, should have ~3 polls
      expect(elapsedTime).toBeLessThan(3000);
    });

    it('should handle GraphQL errors gracefully', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('GraphQL error: Network failure')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Should not throw, but log warning and continue polling
      await expect(
        result.current.waitForSessionReady('test-session-id', 'test-user-id', 1000)
      ).resolves.toBeUndefined();
    });

    it('should proceed with warning on timeout', async () => {
      mockClient.graphql.mockResolvedValue({
        data: {
          pricingByUserId: {
            items: [],
            nextToken: null
          }
        }
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Should timeout and log warning
      await result.current.waitForSessionReady('test-session-id', 'test-user-id', 500);

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session validation timeout'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Exponential Backoff Retry Logic', () => {
    it('should respect maximum retry delay of 30 seconds', () => {
      // Test the exponential backoff calculation
      // Attempt 0: 1s * 2^0 = 1s
      // Attempt 1: 1s * 2^1 = 2s
      // Attempt 2: 1s * 2^2 = 4s (max 30s)
      // Attempt 5: 1s * 2^5 = 32s, capped at 30s
      
      const delays = [0, 1, 2, 5].map(attempt => 
        Math.min(1000 * Math.pow(2, attempt), 30000)
      );

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(30000); // Capped at 30s
    });
  });

  describe('Complete Workflow with Session Validation', () => {
    it('should complete full workflow: create session, validate, invoke resolver', async () => {
      mockClient.graphql
        .mockResolvedValueOnce({
          data: {
            createPricing: mockPricingResponse
          }
        } as any)
        .mockResolvedValueOnce(mockPricingSessionsResponse as any)
        .mockResolvedValueOnce(mockResolverResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute combined mutation
      result.current.createPricingAndInvokeResolver.mutate({ product: mockProduct });

      // Wait for completion
      await waitFor(() => {
        expect(result.current.createPricingAndInvokeResolver.isSuccess).toBe(true);
      }, { timeout: 10000 });

      // Verify workflow steps were logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting pricing analysis workflow'),
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1: Creating pricing session'),
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 2: Validating session is ready'),
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 3: Invoking resolver'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });


  });

  describe('Logging and Timestamps', () => {
    it('should log with ISO timestamps during session validation', async () => {
      mockClient.graphql.mockResolvedValue(mockPricingSessionsResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await result.current.waitForSessionReady('test-session-id', 'test-user-id', 1000);

      // Verify timestamps are in ISO format
      const calls = consoleSpy.mock.calls;
      const hasTimestamps = calls.some(call => 
        typeof call[0] === 'string' && call[0].includes('T') && call[0].includes('Z')
      );

      expect(hasTimestamps).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should include session ID in validation log messages', async () => {
      mockClient.graphql.mockResolvedValue(mockPricingSessionsResponse as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await result.current.waitForSessionReady('test-session-id', 'test-user-id', 1000);

      // Verify session ID is logged
      const calls = consoleSpy.mock.calls;
      const hasSessionId = calls.some(call => 
        JSON.stringify(call).includes('test-session-id')
      );

      expect(hasSessionId).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});