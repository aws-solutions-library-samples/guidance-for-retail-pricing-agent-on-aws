/**
 * @fileoverview Authentication context provider for user state management.
 * 
 * Provides user authentication context throughout the application using React Context.
 * Wraps Amplify's Authenticator and extracts user information from ID tokens.
 * Handles token refresh, error states, and cross-component user data sharing.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { 
  tokenSecurity, 
  validateCurrentTokens, 
  verifySecureConnection,
  SecurityEventType,
  logSecurityEvent 
} from '../utils/token-security';
import type { 
  CognitoUser, 
  AuthError, 
  CognitoUserSession,
  CognitoUserAttributes 
} from '../types/auth-types';

/**
 * Authentication context interface.
 * Defines the shape of the authentication context value.
 */
export interface AuthContextValue {
  /** Current authenticated user */
  user: CognitoUser | null;
  /** User ID extracted from ID token (sub claim) */
  userId: string | null;
  /** User email extracted from ID token */
  userEmail: string | null;
  /** User attributes from Cognito */
  userAttributes: CognitoUserAttributes | null;
  /** Current user session with tokens */
  session: CognitoUserSession | null;
  /** Loading state for authentication operations */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether authentication context is initialized */
  isInitialized: boolean;
  /** Current authentication error */
  error: AuthError | null;
  /** Get current user details */
  getCurrentUser: () => Promise<CognitoUser | null>;
  /** Refresh user context and tokens */
  refreshUser: () => Promise<void>;
  /** Clear current error */
  clearError: () => void;
}

/**
 * Authentication context with default values.
 */
const AuthContext = createContext<AuthContextValue>({
  user: null,
  userId: null,
  userEmail: null,
  userAttributes: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  isInitialized: false,
  error: null,
  getCurrentUser: async () => null,
  refreshUser: async () => {},
  clearError: () => {}
});

/**
 * Props for AuthProvider component.
 */
interface AuthProviderProps {
  /** Child components to render */
  children: ReactNode;
}

/**
 * Maps AWS Amplify auth errors to user-friendly error messages.
 * 
 * @param error - Error from AWS Amplify Auth
 * @returns Formatted AuthError object
 */
const mapAuthError = (error: any): AuthError => {
  const timestamp = new Date().toISOString();
  
  const errorCode = error.name || error.code || error.__type || 'UnknownError';
  const errorMessage = error.message || 'An unexpected error occurred';
  
  let userFriendlyMessage: string;

  switch (errorCode) {
    case 'NotAuthorizedException':
      userFriendlyMessage = 'Authentication failed. Please sign in again.';
      break;
    case 'TokenExpiredException':
      userFriendlyMessage = 'Your session has expired. Please sign in again.';
      break;
    case 'UserNotFoundException':
      userFriendlyMessage = 'User not found. Please check your credentials.';
      break;
    case 'NetworkError':
      userFriendlyMessage = 'Network error. Please check your connection and try again.';
      break;
    default:
      userFriendlyMessage = 'An authentication error occurred. Please try again.';
  }

  return {
    code: errorCode,
    message: userFriendlyMessage,
    name: errorCode,
    details: {
      originalMessage: errorMessage,
      originalCode: errorCode
    },
    timestamp
  };
};

/**
 * Converts Amplify user and session to CognitoUser interface.
 * 
 * @param amplifyUser - User object from Amplify
 * @param session - Auth session from Amplify
 * @returns CognitoUser object or null
 */
const convertToCognitoUser = async (amplifyUser: any, session: any): Promise<CognitoUser | null> => {
  if (!amplifyUser || !session?.tokens) return null;

  try {
    // Extract user attributes from ID token
    const idToken = session.tokens.idToken;
    const accessToken = session.tokens.accessToken;
    
    if (!idToken || !accessToken) {
      console.warn('Missing tokens in session');
      return null;
    }

    // Extract user attributes from ID token payload
    const attributes: CognitoUserAttributes = {
      sub: String(idToken.payload.sub || amplifyUser.userId || ''),
      email: String(idToken.payload.email || ''),
      email_verified: Boolean(idToken.payload.email_verified || false),
      given_name: String(idToken.payload.given_name || ''),
      family_name: String(idToken.payload.family_name || ''),
      phone_number: String(idToken.payload.phone_number || ''),
      phone_number_verified: Boolean(idToken.payload.phone_number_verified || false)
    };

    // Build session object with proper token structure
    const signInUserSession: CognitoUserSession = {
      accessToken: {
        jwtToken: accessToken.toString(),
        payload: {
          sub: String(accessToken.payload.sub || ''),
          iss: String(accessToken.payload.iss || ''),
          exp: Number(accessToken.payload.exp || 0),
          iat: Number(accessToken.payload.iat || 0),
          token_use: 'access',
          client_id: String(accessToken.payload.client_id || ''),
          username: String(accessToken.payload.username || amplifyUser.username || ''),
          scope: String(accessToken.payload.scope || '')
        }
      },
      idToken: {
        jwtToken: idToken.toString(),
        payload: {
          sub: attributes.sub,
          email: attributes.email,
          email_verified: attributes.email_verified,
          iss: String(idToken.payload.iss || ''),
          exp: Number(idToken.payload.exp || 0),
          iat: Number(idToken.payload.iat || 0),
          token_use: 'id',
          aud: String(idToken.payload.aud || ''),
          auth_time: Number(idToken.payload.auth_time || 0),
          'cognito:username': String(idToken.payload['cognito:username'] || amplifyUser.username || '')
        }
      },
      refreshToken: {
        token: 'refresh_token_placeholder' // Amplify handles refresh tokens internally
      },
      clockDrift: 0
    };

    return {
      username: amplifyUser.username || attributes.email,
      attributes,
      signInUserSession,
      pool: {
        userPoolId: String(session.userPoolId || ''),
        clientId: String(accessToken.payload.client_id || '')
      }
    };
  } catch (error) {
    console.error('Error converting to CognitoUser:', error);
    return null;
  }
};

/**
 * Authentication provider component that wraps Amplify's Authenticator.
 * 
 * Provides user context throughout the application with automatic token refresh,
 * user information extraction from ID tokens, and error handling.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [session, setSession] = useState<CognitoUserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  // Derived state from user object
  const userId = user?.attributes?.sub || null;
  const userEmail = user?.attributes?.email || null;
  const userAttributes = user?.attributes || null;
  const isAuthenticated = !!user && !!session;

  /**
   * Clears the current authentication error.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Gets current user details from Amplify and converts to CognitoUser.
   * 
   * @returns Promise resolving to CognitoUser or null
   */
  const getCurrentUserDetails = useCallback(async (): Promise<CognitoUser | null> => {
    try {
      setError(null);
      
      // Verify secure connection first
      if (!verifySecureConnection()) {
        throw new Error('Insecure connection detected. Authentication requires HTTPS.');
      }

      // Validate current session tokens for security
      const tokenValidation = await validateCurrentTokens();
      if (!tokenValidation.isValid) {
        console.warn('Token validation failed:', tokenValidation.errors);
        
        if (tokenValidation.isTampered) {
          logSecurityEvent(
            SecurityEventType.TOKEN_TAMPERING,
            { errors: tokenValidation.errors },
            'CRITICAL'
          );
          throw new Error('Token tampering detected');
        }
        
        if (tokenValidation.isExpired) {
          logSecurityEvent(
            SecurityEventType.TOKEN_EXPIRED,
            { errors: tokenValidation.errors },
            'MEDIUM'
          );
          throw new Error('Tokens have expired');
        }
      }
      
      // Get current user and session from Amplify
      const [amplifyUser, authSession] = await Promise.all([
        getCurrentUser(),
        fetchAuthSession()
      ]);

      if (!amplifyUser) {
        console.log('No current user found');
        return null;
      }

      // Validate session and tokens
      if (!authSession?.tokens?.idToken || !authSession?.tokens?.accessToken) {
        console.warn('Invalid or missing tokens in session');
        throw new Error('Invalid session tokens');
      }

      // Additional token expiration check with security logging
      const now = Math.floor(Date.now() / 1000);
      const idTokenExp = Number(authSession.tokens.idToken.payload.exp || 0);
      const accessTokenExp = Number(authSession.tokens.accessToken.payload.exp || 0);

      if (idTokenExp <= now || accessTokenExp <= now) {
        console.warn('Tokens are expired');
        logSecurityEvent(
          SecurityEventType.TOKEN_EXPIRED,
          { 
            idTokenExp: new Date(idTokenExp * 1000).toISOString(),
            accessTokenExp: new Date(accessTokenExp * 1000).toISOString(),
            currentTime: new Date().toISOString()
          },
          'MEDIUM'
        );
        throw new Error('Tokens have expired');
      }

      // Convert to CognitoUser format
      const cognitoUser = await convertToCognitoUser(amplifyUser, authSession);
      
      if (!cognitoUser) {
        throw new Error('Failed to convert user data');
      }

      console.log('Successfully retrieved current user:', {
        userId: cognitoUser.attributes.sub,
        email: cognitoUser.attributes.email,
        username: cognitoUser.username
      });

      return cognitoUser;
    } catch (err) {
      console.error('Error getting current user:', err);
      const authError = mapAuthError(err);
      setError(authError);
      return null;
    }
  }, []);

  /**
   * Refreshes user context and tokens.
   * Called when tokens are refreshed or user data needs to be updated.
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const cognitoUser = await getCurrentUserDetails();
      
      if (cognitoUser) {
        setUser(cognitoUser);
        setSession(cognitoUser.signInUserSession);
        console.log('User context refreshed successfully');
      } else {
        // Clear user state if no valid user found
        setUser(null);
        setSession(null);
        console.log('No valid user found, cleared user state');
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
      const authError = mapAuthError(err);
      setError(authError);
      
      // Clear user state on error
      setUser(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [getCurrentUserDetails]);

  /**
   * Initialize authentication state on component mount.
   */
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        console.log('Initializing authentication context...');

        // Verify secure connection on initialization
        if (!verifySecureConnection()) {
          const error = new Error('Insecure connection detected');
          setError(mapAuthError(error));
          return;
        }

        // Validate secure storage
        if (!tokenSecurity.validateSecureStorage()) {
          console.warn('Insecure token storage detected during initialization');
        }

        // Try to get current user
        const cognitoUser = await getCurrentUserDetails();
        
        if (cognitoUser) {
          setUser(cognitoUser);
          setSession(cognitoUser.signInUserSession);
          console.log('Authentication context initialized with user');
        } else {
          console.log('Authentication context initialized without user');
        }
      } catch (err) {
        console.error('Error initializing authentication:', err);
        const authError = mapAuthError(err);
        setError(authError);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [getCurrentUserDetails]);

  /**
   * Set up token refresh listener and security monitoring.
   * Listen for token refresh events and update user context accordingly.
   */
  useEffect(() => {
    const handleTokenRefresh = () => {
      console.log('Token refresh detected, updating user context...');
      refreshUser();
    };

    // Listen for custom token refresh events
    window.addEventListener('tokenRefresh', handleTokenRefresh);

    // Set up periodic token validation with security checks (every 5 minutes)
    const tokenValidationInterval = setInterval(async () => {
      if (user && session) {
        try {
          // Comprehensive token validation with security checks
          const tokenValidation = await validateCurrentTokens();
          
          if (!tokenValidation.isValid) {
            console.warn('Token validation failed:', tokenValidation.errors);
            
            if (tokenValidation.isTampered) {
              logSecurityEvent(
                SecurityEventType.TOKEN_TAMPERING,
                { 
                  errors: tokenValidation.errors,
                  userId: user.attributes.sub,
                  userEmail: user.attributes.email
                },
                'CRITICAL'
              );
              // Force logout on token tampering
              setUser(null);
              setSession(null);
              setError(mapAuthError(new Error('Token tampering detected. Please sign in again.')));
              return;
            }
            
            if (tokenValidation.isExpired) {
              console.warn('Tokens expired, refreshing user context');
              await refreshUser();
            }
          }

          // Verify secure connection periodically
          if (!verifySecureConnection()) {
            console.error('Insecure connection detected during token validation');
            setError(mapAuthError(new Error('Insecure connection detected')));
          }

          // Validate secure storage periodically
          if (!tokenSecurity.validateSecureStorage()) {
            console.warn('Insecure token storage detected during validation');
          }
        } catch (err) {
          console.warn('Token validation failed:', err);
          // Don't set error here as this is a background check
        }
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      window.removeEventListener('tokenRefresh', handleTokenRefresh);
      clearInterval(tokenValidationInterval);
    };
  }, [user, session, refreshUser]);

  /**
   * Listen for authentication state changes from Amplify.
   */
  useEffect(() => {
    const handleAuthStateChange = (event: any) => {
      console.log('Auth state change detected:', event.detail);
      
      switch (event.detail.authStatus) {
        case 'authenticated':
          console.log('User authenticated, refreshing context');
          refreshUser();
          break;
        case 'unauthenticated':
          console.log('User unauthenticated, clearing context');
          setUser(null);
          setSession(null);
          setError(null);
          break;
        default:
          console.log('Unknown auth state:', event.detail.authStatus);
      }
    };

    // Listen for Amplify auth state changes
    window.addEventListener('amplifyAuthStateChange', handleAuthStateChange);

    return () => {
      window.removeEventListener('amplifyAuthStateChange', handleAuthStateChange);
    };
  }, [refreshUser]);

  // Context value
  const contextValue: AuthContextValue = {
    user,
    userId,
    userEmail,
    userAttributes,
    session,
    isLoading,
    isAuthenticated,
    isInitialized,
    error,
    getCurrentUser: getCurrentUserDetails,
    refreshUser,
    clearError
  };

  return (
    <AuthContext.Provider value={contextValue}>
      <Authenticator.Provider>
        {children}
      </Authenticator.Provider>
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to access authentication context.
 * 
 * @returns AuthContextValue object
 * @throws Error if used outside of AuthProvider
 */
export const useAuthContext = (): AuthContextValue => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthProvider;