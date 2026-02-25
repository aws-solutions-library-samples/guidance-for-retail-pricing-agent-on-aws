/**
 * @fileoverview Unit tests for useTokenRefresh hook.
 * 
 * Tests automatic token refresh functionality, expiration checking,
 * and error handling for the useTokenRefresh hook.
 */

import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { useTokenRefresh } from '../../../../src/frontend/src/hooks/useTokenRefresh';

// Mock dependencies
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn()
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
  getCurrentUser: jest.fn()
}));

const mockNavigate = jest.fn();
const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

describe('useTokenRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    
    // Default mock to prevent unhandled promise rejections
    mockFetchAuthSession.mockResolvedValue({ tokens: null } as any);
    mockGetCurrentUser.mockResolvedValue({ username: 'test' } as any);
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useTokenRefresh());

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeNull();
    expect(typeof result.current.refreshTokens).toBe('function');
  });

  it('should refresh tokens manually when refreshTokens is called', async () => {
    const mockUser = { username: 'test@example.com' };
    const mockSession = {
      tokens: {
        accessToken: {
          payload: { exp: Math.floor(Date.now() / 1000) + 3600 }
        }
      }
    };

    mockGetCurrentUser.mockResolvedValue(mockUser as any);
    mockFetchAuthSession.mockResolvedValue(mockSession as any);

    const { result } = renderHook(() => useTokenRefresh());

    await act(async () => {
      await result.current.refreshTokens();
    });

    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeInstanceOf(Date);
  });

  it('should handle token refresh failure by redirecting to login', async () => {
    const error = new Error('Token refresh failed');
    mockGetCurrentUser.mockRejectedValue(error);

    const { result } = renderHook(() => useTokenRefresh());

    let thrownError: any;
    await act(async () => {
      try {
        await result.current.refreshTokens();
      } catch (e) {
        thrownError = e;
      }
    });

    expect(thrownError).toBeDefined();
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      state: {
        message: 'Your session has expired. Please log in again.',
        from: window.location.pathname
      },
      replace: true
    });
  });

  it('should provide refreshTokens function', () => {
    const { result } = renderHook(() => useTokenRefresh());
    
    expect(typeof result.current.refreshTokens).toBe('function');
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeNull();
  });

  it('should clean up properly on unmount', () => {
    const { unmount } = renderHook(() => useTokenRefresh());
    
    // Should not throw error on unmount
    expect(() => unmount()).not.toThrow();
  });
});