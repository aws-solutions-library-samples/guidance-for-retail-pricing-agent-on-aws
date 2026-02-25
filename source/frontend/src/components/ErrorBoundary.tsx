/**
 * @fileoverview Error Boundary component for catching React errors.
 * 
 * Provides graceful error handling for React component tree errors.
 * Displays user-friendly error messages with recovery options.
 * 
 * Requirements: 3.4, 8.6
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Alert,
  Button,
  Container,
  SpaceBetween,
  Box,
  Header,
  ExpandableSection
} from '@cloudscape-design/components';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  errorMessage?: string;
  showDetails?: boolean;
  /** Component name for error context */
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
      component: this.props.componentName
    });

    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReload = (): void => {
    // Reset error state before reloading
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  /**
   * Extracts error message from error object.
   */
  getErrorMessage = (): string => {
    if (this.props.errorMessage) {
      return this.props.errorMessage;
    }
    
    if (this.state.error?.message) {
      return this.state.error.message;
    }
    
    return 'An unexpected error occurred';
  };

  /**
   * Extracts component stack from error info.
   */
  getComponentStack = (): string => {
    if (this.state.errorInfo?.componentStack) {
      return this.state.errorInfo.componentStack;
    }
    
    return 'No component stack available';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.getErrorMessage();
      const componentStack = this.getComponentStack();
      const showDetails = this.props.showDetails || process.env.NODE_ENV === 'development';

      return (
        <Container>
          <SpaceBetween direction="vertical" size="l">
            <Header variant="h1">Something Went Wrong</Header>
            
            <Alert
              statusIconAriaLabel="Error"
              type="error"
              header={errorMessage}
              action={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    variant="primary"
                    onClick={this.handleRetry}
                    iconName="refresh"
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="normal"
                    onClick={this.handleReload}
                    iconName="refresh"
                  >
                    Reload Page
                  </Button>
                  <Button
                    variant="normal"
                    onClick={this.handleGoHome}
                    iconName="arrow-left"
                  >
                    Go to Home
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween direction="vertical" size="m">
                <Box>
                  We're sorry, but something went wrong. Please try again or reload the page.
                </Box>

                {this.state.errorCount > 2 && (
                  <Box color="text-status-warning">
                    ⚠️ Multiple errors detected. Consider reloading the page.
                  </Box>
                )}

                {showDetails && (
                  <ExpandableSection
                    headerText="Error Details"
                    variant="footer"
                  >
                    <SpaceBetween direction="vertical" size="s">
                      <Box>
                        <Box variant="h4" margin={{ bottom: 'xs' }}>
                          Error Message:
                        </Box>
                        <div
                          style={{
                            backgroundColor: '#FEE2E2',
                            borderRadius: '4px',
                            border: '1px solid #EF4444',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            padding: '8px',
                            fontFamily: 'monospace',
                            color: '#991B1B'
                          }}
                        >
                          {errorMessage}
                        </div>
                      </Box>

                      {this.props.componentName && (
                        <Box>
                          <Box variant="h4" margin={{ bottom: 'xs' }}>
                            Component:
                          </Box>
                          <Box variant="code" padding="s">
                            {this.props.componentName}
                          </Box>
                        </Box>
                      )}

                      <Box>
                        <Box variant="h4" margin={{ bottom: 'xs' }}>
                          Component Stack:
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
                          {componentStack}
                        </div>
                      </Box>
                    </SpaceBetween>
                  </ExpandableSection>
                )}
              </SpaceBetween>
            </Alert>
          </SpaceBetween>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
