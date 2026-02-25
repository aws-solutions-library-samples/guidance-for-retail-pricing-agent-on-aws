/**
 * @fileoverview Unit tests for useSessionPersistence hook.
 * 
 * Tests session restoration, cross-tab synchronization, and token management
 * functionality of the session persistence hook.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { useSessionPersistence } from '../../../../src/frontend/src/hooks/useSessionPersistence';
import type { CognitoUser } from '../../../../src/frontend/src/types/auth-types';

// Mock AWS Amplify Auth
jest.mock('aws-amplify/auth', () => ({
  getCurrentUser: jest.fn(),
  fetchAuthSession: jest.fn()
}));

// Mock BroadcastChannel
const mockBroadcastChannel = {
  postMessage: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn()
};

// Mock BroadcastChannel constructor
(global as any).BroadcastChannel = jest.fn(() => mockBroadcastChannel);

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;

describe('useSessionPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockAmplifyUser = {
    username: 'test@example.com',
    userId: 'user-123',
    signInDetails: {
      loginId: 'test@example.com'
    }
  };

  const mockSession = {
    tokens: {
      accessToken: {
        toString: () => 'mock-access-token',
        payload: {
          sub: 'user-123',
          iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
          client_id: 'test-client-id',
          username: 'test@example.com',
          scope: 'openid email'
        }
      },
      idToken: {
        toString: () => 'mock-id-token',
        payload: {
          sub: 'user-123',
          email: 'test@example.com',
          email_verified: true,
          iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          token_use: 'id',
          aud: 'test-client-id',
          auth_time: Math.floor(Date.now() / 1000),
          'cognito:username': 'test@example.com'
        }
      }
    },
    identityId: 'identity-123'
  };

  it('should initialize with loading state', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    const { result } = renderHook(() => useSessionPersistence());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('should restore session from storage successfully', async () => {
    mockGetCurrentUser.mockResolvedValue(mockAmplifyUser);
    mockFetchAuthSession.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useSessionPersistence());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeDefined();
    expect(result.current.user?.username).toBe('test@example.com');
    expect(result.current.user?.attributes.sub).toBe('user-123');
    expect(result.current.error).toBe(null);
  });

  it('should handle no existing session gracefully', async () => {
    mockGetCurrentUser.mockRejectedValue({ name: 'UserUnAuthenticatedException' });

    const { result } = renderHook(() => useSessionPersistence());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should initialize BroadcastChannel for cross-tab communication', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    renderHook(() => useSessionPersistence());

    expect(BroadcastChannel).toHaveBeenCalledWith('auth-session');
    expect(mockBroadcastChannel.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should broadcast login event when notifyLogin is called', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    const { result } = renderHook(() => useSessionPersistence());

    const mockUser: CognitoUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true
      },
      signInUserSession: null
    };

    act(() => {
      result.current.notifyLogin(mockUser);
    });

    expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
      type: 'LOGIN',
      timestamp: expect.any(Number),
      userId: 'user-123',
      data: { user: mockUser }
    });
  });

  it('should broadcast logout event when notifyLogout is called', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    const { result } = renderHook(() => useSessionPersistence());

    act(() => {
      result.current.notifyLogout();
    });

    expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
      type: 'LOGOUT',
      timestamp: expect.any(Number)
    });
  });

  it('should broadcast token refresh event when notifyTokenRefresh is called', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    const { result } = renderHook(() => useSessionPersistence());

    const mockUser: CognitoUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true
      },
      signInUserSession: null
    };

    act(() => {
      result.current.notifyTokenRefresh(mockUser);
    });

    expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
      type: 'TOKEN_REFRESH',
      timestamp: expect.any(Number),
      userId: 'user-123',
      data: { user: mockUser }
    });
  });

  it('should clear session and broadcast logout', async () => {
    mockGetCurrentUser.mockResolvedValue(mockAmplifyUser);
    mockFetchAuthSession.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useSessionPersistence());

    // Wait for initial session restoration to complete
    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.user).toBeDefined();
    });

    // Clear the session
    await act(async () => {
      await result.current.clearSession();
    });

    // Verify session is cleared
    expect(result.current.user).toBe(null);
    expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
      type: 'LOGOUT',
      timestamp: expect.any(Number)
    });
  });

  it('should check token expiration periodically', async () => {
    const expiredSession = {
      ...mockSession,
      tokens: {
        ...mockSession.tokens,
        accessToken: {
          ...mockSession.tokens.accessToken,
          payload: {
            ...mockSession.tokens.accessToken.payload,
            exp: Math.floor(Date.now() / 1000) - 100 // Expired 100 seconds ago
          }
        }
      }
    };

    mockGetCurrentUser.mockResolvedValue(mockAmplifyUser);
    mockFetchAuthSession.mockResolvedValue(expiredSession);

    const { result } = renderHook(() => useSessionPersistence());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Fast-forward time to trigger token expiration check
    act(() => {
      jest.advanceTimersByTime(60 * 1000); // 1 minute
    });

    await waitFor(() => {
      expect(result.current.user).toBe(null);
    });
  });

  it('should cleanup BroadcastChannel on unmount', () => {
    mockGetCurrentUser.mockRejectedValue(new Error('No user'));
    
    const { unmount } = renderHook(() => useSessionPersistence());

    unmount();

    expect(mockBroadcastChannel.close).toHaveBeenCalled();
  });
});