/**
 * @fileoverview Session persistence hook with cross-tab synchronization.
 * 
 * Implements authentication state persistence using Amplify's built-in token storage
 * and cross-tab synchronization using BroadcastChannel API for seamless user experience.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import type { CognitoUser, AuthError } from '../types/auth-types';

/**
 * Session persistence events for cross-tab communication.
 */
interface SessionEvent {
  type: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'SESSION_CHECK';
  timestamp: number;
  userId?: string;
  data?: any;
}

/**
 * Session persistence hook return type.
 */
interface UseSessionPersistenceReturn {
  /** Current authenticated user from session */
  user: CognitoUser | null;
  /** Whether session restoration is in progress */
  isLoading: boolean;
  /** Whether session has been initialized */
  isInitialized: boolean;
  /** Session restoration error */
  error: AuthError | null;
  /** Manually restore session */
  restoreSession: () => Promise<void>;
  /** Clear session and notify other tabs */
  clearSession: () => Promise<void>;
  /** Notify other tabs of login */
  notifyLogin: (user: CognitoUser) => void;
  /** Notify other tabs of logout */
  notifyLogout: () => void;
  /** Notify other tabs of token refresh */
  notifyTokenRefresh: (user: CognitoUser) => void;
}

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
 * Session persistence hook with cross-tab synchronization.
 * 
 * Implements session restoration on app load, automatic token refresh,
 * and cross-tab synchronization using BroadcastChannel API.
 * 
 * @returns Session persistence state and methods
 */
export const useSessionPersistence = (): UseSessionPersistenceReturn => {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  
  // BroadcastChannel for cross-tab communication
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Initialize BroadcastChannel for cross-tab communication.
   */
  const initializeBroadcastChannel = useCallback(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) {
      console.warn('BroadcastChannel not supported in this environment');
      return;
    }

    try {
      broadcastChannelRef.current = new BroadcastChannel('auth-session');
      
      broadcastChannelRef.current.addEventListener('message', (event: MessageEvent<SessionEvent>) => {
        const { type, timestamp, userId, data } = event.data;
        
        console.log('Received session event:', type, { timestamp, userId });

        // Ignore events from the same tab (prevent loops)
        if (Math.abs(Date.now() - timestamp) < 100) {
          return;
        }

        switch (type) {
          case 'LOGIN':
            if (data?.user) {
              console.log('Cross-tab login detected, updating user state');
              setUser(data.user);
              setError(null);
            }
            break;
            
          case 'LOGOUT':
            console.log('Cross-tab logout detected, clearing user state');
            setUser(null);
            setError(null);
            break;
            
          case 'TOKEN_REFRESH':
            if (data?.user && user?.attributes.sub === data.user.attributes.sub) {
              console.log('Cross-tab token refresh detected, updating user state');
              setUser(data.user);
            }
            break;
            
          case 'SESSION_CHECK':
            // Another tab is checking session, we can respond if we have a user
            if (user) {
              broadcastChannelRef.current?.postMessage({
                type: 'LOGIN',
                timestamp: Date.now(),
                userId: user.attributes.sub,
                data: { user }
              } as SessionEvent);
            }
            break;
        }
      });

      console.log('BroadcastChannel initialized for cross-tab synchronization');
    } catch (error) {
      console.error('Failed to initialize BroadcastChannel:', error);
    }
  }, [user]);

  /**
   * Broadcast session event to other tabs.
   * 
   * @param event - Session event to broadcast
   */
  const broadcastEvent = useCallback((event: SessionEvent) => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(event);
        console.log('Broadcasted session event:', event.type);
      } catch (error) {
        console.error('Failed to broadcast session event:', error);
      }
    }
  }, []);

  /**
   * Restore session from Amplify's secure storage.
   * Uses Auth.currentAuthenticatedUser() to check for existing session.
   */
  const restoreSession = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Attempting to restore session from storage...');
      
      // Use Amplify's built-in session restoration
      const currentUser = await getCurrentUser();
      
      if (currentUser) {
        console.log('Session restored successfully:', currentUser.username);
        
        // Convert to CognitoUser format
        const cognitoUser = await convertAmplifyUser(currentUser);
        
        if (cognitoUser) {
          setUser(cognitoUser);
          
          // Notify other tabs about the restored session
          broadcastEvent({
            type: 'LOGIN',
            timestamp: Date.now(),
            userId: cognitoUser.attributes.sub,
            data: { user: cognitoUser }
          });
        } else {
          console.log('Failed to convert user, clearing session');
          setUser(null);
        }
      } else {
        console.log('No existing session found');
        setUser(null);
        
        // Check if other tabs have a session
        broadcastEvent({
          type: 'SESSION_CHECK',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.log('No valid session found:', error);
      setUser(null);
      
      // Only set error for unexpected errors, not for "no session" cases
      if (error && typeof error === 'object' && 'name' in error) {
        const errorName = (error as any).name;
        if (errorName !== 'UserUnAuthenticatedException' && errorName !== 'NotAuthorizedException') {
          setError({
            code: errorName,
            message: 'Failed to restore session',
            name: errorName,
            timestamp: new Date().toISOString()
          });
        }
      }
    } finally {
      setIsLoading(false);
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [isInitialized, broadcastEvent]);

  /**
   * Clear session and notify other tabs.
   */
  const clearSession = useCallback(async (): Promise<void> => {
    console.log('Clearing session...');
    
    // Clear user state immediately
    setUser(null);
    setError(null);
    
    // Notify other tabs about logout
    broadcastEvent({
      type: 'LOGOUT',
      timestamp: Date.now()
    });
  }, [broadcastEvent]);

  /**
   * Notify other tabs of successful login.
   * 
   * @param user - Authenticated user
   */
  const notifyLogin = useCallback((user: CognitoUser) => {
    console.log('Notifying other tabs of login');
    
    broadcastEvent({
      type: 'LOGIN',
      timestamp: Date.now(),
      userId: user.attributes.sub,
      data: { user }
    });
  }, [broadcastEvent]);

  /**
   * Notify other tabs of logout.
   */
  const notifyLogout = useCallback(() => {
    console.log('Notifying other tabs of logout');
    
    broadcastEvent({
      type: 'LOGOUT',
      timestamp: Date.now()
    });
  }, [broadcastEvent]);

  /**
   * Notify other tabs of token refresh.
   * 
   * @param user - User with refreshed tokens
   */
  const notifyTokenRefresh = useCallback((user: CognitoUser) => {
    console.log('Notifying other tabs of token refresh');
    
    broadcastEvent({
      type: 'TOKEN_REFRESH',
      timestamp: Date.now(),
      userId: user.attributes.sub,
      data: { user }
    });
  }, [broadcastEvent]);

  /**
   * Check token expiration and trigger refresh if needed.
   */
  const checkTokenExpiration = useCallback(async () => {
    if (!user?.signInUserSession?.accessToken) {
      return;
    }

    try {
      const accessToken = user.signInUserSession.accessToken;
      const expirationTime = accessToken.payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const timeUntilExpiration = expirationTime - currentTime;

      // Refresh token 5 minutes before expiration
      const refreshThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (timeUntilExpiration <= refreshThreshold && timeUntilExpiration > 0) {
        console.log('Token expiring soon, triggering refresh...');
        
        // Get fresh user data (this will trigger token refresh internally)
        const currentUser = await getCurrentUser();
        const refreshedUser = await convertAmplifyUser(currentUser);
        
        if (refreshedUser) {
          setUser(refreshedUser);
          notifyTokenRefresh(refreshedUser);
          console.log('Token refreshed successfully');
        }
      } else if (timeUntilExpiration <= 0) {
        console.log('Token has expired, clearing session');
        await clearSession();
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If token refresh fails, clear the session
      await clearSession();
    }
  }, [user, notifyTokenRefresh, clearSession]);

  /**
   * Initialize session persistence on mount.
   */
  useEffect(() => {
    initializeBroadcastChannel();
    restoreSession();

    // Set up periodic token expiration check (every minute)
    sessionCheckIntervalRef.current = setInterval(checkTokenExpiration, 60 * 1000);

    return () => {
      // Cleanup
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
      
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, []);

  /**
   * Check token expiration when user changes.
   */
  useEffect(() => {
    if (user) {
      checkTokenExpiration();
    }
  }, [user, checkTokenExpiration]);

  return {
    user,
    isLoading,
    isInitialized,
    error,
    restoreSession,
    clearSession,
    notifyLogin,
    notifyLogout,
    notifyTokenRefresh
  };
};

export default useSessionPersistence;