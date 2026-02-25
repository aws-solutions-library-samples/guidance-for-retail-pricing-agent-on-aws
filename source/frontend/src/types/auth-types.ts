/**
 * @fileoverview Authentication type definitions for AWS Cognito integration.
 * 
 * Defines TypeScript interfaces and types for user authentication,
 * session management, and error handling using AWS Cognito and Amplify.
 */

/**
 * AWS Cognito access token interface.
 * Contains JWT access token and its decoded payload.
 */
export interface CognitoAccessToken {
  /** JWT access token string */
  jwtToken: string;
  /** Decoded token payload */
  payload: {
    /** User ID (UUID) */
    sub: string;
    /** Token issuer (Cognito User Pool) */
    iss: string;
    /** Expiration timestamp (Unix timestamp) */
    exp: number;
    /** Issued at timestamp (Unix timestamp) */
    iat: number;
    /** Token use type */
    token_use: 'access';
    /** Client ID */
    client_id: string;
    /** Username */
    username: string;
    /** Token scope */
    scope?: string;
  };
}

/**
 * AWS Cognito ID token interface.
 * Contains JWT ID token with user identity information.
 */
export interface CognitoIdToken {
  /** JWT ID token string */
  jwtToken: string;
  /** Decoded token payload */
  payload: {
    /** User ID (UUID) */
    sub: string;
    /** User's email address */
    email: string;
    /** Email verification status */
    email_verified: boolean;
    /** Token issuer (Cognito User Pool) */
    iss: string;
    /** Expiration timestamp (Unix timestamp) */
    exp: number;
    /** Issued at timestamp (Unix timestamp) */
    iat: number;
    /** Token use type */
    token_use: 'id';
    /** Audience (Client ID) */
    aud: string;
    /** Authentication time */
    auth_time: number;
    /** Cognito username */
    'cognito:username': string;
  };
}

/**
 * AWS Cognito refresh token interface.
 * Contains opaque refresh token for obtaining new access/ID tokens.
 */
export interface CognitoRefreshToken {
  /** Opaque refresh token string */
  token: string;
}

/**
 * AWS Cognito user session interface.
 * Contains all tokens for an authenticated user session.
 */
export interface CognitoUserSession {
  /** Access token for API authorization */
  accessToken: CognitoAccessToken;
  /** ID token with user identity information */
  idToken: CognitoIdToken;
  /** Refresh token for token renewal */
  refreshToken: CognitoRefreshToken;
  /** Clock drift for token validation */
  clockDrift: number;
}

/**
 * AWS Cognito user attributes interface.
 * Contains user profile information from Cognito.
 */
export interface CognitoUserAttributes {
  /** User ID (UUID) */
  sub: string;
  /** User's email address */
  email: string;
  /** Email verification status */
  email_verified: boolean;
  /** User's given name (optional) */
  given_name?: string;
  /** User's family name (optional) */
  family_name?: string;
  /** User's phone number (optional) */
  phone_number?: string;
  /** Phone number verification status (optional) */
  phone_number_verified?: boolean;
}

/**
 * AWS Cognito user interface.
 * Represents an authenticated user with session and attributes.
 */
export interface CognitoUser {
  /** Username (typically email) */
  username: string;
  /** User attributes from Cognito */
  attributes: CognitoUserAttributes;
  /** Current user session with tokens */
  signInUserSession: CognitoUserSession | null;
  /** User pool reference */
  pool?: {
    userPoolId: string;
    clientId: string;
  };
}

/**
 * Authentication error codes enum.
 * Defines all possible error codes from AWS Cognito authentication.
 */
export enum AuthErrorCode {
  // Login errors
  USER_NOT_FOUND = 'UserNotFoundException',
  INCORRECT_PASSWORD = 'NotAuthorizedException',
  USER_NOT_CONFIRMED = 'UserNotConfirmedException',
  PASSWORD_RESET_REQUIRED = 'PasswordResetRequiredException',
  USER_DISABLED = 'UserDisabledException',
  TOO_MANY_REQUESTS = 'TooManyRequestsException',
  
  // Password reset errors
  CODE_MISMATCH = 'CodeMismatchException',
  EXPIRED_CODE = 'ExpiredCodeException',
  INVALID_PARAMETER = 'InvalidParameterException',
  LIMIT_EXCEEDED = 'LimitExceededException',
  
  // Session errors
  NOT_AUTHENTICATED = 'NotAuthenticatedException',
  TOKEN_EXPIRED = 'TokenExpiredException',
  ACCESS_DENIED = 'AccessDeniedException',
  FORBIDDEN = 'ForbiddenException',
  
  // Network and service errors
  NETWORK_ERROR = 'NetworkError',
  SERVICE_ERROR = 'ServiceError',
  INTERNAL_ERROR = 'InternalErrorException',
  
  // MFA errors
  MFA_METHOD_NOT_FOUND = 'MFAMethodNotFoundException',
  INVALID_MFA_TOKEN = 'InvalidMfaTokenException',
  SOFTWARE_TOKEN_MFA_NOT_FOUND = 'SoftwareTokenMFANotFoundException',
  
  // OAuth/OIDC errors
  INVALID_OAUTH_FLOW = 'InvalidOAuthFlowException',
  UNSUPPORTED_IDENTITY_PROVIDER = 'UnsupportedIdentityProviderException'
}

/**
 * Authentication error interface.
 * Represents an error that occurred during authentication operations.
 */
export interface AuthError {
  /** Error code from AuthErrorCode enum */
  code: AuthErrorCode | string;
  /** Human-readable error message */
  message: string;
  /** Error name/type */
  name: string;
  /** Additional error details (optional) */
  details?: Record<string, any>;
  /** Timestamp when error occurred */
  timestamp?: string;
}

/**
 * Authentication state interface.
 * Represents the current authentication state of the application.
 */
export interface AuthState {
  /** Current authenticated user (null if not authenticated) */
  user: CognitoUser | null;
  /** Loading state for authentication operations */
  isLoading: boolean;
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Current authentication error (null if no error) */
  error: AuthError | null;
  /** Whether authentication state has been initialized */
  isInitialized: boolean;
}

/**
 * Sign in credentials interface.
 * Parameters required for user sign in.
 */
export interface SignInCredentials {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
}



/**
 * Password reset request interface.
 * Parameters for requesting password reset.
 */
export interface PasswordResetRequest {
  /** User's email address */
  email: string;
}

/**
 * Password reset confirmation interface.
 * Parameters for confirming password reset.
 */
export interface PasswordResetConfirmation {
  /** User's email address */
  email: string;
  /** Reset code from email */
  code: string;
  /** New password */
  newPassword: string;
}

/**
 * Amplify Auth method types.
 * TypeScript types for AWS Amplify Auth methods.
 */
export interface AmplifyAuthMethods {
  /**
   * Signs in a user with email and password.
   * 
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise resolving to CognitoUser
   */
  signIn: (email: string, password: string) => Promise<CognitoUser>;
  
  /**
   * Signs out the current user.
   * 
   * @returns Promise resolving when sign out completes
   */
  signOut: () => Promise<void>;
  
  /**
   * Initiates forgot password flow.
   * 
   * @param email - User's email address
   * @returns Promise resolving when reset code is sent
   */
  forgotPassword: (email: string) => Promise<void>;
  
  /**
   * Confirms forgot password with new password.
   * 
   * @param email - User's email address
   * @param code - Reset code
   * @param newPassword - New password
   * @returns Promise resolving when password is reset
   */
  forgotPasswordSubmit: (email: string, code: string, newPassword: string) => Promise<void>;
  
  /**
   * Gets current authenticated user.
   * 
   * @param options - Options for getting current user
   * @returns Promise resolving to current user
   */
  currentAuthenticatedUser: (options?: { bypassCache?: boolean }) => Promise<CognitoUser>;
  
  /**
   * Gets current user session.
   * 
   * @returns Promise resolving to current session
   */
  currentSession: () => Promise<CognitoUserSession>;
  
  /**
   * Gets current user credentials.
   * 
   * @returns Promise resolving to AWS credentials
   */
  currentCredentials: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: Date;
  }>;

  /**
   * Signs in with a federated identity provider.
   * 
   * @param options - Sign in options including provider
   * @returns Promise that resolves when redirect is initiated
   */
  signInWithRedirect: (options: { provider: string }) => Promise<void>;

  /**
   * Confirms sign in with a new password and required user attributes (required for first-time login).
   * 
   * @param newPassword - New password to set
   * @param userAttributes - Required user attributes (given_name, family_name)
   * @returns Promise resolving to CognitoUser
   */
  confirmSignInWithNewPassword: (
    newPassword: string, 
    userAttributes?: { given_name?: string; family_name?: string }
  ) => Promise<CognitoUser>;
}

/**
 * Custom auth hook return type.
 * Defines the interface returned by useAuth hook.
 */
export interface UseAuthReturn extends AmplifyAuthMethods {
  /** Current authenticated user */
  user: CognitoUser | null;
  /** Loading state */
  isLoading: boolean;
  /** Authentication status */
  isAuthenticated: boolean;
  /** Current error */
  error: AuthError | null;
  /** Whether auth state is initialized */
  isInitialized: boolean;
  /** Clear current error */
  clearError: () => void;
}

/**
 * Token refresh hook return type.
 * Defines the interface returned by useTokenRefresh hook.
 */
export interface UseTokenRefreshReturn {
  /** Whether token refresh is in progress */
  isRefreshing: boolean;
  /** Last refresh timestamp */
  lastRefresh: Date | null;
  /** Manually trigger token refresh */
  refreshTokens: () => Promise<void>;
}

/**
 * Protected route props interface.
 * Props for ProtectedRoute component.
 */
export interface ProtectedRouteProps {
  /** Child components to render when authenticated */
  children: React.ReactNode;
  /** URL to redirect to when not authenticated */
  redirectTo?: string;
  /** Loading component to show while checking auth */
  fallback?: React.ReactNode;
}

/**
 * Auth provider props interface.
 * Props for AuthProvider component.
 */
export interface AuthProviderProps {
  /** Child components */
  children: React.ReactNode;
  /** Initial auth state (for testing) */
  initialState?: Partial<AuthState>;
}

/**
 * Midway OIDC configuration interface.
 * Configuration for Midway OIDC integration.
 */
export interface MidwayOIDCConfig {
  /** Whether Midway OIDC is enabled */
  enabled: boolean;
  /** Midway client ID */
  clientId?: string;
  /** OIDC authorization endpoint */
  authorizationEndpoint?: string;
  /** OIDC token endpoint */
  tokenEndpoint?: string;
  /** OAuth scopes */
  scopes?: string[];
}

/**
 * Session storage interface.
 * Defines methods for session persistence.
 */
export interface SessionStorage {
  /** Store session data */
  setSession: (session: CognitoUserSession) => Promise<void>;
  /** Retrieve session data */
  getSession: () => Promise<CognitoUserSession | null>;
  /** Clear session data */
  clearSession: () => Promise<void>;
  /** Check if session exists */
  hasSession: () => Promise<boolean>;
}