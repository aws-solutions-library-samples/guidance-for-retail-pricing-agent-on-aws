/**
 * @fileoverview Unit tests for AuthContext provider and hook.
 * 
 * Tests the AuthProvider component and useAuthContext hook functionality
 * including user context management, token extraction, and error handling.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { AuthProvider, useAuthContext } from '../../../../src/frontend/src/contexts/AuthContext';
import type { CognitoUser } from '../../../../src/frontend/src/types/auth-types';

// Mock AWS Amplify Auth
jest.mock('aws-amplify/auth', () => ({
  getCurrentUser: jest.fn(),
  fetchAuthSession: jest.fn()
}));

// Mock Amplify UI React
jest.mock('@aws-amplify/ui-react', () => ({
  Authenticator: {
    Provider: ({ children }: { children: React.ReactNode }) => <div data-testid="authenticator-provider">{children}</div>
  }
}));

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;

/**
 * Test component that uses the AuthContext.
 */
const TestComponent: React.FC = () => {
  const {
    user,
    userId,
    userEmail,
    userAttributes,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    getCurrentUser,
    refreshUser,
    clearError
  } = useAuthContext();

  return (
    <div>
      <div data-testid="user-id">{userId || 'No user ID'}</div>
      <div data-testid="user-email">{userEmail || 'No email'}</div>
      <div data-testid="is-authenticated">{isAuthenticated.toString()}</div>
      <div data-testid="is-loading">{isLoading.toString()}</div>
      <div data-testid="is-initialized">{isInitialized.toString()}</div>
      <div data-testid="error">{error?.message || 'No error'}</div>
      <div data-testid="username">{user?.username || 'No username'}</div>
      <div data-testid="email-verified">{userAttributes?.email_verified?.toString() || 'Unknown'}</div>
      <button onClick={() => getCurrentUser()} data-testid="get-current-user">Get Current User</button>
      <button onClick={() => refreshUser()} data-testid="refresh-user">Refresh User</button>
      <button onClick={() => clearError()} data-testid="clear-error">Clear Error</button>
    </div>
  );
};

/**
 * Creates mock user data for testing.
 */
const createMockUser = (overrides: Partial<any> = {}) => ({
  userId: 'test-user-id-123',
  username: 'testuser@example.com',
  ...overrides
});

/**
 * Creates mock auth session for testing.
 */
const createMockSession = (overrides: Partial<any> = {}) => ({
  tokens: {
    idToken: {
      toString: () => 'mock-id-token',
      payload: {
        sub: 'test-user-id-123',
        email: 'testuser@example.com',
        email_verified: true,
        iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_TEST',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000),
        token_use: 'id',
        aud: 'test-client-id',
        auth_time: Math.floor(Date.now() / 1000),
        'cognito:username': 'testuser@example.com',
        given_name: 'Test',
        family_name: 'User',
        ...overrides.idTokenPayload
      }
    },
    accessToken: {
      toString: () => 'mock-access-token',
      payload: {
        sub: 'test-user-id-123',
        iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_TEST',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
        client_id: 'test-client-id',
        username: 'testuser@example.com',
        scope: 'openid email profile',
        ...overrides.accessTokenPayload
      }
    }
  },
  userPoolId: 'us-west-2_TEST',
  ...overrides
});

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear any existing event listeners
    window.removeEventListener('tokenRefresh', jest.fn());
    window.removeEventListener('amplifyAuthStateChange', jest.fn());
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('AuthProvider', () => {
    it('should provide initial loading state', () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Not authenticated'));
      mockFetchAuthSession.mockRejectedValue(new Error('No session'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('is-initialized')).toHaveTextContent('false');
    });

    it('should initialize with authenticated user', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user-id')).toHaveTextContent('test-user-id-123');
      expect(screen.getByTestId('user-email')).toHaveTextContent('testuser@example.com');
      expect(screen.getByTestId('username')).toHaveTextContent('testuser@example.com');
      expect(screen.getByTestId('email-verified')).toHaveTextContent('true');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Authentication failed');
      authError.name = 'NotAuthorizedException';

      mockGetCurrentUser.mockRejectedValue(authError);
      mockFetchAuthSession.mockRejectedValue(authError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('Authentication failed. Please sign in again.');
    });

    it('should handle expired tokens', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession({
        idTokenPayload: {
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        accessTokenPayload: {
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        }
      });

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('An authentication error occurred. Please try again.');
    });

    it('should extract user information from ID token', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession({
        idTokenPayload: {
          sub: 'custom-user-id',
          email: 'custom@example.com',
          email_verified: false,
          given_name: 'Custom',
          family_name: 'User',
          phone_number: '+1234567890',
          phone_number_verified: true
        }
      });

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('user-id')).toHaveTextContent('custom-user-id');
      expect(screen.getByTestId('user-email')).toHaveTextContent('custom@example.com');
      expect(screen.getByTestId('email-verified')).toHaveTextContent('false');
    });
  });

  describe('useAuthContext', () => {
    it('should provide context value when used within AuthProvider', () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // The context should be available and provide default values initially
      expect(screen.getByTestId('is-loading')).toBeInTheDocument();
      expect(screen.getByTestId('is-authenticated')).toBeInTheDocument();
    });

    it('should provide getCurrentUser function', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      // Clear previous calls
      mockGetCurrentUser.mockClear();
      mockFetchAuthSession.mockClear();

      // Set up new mock responses
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      // Click the get current user button
      act(() => {
        screen.getByTestId('get-current-user').click();
      });

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalled();
        expect(mockFetchAuthSession).toHaveBeenCalled();
      });
    });

    it('should provide refreshUser function', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      // Clear previous calls
      mockGetCurrentUser.mockClear();
      mockFetchAuthSession.mockClear();

      // Set up new mock responses
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      // Click the refresh user button
      act(() => {
        screen.getByTestId('refresh-user').click();
      });

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalled();
        expect(mockFetchAuthSession).toHaveBeenCalled();
      });
    });

    it('should provide clearError function', async () => {
      const authError = new Error('Test error');
      authError.name = 'TestError';

      mockGetCurrentUser.mockRejectedValue(authError);
      mockFetchAuthSession.mockRejectedValue(authError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('error')).not.toHaveTextContent('No error');
      });

      // Click clear error button
      act(() => {
        screen.getByTestId('clear-error').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });
  });

  describe('Token refresh handling', () => {
    it('should listen for token refresh events', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      // Clear previous calls
      mockGetCurrentUser.mockClear();
      mockFetchAuthSession.mockClear();

      // Set up new mock responses for refresh
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      // Simulate token refresh event
      act(() => {
        window.dispatchEvent(new CustomEvent('tokenRefresh'));
      });

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalled();
        expect(mockFetchAuthSession).toHaveBeenCalled();
      });
    });

    it('should listen for auth state change events', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
      });

      // Clear previous calls
      mockGetCurrentUser.mockClear();
      mockFetchAuthSession.mockClear();

      // Set up new mock responses
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      // Simulate auth state change event
      act(() => {
        window.dispatchEvent(new CustomEvent('amplifyAuthStateChange', {
          detail: { authStatus: 'authenticated' }
        }));
      });

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalled();
        expect(mockFetchAuthSession).toHaveBeenCalled();
      });
    });

    it('should clear user state on unauthenticated event', async () => {
      const mockUser = createMockUser();
      const mockSession = createMockSession();

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetchAuthSession.mockResolvedValue(mockSession);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
      });

      // Simulate unauthenticated event
      act(() => {
        window.dispatchEvent(new CustomEvent('amplifyAuthStateChange', {
          detail: { authStatus: 'unauthenticated' }
        }));
      });

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user-id')).toHaveTextContent('No user ID');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });
  });
});