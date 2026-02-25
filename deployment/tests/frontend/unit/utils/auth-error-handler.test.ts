/**
 * @fileoverview Tests for authentication error handling utility.
 */

import {
  handleAuthError,
  isNetworkError,
  requiresUserAction,
  getErrorAction,
  createErrorResponse,
  ExtendedAuthError,
  AdditionalErrorCodes
} from '../../../../src/frontend/src/utils/auth-error-handler';
import { AuthErrorCode } from '../../../../src/frontend/src/types/auth-types';

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
const mockConsoleError = jest.fn();

// Mock window.gtag for analytics tracking
const mockGtag = jest.fn();
Object.defineProperty(window, 'gtag', {
  value: mockGtag,
  writable: true
});

describe('handleAuthError', () => {
  beforeEach(() => {
    mockConsoleError.mockClear();
    mockGtag.mockClear();
    console.error = mockConsoleError;
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('should handle USER_NOT_FOUND error', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User does not exist',
      name: 'UserNotFoundException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.USER_NOT_FOUND);
    expect(result.userMessage).toBe('Invalid email or password. Please check your credentials and try again.');
    expect(result.requiresAction).toBe(false);
    expect(result.actionType).toBeUndefined();
  });

  it('should handle INCORRECT_PASSWORD error', () => {
    const error = {
      code: AuthErrorCode.INCORRECT_PASSWORD,
      message: 'Incorrect username or password',
      name: 'NotAuthorizedException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.INCORRECT_PASSWORD);
    expect(result.userMessage).toBe('Invalid email or password. Please check your credentials and try again.');
    expect(result.requiresAction).toBe(false);
  });

  it('should handle USER_NOT_CONFIRMED error with verification action', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_CONFIRMED,
      message: 'User is not confirmed',
      name: 'UserNotConfirmedException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.USER_NOT_CONFIRMED);
    expect(result.userMessage).toBe('Please verify your email address. Check your inbox for a verification link.');
    expect(result.requiresAction).toBe(true);
    expect(result.actionType).toBe('verify_email');
  });

  it('should handle USERNAME_EXISTS error', () => {
    const error = {
      code: AdditionalErrorCodes.USERNAME_EXISTS,
      message: 'An account with the given email already exists',
      name: 'UsernameExistsException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AdditionalErrorCodes.USERNAME_EXISTS);
    expect(result.userMessage).toBe('An account with this email already exists. Please use a different email or try signing in.');
    expect(result.requiresAction).toBe(false);
  });

  it('should handle INVALID_PASSWORD error with requirements', () => {
    const error = {
      code: AdditionalErrorCodes.INVALID_PASSWORD,
      message: 'Password does not conform to policy',
      name: 'InvalidPasswordException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AdditionalErrorCodes.INVALID_PASSWORD);
    expect(result.userMessage).toBe('Password does not meet requirements. Please ensure your password has at least 8 characters, including uppercase, lowercase, number, and special character.');
    expect(result.requiresAction).toBe(false);
  });

  it('should handle CODE_MISMATCH error', () => {
    const error = {
      code: AuthErrorCode.CODE_MISMATCH,
      message: 'Invalid verification code provided',
      name: 'CodeMismatchException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.CODE_MISMATCH);
    expect(result.userMessage).toBe('Invalid verification code. Please check the code and try again.');
    expect(result.requiresAction).toBe(false);
  });

  it('should handle EXPIRED_CODE error with retry action', () => {
    const error = {
      code: AuthErrorCode.EXPIRED_CODE,
      message: 'Invalid code provided, please request a code again',
      name: 'ExpiredCodeException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.EXPIRED_CODE);
    expect(result.userMessage).toBe('Verification code has expired. Please request a new verification code.');
    expect(result.requiresAction).toBe(true);
    expect(result.actionType).toBe('retry');
  });

  it('should handle NETWORK_ERROR with retry action', () => {
    const error = {
      code: AuthErrorCode.NETWORK_ERROR,
      message: 'Network request failed',
      name: 'NetworkError'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.NETWORK_ERROR);
    expect(result.userMessage).toBe('Unable to connect to the server. Please check your internet connection and try again.');
    expect(result.requiresAction).toBe(true);
    expect(result.actionType).toBe('retry');
  });

  it('should handle TOO_MANY_REQUESTS error', () => {
    const error = {
      code: AuthErrorCode.TOO_MANY_REQUESTS,
      message: 'Too many requests',
      name: 'TooManyRequestsException'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.TOO_MANY_REQUESTS);
    expect(result.userMessage).toBe('Too many requests. Please wait a moment before trying again.');
    expect(result.requiresAction).toBe(true);
    expect(result.actionType).toBe('retry');
  });

  it('should handle unknown errors with default message', () => {
    const error = {
      code: 'UnknownErrorCode',
      message: 'Something went wrong',
      name: 'UnknownError'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe('UnknownErrorCode');
    expect(result.userMessage).toBe('An unexpected error occurred. Please try again or contact support if the problem persists.');
    expect(result.requiresAction).toBe(true);
    expect(result.actionType).toBe('retry');
  });

  it('should log error to console', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User does not exist',
      name: 'UserNotFoundException'
    };

    handleAuthError(error, 'test@example.com');

    expect(mockConsoleError).toHaveBeenCalledWith(
      'Authentication Error:',
      expect.objectContaining({
        errorCode: AuthErrorCode.USER_NOT_FOUND,
        errorMessage: 'User does not exist',
        userEmail: 't***t@example.com',
        timestamp: expect.any(String),
        sessionId: expect.stringMatching(/^session_\d+_[a-z0-9]+$/)
      })
    );
  });

  it('should mask email in logs', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User does not exist'
    };

    handleAuthError(error, 'john.doe@example.com');

    expect(mockConsoleError).toHaveBeenCalledWith(
      'Authentication Error:',
      expect.objectContaining({
        userEmail: 'j***e@example.com'
      })
    );
  });

  it('should handle errors without user email', () => {
    const error = {
      code: AuthErrorCode.NETWORK_ERROR,
      message: 'Network error'
    };

    const result = handleAuthError(error);

    expect(result.code).toBe(AuthErrorCode.NETWORK_ERROR);
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Authentication Error:',
      expect.objectContaining({
        userEmail: undefined
      })
    );
  });

  it('should include timestamp in result', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User does not exist'
    };

    const result = handleAuthError(error);

    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp!).getTime()).toBeCloseTo(Date.now(), -3);
  });
});

describe('isNetworkError', () => {
  it('should identify network errors by code', () => {
    const error = { code: AuthErrorCode.NETWORK_ERROR };
    expect(isNetworkError(error)).toBe(true);
  });

  it('should identify network errors by name', () => {
    const error = { name: 'NetworkError' };
    expect(isNetworkError(error)).toBe(true);
  });

  it('should identify network errors by message content', () => {
    const networkMessages = [
      'network timeout',
      'connection failed',
      'Network request failed'
    ];

    networkMessages.forEach(message => {
      const error = { message };
      expect(isNetworkError(error)).toBe(true);
    });
  });

  it('should not identify non-network errors', () => {
    const error = { code: AuthErrorCode.USER_NOT_FOUND };
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('requiresUserAction', () => {
  it('should return true for errors requiring action', () => {
    const error: ExtendedAuthError = {
      code: AuthErrorCode.EXPIRED_CODE,
      message: 'Code expired',
      name: 'ExpiredCodeException',
      userMessage: 'Code expired',
      requiresAction: true,
      actionType: 'retry'
    };

    expect(requiresUserAction(error)).toBe(true);
  });

  it('should return false for errors not requiring action', () => {
    const error: ExtendedAuthError = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User not found',
      name: 'UserNotFoundException',
      userMessage: 'Invalid credentials',
      requiresAction: false
    };

    expect(requiresUserAction(error)).toBe(false);
  });
});

describe('getErrorAction', () => {
  it('should return action type when present', () => {
    const error: ExtendedAuthError = {
      code: AuthErrorCode.USER_NOT_CONFIRMED,
      message: 'User not confirmed',
      name: 'UserNotConfirmedException',
      userMessage: 'Please verify email',
      requiresAction: true,
      actionType: 'verify_email'
    };

    expect(getErrorAction(error)).toBe('verify_email');
  });

  it('should return undefined when no action type', () => {
    const error: ExtendedAuthError = {
      code: AuthErrorCode.USER_NOT_FOUND,
      message: 'User not found',
      name: 'UserNotFoundException',
      userMessage: 'Invalid credentials'
    };

    expect(getErrorAction(error)).toBeUndefined();
  });
});

describe('createErrorResponse', () => {
  it('should create standardized error response', () => {
    const error = {
      code: AuthErrorCode.INVALID_PARAMETER,
      message: 'Invalid parameter',
      name: 'InvalidParameterException'
    };

    const response = createErrorResponse(error, 'test@example.com');

    expect(response).toEqual({
      success: false,
      error: {
        code: AuthErrorCode.INVALID_PARAMETER,
        message: 'Invalid input provided. Please check your information and try again.',
        requiresAction: false,
        actionType: undefined
      },
      timestamp: expect.any(String)
    });
  });

  it('should include action information in response', () => {
    const error = {
      code: AuthErrorCode.USER_NOT_CONFIRMED,
      message: 'User not confirmed',
      name: 'UserNotConfirmedException'
    };

    const response = createErrorResponse(error);

    expect(response.error.requiresAction).toBe(true);
    expect(response.error.actionType).toBe('verify_email');
  });
});