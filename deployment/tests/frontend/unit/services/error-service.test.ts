/**
 * @fileoverview Unit tests for ErrorService.
 * 
 * Tests error processing, categorization, logging, and notification creation
 * for various error scenarios in the product catalog system.
 */

import { errorService, ErrorType, ErrorSeverity } from '../../../../src/frontend/src/services/error-service';

// Mock console methods
const mockConsoleError = jest.fn();
const mockConsoleLog = jest.fn();

// Mock fetch for CloudWatch logging
const mockFetch = jest.fn();

// Mock localStorage and sessionStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};

const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};

describe('ErrorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    global.console.error = mockConsoleError;
    global.console.log = mockConsoleLog;
    
    // Mock fetch
    global.fetch = mockFetch;
    
    // Mock storage
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });
    Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });
    
    // Mock navigator
    Object.defineProperty(window, 'navigator', {
      value: { userAgent: 'test-agent' }
    });
    
    // Mock location
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/test' }
    });
  });

  describe('processError', () => {
    it('should process GraphQL errors correctly', () => {
      const graphQLError = {
        graphQLErrors: [{
          message: 'Validation failed',
          extensions: { code: 'VALIDATION_ERROR' }
        }]
      };

      const result = errorService.processError(graphQLError, 'GraphQL');

      expect(result.type).toBe(ErrorType.GRAPHQL_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.message).toBe('Validation failed');
      expect(result.userMessage).toBe('Invalid data provided. Please check your input.');
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.source).toBe('GraphQL');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(false);
    });

    it('should process authentication GraphQL errors correctly', () => {
      const authError = {
        graphQLErrors: [{
          message: 'Authentication required',
          extensions: { code: 'UNAUTHENTICATED' }
        }]
      };

      const result = errorService.processError(authError, 'GraphQL');

      expect(result.type).toBe(ErrorType.AUTHENTICATION_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.userMessage).toBe('Authentication required. Please log in again.');
      expect(result.recoverable).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('should process network errors correctly', () => {
      const networkError = {
        networkError: { message: 'Network request failed' },
        code: 'NETWORK_ERROR'
      };

      const result = errorService.processError(networkError, 'Network');

      expect(result.type).toBe(ErrorType.NETWORK_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.userMessage).toBe('Network connection lost. Please check your connection and try again.');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it('should process session expiration errors correctly', () => {
      const sessionError = {
        message: 'Session expired',
        code: 'SESSION_EXPIRED'
      };

      const result = errorService.processError(sessionError);

      expect(result.type).toBe(ErrorType.SESSION_EXPIRED);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
      expect(result.userMessage).toBe('Your session has expired. Please log in again.');
      expect(result.recoverable).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('should process validation errors correctly', () => {
      const validationError = {
        message: 'Invalid input data',
        code: 'VALIDATION_ERROR'
      };

      const result = errorService.processError(validationError);

      expect(result.type).toBe(ErrorType.VALIDATION_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toBe('Invalid data provided. Please check your input.');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(false);
    });

    it('should process data fetch errors correctly', () => {
      const fetchError = {
        message: 'Failed to fetch data',
        statusCode: 500
      };

      const result = errorService.processError(fetchError, 'DataFetch');

      expect(result.type).toBe(ErrorType.DATA_FETCH_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.userMessage).toBe('Unable to load data. Please try again.');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
      expect(result.source).toBe('DataFetch');
    });

    it('should process unknown errors correctly', () => {
      const unknownError = {
        message: 'Something went wrong'
      };

      const result = errorService.processError(unknownError);

      expect(result.type).toBe(ErrorType.UNKNOWN_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.userMessage).toBe('An unexpected error occurred. Please try again.');
      expect(result.recoverable).toBe(true);
      expect(result.retryable).toBe(true);
    });
  });

  describe('createErrorNotification', () => {
    it('should create error notification with correct properties', () => {
      const error = {
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Network failed',
        userMessage: 'Connection lost',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true
      };

      const notification = errorService.createErrorNotification(error);

      expect(notification.type).toBe('error');
      expect(notification.title).toBe('Connection Error');
      expect(notification.message).toBe('Connection lost');
      expect(notification.dismissible).toBe(true);
      expect(notification.autoHide).toBe(false);
    });

    it('should create non-dismissible notification for non-recoverable errors', () => {
      const error = {
        type: ErrorType.AUTHENTICATION_ERROR,
        severity: ErrorSeverity.CRITICAL,
        message: 'Auth failed',
        userMessage: 'Please log in',
        timestamp: Date.now(),
        recoverable: false,
        retryable: false
      };

      const notification = errorService.createErrorNotification(error);

      expect(notification.dismissible).toBe(false);
      expect(notification.title).toBe('Authentication Required');
    });
  });

  describe('logError', () => {
    beforeEach(() => {
      // Set development environment
      process.env.NODE_ENV = 'development';
    });

    it('should log error to console in development', () => {
      const error = {
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Network failed',
        userMessage: 'Connection lost',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true
      };

      errorService.logError(error, { testContext: 'unit-test' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Catalog Error:',
        expect.objectContaining({
          errorType: ErrorType.NETWORK_ERROR,
          severity: ErrorSeverity.HIGH,
          message: 'Network failed',
          context: { testContext: 'unit-test' }
        })
      );
    });

    it('should include user context in log data', () => {
      mockLocalStorage.getItem.mockReturnValue('test-user-123');
      mockSessionStorage.getItem.mockReturnValue('test-session-456');

      const error = {
        type: ErrorType.VALIDATION_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Validation failed',
        userMessage: 'Invalid input',
        timestamp: Date.now(),
        recoverable: true,
        retryable: false
      };

      errorService.logError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Catalog Error:',
        expect.objectContaining({
          userId: 'test-user-123',
          sessionId: 'test-session-456',
          userAgent: 'test-agent',
          url: 'http://localhost:3000/test'
        })
      );
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable network errors', () => {
      const error = {
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Network failed',
        userMessage: 'Connection lost',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true
      };

      expect(errorService.isRetryable(error)).toBe(true);
    });

    it('should return true for retryable data fetch errors', () => {
      const error = {
        type: ErrorType.DATA_FETCH_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Fetch failed',
        userMessage: 'Unable to load',
        timestamp: Date.now(),
        recoverable: true,
        retryable: true
      };

      expect(errorService.isRetryable(error)).toBe(true);
    });

    it('should return false for validation errors', () => {
      const error = {
        type: ErrorType.VALIDATION_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Validation failed',
        userMessage: 'Invalid input',
        timestamp: Date.now(),
        recoverable: true,
        retryable: false
      };

      expect(errorService.isRetryable(error)).toBe(false);
    });

    it('should return false for authentication errors', () => {
      const error = {
        type: ErrorType.AUTHENTICATION_ERROR,
        severity: ErrorSeverity.CRITICAL,
        message: 'Auth failed',
        userMessage: 'Please log in',
        timestamp: Date.now(),
        recoverable: false,
        retryable: false
      };

      expect(errorService.isRetryable(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return exponential backoff delays', () => {
      expect(errorService.getRetryDelay(0)).toBe(1000); // 1s
      expect(errorService.getRetryDelay(1)).toBe(2000); // 2s
      expect(errorService.getRetryDelay(2)).toBe(4000); // 4s
      expect(errorService.getRetryDelay(3)).toBe(8000); // 8s (max)
      expect(errorService.getRetryDelay(4)).toBe(8000); // Still 8s (capped)
    });
  });
});