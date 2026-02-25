/**
 * @fileoverview Error handling utilities for pricing dashboard.
 * 
 * Provides utilities for creating, formatting, and handling errors
 * in a user-friendly manner.
 * 
 * Requirements: 3.4, 8.6
 */

import { ErrorDetails } from '../components/ErrorDisplay';

/**
 * Error type enumeration.
 */
export type ErrorType = 'validation' | 'network' | 'timeout' | 'unknown';

/**
 * Creates an error details object from an error.
 * 
 * @param error - Error object or message
 * @param code - Optional error code
 * @param type - Error type
 * @param context - Additional error context
 * @returns Error details object
 */
export function createErrorDetails(
  error: Error | string,
  code?: string,
  type: ErrorType = 'unknown',
  context?: Record<string, any>
): ErrorDetails {
  const message = typeof error === 'string' ? error : error.message;
  
  return {
    message,
    code,
    type,
    context,
    showDetails: process.env.NODE_ENV === 'development'
  };
}

/**
 * Creates an error details object from an agent error response.
 * 
 * @param agentName - Name of the agent that failed
 * @param error - Error message or object
 * @param errorCode - Error code from agent
 * @returns Error details object
 */
export function createAgentErrorDetails(
  agentName: string,
  error: Error | string,
  errorCode?: string
): ErrorDetails {
  const message = typeof error === 'string' ? error : error.message;
  
  return {
    message: `${agentName} failed: ${message}`,
    code: errorCode,
    type: 'unknown',
    context: {
      agent: agentName,
      originalError: message,
      errorCode
    },
    showDetails: process.env.NODE_ENV === 'development'
  };
}

/**
 * Creates an error details object from a network error.
 * 
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @returns Error details object
 */
export function createNetworkErrorDetails(
  statusCode: number,
  message: string
): ErrorDetails {
  let type: ErrorType = 'network';
  let userMessage = message;

  // Determine error type based on status code
  if (statusCode === 408 || statusCode === 504) {
    type = 'timeout';
    userMessage = 'Request timed out. Please try again.';
  } else if (statusCode === 400 || statusCode === 422) {
    type = 'validation';
    userMessage = 'Invalid request. Please check your input.';
  } else if (statusCode >= 500) {
    userMessage = 'Server error. Please try again later.';
  }

  return {
    message: userMessage,
    code: `HTTP_${statusCode}`,
    type,
    context: {
      statusCode,
      originalMessage: message
    },
    showDetails: process.env.NODE_ENV === 'development'
  };
}

/**
 * Creates an error details object from a timeout error.
 * 
 * @param component - Component that timed out
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Error details object
 */
export function createTimeoutErrorDetails(
  component: string,
  timeoutMs: number
): ErrorDetails {
  return {
    message: `${component} took too long to complete. Please try again.`,
    code: 'TIMEOUT',
    type: 'timeout',
    context: {
      component,
      timeoutMs
    },
    showDetails: process.env.NODE_ENV === 'development'
  };
}

/**
 * Formats an error message for display.
 * 
 * @param error - Error object or message
 * @returns Formatted error message
 */
export function formatErrorMessage(error: Error | string): string {
  if (typeof error === 'string') {
    return error;
  }

  return error.message || 'An unknown error occurred';
}

/**
 * Extracts error code from error object.
 * 
 * @param error - Error object
 * @returns Error code or undefined
 */
export function extractErrorCode(error: any): string | undefined {
  if (typeof error === 'object' && error !== null) {
    return error.code || error.errorCode || error.statusCode;
  }

  return undefined;
}

/**
 * Determines if an error is recoverable.
 * 
 * @param error - Error object or details
 * @returns True if error is recoverable
 */
export function isRecoverableError(error: ErrorDetails | Error | string): boolean {
  if (typeof error === 'string') {
    return true; // Assume string errors are recoverable
  }

  if (error instanceof Error) {
    // Check error message for non-recoverable patterns
    const message = error.message.toLowerCase();
    return !message.includes('fatal') && !message.includes('critical');
  }

  // Check error type
  const errorDetails = error as ErrorDetails;
  return errorDetails.type !== 'validation'; // Validation errors may not be recoverable
}

/**
 * Logs error to console with context.
 * 
 * @param error - Error to log
 * @param context - Additional context
 */
export function logError(
  error: Error | string,
  context?: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const message = typeof error === 'string' ? error : error.message;
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(JSON.stringify({
    level: 'ERROR',
    timestamp,
    message,
    stack,
    context
  }, null, 2));
}

/**
 * Logs error to CloudWatch (placeholder for actual implementation).
 * 
 * @param error - Error to log
 * @param context - Additional context
 */
export async function logErrorToCloudWatch(
  error: Error | string,
  context?: Record<string, any>
): Promise<void> {
  // This would be implemented to send errors to CloudWatch
  // For now, just log to console
  logError(error, context);
}

/**
 * Determines if an error should be shown to the user.
 * 
 * @param error - Error object
 * @returns True if error should be shown to user
 */
export function shouldShowErrorToUser(error: any): boolean {
  if (!error) {
    return false;
  }

  // Don't show internal errors to user
  if (error.internal === true) {
    return false;
  }

  // Don't show errors that are just for logging
  if (error.logOnly === true) {
    return false;
  }

  return true;
}

/**
 * Creates a user-friendly error message from a technical error.
 * 
 * @param error - Technical error
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // Map common error messages to user-friendly versions
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }

    if (message.includes('timeout')) {
      return 'The request took too long. Please try again.';
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return 'Your session has expired. Please log in again.';
    }

    if (message.includes('forbidden') || message.includes('403')) {
      return 'You do not have permission to perform this action.';
    }

    if (message.includes('not found') || message.includes('404')) {
      return 'The requested resource was not found.';
    }

    if (message.includes('server') || message.includes('500')) {
      return 'A server error occurred. Please try again later.';
    }

    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    if (error.message) {
      return getUserFriendlyErrorMessage(error.message);
    }

    if (error.error) {
      return getUserFriendlyErrorMessage(error.error);
    }
  }

  return 'An unexpected error occurred. Please try again.';
}
