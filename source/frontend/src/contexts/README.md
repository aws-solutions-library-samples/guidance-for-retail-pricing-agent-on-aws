# Authentication Context

This directory contains the authentication context provider and related utilities for managing user authentication state throughout the application.

## AuthProvider

The `AuthProvider` component wraps Amplify's `Authenticator.Provider` and provides additional functionality for user context management.

### Features

- **User ID Extraction**: Automatically extracts user ID (sub claim) from ID tokens
- **Email Extraction**: Extracts user email from ID tokens
- **Token Validation**: Validates token expiration and handles expired tokens
- **Error Handling**: Provides user-friendly error messages for authentication failures
- **Token Refresh**: Listens for token refresh events and updates user context
- **Cross-tab Sync**: Handles authentication state changes across browser tabs

### Usage

```typescript
import { AuthProvider, useAuthContext } from '@/contexts';

// Wrap your app with AuthProvider
function App() {
  return (
    <AuthProvider>
      <YourAppComponents />
    </AuthProvider>
  );
}

// Use the context in components
function MyComponent() {
  const {
    user,           // Current CognitoUser object
    userId,         // User ID (sub claim) from ID token
    userEmail,      // User email from ID token
    userAttributes, // All user attributes from Cognito
    session,        // Current user session with tokens
    isAuthenticated,// Whether user is authenticated
    isLoading,      // Loading state
    isInitialized,  // Whether context is initialized
    error,          // Current error, if any
    getCurrentUser, // Function to get current user
    refreshUser,    // Function to refresh user context
    clearError      // Function to clear current error
  } = useAuthContext();

  return (
    <div>
      {isAuthenticated ? (
        <p>Welcome, {userEmail}! Your ID is: {userId}</p>
      ) : (
        <p>Please log in</p>
      )}
    </div>
  );
}
```

### Context Value

The `useAuthContext` hook returns an object with the following properties:

#### State Properties

- `user: CognitoUser | null` - Current authenticated user object
- `userId: string | null` - User ID extracted from ID token (sub claim)
- `userEmail: string | null` - User email extracted from ID token
- `userAttributes: CognitoUserAttributes | null` - User attributes from Cognito
- `session: CognitoUserSession | null` - Current user session with tokens
- `isLoading: boolean` - Whether authentication operations are in progress
- `isAuthenticated: boolean` - Whether user is currently authenticated
- `isInitialized: boolean` - Whether authentication context has been initialized
- `error: AuthError | null` - Current authentication error, if any

#### Methods

- `getCurrentUser(): Promise<CognitoUser | null>` - Gets current user details from Amplify
- `refreshUser(): Promise<void>` - Refreshes user context and tokens
- `clearError(): void` - Clears the current authentication error

### Token Management

The AuthProvider automatically handles:

1. **Token Extraction**: Extracts user information from ID and access tokens
2. **Token Validation**: Checks token expiration before using them
3. **Token Refresh**: Listens for token refresh events and updates context
4. **Error Handling**: Provides user-friendly error messages for token issues

### Event Handling

The AuthProvider listens for the following events:

- `tokenRefresh` - Custom event fired when tokens are refreshed
- `amplifyAuthStateChange` - Amplify authentication state changes

### Error Handling

Authentication errors are automatically mapped to user-friendly messages:

- `NotAuthorizedException` → "Authentication failed. Please sign in again."
- `TokenExpiredException` → "Your session has expired. Please sign in again."
- `UserNotFoundException` → "User not found. Please check your credentials."
- `NetworkError` → "Network error. Please check your connection and try again."

### Integration with Existing useAuth Hook

The AuthProvider works alongside the existing `useAuth` hook. You can use either:

- `useAuth()` - For authentication actions (signIn, signOut, etc.)
- `useAuthContext()` - For accessing user context and state

Both hooks provide complementary functionality and can be used together in the same component.

### Testing

The AuthProvider is fully tested with unit tests covering:

- User context initialization
- Token extraction and validation
- Error handling
- Event listening
- Context methods (getCurrentUser, refreshUser, clearError)

See `tests/frontend/unit/contexts/AuthContext.test.tsx` for test examples.

## Example Components

### UserProfile Component

The `UserProfile` component demonstrates how to use the AuthContext to display user information:

```typescript
import { useAuthContext } from '@/contexts';

export const UserProfile: React.FC = () => {
  const { user, userId, userEmail, userAttributes, isAuthenticated } = useAuthContext();

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <h1>User Profile</h1>
      <p>ID: {userId}</p>
      <p>Email: {userEmail}</p>
      <p>Username: {user?.username}</p>
      <p>Email Verified: {userAttributes?.email_verified ? 'Yes' : 'No'}</p>
    </div>
  );
};
```

This component shows how to access all the user information extracted from the ID token and display it in a user-friendly format.