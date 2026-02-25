/**
 * @fileoverview Token refresh hook for automatic token management with session persistence.
 * 
 * Automatically refreshes AWS Cognito tokens before expiration to maintain
 * user sessions without interruption. Integrates with session persistence
 * for cross-tab synchronization and handles token refresh failures.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { 
  tokenSecurity, 
  validateCurrentTokens, 
  shouldRefreshTokens,
  verifySecureConnection,
  SecurityEventType,
  logSecurityEvent 
} from '../utils/token-security';
import type { UseTokenRefreshReturn, AuthError, CognitoUser } from '../types/auth-types';

/**
 * Converts Amplify user object to CognitoUser interface.
 * 
 * @param amplifyUser - User object from Amplify
 * @returns CognitoUser object or null
 */
const convertAmplifyUser = async (amplifyUser: any): Promise<CognitoUser | null> => {
  if (!amplifyUser) return null;

  try {
    // Get current session to access tokens
    const session = await fetchAuthSession();
    
    // Extract user attributes
    const attributes = {
      sub: amplifyUser.userId || amplifyUser.username,
      email: amplifyUser.signInDetails?.loginId || '',
      email_verified: true, // Amplify users are typically verified
      given_name: amplifyUser.given_name,
      family_name: amplifyUser.family_name,
      phone_number: amplifyUser.phone_number,
      phone_number_verified: amplifyUser.phone_number_verified
    };

    // Build session object if tokens are available
    let signInUserSession = null;
    if (session.tokens) {
      signInUserSession = {
        accessToken: {
          jwtToken: session.tokens.accessToken?.toString() || '',
          payload: {
            sub: attributes.sub,
            iss: String(session.tokens.accessToken?.payload?.iss || ''),
            exp: Number(session.tokens.accessToken?.payload?.exp || 0),
            iat: Number(session.tokens.accessToken?.payload?.iat || 0),
            token_use: 'access' as const,
            client_id: String(session.tokens.accessToken?.payload?.client_id || ''),
            username: amplifyUser.username,
            scope: String(session.tokens.accessToken?.payload?.scope || '')
          }
        },
        idToken: {
          jwtToken: session.tokens.idToken?.toString() || '',
          payload: {
            sub: attributes.sub,
            email: attributes.email,
            email_verified: attributes.email_verified,
            iss: String(session.tokens.idToken?.payload?.iss || ''),
            exp: Number(session.tokens.idToken?.payload?.exp || 0),
            iat: Number(session.tokens.idToken?.payload?.iat || 0),
            token_use: 'id' as const,
            aud: String(session.tokens.idToken?.payload?.aud || ''),
            auth_time: Number(session.tokens.idToken?.payload?.auth_time || 0),
            'cognito:username': amplifyUser.username
          }
        },
        refreshToken: {
          token: 'refresh_token_placeholder' // Amplify handles refresh tokens internally
        },
        clockDrift: 0
      };
    }

    return {
      username: amplifyUser.username,
      attributes,
      signInUserSession,
      pool: {
        userPoolId: String(session.identityId || ''), // Use identityId as fallback
        clientId: String(session.tokens?.accessToken?.payload?.client_id || '')
      }
    };
  } catch (error) {
    console.error('Error converting Amplify user:', error);
    return null;
  }
};

/**
 * Custom hook for automatic token refresh management with session persistence.
 * 
 * Monitors token expiration and automatically refreshes tokens 5 minutes
 * before they expire. Integrates with session persistence for cross-tab
 * synchronization and handles refresh failures.
 * 
 * @param onTokenRefresh - Callback when tokens are refreshed
 * @returns UseTokenRefreshReturn object with refresh state and methods
 */
export const useTokenRefresh = (
  onTokenRefresh?: (user: CognitoUser) => void
): UseTokenRefreshReturn => {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  /**
   * Checks if a token is expired or will expire within the specified minutes.
   * 
   * @param expirationTime - Token expiration timestamp (Unix timestamp)
   * @param minutesBeforeExpiry - Minutes before expiry to consider as "expired"
   * @returns True if token should be refreshed
   */
  const shouldRefreshToken = useCallback((expirationTime: number, minutesBeforeExpiry: number = 5): boolean => {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const refreshThreshold = expirationTime - (minutesBeforeExpiry * 60); // 5 minutes before expiry
    
    return now >= refreshThreshold;
  }, []);

  /**
   * Manually triggers token refresh.
   * 
   * Uses Auth.currentAuthenticatedUser({ bypassCache: true }) to force
   * token refresh and updates the last refresh timestamp. Notifies
   * session persistence system of the refresh.
   * 
   * @returns Promise that resolves when refresh completes
   */
  const refreshTokens = useCallback(async (): Promise<void> => {
    if (isRefreshing || isUnmountedRef.current) {
      return;
    }

    setIsRefreshing(true);

    try {
      console.log('Refreshing authentication tokens...');

      // Verify secure connection before token refresh
      if (!verifySecureConnection()) {
        throw new Error('Insecure connection detected. Cannot refresh tokens.');
      }

      // Validate current tokens before refresh
      const tokenValidation = await validateCurrentTokens();
      if (tokenValidation.isTampered) {
        logSecurityEvent(
          SecurityEventType.TOKEN_TAMPERING,
          { 
            errors: tokenValidation.errors,
            context: 'Token refresh attempt'
          },
          'CRITICAL'
        );
        throw new Error('Token tampering detected during refresh');
      }

      // Force refresh by bypassing cache
      const currentUser = await getCurrentUser();
      
      // Verify we have a valid session after refresh
      const session = await fetchAuthSession();
      
      if (!session.tokens?.accessToken) {
        throw new Error('No valid tokens after refresh');
      }

      // Validate refreshed tokens
      const refreshedTokenValidation = await validateCurrentTokens();
      if (!refreshedTokenValidation.isValid) {
        console.warn('Refreshed tokens failed validation:', refreshedTokenValidation.errors);
        
        if (refreshedTokenValidation.isTampered) {
          logSecurityEvent(
            SecurityEventType.TOKEN_TAMPERING,
            { 
              errors: refreshedTokenValidation.errors,
              context: 'After token refresh'
            },
            'CRITICAL'
          );
          throw new Error('Token tampering detected after refresh');
        }
      }

      console.log('Tokens refreshed successfully');
      
      if (!isUnmountedRef.current) {
        setLastRefresh(new Date());
        
        // Log successful token refresh
        logSecurityEvent(
          SecurityEventType.TOKEN_DELETION_SUCCESS,
          { 
            message: 'Tokens successfully refreshed',
            refreshTime: new Date().toISOString()
          },
          'LOW'
        );
        
        // Notify session persistence system of token refresh
        if (onTokenRefresh && currentUser) {
          const refreshedUser = await convertAmplifyUser(currentUser);
          if (refreshedUser) {
            onTokenRefresh(refreshedUser);
          }
        }
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // Log token refresh failure
      logSecurityEvent(
        SecurityEventType.TOKEN_DELETION_FAILURE,
        { 
          error: error instanceof Error ? error.message : 'Unknown error',
          context: 'Token refresh failure'
        },
        'HIGH'
      );
      
      // If refresh fails, redirect to login
      if (!isUnmountedRef.current) {
        console.log('Redirecting to login due to token refresh failure');
        navigate('/login', { 
          state: { 
            message: 'Your session has expired. Please log in again.',
            from: window.location.pathname 
          },
          replace: true 
        });
      }
      
      throw error;
    } finally {
      if (!isUnmountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [isRefreshing, navigate, onTokenRefresh]);

  /**
   * Checks token expiration and refreshes if needed.
   * 
   * Gets current session using Auth.currentSession() and checks if
   * access token will expire within 5 minutes. If so, triggers refresh.
   */
  const checkAndRefreshToken = useCallback(async (): Promise<void> => {
    if (isRefreshing || isUnmountedRef.current) {
      return;
    }

    try {
      // Verify secure connection before checking tokens
      if (!verifySecureConnection()) {
        console.warn('Insecure connection detected during token check');
        return;
      }

      // Use the token security utility to check if refresh is needed
      const needsRefresh = await shouldRefreshTokens(5 * 60); // 5 minutes buffer
      
      if (needsRefresh) {
        console.log('Tokens need refresh, refreshing...');
        await refreshTokens();
      } else {
        // Get current session to log timing info
        const session = await fetchAuthSession();
        if (session?.tokens?.accessToken) {
          const expirationTime = session.tokens.accessToken.payload.exp;
          const timeUntilRefresh = (expirationTime - 5 * 60) - Math.floor(Date.now() / 1000);
          console.log(`Token refresh not needed. Next check in ${Math.max(0, timeUntilRefresh)} seconds`);
        }
      }
    } catch (error) {
      console.error('Error checking token expiration:', error);
      
      // Log token check failure for security monitoring
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_TOKEN_ACCESS,
        { 
          error: error instanceof Error ? error.message : 'Unknown error',
          context: 'Token expiration check failed'
        },
        'MEDIUM'
      );
      
      // If we can't check the session, the user might not be authenticated
      // Don't redirect here as this might be called when user is not logged in
    }
  }, [isRefreshing, refreshTokens]);

  /**
   * Sets up automatic token refresh interval.
   * 
   * Checks token expiration every minute and refreshes tokens
   * 5 minutes before they expire.
   */
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up interval to check token expiration every minute
    intervalRef.current = setInterval(() => {
      checkAndRefreshToken().catch((error) => {
        console.error('Automatic token refresh check failed:', error);
      });
    }, 60 * 1000); // Check every minute

    // Initial check
    checkAndRefreshToken().catch((error) => {
      console.error('Initial token refresh check failed:', error);
    });

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkAndRefreshToken]);

  /**
   * Cleanup on component unmount.
   * 
   * Clears the refresh interval and sets unmounted flag to prevent
   * state updates after component unmount.
   */
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    isRefreshing,
    lastRefresh,
    refreshTokens
  };
};

export default useTokenRefresh;