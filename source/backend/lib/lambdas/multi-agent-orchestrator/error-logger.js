/**
 * @fileoverview Centralized error logging utility for multi-agent orchestration.
 * 
 * Provides consistent error logging across all Lambda handlers with structured
 * CloudWatch logging format including sessionId, component name, error details,
 * and stack traces.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

/**
 * Logs an error to CloudWatch with structured format.
 * 
 * Formats error information as JSON for easy parsing and analysis in CloudWatch.
 * Includes sessionId, component name, error message, error code, and stack trace.
 * 
 * Requirements: 8.1 (log with ERROR severity), 8.5 (consistent error logging)
 * 
 * @param {string} sessionId - Session identifier for tracking
 * @param {string} component - Component name where error occurred
 * @param {Error} error - Error object to log
 * @param {Object} [additionalContext] - Additional context to include in log
 * @returns {void}
 */
function logError(sessionId, component, error, additionalContext = {}) {
  const errorLog = {
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    sessionId,
    component,
    error: {
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN',
      name: error.name || 'Error',
      stack: error.stack || 'No stack trace available'
    },
    ...additionalContext
  };

  console.error(JSON.stringify(errorLog));
}

/**
 * Logs a warning to CloudWatch with structured format.
 * 
 * Used for non-critical issues that should be monitored but don't stop execution.
 * 
 * @param {string} sessionId - Session identifier for tracking
 * @param {string} component - Component name
 * @param {string} message - Warning message
 * @param {Object} [additionalContext] - Additional context to include in log
 * @returns {void}
 */
function logWarning(sessionId, component, message, additionalContext = {}) {
  const warningLog = {
    level: 'WARN',
    timestamp: new Date().toISOString(),
    sessionId,
    component,
    message,
    ...additionalContext
  };

  console.warn(JSON.stringify(warningLog));
}

/**
 * Logs informational message to CloudWatch with structured format.
 * 
 * Used for tracking workflow progress and important events.
 * 
 * @param {string} sessionId - Session identifier for tracking
 * @param {string} component - Component name
 * @param {string} message - Info message
 * @param {Object} [additionalContext] - Additional context to include in log
 * @returns {void}
 */
function logInfo(sessionId, component, message, additionalContext = {}) {
  const infoLog = {
    level: 'INFO',
    timestamp: new Date().toISOString(),
    sessionId,
    component,
    message,
    ...additionalContext
  };

  console.log(JSON.stringify(infoLog));
}

/**
 * Creates a structured error object for Step Functions.
 * 
 * Formats error information in a way that Step Functions can handle
 * and pass through error handling logic.
 * 
 * @param {string} code - Error code for Step Functions error handling
 * @param {string} message - Error message
 * @param {Object} [details] - Additional error details
 * @returns {Object} Structured error object
 */
function createStepFunctionsError(code, message, details = {}) {
  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Determines if an error is retryable based on error type.
 * 
 * Some errors are transient and can be retried, while others are permanent.
 * This helper function can be used by Step Functions retry logic.
 * 
 * Requirements: 8.2, 8.3 (handle failures with retry logic)
 * 
 * @param {Error} error - Error object to check
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  const retryableErrorCodes = [
    'ThrottlingException',
    'ServiceUnavailableException',
    'RequestLimitExceeded',
    'TimeoutError',
    'AGENT_TIMEOUT',
    'ConnectionError',
    'ECONNREFUSED',
    'ECONNRESET'
  ];

  const retryableErrorNames = [
    'TimeoutError',
    'NetworkingError',
    'ServiceUnavailableException'
  ];

  return (
    retryableErrorCodes.includes(error.code) ||
    retryableErrorNames.includes(error.name) ||
    (error.message && error.message.includes('timeout')) ||
    (error.message && error.message.includes('temporarily unavailable'))
  );
}

/**
 * Formats error details for DynamoDB storage.
 * 
 * Creates a structured error object suitable for storing in DynamoDB
 * session records for later retrieval and analysis.
 * 
 * Requirements: 8.6 (include error details in session status)
 * 
 * @param {Error} error - Error object
 * @param {string} [component] - Component where error occurred
 * @returns {Object} Formatted error details
 */
function formatErrorForStorage(error, component = 'Unknown') {
  return {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    component,
    timestamp: new Date().toISOString(),
    retryable: isRetryableError(error)
  };
}

/**
 * Validates error object and provides default values.
 * 
 * Ensures error object has required properties for logging and handling.
 * 
 * @param {Error} error - Error object to validate
 * @returns {Object} Validated error object with defaults
 */
function validateError(error) {
  if (!error) {
    return {
      message: 'Unknown error',
      code: 'UNKNOWN',
      name: 'Error',
      stack: 'No error object provided'
    };
  }

  return {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    name: error.name || 'Error',
    stack: error.stack || 'No stack trace available'
  };
}

module.exports = {
  logError,
  logWarning,
  logInfo,
  createStepFunctionsError,
  isRetryableError,
  formatErrorForStorage,
  validateError
};
