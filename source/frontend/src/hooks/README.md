# Authentication Hooks Documentation

This directory contains custom React hooks for authentication functionality using AWS Cognito and Amplify.

## Overview

The authentication system provides secure user authentication with automatic token refresh, session persistence, and cross-tab synchronization. All hooks are built on top of AWS Amplify's authentication library with additional security features and error handling.

## Hooks

### useAuth

**File:** `useAuth.ts`

The primary authentication hook that provides comprehensive authentication functionality.

#### Features

- Email/password authentication
- Password reset functionality
- Automatic token refresh
- Session persistence
- Cross-tab synchronization
- Security monitoring and logging
- Error handling and user-friendly messages

#### Usage

```typescript
import { useAuth } from '../hooks/useAuth';

function LoginComponent() {
  const {
    user,
    isLoading,
    isAuthenticated,
    error,
    signIn,
    signOut,
    forgotPassword,
    forgotPasswordSubmit,
    clearError
  } = useAuth();

  const handleLogin = async (email: string, password: string) => {
    try {
      await signIn(email, password);
      // User is now authenticated
    } catch (error) {
      // Error is automatically handled and displayed
    }
  };

  return (
    <div>
      {isAuthenticated ? (
        <div>Welcome, {user?.attributes.email}!</div>
      ) : (
        <LoginForm onSubmit={handleLogin} />
      )}
    </div>
  );
}
```

#### Return Value

```typescript
interface UseAuthReturn {
  // State
  user: CognitoUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AuthError | null;
  isInitialized: boolean;
  
  // Methods
  signIn: (email: string, password: string) => Promise<CognitoUser>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  forgotPasswordSubmit: (email: string, code: string, newPassword: string) => Promise<void>;
  currentAuthenticatedUser: (options?: { bypassCache?: boolean }) => Promise<CognitoUser>;
  currentSession: () => Promise<CognitoUserSession>;
  currentCredentials: () => Promise<AWSCredentials>;
  clearError: () => void;
}
```

### useTokenRefresh

**File:** `useTokenRefresh.ts`

Handles automatic token refresh to maintain user sessions without interruption.

#### Features

- Automatic token expiration monitoring
- Token refresh 5 minutes before expiration
- Cross-tab synchronization of token refresh
- Security validation of tokens
- Graceful handling of refresh failures

#### Usage

```typescript
import { useTokenRefresh } from '../hooks/useTokenRefresh';

function App() {
  const { isRefreshing, lastRefresh, refreshTokens } = useTokenRefresh(
    (user) => {
      // Called when tokens are refreshed
      console.log('Tokens refreshed for user:', user.attributes.email);
    }
  );

  // Manual refresh if needed
  const handleManualRefresh = async () => {
    try {
      await refreshTokens();
    } catch (error) {
      // User will be redirected to login
    }
  };

  return (
    <div>
      {isRefreshing && <div>Refreshing session...</div>}
      <div>Last refresh: {lastRefresh?.toLocaleString()}</div>
    </div>
  );
}
```

#### Return Value

```typescript
interface UseTokenRefreshReturn {
  isRefreshing: boolean;
  lastRefresh: Date | null;
  refreshTokens: () => Promise<void>;
}
```

### useSessionPersistence

**File:** `useSessionPersistence.ts`

Manages session persistence and cross-tab synchronization using browser storage and BroadcastChannel API.

#### Features

- Session restoration on app load
- Cross-tab login/logout synchronization
- Secure token storage using Amplify
- Automatic session cleanup
- Token expiration monitoring

#### Usage

```typescript
import { useSessionPersistence } from '../hooks/useSessionPersistence';

function AuthProvider({ children }) {
  const {
    user,
    isLoading,
    isInitialized,
    error,
    restoreSession,
    clearSession,
    notifyLogin,
    notifyLogout,
    notifyTokenRefresh
  } = useSessionPersistence();

  useEffect(() => {
    // Session is automatically restored on mount
    if (isInitialized && !user) {
      // No session found, show login
    }
  }, [isInitialized, user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
}
```

#### Return Value

```typescript
interface UseSessionPersistenceReturn {
  user: CognitoUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: AuthError | null;
  restoreSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  notifyLogin: (user: CognitoUser) => void;
  notifyLogout: () => void;
  notifyTokenRefresh: (user: CognitoUser) => void;
}
```

## Security Features

### Token Security

All hooks implement comprehensive token security measures:

- **HTTPS Enforcement**: All authentication requests require HTTPS
- **Secure Storage**: Tokens stored using Amplify's secure storage (IndexedDB)
- **Token Validation**: Automatic signature and expiration validation
- **Tampering Detection**: Monitors for token manipulation attempts
- **Secure Deletion**: Proper token cleanup on logout

### Security Monitoring

The hooks include built-in security event logging:

```typescript
// Security events are automatically logged
logSecurityEvent(
  SecurityEventType.TOKEN_TAMPERING,
  { errors: validationErrors },
  'CRITICAL'
);
```

### Error Handling

Comprehensive error handling with user-friendly messages:

```typescript
// Errors are automatically mapped to user-friendly messages
const authError = mapAuthError(error);
// authError.message contains user-friendly text
// authError.details contains technical details for logging
```

## Integration with Components

### Protected Routes

```typescript
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}
```

### Authentication Context

```typescript
import { AuthProvider } from '../contexts/AuthContext';
import { useAuth } from '../hooks/useAuth';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Your routes */}
        </Routes>
      </Router>
    </AuthProvider>
  );
}
```

## Best Practices

### Hook Usage

1. **Single Source of Truth**: Use `useAuth` as the primary authentication hook
2. **Error Handling**: Always handle authentication errors gracefully
3. **Loading States**: Show appropriate loading indicators during auth operations
4. **Security**: Never store tokens manually - let Amplify handle secure storage

### Performance

1. **Memoization**: Hooks are optimized with proper dependency arrays
2. **Cleanup**: All intervals and listeners are properly cleaned up
3. **Debouncing**: Token refresh checks are debounced to prevent excessive calls

### Testing

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

describe('useAuth', () => {
  it('should sign in user with valid credentials', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn('test@example.com', 'Password123!');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toBeDefined();
  });
});
```

## Troubleshooting

### Common Issues

1. **Hook Not Working**: Ensure component is wrapped in `AuthProvider`
2. **Token Refresh Failing**: Check network connectivity and Cognito configuration
3. **Cross-tab Sync Issues**: Verify BroadcastChannel support in browser
4. **Security Warnings**: Check HTTPS configuration and token storage

### Debug Information

Enable debug logging by setting:

```typescript
// In development
console.log('Auth Debug:', {
  user: user?.attributes,
  isAuthenticated,
  isLoading,
  error: error?.code
});
```

## Migration Guide

### From Legacy Auth

If migrating from a legacy authentication system:

1. Replace direct Amplify calls with `useAuth` hook
2. Update error handling to use mapped error messages
3. Remove manual token management code
4. Update components to use new authentication state

### Version Updates

When updating authentication hooks:

1. Check for breaking changes in return types
2. Update error handling if error format changes
3. Test cross-tab synchronization after updates
4. Verify security features are still working

## Related Documentation

- [Authentication Components](../components/README.md#authentication-components)
- [Authentication Types](../types/auth-types.ts)
- [Token Security](../utils/README-token-security.md)