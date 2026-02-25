/**
 * @fileoverview Forgot password page component for password reset functionality.
 * 
 * Provides a two-step password reset process:
 * Step 1: Email input to request reset code
 * Step 2: Code input and new password to complete reset
 * 
 * Features CloudScape components, proper validation, error handling,
 * and password requirements display.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Header,
  FormField,
  Input,
  Button,
  Alert,
  Spinner,
  SpaceBetween,
  Box,
  ExpandableSection,
  TextContent
} from '@cloudscape-design/components';
import { AuthButton } from '../components/AuthButton';
import { useAuth } from '../hooks/useAuth';
import { handleAuthError } from '../utils/auth-error-handler';
import type { AuthError } from '../types/auth-types';

/**
 * Password reset steps enum.
 */
enum ResetStep {
  REQUEST_CODE = 'request',
  RESET_PASSWORD = 'reset'
}

/**
 * Interface for forgot password form state.
 */
interface ForgotPasswordFormState {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
  emailError: string;
  codeError: string;
  newPasswordError: string;
  confirmPasswordError: string;
}

/**
 * Interface for component props.
 */
interface ForgotPasswordPageProps {
  /** Callback function called on successful password reset */
  onSuccess?: () => void;
}

/**
 * Password requirements for validation.
 */
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true
};

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
 * Validates verification code format.
 * 
 * @param code - Verification code to validate
 * @returns Error message or empty string if valid
 */
const validateCode = (code: string): string => {
  if (!code.trim()) {
    return 'Verification code is required';
  }
  
  // Cognito codes are typically 6 digits
  if (!/^\d{6}$/.test(code.trim())) {
    return 'Verification code must be 6 digits';
  }
  
  return '';
};

/**
 * Validates password against requirements.
 * 
 * @param password - Password to validate
 * @returns Error message or empty string if valid
 */
const validatePassword = (password: string): string => {
  if (!password) {
    return 'Password is required';
  }
  
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    return `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`;
  }
  
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  
  if (PASSWORD_REQUIREMENTS.requireNumber && !/\d/.test(password)) {
    return 'Password must contain at least one number';
  }
  
  if (PASSWORD_REQUIREMENTS.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  
  return '';
};

/**
 * Validates password confirmation.
 * 
 * @param password - Original password
 * @param confirmPassword - Password confirmation
 * @returns Error message or empty string if valid
 */
const validatePasswordConfirmation = (password: string, confirmPassword: string): string => {
  if (!confirmPassword) {
    return 'Please confirm your password';
  }
  
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  
  return '';
};

/**
 * Forgot password page component with two-step reset process.
 * 
 * Step 1: Email input and "Send Code" button
 * Step 2: Code input, new password input, confirm password input
 * 
 * Features:
 * - Two-step password reset process
 * - Email validation and code validation
 * - Password requirements display and validation
 * - CloudScape Form components for consistent UI
 * - Loading states and error handling
 * - Success message and redirect to login
 * - Back to Login link
 */
export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { forgotPassword, forgotPasswordSubmit, isLoading, error, clearError } = useAuth();

  // Component state
  const [currentStep, setCurrentStep] = useState<ResetStep>(ResetStep.REQUEST_CODE);
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // Form state
  const [formState, setFormState] = useState<ForgotPasswordFormState>({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
    emailError: '',
    codeError: '',
    newPasswordError: '',
    confirmPasswordError: ''
  });

  // Get email from location state if coming from login page
  useEffect(() => {
    const locationState = location.state as { email?: string } | null;
    if (locationState?.email) {
      setFormState(prev => ({
        ...prev,
        email: locationState.email
      }));
    }
  }, [location.state]);

  /**
   * Handles input field changes and clears validation errors.
   * 
   * @param field - Form field name
   * @param value - New field value
   */
  const handleInputChange = (field: keyof ForgotPasswordFormState, value: string) => {
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
    
    // Clear success message when user starts typing
    if (successMessage) {
      setSuccessMessage('');
    }
  };

  /**
   * Validates the email form (step 1).
   * 
   * @returns True if form is valid, false otherwise
   */
  const validateEmailForm = (): boolean => {
    const emailError = validateEmail(formState.email);

    setFormState(prev => ({
      ...prev,
      emailError
    }));

    return !emailError;
  };

  /**
   * Validates the password reset form (step 2).
   * 
   * @returns True if form is valid, false otherwise
   */
  const validatePasswordForm = (): boolean => {
    const codeError = validateCode(formState.code);
    const newPasswordError = validatePassword(formState.newPassword);
    const confirmPasswordError = validatePasswordConfirmation(
      formState.newPassword, 
      formState.confirmPassword
    );

    setFormState(prev => ({
      ...prev,
      codeError,
      newPasswordError,
      confirmPasswordError
    }));

    return !codeError && !newPasswordError && !confirmPasswordError;
  };

  /**
   * Handles step 1: Request password reset code.
   * 
   * @param event - Form submit event
   */
  const handleRequestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Clear any existing errors and success messages
    clearError();
    setSuccessMessage('');
    
    // Validate form
    if (!validateEmailForm()) {
      return;
    }

    try {
      console.log('Requesting password reset code for:', formState.email);
      
      await forgotPassword(formState.email);
      
      console.log('Password reset code sent successfully');
      setCurrentStep(ResetStep.RESET_PASSWORD);
      setSuccessMessage('Verification code sent to your email. Please check your inbox.');
      
    } catch (authError) {
      console.error('Request code failed:', authError);
      // Error is already set by useAuth hook
    }
  };

  /**
   * Handles step 2: Reset password with code and new password.
   * 
   * @param event - Form submit event
   */
  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Clear any existing errors and success messages
    clearError();
    setSuccessMessage('');
    
    // Validate form
    if (!validatePasswordForm()) {
      return;
    }

    try {
      console.log('Resetting password for:', formState.email);
      
      await forgotPasswordSubmit(formState.email, formState.code, formState.newPassword);
      
      console.log('Password reset completed successfully');
      
      // Show success message
      setSuccessMessage('Password reset successful! Redirecting to login...');
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
      
      // Redirect to login page after a short delay
      setTimeout(() => {
        navigate('/login', {
          state: { 
            message: 'Password reset successful. Please log in with your new password.',
            email: formState.email
          }
        });
      }, 2000);
      
    } catch (authError) {
      console.error('Reset password failed:', authError);
      // Error is already set by useAuth hook
    }
  };

  /**
   * Handles navigation back to login page.
   */
  const handleBackToLogin = () => {
    navigate('/login');
  };

  /**
   * Handles going back to step 1 from step 2.
   */
  const handleBackToStep1 = () => {
    setCurrentStep(ResetStep.REQUEST_CODE);
    setFormState(prev => ({
      ...prev,
      code: '',
      newPassword: '',
      confirmPassword: '',
      codeError: '',
      newPasswordError: '',
      confirmPasswordError: ''
    }));
    clearError();
    setSuccessMessage('');
  };

  /**
   * Renders password requirements section.
   */
  const renderPasswordRequirements = () => (
    <ExpandableSection headerText="Password Requirements" variant="footer">
      <TextContent>
        <ul>
          <li>At least {PASSWORD_REQUIREMENTS.minLength} characters long</li>
          <li>At least one uppercase letter (A-Z)</li>
          <li>At least one lowercase letter (a-z)</li>
          <li>At least one number (0-9)</li>
          <li>At least one special character (!@#$%^&*)</li>
        </ul>
      </TextContent>
    </ExpandableSection>
  );

  return (
    <Container>
      <SpaceBetween direction="vertical" size="l">
        <Header variant="h1">
          {currentStep === ResetStep.REQUEST_CODE ? 'Reset Password' : 'Enter New Password'}
        </Header>

        {/* Display success messages */}
        {successMessage && (
          <Alert
            type="success"
            header="Success"
            dismissible
            onDismiss={() => setSuccessMessage('')}
          >
            {successMessage}
          </Alert>
        )}

        {/* Display authentication errors */}
        {error && (
          <Alert
            type="error"
            header="Password Reset Failed"
            dismissible
            onDismiss={clearError}
          >
            {handleAuthError(error).userMessage}
          </Alert>
        )}

        {/* Step 1: Request Code */}
        {currentStep === ResetStep.REQUEST_CODE && (
          <form onSubmit={handleRequestCode}>
            <SpaceBetween direction="vertical" size="l">
              <TextContent>
                <p>
                  Enter your email address and we'll send you a verification code 
                  to reset your password.
                </p>
              </TextContent>

              <FormField
                label="Email"
                errorText={formState.emailError}
                constraintText="Enter the email address associated with your account"
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

              <SpaceBetween direction="horizontal" size="xs">
                <AuthButton
                  variant="primary"
                  isLoading={isLoading}
                  loadingText="Sending code..."
                  formAction="submit"
                  enhanced={true}
                  loadingAnimation="pulse"
                >
                  Send Code
                </AuthButton>
                
                <Button
                  variant="link"
                  onClick={handleBackToLogin}
                  disabled={isLoading}
                >
                  Back to Login
                </Button>
              </SpaceBetween>
            </SpaceBetween>
          </form>
        )}

        {/* Step 2: Reset Password */}
        {currentStep === ResetStep.RESET_PASSWORD && (
          <form onSubmit={handleResetPassword}>
            <SpaceBetween direction="vertical" size="l">
              <TextContent>
                <p>
                  Enter the verification code sent to <strong>{formState.email}</strong> 
                  and your new password.
                </p>
              </TextContent>

              <FormField
                label="Verification Code"
                errorText={formState.codeError}
                constraintText="Enter the 6-digit code from your email"
              >
                <Input
                  value={formState.code}
                  onChange={({ detail }) => handleInputChange('code', detail.value)}
                  type="text"
                  placeholder="Enter 6-digit code"
                  disabled={isLoading}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </FormField>

              <FormField
                label="New Password"
                errorText={formState.newPasswordError}
                constraintText="Choose a strong password"
              >
                <Input
                  value={formState.newPassword}
                  onChange={({ detail }) => handleInputChange('newPassword', detail.value)}
                  type="password"
                  placeholder="Enter new password"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>

              <FormField
                label="Confirm New Password"
                errorText={formState.confirmPasswordError}
                constraintText="Re-enter your new password"
              >
                <Input
                  value={formState.confirmPassword}
                  onChange={({ detail }) => handleInputChange('confirmPassword', detail.value)}
                  type="password"
                  placeholder="Confirm new password"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </FormField>

              {/* Password requirements */}
              {renderPasswordRequirements()}

              <SpaceBetween direction="horizontal" size="xs">
                <AuthButton
                  variant="primary"
                  isLoading={isLoading}
                  loadingText="Resetting password..."
                  formAction="submit"
                  enhanced={true}
                  loadingAnimation="pulse"
                >
                  Reset Password
                </AuthButton>
                
                <Button
                  variant="normal"
                  onClick={handleBackToStep1}
                  disabled={isLoading}
                >
                  Back
                </Button>
                
                <Button
                  variant="link"
                  onClick={handleBackToLogin}
                  disabled={isLoading}
                >
                  Back to Login
                </Button>
              </SpaceBetween>
            </SpaceBetween>
          </form>
        )}

        {/* Enhanced loading indicator with smooth transition */}
        {isLoading && (
          <div
            style={{
              animation: 'fadeInUp 0.3s ease-in-out',
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e1e4e8',
              marginTop: '16px',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                animation: 'rotate 1s linear infinite'
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
              {currentStep === ResetStep.REQUEST_CODE 
                ? 'Sending verification code to your email...'
                : 'Resetting your password...'
              }
            </Box>
          </div>
        )}
        
        {/* CSS animations */}
        <style>{`
          @keyframes fadeInUp {
            from { 
              opacity: 0; 
              transform: translateY(20px); 
            }
            to { 
              opacity: 1; 
              transform: translateY(0); 
            }
          }
          
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </SpaceBetween>
    </Container>
  );
};

export default ForgotPasswordPage;