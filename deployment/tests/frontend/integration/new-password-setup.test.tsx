/**
 * @fileoverview Integration test for new password setup flow.
 * 
 * Tests the complete user journey for first-time login requiring
 * new password setup with user attributes.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import { LoginPage } from '../../../src/frontend/src/pages/LoginPage';
import { useAuth } from '../../../src/frontend/src/hooks/useAuth';

// Mock the useAuth hook
jest.mock('../../../src/frontend/src/hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null })
}));

// Mock Amplify configuration
jest.mock('../../../src/frontend/src/amplify-config', () => ({}));

/**
 * Test wrapper component with required providers.
 */
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    <Authenticator.Provider>
      {children}
    </Authenticator.Provider>
  </BrowserRouter>
);

describe('New Password Setup Flow', () => {
  const mockSignIn = jest.fn();
  const mockConfirmSignInWithNewPassword = jest.fn();
  const mockClearError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      isInitialized: true,
      signIn: mockSignIn,
      signOut: jest.fn(),
      forgotPassword: jest.fn(),
      forgotPasswordSubmit: jest.fn(),
      confirmSignInWithNewPassword: mockConfirmSignInWithNewPassword,
      currentAuthenticatedUser: jest.fn(),
      currentSession: jest.fn(),
      currentCredentials: jest.fn(),
      clearError: mockClearError
    });
  });

  describe('Initial Login Flow', () => {
    it('should show new password form when NewPasswordRequired error occurs', async () => {
      // Mock sign in to throw NewPasswordRequired error
      const newPasswordError = new Error('New password required');
      (newPasswordError as any).code = 'NewPasswordRequired';
      (newPasswordError as any).name = 'NewPasswordRequired';
      (newPasswordError as any).isSpecialCase = true;
      
      mockSignIn.mockRejectedValue(newPasswordError);

      render(
        <TestWrapper>
          <LoginPage />
        </TestWrapper>
      );

      // Fill in login form
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TempPassword123!' } });
      fireEvent.click(signInButton);

      // Wait for new password form to appear
      await waitFor(() => {
        expect(screen.getByText('Complete Your Account Setup')).toBeInTheDocument();
      });

      // Verify all required fields are present
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
      expect(screen.getByLabelText('New Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /complete account setup/i })).toBeInTheDocument();
    });
  });

  describe('New Password Form Validation', () => {
    beforeEach(async () => {
      // Set up the component in new password state
      const newPasswordError = new Error('New password required');
      (newPasswordError as any).code = 'NewPasswordRequired';
      (newPasswordError as any).isSpecialCase = true;
      mockSignIn.mockRejectedValue(newPasswordError);

      render(
        <TestWrapper>
          <LoginPage />
        </TestWrapper>
      );

      // Trigger new password form
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TempPassword123!' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Account Setup')).toBeInTheDocument();
      });
    });

    it('should validate required first name', async () => {
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });
      
      // Try to submit without first name
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('First name is required')).toBeInTheDocument();
      });
    });

    it('should validate required last name', async () => {
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });
      
      // Try to submit without last name
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Last name is required')).toBeInTheDocument();
      });
    });

    it('should validate password requirements', async () => {
      const newPasswordInput = screen.getByPlaceholderText('Enter your new password');
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });
      
      // Enter weak password
      fireEvent.change(newPasswordInput, { target: { value: 'weak' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters long')).toBeInTheDocument();
      });
    });

    it('should validate password confirmation', async () => {
      const newPasswordInput = screen.getByPlaceholderText('Enter your new password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your new password');
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });
      
      // Enter mismatched passwords
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword123!' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('should validate name format', async () => {
      const firstNameInput = screen.getByPlaceholderText('Enter your first name');
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });
      
      // Enter invalid name with numbers
      fireEvent.change(firstNameInput, { target: { value: 'John123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('First name can only contain letters, spaces, hyphens, and apostrophes')).toBeInTheDocument();
      });
    });
  });

  describe('Successful Account Setup', () => {
    beforeEach(async () => {
      // Set up the component in new password state
      const newPasswordError = new Error('New password required');
      (newPasswordError as any).code = 'NewPasswordRequired';
      (newPasswordError as any).isSpecialCase = true;
      mockSignIn.mockRejectedValue(newPasswordError);

      render(
        <TestWrapper>
          <LoginPage />
        </TestWrapper>
      );

      // Trigger new password form
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TempPassword123!' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Account Setup')).toBeInTheDocument();
      });
    });

    it('should successfully complete account setup with valid data', async () => {
      // Mock successful password confirmation
      const mockUser = {
        username: 'test@example.com',
        attributes: {
          sub: 'user-123',
          email: 'test@example.com',
          email_verified: true,
          given_name: 'John',
          family_name: 'Doe'
        },
        signInUserSession: null
      };
      mockConfirmSignInWithNewPassword.mockResolvedValue(mockUser);

      // Fill in all required fields
      const firstNameInput = screen.getByPlaceholderText('Enter your first name');
      const lastNameInput = screen.getByPlaceholderText('Enter your last name');
      const newPasswordInput = screen.getByPlaceholderText('Enter your new password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your new password');
      const submitButton = screen.getByRole('button', { name: /complete account setup/i });

      fireEvent.change(firstNameInput, { target: { value: 'John' } });
      fireEvent.change(lastNameInput, { target: { value: 'Doe' } });
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'NewPassword123!' } });

      fireEvent.click(submitButton);

      // Verify confirmSignInWithNewPassword was called with correct parameters
      await waitFor(() => {
        expect(mockConfirmSignInWithNewPassword).toHaveBeenCalledWith(
          'NewPassword123!',
          {
            given_name: 'John',
            family_name: 'Doe'
          }
        );
      });

      // Verify navigation to home page
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should handle account setup errors gracefully', async () => {
      // Mock error during password confirmation
      const setupError = new Error('Invalid attributes given, given_name is missing');
      (setupError as any).name = 'InvalidParameterException';
      mockConfirmSignInWithNewPassword.mockRejectedValue(setupError);

      // Update useAuth mock to return the error
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: {
          code: 'InvalidParameterException',
          message: 'Invalid input. Please check your information and try again.',
          name: 'InvalidParameterException',
          timestamp: new Date().toISOString()
        },
        isInitialized: true,
        signIn: mockSignIn,
        signOut: jest.fn(),
        forgotPassword: jest.fn(),
        forgotPasswordSubmit: jest.fn(),
        confirmSignInWithNewPassword: mockConfirmSignInWithNewPassword,
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: mockClearError
      });

      // Re-render with error state
      render(
        <TestWrapper>
          <LoginPage />
        </TestWrapper>
      );

      // Should show error message
      expect(screen.getByText('Password Update Failed')).toBeInTheDocument();
      expect(screen.getByText('Invalid input. Please check your information and try again.')).toBeInTheDocument();
    });
  });

  describe('Form Navigation', () => {
    it('should allow going back to login form', async () => {
      // Set up the component in new password state
      const newPasswordError = new Error('New password required');
      (newPasswordError as any).code = 'NewPasswordRequired';
      (newPasswordError as any).isSpecialCase = true;
      mockSignIn.mockRejectedValue(newPasswordError);

      render(
        <TestWrapper>
          <LoginPage />
        </TestWrapper>
      );

      // Trigger new password form
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TempPassword123!' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Account Setup')).toBeInTheDocument();
      });

      // Click back to sign in
      const backButton = screen.getByRole('button', { name: /back to sign in/i });
      fireEvent.click(backButton);

      // Should return to login form
      await waitFor(() => {
        expect(screen.getByText('Sign In')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
      });
    });
  });
});