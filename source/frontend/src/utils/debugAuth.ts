/**
 * @fileoverview Authentication debugging utilities.
 * 
 * Provides functions to diagnose authentication issues with AppSync.
 */

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

/**
 * Gets detailed authentication information for debugging.
 * 
 * @returns Promise resolving to authentication details
 */
export const getAuthDebugInfo = async () => {
  try {
    // Get current user
    const user = await getCurrentUser();
    console.log('[Auth Debug] Current user:', {
      username: user.username,
      userId: user.userId,
      signInDetails: user.signInDetails
    });

    // Get auth session with tokens
    const session = await fetchAuthSession();
    console.log('[Auth Debug] Auth session:', {
      hasAccessToken: !!session.tokens?.accessToken,
      hasIdToken: !!session.tokens?.idToken,
      accessTokenExpiry: session.tokens?.accessToken?.payload?.exp,
      idTokenExpiry: session.tokens?.idToken?.payload?.exp,
      currentTime: Math.floor(Date.now() / 1000),
      isAccessTokenExpired: session.tokens?.accessToken?.payload?.exp 
        ? session.tokens.accessToken.payload.exp < Math.floor(Date.now() / 1000)
        : 'unknown',
      isIdTokenExpired: session.tokens?.idToken?.payload?.exp
        ? session.tokens.idToken.payload.exp < Math.floor(Date.now() / 1000)
        : 'unknown',
      credentials: session.credentials ? {
        hasAccessKeyId: !!session.credentials.accessKeyId,
        hasSecretAccessKey: !!session.credentials.secretAccessKey,
        hasSessionToken: !!session.credentials.sessionToken,
        expiration: session.credentials.expiration
      } : null
    });

    // Return structured data
    return {
      user: {
        username: user.username,
        userId: user.userId
      },
      tokens: {
        accessToken: session.tokens?.accessToken?.toString(),
        idToken: session.tokens?.idToken?.toString(),
        accessTokenExpiry: session.tokens?.accessToken?.payload?.exp,
        idTokenExpiry: session.tokens?.idToken?.payload?.exp
      },
      credentials: session.credentials,
      isAuthenticated: true
    };
  } catch (error) {
    console.error('[Auth Debug] Error getting auth info:', error);
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Tests if tokens are expired.
 * 
 * @returns Promise resolving to token expiry status
 */
export const checkTokenExpiry = async () => {
  try {
    const session = await fetchAuthSession();
    const now = Math.floor(Date.now() / 1000);

    const accessTokenExp = session.tokens?.accessToken?.payload?.exp;
    const idTokenExp = session.tokens?.idToken?.payload?.exp;

    return {
      accessToken: {
        expiry: accessTokenExp,
        isExpired: accessTokenExp ? accessTokenExp < now : null,
        timeUntilExpiry: accessTokenExp ? accessTokenExp - now : null
      },
      idToken: {
        expiry: idTokenExp,
        isExpired: idTokenExp ? idTokenExp < now : null,
        timeUntilExpiry: idTokenExp ? idTokenExp - now : null
      }
    };
  } catch (error) {
    console.error('[Auth Debug] Error checking token expiry:', error);
    return null;
  }
};
