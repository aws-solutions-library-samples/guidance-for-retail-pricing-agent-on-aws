/**
 * @fileoverview OAuth callback handler component for Midway OIDC integration.
 * 
 * Handles the OAuth authorization code exchange after successful
 * authentication with Midway OIDC provider and manages redirect flow.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Header,
  Spinner,
  Alert,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';

/**
 * OAuth callback component that handles the redirect from Midway OIDC.
 * 
 * This component:
 * - Processes the OAuth authorization code from URL parameters
 * - Exchanges the code for tokens via Amplify
 * - Handles success and error states
 * - Redirects to the appropriate page after processing
 */
export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, error, clearError } = useAuth();
  
  const [isProcessing, setIsProcessing] = useState(true);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        console.log('Processing OAuth callback...');
        
        // Parse URL parameters
        const urlParams = new URLSearchParams(location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const errorParam = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        // Handle OAuth errors
        if (errorParam) {
          const errorMessage = errorDescription || `OAuth error: ${errorParam}`;
          console.error('OAuth callback error:', errorMessage);
          setCallbackError(errorMessage);
          setIsProcessing(false);
          return;
        }

        // Validate authorization code
        if (!code) {
          console.error('No authorization code received in OAuth callback');
          setCallbackError('Invalid OAuth callback: missing authorization code');
          setIsProcessing(false);
          return;
        }

        console.log('Authorization code received, processing...');
        
        // Amplify will automatically handle the token exchange
        // We just need to wait for the authentication state to update
        
        // Set a timeout to avoid infinite waiting
        const timeout = setTimeout(() => {
          if (!isAuthenticated) {
            console.error('OAuth callback timeout: authentication not completed');
            setCallbackError('Authentication timeout. Please try again.');
            setIsProcessing(false);
          }
        }, 10000); // 10 second timeout

        // Clear timeout if authentication succeeds
        if (isAuthenticated) {
          clearTimeout(timeout);
        }

      } catch (err) {
        console.error('OAuth callback processing error:', err);
        setCallbackError(
          err instanceof Error 
            ? err.message 
            : 'An unexpected error occurred during authentication'
        );
        setIsProcessing(false);
      }
    };

    processOAuthCallback();
  }, [location.search, isAuthenticated]);

  // Handle successful authentication
  useEffect(() => {
    if (isAuthenticated && isProcessing) {
      console.log('OAuth authentication successful, redirecting...');
      setIsProcessing(false);
      
      // Get redirect URL from state parameter or default to home
      const urlParams = new URLSearchParams(location.search);
      const state = urlParams.get('state');
      let redirectUrl = '/';
      
      try {
        if (state) {
          const stateData = JSON.parse(decodeURIComponent(state));
          redirectUrl = stateData.redirectUrl || '/';
        }
      } catch (err) {
        console.warn('Failed to parse state parameter:', err);
      }
      
      // Redirect to target page
      navigate(redirectUrl, { replace: true });
    }
  }, [isAuthenticated, isProcessing, location.search, navigate]);

  // Handle authentication errors
  useEffect(() => {
    if (error && isProcessing) {
      console.error('Authentication error during OAuth callback:', error);
      setCallbackError(error.message);
      setIsProcessing(false);
    }
  }, [error, isProcessing]);

  /**
   * Handles retry button click.
   */
  const handleRetry = () => {
    setCallbackError(null);
    clearError();
    navigate('/login', { replace: true });
  };

  /**
   * Handles manual redirect to login.
   */
  const handleGoToLogin = () => {
    navigate('/login', { replace: true });
  };

  // Show processing state
  if (isProcessing) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h1">
            Completing Sign In
          </Header>
          
          <Box textAlign="center">
            <SpaceBetween direction="vertical" size="m">
              <Spinner size="large" />
              <Box variant="p">
                Processing your authentication with Amazon...
              </Box>
              <Box variant="small" color="text-status-info">
                This may take a few moments. Please do not close this window.
              </Box>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Container>
    );
  }

  // Show error state
  if (callbackError) {
    return (
      <Container>
        <SpaceBetween direction="vertical" size="l">
          <Header variant="h1">
            Sign In Failed
          </Header>
          
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header="Authentication Error"
            action={
              <Button onClick={handleRetry}>
                Try Again
              </Button>
            }
          >
            {callbackError}
          </Alert>
          
          <Box textAlign="center">
            <button
              onClick={handleGoToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#0073bb',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Return to Login Page
            </button>
          </Box>
        </SpaceBetween>
      </Container>
    );
  }

  // This should not be reached, but provide fallback
  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        <Header variant="h1">
          Redirecting...
        </Header>
        
        <Box textAlign="center">
          <Spinner size="normal" />
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default OAuthCallback;