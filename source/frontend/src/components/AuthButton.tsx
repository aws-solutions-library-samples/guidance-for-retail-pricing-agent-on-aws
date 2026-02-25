/**
 * @fileoverview Enhanced authentication button component with loading states.
 * 
 * Provides consistent loading states and transitions for authentication-related
 * buttons throughout the application.
 */

import React from 'react';
import { Button, ButtonProps } from '@cloudscape-design/components';

/**
 * Props for AuthButton component extending CloudScape Button props.
 */
export interface AuthButtonProps extends Omit<ButtonProps, 'loading' | 'loadingText'> {
  /** Whether the button is in loading state */
  isLoading?: boolean;
  /** Text to display when loading */
  loadingText?: string;
  /** Loading animation type */
  loadingAnimation?: 'pulse' | 'fade' | 'none';
  /** Whether to show enhanced loading effects */
  enhanced?: boolean;
}

/**
 * Enhanced authentication button with smooth loading states and transitions.
 * 
 * Features:
 * - Smooth loading state transitions
 * - Customizable loading text and animations
 * - Enhanced visual feedback
 * - Accessibility support
 * - Consistent styling across auth forms
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const AuthButton: React.FC<AuthButtonProps> = ({
  isLoading = false,
  loadingText,
  loadingAnimation = 'pulse',
  enhanced = true,
  children,
  disabled,
  variant = 'primary',
  ...buttonProps
}) => {
  // Determine loading text based on button content and props
  const getLoadingText = (): string => {
    if (loadingText) return loadingText;
    
    // Default loading text based on button content
    const buttonText = typeof children === 'string' ? children : '';
    
    if (buttonText.toLowerCase().includes('sign in') || buttonText.toLowerCase().includes('login')) {
      return 'Signing in...';
    }
    if (buttonText.toLowerCase().includes('sign out') || buttonText.toLowerCase().includes('logout')) {
      return 'Signing out...';
    }
    if (buttonText.toLowerCase().includes('send')) {
      return 'Sending...';
    }
    if (buttonText.toLowerCase().includes('reset')) {
      return 'Resetting...';
    }
    if (buttonText.toLowerCase().includes('verify')) {
      return 'Verifying...';
    }
    
    return 'Loading...';
  };

  // Animation styles based on loading animation type
  const getAnimationStyle = () => {
    if (!enhanced || !isLoading) return {};
    
    switch (loadingAnimation) {
      case 'pulse':
        return {
          animation: 'authButtonPulse 1.5s infinite ease-in-out'
        };
      case 'fade':
        return {
          animation: 'authButtonFade 1s infinite ease-in-out'
        };
      default:
        return {};
    }
  };

  return (
    <>
      <div
        style={{
          transition: 'all 0.2s ease-in-out',
          transform: isLoading ? 'scale(0.98)' : 'scale(1)',
          ...getAnimationStyle()
        }}
      >
        <Button
          {...buttonProps}
          variant={variant}
          loading={isLoading}
          loadingText={getLoadingText()}
          disabled={disabled || isLoading}
          ariaLabel={isLoading ? getLoadingText() : buttonProps.ariaLabel}
        >
          {children}
        </Button>
      </div>
      
      {/* CSS animations for enhanced loading effects */}
      {enhanced && (
        <style>{`
          @keyframes authButtonPulse {
            0%, 100% { 
              opacity: 1; 
              transform: scale(0.98); 
            }
            50% { 
              opacity: 0.8; 
              transform: scale(0.96); 
            }
          }
          
          @keyframes authButtonFade {
            0%, 100% { 
              opacity: 1; 
            }
            50% { 
              opacity: 0.7; 
            }
          }
        `}</style>
      )}
    </>
  );
};

export default AuthButton;