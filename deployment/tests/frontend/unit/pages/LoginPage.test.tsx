/**
 * @fileoverview Unit tests for LoginPage component.
 * 
 * Tests the login form functionality, validation, error handling,
 * and integration with the useAuth hook.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../../../../src/frontend/src/pages/LoginPage';
import { useAuth } from '../../../../src/frontend/src/hooks/useAuth';

// Mock the useAuth hook
jest.mock('../../../../src/frontend/src/hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null })
}));

/**
 * Helper function to render LoginPage with router context.
 */
const renderLoginPage = (props = {}) => {
  return render(
    <BrowserRouter>
      <LoginPage {...props} />
    </BrowserRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      isInitialized: true,
      signIn: jest.fn(),
      signOut: jest.fn(),
      forgotPassword: jest.fn(),
      forgotPasswordSubmit: jest.fn(),
      currentAuthenticatedUser: jest.fn(),
      currentSession: jest.fn(),
      currentCredentials: jest.fn(),
      clearError: jest.fn()
    });
  });

  describe('Rendering', () => {
    it('should render login form with email and password fields', () => {
      renderLoginPage();

      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('should render forgot password link', () => {
      renderLoginPage();

      const forgotPasswordLink = screen.getByText('Forgot your password?');
      expect(forgotPasswordLink).toBeInTheDocument();
    });

    it('should render Midway OIDC button when enabled', () => {
      renderLoginPage({ midwayEnabled: true });

      expect(screen.getByRole('button', { name: 'Sign in with Amazon' })).toBeInTheDocument();
    });

    it('should not render Midway OIDC button when disabled', () => {
      renderLoginPage({ midwayEnabled: false });

      expect(screen.queryByRole('button', { name: 'Sign in with Amazon' })).not.toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show email validation error for empty email', async () => {
      renderLoginPage();

      const signInButton = screen.getByRole('button', { name: 'Sign In' });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });
    });

    it('should show email validation error for invalid email format', async () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      const form = emailInput.closest('form');

      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
    });

    it('should show password validation error for empty password', async () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      const signInButton = screen.getByRole('button', { name: 'Sign In' });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
    });

    it('should clear validation errors when user starts typing', async () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      const signInButton = screen.getByRole('button', { name: 'Sign In' });

      // Trigger validation error
      fireEvent.click(signInButton);
      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });

      // Start typing to clear error
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      
      await waitFor(() => {
        expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
      });
    });
  });

  describe('Authentication', () => {
    it('should call signIn with correct credentials on form submission', async () => {
      const mockSignIn = jest.fn().mockResolvedValue({});
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
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: jest.fn()
      });

      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: 'Sign In' });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should show loading state during authentication', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
        isInitialized: true,
        signIn: jest.fn(),
        signOut: jest.fn(),
        forgotPassword: jest.fn(),
        forgotPasswordSubmit: jest.fn(),
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: jest.fn()
      });

      renderLoginPage();

      expect(screen.getByText('Signing in...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
    });

    it('should display authentication error', () => {
      const mockError = {
        code: 'NotAuthorizedException',
        message: 'Invalid email or password',
        name: 'NotAuthorizedException'
      };

      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: mockError,
        isInitialized: true,
        signIn: jest.fn(),
        signOut: jest.fn(),
        forgotPassword: jest.fn(),
        forgotPasswordSubmit: jest.fn(),
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: jest.fn()
      });

      renderLoginPage();

      expect(screen.getByText('Sign In Failed')).toBeInTheDocument();
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });

    it('should redirect to home page after successful authentication', () => {
      mockUseAuth.mockReturnValue({
        user: { username: 'test@example.com', attributes: { sub: '123', email: 'test@example.com', email_verified: true }, signInUserSession: null },
        isLoading: false,
        isAuthenticated: true,
        error: null,
        isInitialized: true,
        signIn: jest.fn(),
        signOut: jest.fn(),
        forgotPassword: jest.fn(),
        forgotPasswordSubmit: jest.fn(),
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: jest.fn()
      });

      renderLoginPage();

      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  describe('Navigation', () => {
    it('should navigate to forgot password page when link is clicked', () => {
      renderLoginPage();

      const forgotPasswordLink = screen.getByText('Forgot your password?');
      fireEvent.click(forgotPasswordLink);

      expect(mockNavigate).toHaveBeenCalledWith('/forgot-password');
    });

    it('should redirect to original URL after login', () => {
      // Mock location state with original URL
      jest.mocked(require('react-router-dom').useLocation).mockReturnValue({
        state: { from: { pathname: '/pricing/dashboard' } }
      });

      mockUseAuth.mockReturnValue({
        user: { username: 'test@example.com', attributes: { sub: '123', email: 'test@example.com', email_verified: true }, signInUserSession: null },
        isLoading: false,
        isAuthenticated: true,
        error: null,
        isInitialized: true,
        signIn: jest.fn(),
        signOut: jest.fn(),
        forgotPassword: jest.fn(),
        forgotPasswordSubmit: jest.fn(),
        currentAuthenticatedUser: jest.fn(),
        currentSession: jest.fn(),
        currentCredentials: jest.fn(),
        clearError: jest.fn()
      });

      renderLoginPage();

      expect(mockNavigate).toHaveBeenCalledWith('/pricing/dashboard', { replace: true });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and ARIA attributes', () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');

      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('autoComplete', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
    });

    it('should have autofocus on email input', () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('autofocus');
    });
  });
});