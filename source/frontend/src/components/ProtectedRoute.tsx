/**
 * @fileoverview Protected route component for authentication-required pages.
 * 
 * Wraps components that require authentication and handles redirects to login
 * when users are not authenticated. Stores original URL for redirect after login.
 * 
 * @example
 * ```tsx
 * // Basic usage - protects a route and redirects to /login if not authenticated
 * <Route 
 *   path="/pricing/analysis" 
 *   element={
 *     <ProtectedRoute>
 *       <PricingAnalysisPage />
 *     </ProtectedRoute>
 *   } 
 * />
 * 
 * // Custom redirect URL
 * <Route 
 *   path="/admin" 
 *   element={
 *     <ProtectedRoute redirectTo="/admin-login">
 *       <AdminPage />
 *     </ProtectedRoute>
 *   } 
 * />
 * 
 * // Custom loading fallback
 * <Route 
 *   path="/dashboard" 
 *   element={
 *     <ProtectedRoute fallback={<CustomSpinner />}>
 *       <DashboardPage />
 *     </ProtectedRoute>
 *   } 
 * />
 * ```
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner, Container, Box } from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';
import type { ProtectedRouteProps } from '../types/auth-types';

/**
 * Loading component displayed while checking authentication state.
 * 
 * Features:
 * - Smooth fade-in animation
 * - Accessible loading state
 * - Descriptive loading text
 * - Proper ARIA attributes
 * 
 * @returns JSX element with centered spinner
 */
const AuthLoadingSpinner: React.FC = () => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease-in-out'
    }}
    role="status"
    aria-live="polite"
    aria-label="Checking authentication"
  >
    <Container>
      <Box textAlign="center" padding="xxl">
        <div
          style={{
            animation: 'spin 1s linear infinite'
          }}
        >
          <Spinner size="large" />
        </div>
        <Box 
          variant="h4" 
          color="text-body-secondary" 
          margin={{ top: 'm' }}
          fontWeight="normal"
        >
          Verifying access...
        </Box>
        <Box 
          variant="p" 
          color="text-body-secondary" 
          margin={{ top: 's' }}
          fontSize="body-s"
        >
          Please wait while we check your authentication
        </Box>
      </Box>
    </Container>
    
    {/* CSS animations */}
    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

/**
 * Protected route component that checks authentication before rendering children.
 * 
 * Features:
 * - Displays loading spinner while checking authentication state
 * - Redirects to login if user is not authenticated
 * - Stores original URL in location state for redirect after login
 * - Renders children if user is authenticated
 * - Handles session expiration by redirecting to login with message
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/login',
  fallback
}) => {
  const { user, isLoading, isAuthenticated, isInitialized, error } = useAuth();
  const location = useLocation();
  const [showContent, setShowContent] = React.useState(false);

  // Handle smooth transitions when authentication state changes
  React.useEffect(() => {
    if (isInitialized && !isLoading && isAuthenticated && user) {
      // In test environment, show content immediately
      if (process.env.NODE_ENV === 'test') {
        setShowContent(true);
      } else {
        // Add a small delay for smooth transition in production
        const timer = setTimeout(() => {
          setShowContent(true);
        }, 100);
        
        return () => clearTimeout(timer);
      }
    } else {
      setShowContent(false);
    }
  }, [isInitialized, isLoading, isAuthenticated, user]);

  // Show loading spinner while authentication state is being determined
  if (isLoading || !isInitialized) {
    return fallback || <AuthLoadingSpinner />;
  }

  // Handle authentication errors that indicate session expiration
  if (error && (
    error.code === 'TokenExpiredException' ||
    error.code === 'NotAuthenticatedException' ||
    error.code === 'AccessDeniedException'
  )) {
    console.log('Session expired, redirecting to login');
    
    return (
      <Navigate
        to={redirectTo}
        state={{
          from: location,
          message: 'Your session has expired. Please log in again.'
        }}
        replace
      />
    );
  }

  // Redirect to login if user is not authenticated
  if (!isAuthenticated || !user) {
    console.log('User not authenticated, redirecting to login');
    
    return (
      <Navigate
        to={redirectTo}
        state={{
          from: location,
          message: undefined // No message for regular unauthenticated access
        }}
        replace
      />
    );
  }

  // Show loading while waiting for smooth transition
  if (isAuthenticated && user && !showContent) {
    return fallback || <AuthLoadingSpinner />;
  }

  // User is authenticated, render the protected content with smooth transition
  console.log('User authenticated, rendering protected content');
  return (
    <div
      style={{
        animation: 'slideInContent 0.3s ease-out',
        opacity: showContent ? 1 : 0,
        transform: showContent ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out'
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

export default ProtectedRoute;