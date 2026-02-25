/**
 * @fileoverview Unit test for useAuth token validation during new password confirmation.
 * 
 * Tests that token validation doesn't incorrectly flag fresh tokens as tampered.
 */

import { confirmSignIn, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { useAuth } from '../../../../src/frontend/src/hooks/useAuth';
import { renderHook, act } from '@testing-library/react';
import * as tokenSecurity from '../../../../src/frontend/src/utils/token-security';

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

// Mock token security utilities
jest.mock('../../../../src/frontend/src/utils/token-security', () => ({
  tokenSecurity: {
    logFailedLoginAttempt: jest.fn(),
    validateSecureStorage: () => true
  },
  validateCurrentTokens: jest.fn(),
  validateFreshTokens: jest.fn(),
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

// Mock useAuthenticator
jest.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({
    user: null,
    authStatus: 'unauthenticated'
  })
}));

const mockConfirmSignIn = confirmSignIn as jest.MockedFunction<typeof confirmSignIn>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;
const mockValidateFreshTokens = tokenSecurity.validateFreshTokens as jest.MockedFunction<typeof tokenSecurity.validateFreshTokens>;
const mockLogSecurityEvent = tokenSecurity.logSecurityEvent as jest.MockedFunction<typeof tokenSecurity.logSecurityEvent>;

describe('useAuth - Token Validation During New Password Confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle fresh tokens without throwing tampering error', async () => {
    // Mock successful confirmSignIn response
    const mockUser = {
      userId: 'user-123',
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

    mockGetCurrentUser.mockResolvedValue(mockUser);

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6Im1vY2staXNzdWVyIiwiZXhwIjoxNzM0NTU2ODAwfQ.test',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
            token_use: 'access',
            client_id: 'mock-client-id',
            username: 'test@example.com',
            scope: 'aws.cognito.signin.user.admin'
          }
        },
        idToken: {
          toString: () => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImV4cCI6MTczNDU1NjgwMH0.test',
          payload: {
            sub: 'user-123',
            email: 'test@example.com',
            email_verified: true,
            iss: 'mock-issuer',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
            token_use: 'id',
            aud: 'mock-client-id',
            auth_time: Math.floor(Date.now() / 1000),
            'cognito:username': 'test@example.com'
          }
        }
      }
    });

    // Mock fresh token validation as valid
    mockValidateFreshTokens.mockResolvedValue({
      isValid: true,
      isExpired: false,
      isTampered: false,
      errors: []
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

    // Verify that validateFreshTokens was called instead of validateCurrentTokens
    expect(mockValidateFreshTokens).toHaveBeenCalled();

    // Verify no tampering error was thrown
    expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: 'new_password_confirmation'
      }),
      'CRITICAL'
    );
  });

  it('should handle token validation errors gracefully during new password confirmation', async () => {
    const mockUser = {
      userId: 'user-123',
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

    mockGetCurrentUser.mockResolvedValue(mockUser);

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    });

    // Mock token validation throwing an error
    mockValidateFreshTokens.mockRejectedValue(new Error('Token validation service unavailable'));

    const { result } = renderHook(() => useAuth());

    // Should not throw error even if token validation fails
    await act(async () => {
      const user = await result.current.confirmSignInWithNewPassword(
        'NewPassword123!',
        {
          given_name: 'John',
          family_name: 'Doe'
        }
      );

      expect(user).toBeDefined();
      expect(user.username).toBe('test@example.com');
    });

    // Verify that validation error was logged but didn't block sign-in
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      tokenSecurity.SecurityEventType.TOKEN_TAMPERING,
      expect.objectContaining({
        context: 'new_password_confirmation_validation_error',
        action: 'validation_skipped'
      }),
      'MEDIUM'
    );
  });

  it('should allow sign-in when fresh token validation has minor issues', async () => {
    const mockUser = {
      userId: 'user-123',
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

    mockGetCurrentUser.mockResolvedValue(mockUser);

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    });

    // Mock fresh token validation with minor issues (fresh token scenario)
    mockValidateFreshTokens.mockResolvedValue({
      isValid: false,
      isExpired: false,
      isTampered: true,
      errors: ['Token decoding failed', 'Invalid JWT payload']
    });

    const { result } = renderHook(() => useAuth());

    // Should allow sign-in despite validation issues
    await act(async () => {
      const user = await result.current.confirmSignInWithNewPassword(
        'NewPassword123!',
        {
          given_name: 'John',
          family_name: 'Doe'
        }
      );

      expect(user).toBeDefined();
      expect(user.username).toBe('test@example.com');
    });

    // Verify that fresh token exception was logged
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      tokenSecurity.SecurityEventType.TOKEN_TAMPERING,
      expect.objectContaining({
        context: 'new_password_confirmation',
        action: 'allowed_fresh_token_exception'
      }),
      'MEDIUM'
    );
  });

  it('should still block sign-in for genuine tampering concerns', async () => {
    const mockUser = {
      userId: 'user-123',
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

    mockGetCurrentUser.mockResolvedValue(mockUser);

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
          payload: {
            sub: 'user-123',
            iss: 'mock-issuer',
            exp: Math.floor(Date.now() / 1000) + 3600
          }
        }
      }
    });

    // Mock token validation with genuine tampering concerns
    mockValidateFreshTokens.mockResolvedValue({
      isValid: false,
      isExpired: false,
      isTampered: true,
      errors: ['Signature verification failed', 'Token structure corrupted']
    });

    const { result } = renderHook(() => useAuth());

    // Should throw error for genuine tampering
    await act(async () => {
      await expect(
        result.current.confirmSignInWithNewPassword(
          'NewPassword123!',
          {
            given_name: 'John',
            family_name: 'Doe'
          }
        )
      ).rejects.toThrow('Token tampering detected after password confirmation');
    });

    // Verify that critical security event was logged
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      tokenSecurity.SecurityEventType.TOKEN_TAMPERING,
      expect.objectContaining({
        context: 'new_password_confirmation'
      }),
      'CRITICAL'
    );
  });
});