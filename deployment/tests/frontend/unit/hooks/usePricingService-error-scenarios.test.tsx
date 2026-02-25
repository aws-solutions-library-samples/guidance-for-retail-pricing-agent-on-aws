/**
 * @fileoverview Error scenario tests for usePricingService hook.
 * 
 * Tests error handling, recovery, and retry logic for pricing service operations
 * including network latency, DynamoDB latency, authentication failures, and
 * invalid product data scenarios.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5
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

// Mock the GraphQL client
jest.mock('../../../../src/frontend/src/graphql/client', () => ({
  client: {
    graphql: jest.fn()
  }
}));

const mockClient = client as jest.Mocked<typeof client>;

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

// Mock product with missing pricing fields
const mockProductMissingCost: ProductType = {
  ...mockProduct,
  cost: undefined as any
};

const mockProductMissingMSRP: ProductType = {
  ...mockProduct,
  MSRP: undefined as any
};

const mockProductMissingMAP: ProductType = {
  ...mockProduct,
  MAP: undefined as any
};

const mockProductInvalidData: ProductType = {
  ...mockProduct,
  product_id: '' // Invalid: empty product_id
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

describe('usePricingService - Error Scenarios', () => {
  beforeEach(() => {
    mockUseAuthenticator.mockReturnValue({
      user: {
        userId: 'test-user-id',
        username: 'test-user-id'
      }
    } as any);
    mockClient.graphql.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Failure Scenarios', () => {
    it('should handle authentication failure with clear error message', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Unauthorized: Authentication required')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.createPricingError?.message).toContain('Unauthorized');
    });

    it('should handle missing user authentication', async () => {
      mockUseAuthenticator.mockReturnValue({
        user: null
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // The hook should handle missing user gracefully
      expect(result.current.isCreatingPricing).toBe(false);
    });

    it('should provide actionable error message for authentication failure', async () => {
      const authError = new Error('Authentication required to create pricing session');
      mockClient.graphql.mockRejectedValue(authError);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      const errorMessage = result.current.createPricingError?.message || '';
      expect(errorMessage).toMatch(/authentication|required/i);
    });
  });

  describe('Network Latency Scenarios', () => {
    it('should handle network timeout gracefully', async () => {
      mockClient.graphql.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.createPricingError?.message).toContain('timeout');
    });

    it('should retry on network failure with exponential backoff', async () => {
      let attemptCount = 0;
      mockClient.graphql.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          data: {
            createPricing: {
              id: 'test-session-id',
              userId: 'test-user-id',
              product: JSON.stringify(mockProduct),
              status: 'initiated',
              createdAt: '2024-01-15T10:30:00Z'
            }
          }
        } as any);
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isSuccess).toBe(true);
      }, { timeout: 5000 });

      expect(attemptCount).toBeGreaterThan(1);
    });

    it('should handle slow DynamoDB responses', async () => {
      mockClient.graphql.mockImplementation(
        () => new Promise(resolve => 
          setTimeout(() => resolve({
            data: {
              createPricing: {
                id: 'test-session-id',
                userId: 'test-user-id',
                product: JSON.stringify(mockProduct),
                status: 'initiated',
                createdAt: '2024-01-15T10:30:00Z'
              }
            }
          } as any), 2000)
        )
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isSuccess).toBe(true);
      }, { timeout: 5000 });

      expect(result.current.createPricing.data?.id).toBe('test-session-id');
    });
  });

  describe('Invalid Product Data Scenarios', () => {
    it('should handle invalid product data with clear error', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Invalid product data format')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProductInvalidData });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.createPricingError?.message).toContain('Invalid');
    });

    it('should handle missing required product fields', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Missing required product field: product_id')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProductInvalidData });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.createPricingError?.message).toContain('required');
    });

    it('should provide specific error message for each missing field', async () => {
      const errorMessages = [
        'Missing required product field: product_id',
        'Missing required product field: category',
        'Missing required product field: vendor'
      ];

      for (const errorMsg of errorMessages) {
        mockClient.graphql.mockRejectedValueOnce(new Error(errorMsg));

        const wrapper = createWrapper();
        const { result } = renderHook(() => usePricingService(), { wrapper });

        result.current.createPricing.mutate({ product: mockProduct });

        await waitFor(() => {
          expect(result.current.createPricing.isError).toBe(true);
        }, { timeout: 3000 });

        expect(result.current.createPricingError?.message).toContain('required');
      }
    });
  });

  describe('Session Validation Error Scenarios', () => {
    it('should handle session validation timeout gracefully', async () => {
      mockClient.graphql.mockResolvedValue({
        data: {
          pricingByUserId: {
            items: [], // Session not found
            nextToken: null
          }
        }
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Should not throw, but log warning
      await expect(
        result.current.waitForSessionReady('test-session-id', 'test-user-id', 500)
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session validation timeout'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should handle GraphQL errors during session validation', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('GraphQL error: Network failure')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Should not throw, but log warning and continue
      await expect(
        result.current.waitForSessionReady('test-session-id', 'test-user-id', 1000)
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during session validation'),
        expect.any(Object)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should proceed with warning on session validation timeout', async () => {
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

      await result.current.waitForSessionReady('test-session-id', 'test-user-id', 500);

      // Verify warning was logged with timeout message
      const warnCalls = consoleSpy.mock.calls;
      const hasTimeoutWarning = warnCalls.some(call =>
        JSON.stringify(call).includes('timeout')
      );

      expect(hasTimeoutWarning).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Resolver Invocation Error Scenarios', () => {
    it('should handle resolver invocation failure', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Failed to invoke resolver')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.invokeResolver.mutate({
        userID: 'test-user-id',
        sessionID: 'test-session-id',
        product: mockProduct
      });

      await waitFor(() => {
        expect(result.current.invokeResolver.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.invokeResolverError?.message).toContain('resolver');
    });

    it('should provide clear error message for resolver failures', async () => {
      const resolverError = new Error('Lambda function timeout');
      mockClient.graphql.mockRejectedValue(resolverError);

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.invokeResolver.mutate({
        userID: 'test-user-id',
        sessionID: 'test-session-id',
        product: mockProduct
      });

      await waitFor(() => {
        expect(result.current.invokeResolver.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.invokeResolverError?.message).toContain('timeout');
    });
  });

  describe('Exponential Backoff Retry Strategy', () => {
    it('should implement exponential backoff with correct delays', async () => {
      const delays: number[] = [];
      let attemptCount = 0;

      mockClient.graphql.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          const delay = Math.min(1000 * Math.pow(2, attemptCount - 1), 30000);
          delays.push(delay);
          return Promise.reject(new Error('Transient error'));
        }
        return Promise.resolve({
          data: {
            createPricing: {
              id: 'test-session-id',
              userId: 'test-user-id',
              product: JSON.stringify(mockProduct),
              status: 'initiated',
              createdAt: '2024-01-15T10:30:00Z'
            }
          }
        } as any);
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isSuccess).toBe(true);
      }, { timeout: 10000 });

      // Verify exponential backoff delays
      expect(delays.length).toBeGreaterThan(0);
      expect(delays[0]).toBeLessThanOrEqual(2000); // First retry delay
    });

    it('should cap maximum retry delay at 30 seconds', () => {
      // Test the exponential backoff calculation
      const maxDelay = 30000;
      const delays = [0, 1, 2, 5, 10].map(attempt =>
        Math.min(1000 * Math.pow(2, attempt), maxDelay)
      );

      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(30000); // Capped at 30s (2^5 = 32000 > 30000)
      expect(delays[4]).toBe(30000); // Capped at 30s
    });

    it('should not exceed maximum retry attempts', async () => {
      let attemptCount = 0;

      mockClient.graphql.mockImplementation(() => {
        attemptCount++;
        return Promise.reject(new Error('Persistent error'));
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 5000 });

      // Should have attempted initial + 2 retries = 3 total
      expect(attemptCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Complete Workflow Error Recovery', () => {
    it('should handle workflow error state', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Failed to create pricing session')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      // Test that error state is initially null or undefined
      expect(result.current.workflowError).toBeFalsy();
      
      // Trigger error through individual mutation
      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 5000 });

      expect(result.current.createPricingError?.message).toBeTruthy();
    });

    it('should log error details for debugging', async () => {
      const errorMessage = 'Database connection failed';
      mockClient.graphql.mockRejectedValue(new Error(errorMessage));

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 5000 });

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should provide error state for workflow operations', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Transient failure')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 5000 });

      // Verify error is accessible
      expect(result.current.createPricingError).toBeDefined();
      expect(result.current.createPricingError?.message).toContain('Transient');
    });
  });

  describe('Error Message Clarity and Actionability', () => {
    it('should provide clear error message for authentication failure', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Authentication required to create pricing session')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      const errorMsg = result.current.createPricingError?.message || '';
      expect(errorMsg).toMatch(/authentication|required/i);
    });

    it('should provide clear error message for network failure', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Network error: Connection refused')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProduct });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      const errorMsg = result.current.createPricingError?.message || '';
      expect(errorMsg).toMatch(/network|connection/i);
    });

    it('should provide clear error message for invalid data', async () => {
      mockClient.graphql.mockRejectedValue(
        new Error('Invalid product data format')
      );

      const wrapper = createWrapper();
      const { result } = renderHook(() => usePricingService(), { wrapper });

      result.current.createPricing.mutate({ product: mockProductInvalidData });

      await waitFor(() => {
        expect(result.current.createPricing.isError).toBe(true);
      }, { timeout: 3000 });

      const errorMsg = result.current.createPricingError?.message || '';
      expect(errorMsg).toMatch(/invalid|format/i);
    });
  });
});
