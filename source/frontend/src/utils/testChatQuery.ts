/**
 * @fileoverview Test utility to diagnose chat message query issues.
 * 
 * This script helps identify whether the issue is with authentication,
 * authorization, or the query itself.
 */

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import amplifyOutputs from '../../amplify_outputs.json';

/**
 * Tests the chat messages query with detailed diagnostics.
 * 
 * @param sessionId - The session ID to query
 */
export const testChatQuery = async (sessionId: string) => {
  console.log('=== Chat Query Diagnostic Test ===');
  console.log('Session ID:', sessionId);
  console.log('');

  // Step 1: Check authentication
  console.log('Step 1: Checking authentication...');
  try {
    const user = await getCurrentUser();
    const session = await fetchAuthSession();
    
    console.log('✓ User authenticated:', user.username);
    console.log('✓ User ID:', user.userId);
    console.log('✓ Has access token:', !!session.tokens?.accessToken);
    console.log('✓ Has ID token:', !!session.tokens?.idToken);
    
    const idToken = session.tokens?.idToken?.toString();
    if (idToken) {
      console.log('✓ ID Token (first 50 chars):', idToken.substring(0, 50) + '...');
    }
    
    // Check token expiry
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExp = session.tokens?.accessToken?.payload?.exp;
    const idTokenExp = session.tokens?.idToken?.payload?.exp;
    
    if (accessTokenExp) {
      const timeLeft = accessTokenExp - now;
      console.log(`✓ Access token expires in: ${Math.floor(timeLeft / 60)} minutes`);
      if (timeLeft < 0) {
        console.error('✗ Access token is EXPIRED!');
        return;
      }
    }
    
    if (idTokenExp) {
      const timeLeft = idTokenExp - now;
      console.log(`✓ ID token expires in: ${Math.floor(timeLeft / 60)} minutes`);
      if (timeLeft < 0) {
        console.error('✗ ID token is EXPIRED!');
        return;
      }
    }
    
    console.log('');
    
    // Step 2: Check Amplify configuration
    console.log('Step 2: Checking Amplify configuration...');
    console.log('✓ GraphQL Endpoint:', amplifyOutputs.api.aws_appsync_graphqlEndpoint);
    console.log('✓ Auth Type:', amplifyOutputs.api.aws_appsync_authenticationType);
    console.log('✓ Region:', amplifyOutputs.api.aws_appsync_region);
    console.log('✓ User Pool ID:', amplifyOutputs.auth.user_pool_id);
    console.log('');
    
    // Step 3: Make raw fetch request to test
    console.log('Step 3: Testing raw GraphQL request...');
    
    const query = `
      query ListChatMessages($sessionId: ID!) {
        listChatMessages(sessionId: $sessionId, limit: 10) {
          items {
            id
            agentName
            message
            timestamp
          }
        }
      }
    `;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header based on auth type
    if (amplifyOutputs.api.aws_appsync_authenticationType === 'AMAZON_COGNITO_USER_POOLS') {
      if (idToken) {
        headers['Authorization'] = idToken;
        console.log('✓ Using Cognito User Pool auth with ID token');
      } else {
        console.error('✗ No ID token available for Cognito auth');
        return;
      }
    }
    
    console.log('Making request to:', amplifyOutputs.api.aws_appsync_graphqlEndpoint);
    console.log('Headers:', Object.keys(headers));
    console.log('');
    
    const response = await fetch(amplifyOutputs.api.aws_appsync_graphqlEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { sessionId }
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('');
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    console.log('');
    
    if (response.status === 401) {
      console.error('✗ 401 Unauthorized Error');
      console.error('This means AppSync rejected the authentication token.');
      console.error('');
      console.error('Possible causes:');
      console.error('1. Token is not being sent in the correct header');
      console.error('2. Token format is incorrect');
      console.error('3. AppSync API is not configured to accept this auth type');
      console.error('4. User Pool configuration mismatch');
      console.error('');
      console.error('Check:');
      console.error('- AppSync Console > API > Settings > Authorization');
      console.error('- Verify "Amazon Cognito User Pool" is configured');
      console.error('- Verify the User Pool ID matches:', amplifyOutputs.auth.user_pool_id);
      return;
    }
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      if (data.errors) {
        console.error('✗ GraphQL errors:', JSON.stringify(data.errors, null, 2));
      } else {
        console.log('✓ Query successful!');
        console.log('✓ Messages returned:', data.data?.listChatMessages?.items?.length || 0);
        console.log('');
        console.log('Sample messages:');
        data.data?.listChatMessages?.items?.slice(0, 3).forEach((msg: any) => {
          console.log(`  - ${msg.agentName}: ${msg.message.substring(0, 50)}...`);
        });
      }
    } else {
      console.error('✗ HTTP Error:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('✗ Test failed with error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
  
  console.log('');
  console.log('=== End Diagnostic Test ===');
};

/**
 * Run the test from browser console.
 * 
 * Usage:
 * ```javascript
 * import { testChatQuery } from './utils/testChatQuery';
 * testChatQuery('ca284d34-6139-4688-a293-5e2442291657');
 * ```
 */
export default testChatQuery;
