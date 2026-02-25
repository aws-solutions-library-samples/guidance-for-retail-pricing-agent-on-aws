/**
 * @fileoverview Authentication error handling utility.
 * 
 * Provides centralized error handling for authentication operations,
 * mapping AWS Cognito error codes to user-friendly messages and
 * implementing CloudWatch logging for security monitoring.
 */

import { AuthError, AuthErrorCode } from '../types/auth-types';
import { SecurityEventType, logSecurityEvent } from './token-security';

/**
 * Extended authentication error interface with user-friendly messaging.
 */
export interface ExtendedAuthError extends AuthError {
  /** User-friendly error message */
  userMessage: string;
  /** Whether the error requires user action */
  requiresAction?: boolean;
  /** Type of action required */
  actionType?: 'verify_email' | 'retry' | 'contact_support';
}

/**
 * Additional error codes not in the main auth types.
 */
export const AdditionalErrorCodes = {
  USERNAME_EXISTS: 'UsernameExistsException',
  INVALID_PASSWORD: 'InvalidPasswordException',
  USER_LOCKED: 'UserLockedException',
  UNKNOWN_ERROR: 'UnknownError'
} as const;

/**
 * Interface for error logging context.
 */
interface ErrorLogContext {
  errorCode: string;
  errorMessage: string;
  userEmail?: string;
  timestamp: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
}

/**
 * Maps AWS Cognito error codes to user-friendly messages.
 * 
 * @param error - The error object from AWS Cognito
 * @param userEmail - Optional user email for logging context
 * @returns Structured authentication error with user-friendly message
 */
export function handleAuthError(error: any, userEmail?: string): ExtendedAuthError {
  const errorCode = error?.code || error?.name || AdditionalErrorCodes.UNKNOWN_ERROR;
  const originalMessage = error?.message || 'An unexpected error occurred';
  
  // Log the error for monitoring and security analysis
  logAuthError(error, userEmail);
  
  let userMessage: string;
  let requiresAction = false;
  let actionType: 'verify_email' | 'retry' | 'contact_support' | undefined;
  
  switch (errorCode) {
    case AuthErrorCode.USER_NOT_FOUND:
    case AuthErrorCode.INCORRECT_PASSWORD:
      userMessage = 'Invalid email or password. Please check your credentials and try again.';
      break;
      
    case AuthErrorCode.USER_NOT_CONFIRMED:
      userMessage = 'Please verify your email address. Check your inbox for a verification link.';
      requiresAction = true;
      actionType = 'verify_email';
      break;
      
    case AdditionalErrorCodes.USERNAME_EXISTS:
      userMessage = 'An account with this email already exists. Please use a different email or try signing in.';
      break;
      
    case AdditionalErrorCodes.INVALID_PASSWORD:
      userMessage = 'Password does not meet requirements. Please ensure your password has at least 8 characters, including uppercase, lowercase, number, and special character.';
      break;
      
    case AuthErrorCode.CODE_MISMATCH:
      userMessage = 'Invalid verification code. Please check the code and try again.';
      break;
      
    case AuthErrorCode.EXPIRED_CODE:
      userMessage = 'Verification code has expired. Please request a new verification code.';
      requiresAction = true;
      actionType = 'retry';
      break;
      
    case AuthErrorCode.NETWORK_ERROR:
      userMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      requiresAction = true;
      actionType = 'retry';
      break;
      
    case AuthErrorCode.USER_DISABLED:
      userMessage = 'Your account has been disabled. Please contact support for assistance.';
      requiresAction = true;
      actionType = 'contact_support';
      break;
      
    case AdditionalErrorCodes.USER_LOCKED:
      userMessage = 'Your account has been temporarily locked due to too many failed attempts. Please try again later or contact support.';
      requiresAction = true;
      actionType = 'contact_support';
      break;
      
    case AuthErrorCode.TOO_MANY_REQUESTS:
      userMessage = 'Too many requests. Please wait a moment before trying again.';
      requiresAction = true;
      actionType = 'retry';
      break;
      
    case AuthErrorCode.LIMIT_EXCEEDED:
      userMessage = 'Request limit exceeded. Please wait before requesting another verification code.';
      requiresAction = true;
      actionType = 'retry';
      break;
      
    case AuthErrorCode.NOT_AUTHENTICATED:
      userMessage = 'You are not authenticated. Please sign in to continue.';
      break;
      
    case AuthErrorCode.TOKEN_EXPIRED:
      userMessage = 'Your session has expired. Please sign in again.';
      break;
      
    case AuthErrorCode.INVALID_PARAMETER:
      userMessage = 'Invalid input provided. Please check your information and try again.';
      break;
      
    default:
      userMessage = 'An unexpected error occurred. Please try again or contact support if the problem persists.';
      requiresAction = true;
      actionType = 'retry';
      break;
  }
  
  return {
    code: errorCode,
    message: originalMessage,
    name: error?.name || 'AuthError',
    timestamp: new Date().toISOString(),
    userMessage,
    requiresAction,
    actionType
  };
}

/**
 * Logs authentication errors to CloudWatch for monitoring and security analysis.
 * 
 * @param error - The original error object
 * @param userEmail - Optional user email for context
 */
function logAuthError(error: any, userEmail?: string): void {
  const logContext: ErrorLogContext = {
    errorCode: error?.code || error?.name || AdditionalErrorCodes.UNKNOWN_ERROR,
    errorMessage: error?.message || 'Unknown error',
    userEmail: userEmail ? maskEmail(userEmail) : undefined,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined,
    sessionId: generateSessionId()
  };
  
  // Log to console for development (CloudWatch will capture console logs in Lambda)
  console.error('Authentication Error:', {
    ...logContext,
    // Exclude sensitive data from logs
    originalError: {
      code: error?.code,
      name: error?.name,
      // Don't log the full error message as it might contain sensitive info
    }
  });

  // Use the centralized security logging system
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
  
  // Determine severity based on error type
  switch (logContext.errorCode) {
    case AuthErrorCode.USER_NOT_FOUND:
    case AuthErrorCode.INCORRECT_PASSWORD:
      severity = 'MEDIUM';
      break;
    case AdditionalErrorCodes.USER_LOCKED:
    case AuthErrorCode.USER_DISABLED:
      severity = 'HIGH';
      break;
    case AuthErrorCode.TOKEN_EXPIRED:
    case AuthErrorCode.NOT_AUTHENTICATED:
      severity = 'LOW';
      break;
    case AuthErrorCode.TOO_MANY_REQUESTS:
    case AuthErrorCode.LIMIT_EXCEEDED:
      severity = 'HIGH';
      break;
    default:
      severity = 'MEDIUM';
  }

  // Log through the security event system
  logSecurityEvent(
    SecurityEventType.FAILED_LOGIN_ATTEMPT,
    {
      errorCode: logContext.errorCode,
      errorMessage: logContext.errorMessage,
      userEmail: logContext.userEmail,
      userAgent: logContext.userAgent,
      sessionId: logContext.sessionId
    },
    severity
  );
  
  // In a production environment, you might want to send this to a dedicated logging service
  // or use AWS CloudWatch Logs directly via the AWS SDK
  if (typeof window !== 'undefined' && (window as any).gtag) {
    // Example: Send to Google Analytics for error tracking (optional)
    (window as any).gtag('event', 'auth_error', {
      error_code: logContext.errorCode,
      error_category: 'authentication'
    });
  }
}

/**
 * Masks email address for logging purposes to protect user privacy.
 * 
 * @param email - Email address to mask
 * @returns Masked email address
 */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return 'invalid_email';
  }
  
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length > 2 
    ? `${localPart.charAt(0)}***${localPart.charAt(localPart.length - 1)}`
    : '***';
  
  return `${maskedLocal}@${domain}`;
}

/**
 * Generates a session ID for error tracking.
 * 
 * @returns Session ID string
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Checks if an error is a network-related error.
 * 
 * @param error - Error object to check
 * @returns True if the error is network-related
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  return Boolean(
    error.code === AuthErrorCode.NETWORK_ERROR ||
    error.name === 'NetworkError' ||
    (error.message && (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('connection') ||
      error.message.toLowerCase().includes('timeout')
    ))
  );
}

/**
 * Checks if an error requires user action.
 * 
 * @param error - Error object to check
 * @returns True if the error requires user action
 */
export function requiresUserAction(error: ExtendedAuthError): boolean {
  return error.requiresAction === true;
}

/**
 * Gets the recommended action for an error.
 * 
 * @param error - Error object
 * @returns Action type or undefined
 */
export function getErrorAction(error: ExtendedAuthError): string | undefined {
  return error.actionType;
}

/**
 * Creates a standardized error response for API calls.
 * 
 * @param error - Original error
 * @param userEmail - Optional user email
 * @returns Standardized error response
 */
export function createErrorResponse(error: any, userEmail?: string) {
  const authError = handleAuthError(error, userEmail);
  
  return {
    success: false,
    error: {
      code: authError.code,
      message: authError.userMessage,
      requiresAction: authError.requiresAction,
      actionType: authError.actionType
    },
    timestamp: new Date().toISOString()
  };
}