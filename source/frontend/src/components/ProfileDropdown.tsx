/**
 * @fileoverview Profile dropdown component for user authentication.
 * 
 * Provides a dropdown menu with user profile information and logout functionality.
 * Displays user email, navigation to profile page, and secure logout with loading state.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ButtonDropdown, 
  Box, 
  SpaceBetween,
  Modal,
  Button,
  Header,
  Spinner
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';
import type { CognitoUser } from '../types/auth-types';

/**
 * Props for ProfileDropdown component.
 */
export interface ProfileDropdownProps {
  /** Current authenticated user */
  user: CognitoUser;
  /** Optional callback when logout completes */
  onLogout?: () => void;
  /** Whether to show logout confirmation dialog */
  showLogoutConfirmation?: boolean;
}

/**
 * Gets user initials from email address.
 * 
 * @param email - User's email address
 * @returns First letter of email in uppercase
 */
const getUserInitials = (email: string): string => {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
};

/**
 * Profile dropdown component that displays user information and logout option.
 * 
 * Features:
 * - User email display as dropdown trigger
 * - User avatar/initials display
 * - Profile navigation menu item
 * - Logout menu item with confirmation dialog
 * - Loading state during logout
 * 
 * @param props - Component props
 * @returns ProfileDropdown component
 */
export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  user,
  onLogout,
  showLogoutConfirmation = false
}) => {
  const navigate = useNavigate();
  const { signOut, isLoading } = useAuth();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Get user email from attributes
  const userEmail = user.attributes?.email || user.username || 'Unknown User';
  const userInitials = getUserInitials(userEmail);

  /**
   * Handles dropdown item selection.
   * 
   * @param detail - Selection detail from ButtonDropdown
   */
  const handleItemClick = useCallback(({ detail }: { detail: { id: string } }) => {
    switch (detail.id) {
      case 'profile':
        console.log('Navigating to profile page');
        navigate('/profile');
        break;
        
      case 'logout':
        if (showLogoutConfirmation) {
          setShowConfirmDialog(true);
        } else {
          handleLogout();
        }
        break;
        
      default:
        console.warn(`Unknown menu item: ${detail.id}`);
    }
  }, [navigate, showLogoutConfirmation]);

  /**
   * Handles user logout with loading state.
   */
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    setShowConfirmDialog(false);

    try {
      console.log('Logging out user:', userEmail);
      await signOut();
      console.log('User logged out successfully');
      
      // Call optional callback
      onLogout?.();
      
      // Navigate to login page
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Error is handled by useAuth hook
    } finally {
      setIsLoggingOut(false);
    }
  }, [signOut, userEmail, onLogout, navigate]);

  /**
   * Handles logout confirmation dialog dismissal.
   */
  const handleCancelLogout = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // Dropdown menu items
  const dropdownItems = [
    {
      id: 'profile',
      text: 'Profile',
      description: 'View and manage your profile'
    },
    {
      id: 'logout',
      text: isLoggingOut ? 'Logging out...' : 'Logout',
      description: 'Sign out of your account',
      disabled: isLoggingOut || isLoading
    }
  ];

  return (
    <>
      <div
        style={{
          transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out',
          opacity: isLoading || isLoggingOut ? 0.7 : 1,
          transform: isLoading || isLoggingOut ? 'scale(0.98)' : 'scale(1)'
        }}
      >
        <ButtonDropdown
          items={dropdownItems}
          onItemClick={handleItemClick}
          loading={isLoading || isLoggingOut}
          disabled={isLoading || isLoggingOut}
          variant="icon"
          ariaLabel={`User menu for ${userEmail}`}
        >
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          {/* User avatar/initials */}
          <Box
            padding={{ vertical: 'xs', horizontal: 's' }}
            fontSize="body-s"
            fontWeight="bold"
            textAlign="center"
            display="inline-block"
            variant="div"
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#0073bb',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
              title={`User avatar for ${userEmail}`}
            >
              {userInitials}
            </div>
          </Box>
          
          {/* User email */}
          <Box
            fontSize="body-s"
            display="inline-block"
          >
            {userEmail}
          </Box>
        </SpaceBetween>
        </ButtonDropdown>
      </div>

      {/* Logout confirmation dialog with enhanced loading states */}
      {showLogoutConfirmation && (
        <Modal
          visible={showConfirmDialog}
          onDismiss={handleCancelLogout}
          size="medium"
          header={
            <Header 
              variant="h3"
              description={isLoggingOut ? "Please wait while we sign you out..." : undefined}
            >
              {isLoggingOut ? 'Signing Out...' : 'Confirm Logout'}
            </Header>
          }
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="link"
                  onClick={handleCancelLogout}
                  disabled={isLoggingOut}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleLogout}
                  loading={isLoggingOut}
                  loadingText="Signing out..."
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? 'Signing out...' : 'Sign Out'}
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          {isLoggingOut ? (
            <Box textAlign="center" padding="l">
              <div
                style={{
                  animation: 'fadeIn 0.3s ease-in-out'
                }}
              >
                <Spinner size="normal" />
                <Box 
                  variant="p" 
                  color="text-body-secondary" 
                  margin={{ top: 's' }}
                >
                  Signing you out securely...
                </Box>
              </div>
            </Box>
          ) : (
            <>
              <Box variant="p">
                Are you sure you want to log out of your account?
              </Box>
              <Box variant="p">
                <span style={{ color: '#5f6b7a' }}>
                  You will need to sign in again to access the application.
                </span>
              </Box>
            </>
          )}
          
          {/* CSS animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </Modal>
      )}
    </>
  );
};

export default ProfileDropdown;