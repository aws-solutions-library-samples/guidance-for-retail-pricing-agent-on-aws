/**
 * @fileoverview Authentication debugging utilities.
 * 
 * Provides utilities for debugging authentication issues in development.
 */

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { isDevelopment } from './environment';

/**
 * Debug information about the current authentication state.
 */
export interface AuthDebugInfo {
  hasSession: boolean;
  hasTokens: boolean;
  hasUser: boolean;
  tokenInfo?: {
    accessTokenPresent: boolean;
    idTokenPresent: boolean;
    refreshTokenPresent: boolean;
  };
  userInfo?: {
    userId: string;
    username: string;
    email?: string;
  };
  errors: string[];
}

/**
 * Gets comprehensive debug information about the current authentication state.
 * Only works in development mode for security.
 * 
 * @returns Promise resolving to debug information
 */
export async function getAuthDebugInfo(): Promise<AuthDebugInfo> {
  const debugInfo: AuthDebugInfo = {
    hasSession: false,
    hasTokens: false,
    hasUser: false,
    errors: []
  };

  if (!isDevelopment()) {
    debugInfo.errors.push('Auth debugging only available in development mode');
    return debugInfo;
  }

  try {
    // Check session
    const session = await fetchAuthSession();
    debugInfo.hasSession = !!session;

    if (session.tokens) {
      debugInfo.hasTokens = true;
      debugInfo.tokenInfo = {
        accessTokenPresent: !!session.tokens.accessToken,
        idTokenPresent: !!session.tokens.idToken,
        // Note: refreshToken is not directly exposed in the tokens object
        refreshTokenPresent: false
      };
    }

    // Check user
    try {
      const user = await getCurrentUser();
      debugInfo.hasUser = !!user;
      
      if (user) {
        debugInfo.userInfo = {
          userId: user.userId,
          username: user.username,
          email: user.signInDetails?.loginId
        };
      }
    } catch (userError) {
      debugInfo.errors.push(`User error: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
    }

  } catch (sessionError) {
    debugInfo.errors.push(`Session error: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}`);
  }

  return debugInfo;
}

/**
 * Logs authentication debug information to console.
 * Only works in development mode.
 */
export async function logAuthDebugInfo(): Promise<void> {
  if (!isDevelopment()) {
    console.warn('Auth debugging only available in development mode');
    return;
  }

  const debugInfo = await getAuthDebugInfo();
  
  console.group('🔐 Authentication Debug Info');
  console.log('Has Session:', debugInfo.hasSession);
  console.log('Has Tokens:', debugInfo.hasTokens);
  console.log('Has User:', debugInfo.hasUser);
  
  if (debugInfo.tokenInfo) {
    console.group('Token Information');
    console.log('Access Token:', debugInfo.tokenInfo.accessTokenPresent ? '✅' : '❌');
    console.log('ID Token:', debugInfo.tokenInfo.idTokenPresent ? '✅' : '❌');
    console.log('Refresh Token:', debugInfo.tokenInfo.refreshTokenPresent ? '✅' : '❌');
    console.groupEnd();
  }
  
  if (debugInfo.userInfo) {
    console.group('User Information');
    console.log('User ID:', debugInfo.userInfo.userId);
    console.log('Username:', debugInfo.userInfo.username);
    console.log('Email:', debugInfo.userInfo.email || 'Not available');
    console.groupEnd();
  }
  
  if (debugInfo.errors.length > 0) {
    console.group('Errors');
    debugInfo.errors.forEach(error => console.error(error));
    console.groupEnd();
  }
  
  console.groupEnd();
}

/**
 * Clears all authentication-related data from localStorage.
 * Only works in development mode for debugging purposes.
 */
export function clearAuthDebugData(): void {
  if (!isDevelopment()) {
    console.warn('Auth debugging only available in development mode');
    return;
  }

  const keysToRemove: string[] = [];
  
  // Find all authentication-related keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('CognitoIdentityServiceProvider') ||
      key.includes('amplify-') ||
      key.includes('aws-amplify-') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('auth')
    )) {
      keysToRemove.push(key);
    }
  }

  // Remove the keys
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`Removed: ${key}`);
  });

  console.log(`Cleared ${keysToRemove.length} authentication-related items from localStorage`);
}

// Auto-log debug info in development when this module is imported
if (isDevelopment()) {
  // Delay to allow Amplify to initialize
  setTimeout(() => {
    logAuthDebugInfo().catch(error => {
      console.error('Failed to log auth debug info:', error);
    });
  }, 2000);
}