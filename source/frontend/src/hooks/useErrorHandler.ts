/**
 * @fileoverview React hook for centralized error handling in product catalog.
 * 
 * Provides error processing, notification management, recovery actions,
 * and session expiration handling with automatic retry logic.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { 
  addNotificationAtom, 
  createErrorNotification,
  createWarningNotification 
} from '../atoms/notification';
import { 
  errorService, 
  CatalogError, 
  ErrorType, 
  ErrorRecoveryAction 
} from '../services/error-service';

/**
 * Error handler state interface.
 */
interface ErrorHandlerState {
  hasError: boolean;
  currentError: CatalogError | null;
  retryCount: number;
  isRetrying: boolean;
}

/**
 * Error handler options interface.
 */
interface ErrorHandlerOptions {
  maxRetries?: number;
  enableAutoRetry?: boolean;
  logErrors?: boolean;
  showNotifications?: boolean;
}

/**
 * Hook for centralized error handling with recovery actions.
 * 
 * @param options - Configuration options for error handling
 * @returns Error handling utilities and state
 */
export const useErrorHandler = (options: ErrorHandlerOptions = {}) => {
  const {
    maxRetries = 3,
    enableAutoRetry = true,
    logErrors = true,
    showNotifications = true
  } = options;

  const [, addNotification] = useAtom(addNotificationAtom);
  const { signOut } = useAuthenticator();

  const [errorState, setErrorState] = useState<ErrorHandlerState>({
    hasError: false,
    currentError: null,
    retryCount: 0,
    isRetrying: false
  });

  /**
   * Processes an error and determines appropriate handling strategy.
   * 
   * @param error - Raw error object
   * @param source - Source of the error
   * @param retryAction - Optional retry action
   */
  const handleError = useCallback(async (
    error: any, 
    source?: string,
    retryAction?: () => Promise<void>
  ) => {
    const catalogError = errorService.processError(error, source);
    
    // Log error if enabled
    if (logErrors) {
      errorService.logError(catalogError, {
        retryCount: errorState.retryCount,
        maxRetries,
        hasRetryAction: !!retryAction
      });
    }

    // Update error state
    setErrorState(prev => ({
      ...prev,
      hasError: true,
      currentError: catalogError
    }));

    // Handle session expiration
    if (catalogError.type === ErrorType.SESSION_EXPIRED || 
        catalogError.type === ErrorType.AUTHENTICATION_ERROR) {
      await handleSessionExpiration(catalogError);
      return;
    }

    // Show notification if enabled
    if (showNotifications) {
      const recoveryActions = createRecoveryActions(catalogError, retryAction);
      const notification = errorService.createErrorNotification(catalogError, recoveryActions);
      addNotification(notification);
    }

    // Auto-retry if enabled and error is retryable
    if (enableAutoRetry && 
        errorService.isRetryable(catalogError) && 
        errorState.retryCount < maxRetries && 
        retryAction) {
      await performAutoRetry(retryAction, catalogError);
    }
  }, [
    errorState.retryCount, 
    maxRetries, 
    enableAutoRetry, 
    logErrors, 
    showNotifications, 
    addNotification, 
    signOut
  ]);

  /**
   * Manually retries the last failed operation.
   * 
   * @param retryAction - Action to retry
   */
  const retry = useCallback(async (retryAction: () => Promise<void>) => {
    if (!errorState.currentError || errorState.isRetrying) {
      return;
    }

    setErrorState(prev => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1
    }));

    try {
      await retryAction();
      
      // Clear error state on successful retry
      setErrorState({
        hasError: false,
        currentError: null,
        retryCount: 0,
        isRetrying: false
      });

      // Show success notification
      if (showNotifications) {
        addNotification({
          type: 'success',
          title: 'Operation Successful',
          message: 'The operation completed successfully after retry.',
          autoHide: true,
          duration: 3000
        });
      }
    } catch (retryError) {
      // Handle retry failure
      await handleError(retryError, 'Retry', retryAction);
    } finally {
      setErrorState(prev => ({
        ...prev,
        isRetrying: false
      }));
    }
  }, [errorState, handleError, showNotifications, addNotification]);

  /**
   * Clears the current error state.
   */
  const clearError = useCallback(() => {
    setErrorState({
      hasError: false,
      currentError: null,
      retryCount: 0,
      isRetrying: false
    });
  }, []);

  /**
   * Checks if the current error is retryable.
   */
  const canRetry = useCallback(() => {
    return errorState.currentError && 
           errorService.isRetryable(errorState.currentError) &&
           errorState.retryCount < maxRetries;
  }, [errorState, maxRetries]);

  // Private helper methods

  const handleSessionExpiration = async (error: CatalogError) => {
    // Show session expiration warning
    if (showNotifications) {
      addNotification(createWarningNotification(
        'Session Expired',
        'Your session has expired. You will be redirected to the login page.',
        { autoHide: false }
      ));
    }

    // Wait a moment for user to see the message
    setTimeout(async () => {
      try {
        await signOut();
        // In a real app, this would redirect to login page
        // For now, we'll just reload the page which should trigger auth flow
        window.location.href = '/login';
      } catch (signOutError) {
        console.error('Failed to sign out:', signOutError);
        // Force navigation even if sign out fails
        window.location.href = '/login';
      }
    }, 2000);
  };

  const createRecoveryActions = (
    error: CatalogError, 
    retryAction?: () => Promise<void>
  ): ErrorRecoveryAction[] => {
    const actions: ErrorRecoveryAction[] = [];

    // Add retry action if error is retryable
    if (errorService.isRetryable(error) && retryAction && errorState.retryCount < maxRetries) {
      actions.push({
        label: 'Retry',
        action: () => retry(retryAction),
        primary: true
      });
    }

    // Add refresh action for data fetch errors
    if (error.type === ErrorType.DATA_FETCH_ERROR) {
      actions.push({
        label: 'Refresh Page',
        action: () => window.location.reload()
      });
    }

    // Add dismiss action for recoverable errors
    if (error.recoverable) {
      actions.push({
        label: 'Dismiss',
        action: clearError
      });
    }

    return actions;
  };

  const performAutoRetry = async (
    retryAction: () => Promise<void>,
    error: CatalogError
  ) => {
    const delay = errorService.getRetryDelay(errorState.retryCount);
    
    // Show retry notification
    if (showNotifications) {
      addNotification({
        type: 'info',
        title: 'Retrying Operation',
        message: `Retrying in ${delay / 1000} seconds... (Attempt ${errorState.retryCount + 1}/${maxRetries})`,
        autoHide: true,
        duration: delay
      });
    }

    setTimeout(async () => {
      await retry(retryAction);
    }, delay);
  };

  // Reset retry count when error changes
  useEffect(() => {
    if (errorState.currentError) {
      const timer = setTimeout(() => {
        setErrorState(prev => ({
          ...prev,
          retryCount: 0
        }));
      }, 60000); // Reset after 1 minute

      return () => clearTimeout(timer);
    }
  }, [errorState.currentError]);

  return {
    // Error state
    hasError: errorState.hasError,
    currentError: errorState.currentError,
    isRetrying: errorState.isRetrying,
    retryCount: errorState.retryCount,
    
    // Error handling methods
    handleError,
    retry,
    clearError,
    canRetry: canRetry(),
    
    // Utility methods
    isRetryable: (error: any) => errorService.isRetryable(errorService.processError(error)),
    processError: (error: any, source?: string) => errorService.processError(error, source)
  };
};