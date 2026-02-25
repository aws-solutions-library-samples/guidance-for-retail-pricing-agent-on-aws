/**
 * @fileoverview DemoResetButton component for resetting demo data.
 * 
 * Provides a button that opens a confirmation modal for resetting
 * all pricing session data to prepare for a new demonstration.
 * Implements safety controls to prevent accidental data deletion.
 */

import React, { useState } from 'react';
import { Button, Modal, Box, SpaceBetween, Alert, Input, FormField, StatusIndicator } from '@cloudscape-design/components';
import { useDemoReset } from '../hooks/useDemoReset';
import { useNavigation } from '../hooks/useNavigation';

/**
 * Props interface for DemoResetButton component.
 */
export interface DemoResetButtonProps {
  /** Optional callback function when reset completes successfully */
  onResetSuccess?: () => void;
  
  /** Optional callback function when reset fails */
  onResetError?: (error: Error) => void;
  
  /** Optional custom button text */
  buttonText?: string;
  
  /** Optional button variant */
  variant?: 'normal' | 'primary' | 'link' | 'icon';
  
  /** Optional icon name for the button */
  iconName?: 'refresh' | 'undo' | 'remove';
  
  /** Optional aria label for accessibility */
  ariaLabel?: string;
}

/**
 * DemoResetButton component for initiating demo reset workflow.
 * 
 * Features:
 * - CloudScape Button component integration
 * - Click handler to show confirmation modal
 * - Loading state support during reset operation with StatusIndicator
 * - Error Alert display when reset fails
 * - Success StatusIndicator and Alert when reset completes
 * - All UI controls disabled during reset operation
 * - Accessibility support with ARIA labels
 * - Customizable button appearance
 * - Integrated with useDemoReset hook for mutation handling
 * - Automatic navigation to home page after successful reset
 * - Cache invalidation and UI updates on success
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 * 
 * @param props - Component props
 * @returns DemoResetButton component
 */
export const DemoResetButton: React.FC<DemoResetButtonProps> = ({
  onResetSuccess,
  onResetError,
  buttonText = 'Reset Demo',
  variant = 'normal',
  iconName,
  ariaLabel = 'Reset demo data'
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  
  // Use the demo reset hook
  const { resetDemo, isResetting, isSuccess, isError, error, resetData } = useDemoReset();
  
  // Use navigation hook for redirecting after reset
  const { navigateToHome } = useNavigation();

  /**
   * Handles button click to show confirmation modal.
   */
  const handleClick = () => {
    setIsModalVisible(true);
    setConfirmationText(''); // Reset confirmation text when opening modal
  };

  /**
   * Handles modal close event.
   */
  const handleModalClose = () => {
    setIsModalVisible(false);
    setConfirmationText(''); // Clear confirmation text when closing
  };

  /**
   * Handles reset confirmation from modal.
   * Executes the reset mutation and handles success/error callbacks.
   * Redirects to home page after successful reset.
   */
  const handleResetConfirmed = () => {
    resetDemo(undefined, {
      onSuccess: (data) => {
        console.log('Demo reset successful:', data);
        setIsModalVisible(false);
        setConfirmationText('');
        
        // Call success callback if provided
        if (onResetSuccess) {
          onResetSuccess();
        }

        // Redirect to home page after successful reset
        // This ensures users start fresh after demo reset
        setTimeout(() => {
          navigateToHome();
        }, 1000); // Small delay to allow user to see success message
      },
      onError: (err) => {
        console.error('Demo reset failed:', err);
        
        // Call error callback if provided
        if (onResetError) {
          onResetError(err);
        }
        
        // Keep modal open to show error state
      }
    });
  };

  /**
   * Handles confirmation text input change.
   * 
   * @param value - New input value
   */
  const handleConfirmationTextChange = (value: string) => {
    setConfirmationText(value);
  };

  /**
   * Checks if the confirm button should be enabled.
   * Requires exact match of "RESET" text.
   */
  const isConfirmEnabled = confirmationText === 'RESET';

  return (
    <>
      <Button
        variant={variant}
        onClick={handleClick}
        disabled={isResetting}
        loading={isResetting}
        iconName={iconName}
        ariaLabel={ariaLabel}
      >
        {isResetting ? 'Resetting...' : buttonText}
      </Button>

      <Modal
        visible={isModalVisible}
        onDismiss={handleModalClose}
        header="Reset Demo Data"
        closeAriaLabel="Close modal"
        size="medium"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={handleModalClose}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleResetConfirmed}
                disabled={!isConfirmEnabled || isResetting}
                loading={isResetting}
              >
                Confirm Reset
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {/* Loading Indicator - shown during reset operation */}
          {isResetting && (
            <Box textAlign="center" padding={{ vertical: 'l' }}>
              <StatusIndicator type="loading">
                Resetting demo data...
              </StatusIndicator>
            </Box>
          )}

          {/* Error Alert - shown when reset fails */}
          {isError && error && !isResetting && (
            <Alert
              type="error"
              header="Reset Failed"
              dismissible
              onDismiss={() => {
                // Error will be cleared when modal is closed
              }}
            >
              {error.message || 'An error occurred while resetting demo data. Please try again.'}
            </Alert>
          )}

          {/* Success Status and Alert - shown when reset succeeds */}
          {isSuccess && resetData && !isResetting && (
            <>
              <Box textAlign="center" padding={{ vertical: 'm' }}>
                <StatusIndicator type="success">
                  Demo reset completed successfully
                </StatusIndicator>
              </Box>
              <Alert
                type="success"
                header="Reset Successful"
              >
                {resetData.message} ({resetData.deletedCount} session{resetData.deletedCount !== 1 ? 's' : ''} deleted)
              </Alert>
            </>
          )}

          {/* Warning Alert - shown before reset */}
          {!isSuccess && !isResetting && (
            <Alert
              type="warning"
              header="Warning: This action cannot be undone"
            >
              Resetting the demo will permanently delete all pricing session data.
              Product catalog data will be preserved. This action is intended for
              demo presenters to prepare for a new demonstration.
            </Alert>
          )}

          {/* Confirmation Input - only shown before reset */}
          {!isSuccess && !isResetting && (
            <FormField
              label="Type RESET to confirm"
              description="Enter the word RESET (in capital letters) to enable the confirm button"
            >
              <Input
                value={confirmationText}
                onChange={({ detail }) => handleConfirmationTextChange(detail.value)}
                placeholder="Type RESET here"
                disabled={isResetting}
                ariaLabel="Confirmation text input"
              />
            </FormField>
          )}
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default DemoResetButton;
