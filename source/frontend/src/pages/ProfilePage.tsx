/**
 * @fileoverview User profile page component.
 * 
 * Displays user information including email, user ID, and account details.
 * Provides basic profile management functionality with CloudScape components.
 */

import React from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  ColumnLayout,
  FormField,
  Input,
  Button,
  Alert
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';

/**
 * User profile page component.
 * 
 * Features:
 * - Display user email, user ID (sub), and account information
 * - Show email verification status
 * - CloudScape Container and Header components for layout
 * - Future enhancement placeholders for change password and delete account
 */
export const ProfilePage: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Container>
        <Box textAlign="center" padding="xxl">
          Loading profile...
        </Box>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <Alert type="error" header="Access Denied">
          You must be logged in to view your profile.
        </Alert>
      </Container>
    );
  }

  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        <Header variant="h1">
          User Profile
        </Header>

        <ColumnLayout columns={1} variant="text-grid">
          <SpaceBetween direction="vertical" size="m">
            {/* User Email */}
            <FormField label="Email Address">
              <Input
                value={user.attributes.email || 'Not available'}
                readOnly
                disabled
              />
            </FormField>

            {/* User ID */}
            <FormField 
              label="User ID" 
              description="Your unique user identifier"
            >
              <Input
                value={user.attributes.sub || 'Not available'}
                readOnly
                disabled
              />
            </FormField>

            {/* Email Verification Status */}
            <FormField label="Email Verification Status">
              <Box>
                {user.attributes.email_verified ? (
                  <Box color="text-status-success">✓ Verified</Box>
                ) : (
                  <Box color="text-status-warning">⚠ Not Verified</Box>
                )}
              </Box>
            </FormField>

            {/* Username */}
            <FormField label="Username">
              <Input
                value={user.username || 'Not available'}
                readOnly
                disabled
              />
            </FormField>
          </SpaceBetween>
        </ColumnLayout>

        {/* Future Enhancement Placeholders */}
        <SpaceBetween direction="vertical" size="s">
          <Header variant="h3">Account Management</Header>
          
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="normal"
              disabled
            >
              Change Password (Coming Soon)
            </Button>
            
            <Button
              variant="normal"
              disabled
            >
              Delete Account (Coming Soon)
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </SpaceBetween>
    </Container>
  );
};

export default ProfilePage;