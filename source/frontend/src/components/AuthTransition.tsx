/**
 * @fileoverview Authentication transition component for smooth state changes.
 * 
 * Provides smooth transitions between different authentication states with
 * loading indicators, fade effects, and proper accessibility support.
 */

import React, { useState, useEffect } from 'react';
import { Spinner, Box, Container } from '@cloudscape-design/components';

/**
 * Props for AuthTransition component.
 */
export interface AuthTransitionProps {
  /** Whether the authentication state is loading */
  isLoading: boolean;
  /** Whether the authentication system is initialized */
  isInitialized: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Loading message to display */
  loadingMessage?: string;
  /** Loading description text */
  loadingDescription?: string;
  /** Children to render when not loading */
  children: React.ReactNode;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Transition delay in milliseconds */
  transitionDelay?: number;
  /** Whether to show full-screen loading overlay */
  fullScreen?: boolean;
}

/**
 * Default loading component with smooth animations.
 * 
 * @param message - Loading message
 * @param description - Loading description
 * @param fullScreen - Whether to show full-screen overlay
 * @returns JSX element
 */
const DefaultLoadingComponent: React.FC<{
  message?: string;
  description?: string;
  fullScreen?: boolean;
}> = ({ 
  message = 'Loading...', 
  description = 'Please wait',
  fullScreen = false 
}) => {
  const containerStyle = fullScreen ? {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    zIndex: 9999,
    animation: 'fadeIn 0.3s ease-in-out'
  } : {
    animation: 'fadeIn 0.3s ease-in-out'
  };

  return (
    <div
      style={containerStyle}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <Container>
        <Box textAlign="center" padding="xxl">
          <div
            style={{
              animation: 'pulse 2s infinite ease-in-out'
            }}
          >
            <Spinner size="large" />
          </div>
          <Box 
            variant="h4" 
            color="text-body-secondary" 
            margin={{ top: 'l' }}
            fontWeight="normal"
          >
            {message}
          </Box>
          {description && (
            <Box 
              variant="p" 
              color="text-body-secondary" 
              margin={{ top: 's' }}
              fontSize="body-s"
            >
              {description}
            </Box>
          )}
        </Box>
      </Container>
      
      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

/**
 * Authentication transition component that provides smooth transitions
 * between loading and content states.
 * 
 * Features:
 * - Smooth fade transitions between states
 * - Configurable loading messages and components
 * - Accessibility support with proper ARIA attributes
 * - Full-screen or inline loading modes
 * - Customizable transition delays
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const AuthTransition: React.FC<AuthTransitionProps> = ({
  isLoading,
  isInitialized,
  isAuthenticated,
  loadingMessage = 'Authenticating...',
  loadingDescription = 'Please wait while we verify your session',
  children,
  loadingComponent,
  transitionDelay = 150,
  fullScreen = false
}) => {
  const [showContent, setShowContent] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle smooth transitions when authentication state changes
  useEffect(() => {
    if (isInitialized && !isLoading) {
      setIsTransitioning(true);
      
      // In test environment, show content immediately
      if (process.env.NODE_ENV === 'test') {
        setShowContent(true);
        setIsTransitioning(false);
      } else {
        // Add transition delay for smooth effect in production
        const timer = setTimeout(() => {
          setShowContent(true);
          setIsTransitioning(false);
        }, transitionDelay);
        
        return () => clearTimeout(timer);
      }
    } else {
      setShowContent(false);
      setIsTransitioning(false);
    }
  }, [isInitialized, isLoading, transitionDelay]);

  // Show loading state
  if (isLoading || !isInitialized || isTransitioning) {
    return loadingComponent || (
      <DefaultLoadingComponent
        message={loadingMessage}
        description={loadingDescription}
        fullScreen={fullScreen}
      />
    );
  }

  // Show content with smooth transition
  return (
    <div
      style={{
        animation: showContent ? 'slideInContent 0.4s ease-out' : 'none',
        opacity: showContent ? 1 : 0,
        transform: showContent ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out'
      }}
    >
      {children}
      
      {/* CSS animations for content transition */}
      <style>{`
        @keyframes slideInContent {
          from { 
            opacity: 0; 
            transform: translateY(10px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
      `}</style>
    </div>
  );
};

export default AuthTransition;