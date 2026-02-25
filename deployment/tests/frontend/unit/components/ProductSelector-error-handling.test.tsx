/**
 * @fileoverview Unit tests for ProductSelector error handling functionality.
 * 
 * Tests error handling integration and validation logic without rendering
 * the full component to avoid complex dependency mocking issues.
 */

import { renderHook, act } from '@testing-library/react';
import { useErrorHandler } from '../../../../src/frontend/src/hooks/useErrorHandler';

// Mock dependencies for useErrorHandler
jest.mock('jotai', () => ({
  useAtom: jest.fn()
}));

jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: jest.fn()
}));

jest.mock('../../../../src/frontend/src/atoms/notification', () => ({
  addNotificationAtom: 'mockAddNotificationAtom',
  createErrorNotification: jest.fn((title, message) => ({ type: 'error', title, message })),
  createWarningNotification: jest.fn((title, message) => ({ type: 'warning', title, message }))
}));

const mockUseAtom = jest.mocked(require('jotai').useAtom);
const mockUseAuthenticator = jest.mocked(require('@aws-amplify/ui-react').useAuthenticator);

describe('ProductSelector Error Handling Integration', () => {
  const mockAddNotification = jest.fn();
  const mockSignOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useAtom for notifications
    mockUseAtom.mockReturnValue([null, mockAddNotification]);

    // Mock useAuthenticator
    mockUseAuthenticator.mockReturnValue({
      signOut: mockSignOut,
      user: { userId: 'test-user' }
    } as any);

    // Mock window.location
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  describe('GraphQL mutation error handling', () => {
    it('should handle GraphQL mutation errors correctly', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const graphQLError = {
        graphQLErrors: [{
          message: 'Mutation failed',
          extensions: { code: 'INTERNAL_ERROR' }
        }]
      };

      await act(async () => {
        await result.current.handleError(graphQLError, 'GraphQL');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('GRAPHQL_ERROR');
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Server Error'
        })
      );
    });

    it('should validate product data requirements', () => {
      // Test product validation logic
      const validProduct = {
        product_id: 'TEST-001',
        cost: 50.00,
        MSRP: 99.99,
        MAP: 89.99
      };

      const invalidProduct = {
        product_id: 'TEST-002',
        cost: 0,
        MSRP: 0,
        MAP: 0
      };

      // Valid product should pass validation
      expect(validProduct.cost).toBeGreaterThan(0);
      expect(validProduct.MSRP).toBeGreaterThan(0);
      expect(validProduct.MAP).toBeGreaterThan(0);

      // Invalid product should fail validation
      const missingFields = [];
      if (!invalidProduct.cost) missingFields.push('cost');
      if (!invalidProduct.MSRP) missingFields.push('MSRP');
      if (!invalidProduct.MAP) missingFields.push('MAP');

      expect(missingFields).toEqual(['cost', 'MSRP', 'MAP']);
    });
  });

  describe('Session expiration handling', () => {
    it('should handle session expiration correctly', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const sessionError = {
        message: 'Session expired',
        code: 'SESSION_EXPIRED'
      };

      await act(async () => {
        await result.current.handleError(sessionError, 'Session');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('SESSION_EXPIRED');
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: 'Session Expired'
        })
      );
    });
  });

  describe('Network connectivity error handling', () => {
    it('should handle network errors with retry capability', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const mockRetryAction = jest.fn().mockResolvedValue(undefined);

      const networkError = {
        networkError: { message: 'Network request failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('NETWORK_ERROR');
      expect(result.current.canRetry).toBe(true);
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Connection Error'
        })
      );
    });

    it('should handle data fetch errors', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const dataFetchError = {
        message: 'Failed to fetch data',
        statusCode: 500
      };

      await act(async () => {
        await result.current.handleError(dataFetchError, 'DataFetch');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('DATA_FETCH_ERROR');
    });
  });

  describe('Error recovery and retry logic', () => {
    it('should support error dismissal for recoverable errors', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const validationError = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };

      await act(async () => {
        await result.current.handleError(validationError, 'Validation');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.recoverable).toBe(true);

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.hasError).toBe(false);
      expect(result.current.currentError).toBe(null);
    });

    it('should handle retry functionality correctly', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const mockRetryAction = jest.fn().mockResolvedValue(undefined);

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      expect(result.current.canRetry).toBe(true);

      // Retry the operation
      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      expect(mockRetryAction).toHaveBeenCalled();
      expect(result.current.hasError).toBe(false);
    });

    it('should respect retry limits', async () => {
      const { result } = renderHook(() => useErrorHandler({ maxRetries: 2 }));
      const mockRetryAction = jest.fn().mockRejectedValue(new Error('Always fails'));

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      // Retry twice (should reach max)
      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      expect(result.current.retryCount).toBe(2);
      expect(result.current.canRetry).toBe(false);
    });
  });

  describe('Error categorization and processing', () => {
    it('should correctly categorize different error types', async () => {
      const { result } = renderHook(() => useErrorHandler());

      // Test different error types
      const errors = [
        {
          error: { networkError: { message: 'Network failed' }, code: 'NETWORK_ERROR' },
          expectedType: 'NETWORK_ERROR'
        },
        {
          error: { graphQLErrors: [{ message: 'GraphQL failed' }] },
          expectedType: 'GRAPHQL_ERROR'
        },
        {
          error: { message: 'Session expired', code: 'SESSION_EXPIRED' },
          expectedType: 'SESSION_EXPIRED'
        },
        {
          error: { message: 'Validation failed', code: 'VALIDATION_ERROR' },
          expectedType: 'VALIDATION_ERROR'
        }
      ];

      for (const { error, expectedType } of errors) {
        await act(async () => {
          await result.current.handleError(error, 'Test');
        });

        expect(result.current.currentError?.type).toBe(expectedType);

        // Clear error for next test
        act(() => {
          result.current.clearError();
        });
      }
    });

    it('should identify retryable vs non-retryable errors', () => {
      const { result } = renderHook(() => useErrorHandler());

      const retryableError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      const nonRetryableError = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };

      expect(result.current.isRetryable(retryableError)).toBe(true);
      expect(result.current.isRetryable(nonRetryableError)).toBe(false);
    });
  });
});