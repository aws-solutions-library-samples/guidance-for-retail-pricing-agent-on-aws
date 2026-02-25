/**
 * @fileoverview User profile component demonstrating AuthContext usage.
 * 
 * Shows how to access user information from the AuthContext including
 * user ID, email, and other attributes extracted from ID tokens.
 */

import React from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  ColumnLayout,
  StatusIndicator,
  Button
} from '@cloudscape-design/components';
import { useAuthContext } from '../contexts/AuthContext';

/**
 * User profile component that displays current user information.
 * 
 * Demonstrates how to use the AuthContext to access:
 * - User ID (sub claim from ID token)
 * - User email (from ID token)
 * - User attributes
 * - Authentication status
 * - Session information
 * 
 * @returns JSX element
 */
export const UserProfile: React.FC = () => {
  const {
    user,
    userId,
    userEmail,
    userAttributes,
    session,
    isAuthenticated,
    isLoading,
    error,
    getCurrentUser,
    refreshUser,
    clearError
  } = useAuthContext();

  /**
   * Handles refreshing user data.
   */
  const handleRefreshUser = async () => {
    try {
      await refreshUser();
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  /**
   * Handles getting current user details.
   */
  const handleGetCurrentUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      console.log('Current user:', currentUser);
    } catch (err) {
      console.error('Failed to get current user:', err);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <StatusIndicator type="loading">Loading user profile...</StatusIndicator>
        </Box>
      </Container>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <StatusIndicator type="error">Not authenticated</StatusIndicator>
        </Box>
      </Container>
    );
  }

  return (
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={handleRefreshUser}>Refresh User</Button>
              <Button onClick={handleGetCurrentUser}>Get Current User</Button>
              {error && <Button onClick={clearError}>Clear Error</Button>}
            </SpaceBetween>
          }
        >
          User Profile
        </Header>

        {error && (
          <Box>
            <StatusIndicator type="error">
              {error.message}
            </StatusIndicator>
          </Box>
        )}

        <ColumnLayout columns={2} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">User ID (Sub Claim)</Box>
            <Box>{userId || 'Not available'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Email</Box>
            <Box>{userEmail || 'Not available'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Username</Box>
            <Box>{user.username || 'Not available'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Email Verified</Box>
            <Box>
              <StatusIndicator type={userAttributes?.email_verified ? 'success' : 'warning'}>
                {userAttributes?.email_verified ? 'Verified' : 'Not verified'}
              </StatusIndicator>
            </Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Given Name</Box>
            <Box>{userAttributes?.given_name || 'Not provided'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Family Name</Box>
            <Box>{userAttributes?.family_name || 'Not provided'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Phone Number</Box>
            <Box>{userAttributes?.phone_number || 'Not provided'}</Box>
          </div>
          
          <div>
            <Box variant="awsui-key-label">Phone Verified</Box>
            <Box>
              <StatusIndicator type={userAttributes?.phone_number_verified ? 'success' : 'warning'}>
                {userAttributes?.phone_number_verified ? 'Verified' : 'Not verified'}
              </StatusIndicator>
            </Box>
          </div>
        </ColumnLayout>

        {session && (
          <Container>
            <Header variant="h2">Session Information</Header>
            <ColumnLayout columns={2} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">Access Token Expiry</Box>
                <Box>
                  {new Date(session.accessToken.payload.exp * 1000).toLocaleString()}
                </Box>
              </div>
              
              <div>
                <Box variant="awsui-key-label">ID Token Expiry</Box>
                <Box>
                  {new Date(session.idToken.payload.exp * 1000).toLocaleString()}
                </Box>
              </div>
              
              <div>
                <Box variant="awsui-key-label">Token Issuer</Box>
                <Box>{session.idToken.payload.iss}</Box>
              </div>
              
              <div>
                <Box variant="awsui-key-label">Client ID</Box>
                <Box>{session.accessToken.payload.client_id}</Box>
              </div>
            </ColumnLayout>
          </Container>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default UserProfile;