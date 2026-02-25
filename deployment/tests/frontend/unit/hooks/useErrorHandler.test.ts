/**
 * @fileoverview Unit tests for useErrorHandler hook.
 * 
 * Tests error handling, retry logic, session expiration handling,
 * and notification management in the product catalog system.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAtom } from 'jotai';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useErrorHandler } from '../../../../src/frontend/src/hooks/useErrorHandler';
import { addNotificationAtom } from '../../../../src/frontend/src/atoms/notification';

// Mock dependencies
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

const mockUseAtom = jest.mocked(useAtom);
const mockUseAuthenticator = jest.mocked(useAuthenticator);

describe('useErrorHandler', () => {
  const mockAddNotification = jest.fn();
  const mockSignOut = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock useAtom for notifications
    mockUseAtom.mockReturnValue([null, mockAddNotification] as any);

    // Mock useAuthenticator
    mockUseAuthenticator.mockReturnValue({
      signOut: mockSignOut,
      user: { userId: 'test-user' }
    } as any);

    // Mock window.location
    delete (window as any).location;
    (window as any).location = { href: '' };

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('handleError', () => {
    it('should process and handle network errors', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const networkError = {
        networkError: { message: 'Network request failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('NETWORK_ERROR');
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Connection Error'
        })
      );
    });

    it('should handle GraphQL mutation errors', async () => {
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

    it('should handle session expiration with redirect', async () => {
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

      // Should show warning notification
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: 'Session Expired'
        })
      );

      // Should trigger sign out and navigation after delay
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(window.location.href).toBe('/login');
      });
    });

    it('should handle authentication errors with redirect', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const authError = {
        message: 'Authentication required',
        code: 'UNAUTHENTICATED'
      };

      await act(async () => {
        await result.current.handleError(authError, 'Auth');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle data fetch errors with retry capability', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const mockRetryAction = jest.fn().mockResolvedValue(undefined);

      const dataFetchError = {
        message: 'Failed to fetch data',
        statusCode: 500
      };

      await act(async () => {
        await result.current.handleError(dataFetchError, 'DataFetch', mockRetryAction);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.currentError?.type).toBe('DATA_FETCH_ERROR');
      expect(result.current.canRetry).toBe(true);
    });
  });

  describe('retry functionality', () => {
    it('should successfully retry failed operations', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const mockRetryAction = jest.fn().mockResolvedValue(undefined);

      // First, create an error
      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.canRetry).toBe(true);

      // Now retry
      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      expect(mockRetryAction).toHaveBeenCalled();
      expect(result.current.hasError).toBe(false);
      expect(result.current.retryCount).toBe(0);

      // Should show success notification
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Operation Successful'
        })
      );
    });

    it('should handle retry failures', async () => {
      const { result } = renderHook(() => useErrorHandler());
      const mockRetryAction = jest.fn()
        .mockRejectedValueOnce(new Error('First retry failed'))
        .mockResolvedValueOnce(undefined);

      // Create initial error
      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      // First retry fails
      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.retryCount).toBe(1);

      // Second retry succeeds
      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      expect(result.current.hasError).toBe(false);
    });

    it('should respect maximum retry attempts', async () => {
      const { result } = renderHook(() => useErrorHandler({ maxRetries: 2 }));
      const mockRetryAction = jest.fn().mockRejectedValue(new Error('Always fails'));

      // Create initial error
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

    it('should not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const validationError = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };

      await act(async () => {
        await result.current.handleError(validationError, 'Validation');
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.canRetry).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      const { result } = renderHook(() => useErrorHandler());

      // Create an error
      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network');
      });

      expect(result.current.hasError).toBe(true);

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.hasError).toBe(false);
      expect(result.current.currentError).toBe(null);
      expect(result.current.retryCount).toBe(0);
    });
  });

  describe('error processing utilities', () => {
    it('should correctly identify retryable errors', () => {
      const { result } = renderHook(() => useErrorHandler());

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      const validationError = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };

      expect(result.current.isRetryable(networkError)).toBe(true);
      expect(result.current.isRetryable(validationError)).toBe(false);
    });

    it('should process errors correctly', () => {
      const { result } = renderHook(() => useErrorHandler());

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      const processedError = result.current.processError(networkError, 'Network');

      expect(processedError.type).toBe('NETWORK_ERROR');
      expect(processedError.source).toBe('Network');
      expect(processedError.retryable).toBe(true);
    });
  });

  describe('configuration options', () => {
    it('should respect maxRetries configuration', async () => {
      const { result } = renderHook(() => useErrorHandler({ maxRetries: 1 }));
      const mockRetryAction = jest.fn().mockRejectedValue(new Error('Fails'));

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network', mockRetryAction);
      });

      // Should allow retry once
      expect(result.current.canRetry).toBe(true);

      await act(async () => {
        await result.current.retry(mockRetryAction);
      });

      // Should not allow more retries
      expect(result.current.canRetry).toBe(false);
    });

    it('should respect showNotifications configuration', async () => {
      const { result } = renderHook(() => useErrorHandler({ showNotifications: false }));

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network');
      });

      expect(mockAddNotification).not.toHaveBeenCalled();
    });

    it('should respect logErrors configuration', async () => {
      const consoleSpy = jest.spyOn(console, 'error');

      const { result } = renderHook(() => useErrorHandler({ logErrors: false }));

      const networkError = {
        networkError: { message: 'Network failed' },
        code: 'NETWORK_ERROR'
      };

      await act(async () => {
        await result.current.handleError(networkError, 'Network');
      });

      // Should not log to console when logErrors is false
      expect(consoleSpy).not.toHaveBeenCalledWith(
        'Catalog Error:',
        expect.any(Object)
      );
    });
  });
});