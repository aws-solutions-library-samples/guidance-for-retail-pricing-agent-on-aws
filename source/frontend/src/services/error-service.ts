/**
 * @fileoverview Error handling service for product catalog management.
 * 
 * Provides centralized error handling, logging, and user feedback
 * for various error scenarios including network failures, authentication
 * errors, and data validation issues.
 */

import { Notification } from '../atoms/notification';

/**
 * Error types for categorizing different error scenarios.
 */
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
  GRAPHQL_ERROR = 'GRAPHQL_ERROR',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error severity levels for prioritizing error handling.
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Structured error interface for consistent error handling.
 */
export interface CatalogError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: number;
  recoverable: boolean;
  retryable: boolean;
  source?: string;
}

/**
 * Error recovery action interface.
 */
export interface ErrorRecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  primary?: boolean;
}

/**
 * Error service class for handling product catalog errors.
 */
export class ErrorService {
  private static instance: ErrorService;
  
  private constructor() {}
  
  /**
   * Gets singleton instance of ErrorService.
   */
  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  /**
   * Processes and categorizes errors from various sources.
   * 
   * @param error - Raw error object
   * @param source - Source of the error (e.g., 'GraphQL', 'S3', 'Network')
   * @returns Structured catalog error
   */
  public processError(error: any, source?: string): CatalogError {
    const timestamp = Date.now();
    
    // Handle GraphQL errors
    if (error?.graphQLErrors?.length > 0) {
      const graphQLError = error.graphQLErrors[0];
      return this.createGraphQLError(graphQLError, timestamp, source);
    }
    
    // Handle network errors
    if (error?.networkError || error?.code === 'NETWORK_ERROR') {
      return this.createNetworkError(error, timestamp, source);
    }
    
    // Handle authentication errors
    if (this.isAuthenticationError(error)) {
      return this.createAuthenticationError(error, timestamp, source);
    }
    
    // Handle session expiration
    if (this.isSessionExpiredError(error)) {
      return this.createSessionExpiredError(error, timestamp, source);
    }
    
    // Handle validation errors
    if (this.isValidationError(error)) {
      return this.createValidationError(error, timestamp, source);
    }
    
    // Handle data fetch errors
    if (this.isDataFetchError(error)) {
      return this.createDataFetchError(error, timestamp, source);
    }
    
    // Default to unknown error
    return this.createUnknownError(error, timestamp, source);
  }

  /**
   * Creates a notification object from a catalog error.
   * 
   * @param error - Catalog error
   * @param actions - Optional recovery actions
   * @returns Notification object
   */
  public createErrorNotification(
    error: CatalogError, 
    actions?: ErrorRecoveryAction[]
  ): Omit<Notification, 'id' | 'timestamp'> {
    const notification: Omit<Notification, 'id' | 'timestamp'> = {
      type: 'error',
      title: this.getErrorTitle(error),
      message: error.userMessage,
      dismissible: error.recoverable,
      autoHide: false // Errors should not auto-hide
    };

    return notification;
  }

  /**
   * Logs error to CloudWatch (in production) or console (in development).
   * 
   * @param error - Catalog error to log
   * @param context - Additional context information
   */
  public logError(error: CatalogError, context?: Record<string, any>): void {
    const logData = {
      timestamp: new Date(error.timestamp).toISOString(),
      errorType: error.type,
      severity: error.severity,
      message: error.message,
      userMessage: error.userMessage,
      code: error.code,
      details: error.details,
      source: error.source,
      recoverable: error.recoverable,
      retryable: error.retryable,
      context,
      // Add user context if available
      userId: this.getCurrentUserId(),
      sessionId: this.getCurrentSessionId(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      console.error('Catalog Error:', logData);
      return;
    }

    // In production, send to CloudWatch via API
    this.sendToCloudWatch(logData).catch(err => {
      console.error('Failed to log error to CloudWatch:', err);
    });
  }

  /**
   * Determines if an error is retryable based on its characteristics.
   * 
   * @param error - Catalog error
   * @returns True if the error is retryable
   */
  public isRetryable(error: CatalogError): boolean {
    return error.retryable && (
      error.type === ErrorType.NETWORK_ERROR ||
      error.type === ErrorType.DATA_FETCH_ERROR ||
      (error.type === ErrorType.GRAPHQL_ERROR && error.code !== 'VALIDATION_ERROR')
    );
  }

  /**
   * Gets appropriate retry delay based on attempt number.
   * 
   * @param attempt - Current retry attempt (0-based)
   * @returns Delay in milliseconds
   */
  public getRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s
    return Math.min(1000 * Math.pow(2, attempt), 8000);
  }

  // Private helper methods

  private createGraphQLError(graphQLError: any, timestamp: number, source?: string): CatalogError {
    const isValidationError = graphQLError.extensions?.code === 'VALIDATION_ERROR';
    const isAuthError = graphQLError.extensions?.code === 'UNAUTHENTICATED';
    
    return {
      type: isAuthError ? ErrorType.AUTHENTICATION_ERROR : ErrorType.GRAPHQL_ERROR,
      severity: isValidationError ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      message: graphQLError.message,
      userMessage: isAuthError 
        ? 'Authentication required. Please log in again.'
        : isValidationError
        ? 'Invalid data provided. Please check your input.'
        : 'A server error occurred. Please try again.',
      code: graphQLError.extensions?.code,
      details: graphQLError.extensions,
      timestamp,
      recoverable: !isAuthError,
      retryable: !isValidationError && !isAuthError,
      source: source || 'GraphQL'
    };
  }

  private createNetworkError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.HIGH,
      message: error.message || 'Network request failed',
      userMessage: 'Network connection lost. Please check your connection and try again.',
      code: error.code,
      details: { statusCode: error.statusCode, networkError: error.networkError },
      timestamp,
      recoverable: true,
      retryable: true,
      source: source || 'Network'
    };
  }

  private createAuthenticationError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.AUTHENTICATION_ERROR,
      severity: ErrorSeverity.CRITICAL,
      message: error.message || 'Authentication failed',
      userMessage: 'Authentication required. Please log in again.',
      code: error.code,
      details: error.details,
      timestamp,
      recoverable: false,
      retryable: false,
      source: source || 'Authentication'
    };
  }

  private createSessionExpiredError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.SESSION_EXPIRED,
      severity: ErrorSeverity.CRITICAL,
      message: error.message || 'Session expired',
      userMessage: 'Your session has expired. Please log in again.',
      code: error.code,
      details: error.details,
      timestamp,
      recoverable: false,
      retryable: false,
      source: source || 'Session'
    };
  }

  private createValidationError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.VALIDATION_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || 'Validation failed',
      userMessage: error.userMessage || 'Invalid data provided. Please check your input.',
      code: error.code,
      details: error.details,
      timestamp,
      recoverable: true,
      retryable: false,
      source: source || 'Validation'
    };
  }

  private createDataFetchError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.DATA_FETCH_ERROR,
      severity: ErrorSeverity.HIGH,
      message: error.message || 'Data fetch failed',
      userMessage: 'Unable to load data. Please try again.',
      code: error.code,
      details: error.details,
      timestamp,
      recoverable: true,
      retryable: true,
      source: source || 'DataFetch'
    };
  }

  private createUnknownError(error: any, timestamp: number, source?: string): CatalogError {
    return {
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again.',
      code: error.code,
      details: { originalError: error },
      timestamp,
      recoverable: true,
      retryable: true,
      source: source || 'Unknown'
    };
  }

  private isAuthenticationError(error: any): boolean {
    return error?.code === 'UNAUTHENTICATED' ||
           error?.message?.includes('authentication') ||
           error?.message?.includes('unauthorized') ||
           error?.statusCode === 401;
  }

  private isSessionExpiredError(error: any): boolean {
    return error?.code === 'SESSION_EXPIRED' ||
           error?.message?.includes('session expired') ||
           error?.message?.includes('token expired');
  }

  private isValidationError(error: any): boolean {
    return error?.code === 'VALIDATION_ERROR' ||
           error?.message?.includes('validation') ||
           error?.statusCode === 400;
  }

  private isDataFetchError(error: any): boolean {
    return error?.code === 'DATA_FETCH_ERROR' ||
           error?.message?.includes('fetch') ||
           error?.message?.includes('load') ||
           (error?.statusCode >= 500 && error?.statusCode < 600);
  }

  private getErrorTitle(error: CatalogError): string {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return 'Connection Error';
      case ErrorType.AUTHENTICATION_ERROR:
        return 'Authentication Required';
      case ErrorType.SESSION_EXPIRED:
        return 'Session Expired';
      case ErrorType.VALIDATION_ERROR:
        return 'Invalid Data';
      case ErrorType.DATA_FETCH_ERROR:
        return 'Loading Error';
      case ErrorType.GRAPHQL_ERROR:
        return 'Server Error';
      default:
        return 'Error';
    }
  }

  private getCurrentUserId(): string | undefined {
    // This would be implemented based on your authentication system
    try {
      // Example: get from localStorage, context, or auth service
      return localStorage.getItem('userId') || undefined;
    } catch {
      return undefined;
    }
  }

  private getCurrentSessionId(): string | undefined {
    // This would be implemented based on your session management
    try {
      return sessionStorage.getItem('sessionId') || undefined;
    } catch {
      return undefined;
    }
  }

  private async sendToCloudWatch(logData: any): Promise<void> {
    // In a real implementation, this would send structured logs to CloudWatch
    // via an API endpoint or AWS SDK
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          logGroup: 'product-catalog-errors',
          logStream: `${new Date().toISOString().split('T')[0]}-errors`,
          message: JSON.stringify(logData)
        })
      });
    } catch (error) {
      // Fallback to console if CloudWatch logging fails
      console.error('CloudWatch logging failed:', error);
    }
  }
}

/**
 * Singleton instance of ErrorService.
 */
export const errorService = ErrorService.getInstance();