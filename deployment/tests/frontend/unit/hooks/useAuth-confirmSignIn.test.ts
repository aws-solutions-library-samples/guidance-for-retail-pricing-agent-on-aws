/**
 * @fileoverview Unit test for useAuth confirmSignInWithNewPassword functionality.
 * 
 * Tests the correct format for confirmSignIn API call with user attributes.
 */

import { confirmSignIn } from 'aws-amplify/auth';
import { useAuth } from '../../../../src/frontend/src/hooks/useAuth';
import { renderHook, act } from '@testing-library/react';

// Mock AWS Amplify Auth
jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  resetPassword: jest.fn(),
  confirmResetPassword: jest.fn(),
  getCurrentUser: jest.fn(),
  fetchAuthSession: jest.fn(),
  signInWithRedirect: jest.fn(),
  confirmSignIn: jest.fn()
}));

// Mock other dependencies
jest.mock('../../../../src/frontend/src/hooks/useSessionPersistence', () => ({
  useSessionPersistence: () => ({
    user: null,
    isLoading: false,
    isInitialized: true,
    error: null,
    notifyLogin: jest.fn(),
    notifyLogout: jest.fn(),
    notifyTokenRefresh: jest.fn(),
    clearSession: jest.fn()
  })
}));

jest.mock('../../../../src/frontend/src/hooks/useTokenRefresh', () => ({
  useTokenRefresh: () => ({
    isRefreshing: false
  })
}));

jest.mock('../../../../src/frontend/src/utils/token-security', () => ({
  tokenSecurity: {
    logFailedLoginAttempt: jest.fn(),
    validateSecureStorage: () => true
  },
  validateCurrentTokens: () => Promise.resolve({ isValid: true }),
  verifySecureConnection: () => true,
  secureTokenCleanup: () => Promise.resolve(true),
  SecurityEventType: {
    TOKEN_TAMPERING: 'TOKEN_TAMPERING',
    TOKEN_DELETION_SUCCESS: 'TOKEN_DELETION_SUCCESS',
    TOKEN_DELETION_FAILURE: 'TOKEN_DELETION_FAILURE',
    FAILED_LOGIN_ATTEMPT: 'FAILED_LOGIN_ATTEMPT'
  },
  logSecurityEvent: jest.fn()
}));

// Mock useAuthenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: null,
    authStatus: 'unauthenticated'
  })
}));

const mockConfirmSignIn = confirmSignIn as jest.MockedFunction<typeof confirmSignIn>;

describe('useAuth - confirmSignInWithNewPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call confirmSignIn with correct format for new password and user attributes', async () => {
    // Mock successful confirmSignIn response
    const mockUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        given_name: 'John',
        family_name: 'Doe'
      }
    };

    mockConfirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' }
    } as any);

    // Mock getCurrentUser
    const { getCurrentUser } = require('aws-amplify/auth');
    getCurrentUser.mockResolvedValue(mockUser);

    // Mock fetchAuthSession
    const { fetchAuthSession } = require('aws-amplify/auth');
    fetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'access',
            client_id: 'mock-client-id',
            username: 'test@example.com',
            scope: 'aws.cognito.signin.user.admin'
          }
        },
        idToken: {
          toString: () => 'mock-id-token',
          payload: {
            sub: 'user-123',
            email: 'test@example.com',
            email_verified: true,
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'id',
            aud: 'mock-client-id',
            auth_time: Date.now() / 1000,
            'cognito:username': 'test@example.com'
          }
        }
      }
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.confirmSignInWithNewPassword(
        'NewPassword123!',
        {
          given_name: 'John',
          family_name: 'Doe'
        }
      );
    });

    // Verify confirmSignIn was called with correct format
    expect(mockConfirmSignIn).toHaveBeenCalledWith({
      challengeResponse: 'NewPassword123!',
      options: {
        userAttributes: {
          given_name: 'John',
          family_name: 'Doe'
        }
      }
    });
  });

  it('should call confirmSignIn with only password when no user attributes provided', async () => {
    const mockUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true
      }
    };

    mockConfirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' }
    } as any);

    const { getCurrentUser } = require('aws-amplify/auth');
    getCurrentUser.mockResolvedValue(mockUser);

    const { fetchAuthSession } = require('aws-amplify/auth');
    fetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'access',
            client_id: 'mock-client-id',
            username: 'test@example.com',
            scope: 'aws.cognito.signin.user.admin'
          }
        },
        idToken: {
          toString: () => 'mock-id-token',
          payload: {
            sub: 'user-123',
            email: 'test@example.com',
            email_verified: true,
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'id',
            aud: 'mock-client-id',
            auth_time: Date.now() / 1000,
            'cognito:username': 'test@example.com'
          }
        }
      }
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.confirmSignInWithNewPassword('NewPassword123!');
    });

    // Verify confirmSignIn was called with only challengeResponse
    expect(mockConfirmSignIn).toHaveBeenCalledWith({
      challengeResponse: 'NewPassword123!'
    });
  });

  it('should handle partial user attributes correctly', async () => {
    const mockUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true,
        given_name: 'John'
      }
    };

    mockConfirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' }
    } as any);

    const { getCurrentUser } = require('aws-amplify/auth');
    getCurrentUser.mockResolvedValue(mockUser);

    const { fetchAuthSession } = require('aws-amplify/auth');
    fetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'access',
            client_id: 'mock-client-id',
            username: 'test@example.com',
            scope: 'aws.cognito.signin.user.admin'
          }
        },
        idToken: {
          toString: () => 'mock-id-token',
          payload: {
            sub: 'user-123',
            email: 'test@example.com',
            email_verified: true,
            iss: 'mock-issuer',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            token_use: 'id',
            aud: 'mock-client-id',
            auth_time: Date.now() / 1000,
            'cognito:username': 'test@example.com'
          }
        }
      }
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.confirmSignInWithNewPassword(
        'NewPassword123!',
        {
          given_name: 'John'
          // family_name not provided
        }
      );
    });

    // Verify confirmSignIn was called with only provided attributes
    expect(mockConfirmSignIn).toHaveBeenCalledWith({
      challengeResponse: 'NewPassword123!',
      options: {
        userAttributes: {
          given_name: 'John'
        }
      }
    });
  });
});