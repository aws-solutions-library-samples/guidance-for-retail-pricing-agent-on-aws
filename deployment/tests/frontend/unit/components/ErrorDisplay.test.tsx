/**
 * @fileoverview Unit tests for ErrorDisplay component.
 * 
 * Tests error display, error types, retry/dismiss actions, and detailed error information.
 */

// @ts-nocheck - Test file with complex JSX mocking
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay, ErrorDetails } from '../../../../src/frontend/src/components/ErrorDisplay';

// Mock CloudScape components
jest.mock('@cloudscape-design/components', () => ({
  Alert: ({ children, header, type, action, statusIconAriaLabel, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-alert', 'data-type': type, ...props }, [
      React.createElement('div', { 'data-testid': 'alert-header' }, header),
      children,
      action && React.createElement('div', { 'data-testid': 'alert-action' }, action)
    ])
  ),
  Box: ({ children, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-box', ...props }, children)
  ),
  Button: ({ children, onClick, variant, iconName, ...props }: any) => (
    React.createElement('button', { 
      'data-testid': 'cloudscape-button', 
      'data-variant': variant,
      'data-icon': iconName,
      onClick,
      ...props 
    }, children)
  ),
  SpaceBetween: ({ children, direction, size, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-space-between',
      'data-direction': direction,
      'data-size': size,
      style: { 
        display: 'flex', 
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        gap: size === 's' ? '8px' : size === 'm' ? '16px' : '24px'
      },
      ...props
    }, children)
  ),
  ExpandableSection: ({ children, headerText, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-expandable-section', ...props }, [
      React.createElement('div', { 'data-testid': 'expandable-header' }, headerText),
      children
    ])
  )
}));

/**
 * Creates mock error details for testing.
 */
const createMockErrorDetails = (overrides?: Partial<ErrorDetails>): ErrorDetails => ({
  message: 'An error occurred',
  code: 'ERROR_001',
  type: 'unknown',
  showDetails: false,
  ...overrides
});

describe('ErrorDisplay Component', () => {
  describe('Error Display', () => {
    it('should display error message', () => {
      const error = createMockErrorDetails({
        message: 'Failed to load data'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });

    it('should display error code', () => {
      const error = createMockErrorDetails({
        code: 'NETWORK_ERROR'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText('NETWORK_ERROR')).toBeInTheDocument();
    });

    it('should display error type in header', () => {
      const error = createMockErrorDetails({
        type: 'network'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
    });
  });

  describe('Error Types', () => {
    it('should display validation error', () => {
      const error = createMockErrorDetails({
        type: 'validation',
        message: 'Invalid input'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText(/Validation Error/i)).toBeInTheDocument();
    });

    it('should display network error', () => {
      const error = createMockErrorDetails({
        type: 'network',
        message: 'Connection failed'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
    });

    it('should display timeout error', () => {
      const error = createMockErrorDetails({
        type: 'timeout',
        message: 'Request timed out'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText(/Request Timeout/i)).toBeInTheDocument();
    });

    it('should display unknown error', () => {
      const error = createMockErrorDetails({
        type: 'unknown',
        message: 'Unknown error'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should display retry button when onRetry provided', () => {
      const error = createMockErrorDetails();
      const onRetry = jest.fn();

      render(<ErrorDisplay error={error} onRetry={onRetry} showRetry={true} />);
      
      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeInTheDocument();
    });

    it('should call onRetry when retry button clicked', () => {
      const error = createMockErrorDetails();
      const onRetry = jest.fn();

      render(<ErrorDisplay error={error} onRetry={onRetry} showRetry={true} />);
      
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);
      
      expect(onRetry).toHaveBeenCalled();
    });

    it('should display dismiss button when onDismiss provided', () => {
      const error = createMockErrorDetails();
      const onDismiss = jest.fn();

      render(<ErrorDisplay error={error} onDismiss={onDismiss} showDismiss={true} />);
      
      const dismissButton = screen.getByText('Dismiss');
      expect(dismissButton).toBeInTheDocument();
    });

    it('should call onDismiss when dismiss button clicked', () => {
      const error = createMockErrorDetails();
      const onDismiss = jest.fn();

      render(<ErrorDisplay error={error} onDismiss={onDismiss} showDismiss={true} />);
      
      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);
      
      expect(onDismiss).toHaveBeenCalled();
    });

    it('should not display buttons when showRetry and showDismiss are false', () => {
      const error = createMockErrorDetails();
      const onRetry = jest.fn();
      const onDismiss = jest.fn();

      render(
        <ErrorDisplay 
          error={error} 
          onRetry={onRetry} 
          onDismiss={onDismiss}
          showRetry={false}
          showDismiss={false}
        />
      );
      
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });
  });

  describe('Detailed Error Information', () => {
    it('should display error details when showDetails is true', () => {
      const error = createMockErrorDetails({
        showDetails: true,
        type: 'network'
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText('Error Details')).toBeInTheDocument();
    });

    it('should display error context when provided', () => {
      const error = createMockErrorDetails({
        showDetails: true,
        context: {
          endpoint: '/api/pricing',
          method: 'POST'
        }
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.getByText('Context:')).toBeInTheDocument();
    });

    it('should not display error details when showDetails is false', () => {
      const error = createMockErrorDetails({
        showDetails: false
      });

      render(<ErrorDisplay error={error} />);
      
      expect(screen.queryByText('Error Details')).not.toBeInTheDocument();
    });
  });

  describe('Alert Type', () => {
    it('should use error alert type for validation errors', () => {
      const error = createMockErrorDetails({
        type: 'validation'
      });

      const { container } = render(<ErrorDisplay error={error} />);
      
      const alert = container.querySelector('[data-testid="cloudscape-alert"]');
      expect(alert).toHaveAttribute('data-type', 'error');
    });

    it('should use warning alert type for timeout errors', () => {
      const error = createMockErrorDetails({
        type: 'timeout'
      });

      const { container } = render(<ErrorDisplay error={error} />);
      
      const alert = container.querySelector('[data-testid="cloudscape-alert"]');
      expect(alert).toHaveAttribute('data-type', 'warning');
    });
  });
});
