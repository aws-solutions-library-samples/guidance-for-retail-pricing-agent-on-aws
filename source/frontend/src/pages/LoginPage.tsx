/**
 * @fileoverview Login page component for user authentication.
 * 
 * Provides email/password login form with CloudScape components,
 * forgot password functionality, and proper error handling with loading states.
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Header,
  FormField,
  Input,
  Button,
  Alert,
  Spinner,
  SpaceBetween,
  Box
} from '@cloudscape-design/components';
import { AuthButton } from '../components/AuthButton';
import { useAuth } from '../hooks/useAuth';
import type { AuthError } from '../types/auth-types';

/**
 * Interface for login form state.
 */
interface LoginFormState {
  email: string;
  password: string;
  emailError: string;
  passwordError: string;
}

/**
 * Interface for component props.
 */
interface LoginPageProps {
  /** URL to redirect to after successful login */
  redirectUrl?: string;
}

/**
 * Interface for new password form state.
 */
interface NewPasswordFormState {
  newPassword: string;
  confirmPassword: string;
  givenName: string;
  familyName: string;
  newPasswordError: string;
  confirmPasswordError: string;
  givenNameError: string;
  familyNameError: string;
}

/**
 * Validates email format.
 * 
 * @param email - Email address to validate
 * @returns Error message or empty string if valid
 */
const validateEmail = (email: string): string => {
  if (!email.trim()) {
    return 'Email is required';
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  
  return '';
};

/**
 * Validates password.
 * 
 * @param password - Password to validate
 * @returns Error message or empty string if valid
 */
const validatePassword = (password: string): string => {
  if (!password.trim()) {
    return 'Password is required';
  }
  
  return '';
};

/**
 * Validates new password with strength requirements.
 * 
 * @param password - New password to validate
 * @returns Error message or empty string if valid
 */
const validateNewPassword = (password: string): string => {
  if (!password.trim()) {
    return 'New password is required';
  }
  
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  
  // Check for at least one number
  if (!/\d/.test(password)) {
    return 'Password must contain at least one number';
  }
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  
  return '';
};

/**
 * Validates password confirmation.
 * 
 * @param password - Original password
 * @param confirmPassword - Confirmation password
 * @returns Error message or empty string if valid
 */
const validatePasswordConfirmation = (password: string, confirmPassword: string): string => {
  if (!confirmPassword.trim()) {
    return 'Please confirm your password';
  }
  
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  
  return '';
};

/**
 * Validates given name (first name).
 * 
 * @param givenName - Given name to validate
 * @returns Error message or empty string if valid
 */
const validateGivenName = (givenName: string): string => {
  if (!givenName.trim()) {
    return 'First name is required';
  }
  
  if (givenName.trim().length < 2) {
    return 'First name must be at least 2 characters long';
  }
  
  // Check for valid name characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(givenName.trim())) {
    return 'First name can only contain letters, spaces, hyphens, and apostrophes';
  }
  
  return '';
};

/**
 * Validates family name (last name).
 * 
 * @param familyName - Family name to validate
 * @returns Error message or empty string if valid
 */
const validateFamilyName = (familyName: string): string => {
  if (!familyName.trim()) {
    return 'Last name is required';
  }
  
  if (familyName.trim().length < 2) {
    return 'Last name must be at least 2 characters long';
  }
  
  // Check for valid name characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(familyName.trim())) {
    return 'Last name can only contain letters, spaces, hyphens, and apostrophes';
  }
  
  return '';
};

/**
 * Login page component with email/password authentication.
 * 
 * Features:
 * - Email and password input fields with validation
 * - CloudScape Form components for consistent UI
 * - Loading state with Spinner during authentication
 * - Error display using CloudScape Alert component
 * - Forgot password link navigation
 * - Redirect to original URL after successful login
 * - Form validation for email format and required fields
 */
export const LoginPage: React.FC<LoginPageProps> = ({
  redirectUrl
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, confirmSignInWithNewPassword, isLoading, error, clearError, isAuthenticated } = useAuth();

  // Form state
  const [formState, setFormState] = useState<LoginFormState>({
    email: '',
    password: '',
    emailError: '',
    passwordError: ''
  });

  // New password form state
  const [newPasswordState, setNewPasswordState] = useState<NewPasswordFormState>({
    newPassword: '',
    confirmPassword: '',
    givenName: '',
    familyName: '',
    newPasswordError: '',
    confirmPasswordError: '',
    givenNameError: '',
    familyNameError: ''
  });

  // Track if we need to show new password form
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);

  // Get redirect URL from location state or prop
  const getRedirectUrl = (): string => {
    if (redirectUrl) return redirectUrl;
    
    const locationState = location.state as { from?: { pathname: string } } | null;
    return locationState?.from?.pathname || '/';
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const targetUrl = getRedirectUrl();
      console.log('User already authenticated, redirecting to:', targetUrl);
      navigate(targetUrl, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectUrl, location.state]);

  /**
   * Handles input field changes and clears validation errors.
   * 
   * @param field - Form field name
   * @param value - New field value
   */
  const handleInputChange = (field: keyof LoginFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      // Clear field-specific error when user starts typing
      [`${field}Error`]: ''
    }));
    
    // Clear auth error when user starts typing
    if (error) {
      clearError();
    }
  };

  /**
   * Validates the entire form.
   * 
   * @returns True if form is valid, false otherwise
   */
  const validateForm = (): boolean => {
    const emailError = validateEmail(formState.email);
    const passwordError = validatePassword(formState.password);

    setFormState(prev => ({
      ...prev,
      emailError,
      passwordError
    }));

    return !emailError && !passwordError;
  };

  /**
   * Handles form submission for email/password login.
   * 
   * @param event - Form submit event
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Clear any existing errors
    clearError();
    
    // Validate form
    if (!validateForm()) {
      return;
    }

    try {
      console.log('Attempting login for:', formState.email);
      
      await signIn(formState.email, formState.password);
      
      // Redirect on successful login
      const targetUrl = getRedirectUrl();
      console.log('Login successful, redirecting to:', targetUrl);
      navigate(targetUrl, { replace: true });
      
    } catch (authError: any) {
      console.error('Login failed:', authError);
      
      // Check if new password is required
      if (authError.code === 'NewPasswordRequired' || authError.name === 'NewPasswordRequired') {
        console.log('New password required, showing new password form');
        setShowNewPasswordForm(true);
        clearError(); // Clear the error since we're handling it
        return; // Don't treat this as an error
      }
      // Other errors are already set by useAuth hook
    }
  };

  /**
   * Handles navigation to forgot password page.
   */
  const handleForgotPassword = () => {
    navigate('/forgot-password');
  };

  /**
   * Handles input field changes for new password form.
   * 
   * @param field - Form field name
   * @param value - New field value
   */
  const handleNewPasswordInputChange = (field: keyof NewPasswordFormState, value: string) => {
    setNewPasswordState(prev => ({
      ...prev,
      [field]: value,
      // Clear field-specific error when user starts typing
      [`${field}Error`]: ''
    }));
    
    // Clear auth error when user starts typing
    if (error) {
      clearError();
    }
  };

  /**
   * Validates the new password form.
   * 
   * @returns True if form is valid, false otherwise
   */
  const validateNewPasswordForm = (): boolean => {
    const newPasswordError = validateNewPassword(newPasswordState.newPassword);
    const confirmPasswordError = validatePasswordConfirmation(
      newPasswordState.newPassword, 
      newPasswordState.confirmPassword
    );
    const givenNameError = validateGivenName(newPasswordState.givenName);
    const familyNameError = validateFamilyName(newPasswordState.familyName);

    setNewPasswordState(prev => ({
      ...prev,
      newPasswordError,
      confirmPasswordError,
      givenNameError,
      familyNameError
    }));

    return !newPasswordError && !confirmPasswordError && !givenNameError && !familyNameError;
  };

  /**
   * Handles new password form submission.
   * 
   * @param event - Form submit event
   */
  const handleNewPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Clear any existing errors
    clearError();
    
    // Validate form
    if (!validateNewPasswordForm()) {
      return;
    }

    try {
      console.log('Setting new password for user with attributes');
      console.log('New password length:', newPasswordState.newPassword.length);
      console.log('User attributes:', {
        given_name: newPasswordState.givenName,
        family_name: newPasswordState.familyName
      });
      
      await confirmSignInWithNewPassword(
        newPasswordState.newPassword,
        {
          given_name: newPasswordState.givenName.trim(),
          family_name: newPasswordState.familyName.trim()
        }
      );
      
      // Redirect on successful password change and login
      const targetUrl = getRedirectUrl();
      console.log('Password set successfully, redirecting to:', targetUrl);
      navigate(targetUrl, { replace: true });
      
    } catch (authError) {
      console.error('New password confirmation failed:', authError);
      console.error('Auth error details:', {
        code: (authError as any)?.code,
        message: (authError as any)?.message,
        name: (authError as any)?.name
      });
      // Error is already set by useAuth hook
    }
  };

  /**
   * Handles going back to the login form from new password form.
   */
  const handleBackToLogin = () => {
    setShowNewPasswordForm(false);
    clearError();
    // Reset new password form
    setNewPasswordState({
      newPassword: '',
      confirmPassword: '',
      givenName: '',
      familyName: '',
      newPasswordError: '',
      confirmPasswordError: '',
      givenNameError: '',
      familyNameError: ''
    });
  };

  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        <Header variant="h1">
          {showNewPasswordForm ? 'Set New Password' : 'Sign In'}
        </Header>

        {/* Display authentication errors */}
        {error && (
          <Alert
            statusIconAriaLabel="Error"
            type="error"
            header={showNewPasswordForm ? "Password Update Failed" : "Sign In Failed"}
            dismissible
            onDismiss={clearError}
          >
            {error.message}
            {!showNewPasswordForm && error.message.includes('Incorrect username or password') && (
              <p style={{ marginTop: '8px', fontSize: '14px' }}>
                <strong>Note:</strong> If this is your first time signing in, please use the temporary password provided to you, not a new password you created.
              </p>
            )}
          </Alert>
        )}

        {showNewPasswordForm ? (
          /* New Password Form */
          <form onSubmit={handleNewPasswordSubmit}>
            <SpaceBetween direction="vertical" size="l">
              <Alert
                statusIconAriaLabel="Info"
                type="info"
                header="Complete Your Account Setup"
              >
                <p>You're signing in for the first time with a temporary password. Please complete your profile and set a new password to continue.</p>
                <p><strong>Required:</strong> All fields below are required to complete your account setup.</p>
              </Alert>

              {/* First Name field */}
              <FormField
                label="First Name"
                errorText={newPasswordState.givenNameError}
                constraintText="Enter your first name (required for account setup)"
              >
                <Input
                  value={newPasswordState.givenName}
                  onChange={({ detail }) => handleNewPasswordInputChange('givenName', detail.value)}
                  type="text"
                  placeholder="Enter your first name"
                  disabled={isLoading}
                  autoComplete="given-name"
                  autoFocus
                />
              </FormField>

              {/* Last Name field */}
              <FormField
                label="Last Name"
                errorText={newPasswordState.familyNameError}
                constraintText="Enter your last name (required for account setup)"
              >
                <Input
                  value={newPasswordState.familyName}
                  onChange={({ detail }) => handleNewPasswordInputChange('familyName', detail.value)}
                  type="text"
                  placeholder="Enter your last name"
                  disabled={isLoading}
                  autoComplete="family-name"
                />
              </FormField>

              {/* New Password field */}
              <FormField
                label="New Password"
                errorText={newPasswordState.newPasswordError}
                constraintText="Must be at least 8 characters with uppercase, lowercase, number, and special character"
              >
                <Input
                  value={newPasswordState.newPassword}
                  onChange={({ detail }) => handleNewPasswordInputChange('newPassword', detail.value)}
                  type="password"
                  placeholder="Enter your new password"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>

              {/* Confirm Password field */}
              <FormField
                label="Confirm New Password"
                errorText={newPasswordState.confirmPasswordError}
                constraintText="Re-enter your new password to confirm"
              >
                <Input
                  value={newPasswordState.confirmPassword}
                  onChange={({ detail }) => handleNewPasswordInputChange('confirmPassword', detail.value)}
                  type="password"
                  placeholder="Confirm your new password"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>

              {/* Form actions */}
              <SpaceBetween direction="vertical" size="xs">
                <AuthButton
                  variant="primary"
                  isLoading={isLoading}
                  loadingText="Completing setup..."
                  formAction="submit"
                  enhanced={true}
                  loadingAnimation="pulse"
                >
                  Complete Account Setup
                </AuthButton>
                
                <AuthButton
                  variant="link"
                  onClick={handleBackToLogin}
                  disabled={isLoading}
                >
                  Back to Sign In
                </AuthButton>
              </SpaceBetween>
            </SpaceBetween>
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit}>
            <SpaceBetween direction="vertical" size="l">
              {/* Email field */}
              <FormField
                label="Email"
                errorText={formState.emailError}
                constraintText="Enter your email address"
              >
                <Input
                  value={formState.email}
                  onChange={({ detail }) => handleInputChange('email', detail.value)}
                  type="email"
                  placeholder="Enter your email"
                  disabled={isLoading}
                  autoComplete="email"
                  autoFocus
                />
              </FormField>

              {/* Password field */}
              <FormField
                label="Password"
                errorText={formState.passwordError}
                constraintText="Enter your password"
              >
                <Input
                  value={formState.password}
                  onChange={({ detail }) => handleInputChange('password', detail.value)}
                  type="password"
                  placeholder="Enter your password"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </FormField>

              {/* Forgot password link */}
              <Box textAlign="center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0073bb',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Forgot your password?
                </button>
              </Box>

              {/* Form actions with enhanced loading states */}
              <SpaceBetween direction="vertical" size="xs">
                <AuthButton
                  variant="primary"
                  isLoading={isLoading}
                  loadingText="Signing in..."
                  formAction="submit"
                  enhanced={true}
                  loadingAnimation="pulse"
                >
                  Sign In
                </AuthButton>
              </SpaceBetween>
            </SpaceBetween>
          </form>
        )}

        {/* Enhanced loading indicator with smooth transition */}
        {isLoading && (
          <div
            style={{
              animation: 'fadeIn 0.3s ease-in-out',
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e1e4e8',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                animation: 'pulse 1.5s infinite ease-in-out'
              }}
            >
              <Spinner size="normal" />
            </div>
            <Box 
              variant="p" 
              color="text-body-secondary" 
              margin={{ top: 's' }}
              fontSize="body-s"
            >
              Authenticating your credentials...
            </Box>
          </div>
        )}
        
        {/* CSS animations */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.7; }
          }
        `}</style>
      </SpaceBetween>
    </Container>
  );
};

export default LoginPage;