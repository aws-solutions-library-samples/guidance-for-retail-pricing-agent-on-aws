/**
 * @fileoverview Amplify GraphQL client using the standard Amplify approach.
 * 
 * Simple, clean GraphQL client setup using AWS Amplify's generateClient()
 * with automatic authentication, caching, and real-time subscriptions.
 */

import { generateClient } from 'aws-amplify/api';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

/**
 * Amplify GraphQL client instance.
 * 
 * This client automatically handles:
 * - Authentication (API Key, Cognito, IAM)
 * - Caching and offline support
 * - Real-time subscriptions
 * - Error handling and retries
 */
export const client = generateClient();

/**
 * Get current authentication status.
 */
export const getAuthStatus = async () => {
  try {
    const user = await getCurrentUser();
    const session = await fetchAuthSession();
    
    return {
      isAuthenticated: !!user,
      user,
      hasValidSession: !!session.tokens?.accessToken
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      user: null,
      hasValidSession: false
    };
  }
};

/**
 * Test GraphQL connection.
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    // Simple introspection query
    const result = await client.graphql({
      query: `query { __typename }`
    });
    
    return !!(result as any).data;
  } catch (error) {
    console.error('GraphQL connection test failed:', error);
    return false;
  }
};