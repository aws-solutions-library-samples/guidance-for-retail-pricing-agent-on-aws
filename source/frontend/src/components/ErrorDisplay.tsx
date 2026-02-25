/**
 * @fileoverview ErrorDisplay component for showing error details.
 * 
 * Displays error information in a user-friendly format with optional
 * detailed error information and recovery actions.
 * 
 * Requirements: 3.4, 8.6
 */

import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  SpaceBetween,
  ExpandableSection
} from '@cloudscape-design/components';

/**
 * Error details interface.
 */
export interface ErrorDetails {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Error type */
  type?: 'validation' | 'network' | 'timeout' | 'unknown';
  /** Additional error context */
  context?: Record<string, any>;
  /** Whether to show detailed information */
  showDetails?: boolean;
}

/**
 * Props for ErrorDisplay component.
 */
export interface ErrorDisplayProps {
  /** Error details to display */
  error: ErrorDetails;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Whether to show dismiss button */
  showDismiss?: boolean;
}

/**
 * Gets the alert type based on error type.
 * 
 * @param errorType - Error type
 * @returns Alert type
 */
const getAlertType = (errorType?: string): 'error' | 'warning' => {
  switch (errorType) {
    case 'timeout':
      return 'warning';
    default:
      return 'error';
  }
};

/**
 * Gets the error icon based on error type.
 * 
 * @param errorType - Error type
 * @returns Error icon emoji
 */
const getErrorIcon = (errorType?: string): string => {
  switch (errorType) {
    case 'validation':
      return '⚠️';
    case 'network':
      return '🌐';
    case 'timeout':
      return '⏱️';
    default:
      return '❌';
  }
};

/**
 * Gets the error title based on error type.
 * 
 * @param errorType - Error type
 * @returns Error title
 */
const getErrorTitle = (errorType?: string): string => {
  switch (errorType) {
    case 'validation':
      return 'Validation Error';
    case 'network':
      return 'Network Error';
    case 'timeout':
      return 'Request Timeout';
    default:
      return 'Error';
  }
};

/**
 * ErrorDisplay component.
 * 
 * Displays error information with optional detailed error information
 * and recovery actions (retry, dismiss).
 * 
 * Features:
 * - User-friendly error messages
 * - Error type-specific icons and styling
 * - Optional detailed error information
 * - Retry and dismiss actions
 * - Error context display
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  showRetry = true,
  showDismiss = true
}) => {
  const alertType = useMemo(() => getAlertType(error.type), [error.type]);
  const errorIcon = useMemo(() => getErrorIcon(error.type), [error.type]);
  const errorTitle = useMemo(() => getErrorTitle(error.type), [error.type]);

  /**
   * Formats context object for display.
   */
  const formattedContext = useMemo(() => {
    if (!error.context) {
      return null;
    }
    
    return JSON.stringify(error.context, null, 2);
  }, [error.context]);

  return (
    <Alert
      statusIconAriaLabel={errorTitle}
      type={alertType}
      header={`${errorIcon} ${errorTitle}`}
      action={
        (showRetry || showDismiss) && (
          <SpaceBetween direction="horizontal" size="xs">
            {showRetry && onRetry && (
              <Button
                variant="primary"
                onClick={onRetry}
                iconName="refresh"
              >
                Retry
              </Button>
            )}
            {showDismiss && onDismiss && (
              <Button
                variant="normal"
                onClick={onDismiss}
                iconName="close"
              >
                Dismiss
              </Button>
            )}
          </SpaceBetween>
        )
      }
    >
      <SpaceBetween direction="vertical" size="m">
        {/* Error message */}
        <Box>
          {error.message}
        </Box>

        {/* Error code */}
        {error.code && (
          <div style={{ fontSize: '14px', color: '#666' }}>
            Error Code: <strong>{error.code}</strong>
          </div>
        )}

        {/* Detailed error information */}
        {error.showDetails && (
          <ExpandableSection
            headerText="Error Details"
            variant="footer"
          >
            <SpaceBetween direction="vertical" size="s">
              {/* Error type */}
              {error.type && (
                <Box>
                  <Box variant="h4" margin={{ bottom: 'xs' }}>
                    Error Type:
                  </Box>
                  <Box variant="code" padding="s">
                    {error.type}
                  </Box>
                </Box>
              )}

              {/* Error context */}
              {formattedContext && (
                <Box>
                  <Box variant="h4" margin={{ bottom: 'xs' }}>
                    Context:
                  </Box>
                  <div
                    style={{
                      backgroundColor: '#f9f9f9',
                      borderRadius: '4px',
                      border: '1px solid #e9ecef',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      padding: '8px',
                      fontFamily: 'monospace'
                    }}
                  >
                    {formattedContext}
                  </div>
                </Box>
              )}
            </SpaceBetween>
          </ExpandableSection>
        )}
      </SpaceBetween>
    </Alert>
  );
};

export default ErrorDisplay;
