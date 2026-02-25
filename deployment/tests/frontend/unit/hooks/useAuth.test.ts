/**
 * @fileoverview Unit tests for useAuth hook.
 * 
 * Tests the custom authentication hook functionality including
 * sign in, sign out, password reset, and error handling.
 */

import { renderHook, act } from '@testing-library/react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { signIn, signOut, resetPassword, confirmResetPassword, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { useAuth } from '../../../../src/frontend/src/hooks/useAuth';

// Mock AWS Amplify modules
jest.mock('@aws-amplify/ui-react');
jest.mock('aws-amplify/auth');

const mockUseAuthenticator = useAuthenticator as jest.MockedFunction<typeof useAuthenticator>;
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockResetPassword = resetPassword as jest.MockedFunction<typeof resetPassword>;
const mockConfirmResetPassword = confirmResetPassword as jest.MockedFunction<typeof confirmResetPassword>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>;

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation
    mockUseAuthenticator.mockImplementation((selector: any) => {
      const context = {
        user: null,
        authStatus: 'unauthenticated'
      };
      return selector ? selector(context) : context;
    });
  });

  describe('initialization', () => {
    it('should initialize with unauthenticated state', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useAuth());

      expect(typeof result.current.signIn).toBe('function');
      expect(typeof result.current.signOut).toBe('function');
      expect(typeof result.current.forgotPassword).toBe('function');
      expect(typeof result.current.forgotPasswordSubmit).toBe('function');
      expect(typeof result.current.currentAuthenticatedUser).toBe('function');
      expect(typeof result.current.currentSession).toBe('function');
      expect(typeof result.current.currentCredentials).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
    });
  });

  describe('signIn', () => {
    it('should handle successful sign in', async () => {
      const mockUser = {
        userId: 'test-user-id',
        username: 'test@example.com'
      };

      const mockSession = {
        tokens: {
          accessToken: {
            toString: () => 'mock-access-token',
            payload: {
              sub: 'test-user-id',
              iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test',
              exp: Date.now() / 1000 + 3600,
              iat: Date.now() / 1000,
              client_id: 'test-client-id',
              username: 'test@example.com',
              scope: 'openid email'
            }
          },
          idToken: {
            toString: () => 'mock-id-token',
            payload: {
              sub: 'test-user-id',
              email: 'test@example.com',
              email_verified: true,
              iss: 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test',
              exp: Date.now() / 1000 + 3600,
              iat: Date.now() / 1000,
              aud: 'test-client-id',
              auth_time: Date.now() / 1000,
              'cognito:username': 'test@example.com'
            }
          }
        },
        identityId: 'test-identity-id'
      };

      mockSignIn.mockResolvedValue({
        isSignedIn: true,
        nextStep: { signInStep: 'DONE' }
      } as any);

      mockGetCurrentUser.mockResolvedValue(mockUser as any);
      mockFetchAuthSession.mockResolvedValue(mockSession as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        const user = await result.current.signIn('test@example.com', 'password123');
        expect(user).toBeDefined();
        expect(user.username).toBe('test@example.com');
      });

      expect(mockSignIn).toHaveBeenCalledWith({
        username: 'test@example.com',
        password: 'password123'
      });
    });

    it('should handle sign in errors', async () => {
      const mockError = {
        name: 'NotAuthorizedException',
        message: 'Incorrect username or password.'
      };

      mockSignIn.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.signIn('test@example.com', 'wrongpassword');
        } catch (error: any) {
          expect(error.code).toBe('NotAuthorizedException');
          expect(error.message).toBe('Invalid email or password');
        }
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.code).toBe('NotAuthorizedException');
    });
  });

  describe('signOut', () => {
    it('should handle successful sign out', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });

    it('should handle sign out errors', async () => {
      const mockError = {
        name: 'NetworkError',
        message: 'Network error occurred'
      };

      mockSignOut.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.signOut();
        } catch (error: any) {
          expect(error.code).toBe('NetworkError');
        }
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('forgotPassword', () => {
    it('should handle successful password reset request', async () => {
      mockResetPassword.mockResolvedValue({
        nextStep: {
          resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE'
        }
      } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.forgotPassword('test@example.com');
      });

      expect(mockResetPassword).toHaveBeenCalledWith({
        username: 'test@example.com'
      });
    });

    it('should handle password reset errors', async () => {
      const mockError = {
        name: 'UserNotFoundException',
        message: 'User does not exist'
      };

      mockResetPassword.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.forgotPassword('nonexistent@example.com');
        } catch (error: any) {
          expect(error.code).toBe('NotAuthorizedException');
        }
      });
    });
  });

  describe('forgotPasswordSubmit', () => {
    it('should handle successful password reset confirmation', async () => {
      mockConfirmResetPassword.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.forgotPasswordSubmit('test@example.com', '123456', 'newpassword123');
      });

      expect(mockConfirmResetPassword).toHaveBeenCalledWith({
        username: 'test@example.com',
        confirmationCode: '123456',
        newPassword: 'newpassword123'
      });
    });

    it('should handle invalid confirmation code', async () => {
      const mockError = {
        name: 'CodeMismatchException',
        message: 'Invalid verification code provided'
      };

      mockConfirmResetPassword.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.forgotPasswordSubmit('test@example.com', 'invalid', 'newpassword123');
        } catch (error: any) {
          expect(error.code).toBe('CodeMismatchException');
          expect(error.message).toBe('Invalid verification code');
        }
      });
    });
  });

  describe('clearError', () => {
    it('should clear the current error', async () => {
      const mockError = {
        name: 'NetworkError',
        message: 'Network error'
      };

      mockSignIn.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuth());

      // Trigger an error
      await act(async () => {
        try {
          await result.current.signIn('test@example.com', 'password');
        } catch (error) {
          // Expected error
        }
      });

      expect(result.current.error).toBeDefined();

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});