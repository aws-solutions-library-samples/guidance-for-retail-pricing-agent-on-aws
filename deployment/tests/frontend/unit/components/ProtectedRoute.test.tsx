/**
 * @fileoverview Unit tests for ProtectedRoute component.
 * 
 * Tests authentication-based routing behavior including redirects,
 * loading states, and session expiration handling.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import type { UseAuthReturn } from '@/types/auth-types';

// Mock the useAuth hook
jest.mock('@/hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock react-router-dom Navigate component
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Navigate: ({ to, state, replace }: any) => {
    mockNavigate(to, state, replace);
    return <div data-testid="navigate" data-to={to} />;
  },
  useLocation: () => ({
    pathname: '/protected-page',
    search: '',
    hash: '',
    state: null
  })
}));

/**
 * Test wrapper component that provides routing context.
 */
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

/**
 * Creates a mock auth return object with default values.
 */
const createMockAuthReturn = (overrides: Partial<UseAuthReturn> = {}): UseAuthReturn => ({
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
  clearError: jest.fn(),
  ...overrides
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('should display loading spinner when authentication is loading', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isLoading: true,
      isInitialized: false
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByText('Verifying access...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should display loading spinner when not initialized', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isLoading: false,
      isInitialized: false
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByText('Verifying access...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: false,
      user: null,
      isInitialized: true
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
    expect(mockNavigate).toHaveBeenCalledWith(
      '/login',
      {
        from: {
          pathname: '/protected-page',
          search: '',
          hash: '',
          state: null
        },
        message: undefined
      },
      true
    );
  });

  it('should redirect to custom login URL when specified', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: false,
      user: null,
      isInitialized: true
    }));

    render(
      <TestWrapper>
        <ProtectedRoute redirectTo="/custom-login">
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/custom-login');
  });

  it('should redirect to login with session expired message when token is expired', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: false,
      user: null,
      isInitialized: true,
      error: {
        code: 'TokenExpiredException',
        message: 'Token has expired',
        name: 'TokenExpiredException'
      }
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      '/login',
      {
        from: {
          pathname: '/protected-page',
          search: '',
          hash: '',
          state: null
        },
        message: 'Your session has expired. Please log in again.'
      },
      true
    );
  });

  it('should redirect to login with session expired message when not authenticated error', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: false,
      user: null,
      isInitialized: true,
      error: {
        code: 'NotAuthenticatedException',
        message: 'User is not authenticated',
        name: 'NotAuthenticatedException'
      }
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      '/login',
      {
        from: {
          pathname: '/protected-page',
          search: '',
          hash: '',
          state: null
        },
        message: 'Your session has expired. Please log in again.'
      },
      true
    );
  });

  it('should render children when user is authenticated', () => {
    const mockUser = {
      username: 'test@example.com',
      attributes: {
        sub: 'user-123',
        email: 'test@example.com',
        email_verified: true
      },
      signInUserSession: null
    };

    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: true,
      user: mockUser,
      isInitialized: true
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Verifying access...')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should render custom fallback component when loading', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isLoading: true,
      isInitialized: false
    }));

    const CustomFallback = () => <div>Custom Loading...</div>;

    render(
      <TestWrapper>
        <ProtectedRoute fallback={<CustomFallback />}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(screen.getByText('Custom Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Verifying access...')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should handle access denied error with session expired message', () => {
    mockUseAuth.mockReturnValue(createMockAuthReturn({
      isAuthenticated: false,
      user: null,
      isInitialized: true,
      error: {
        code: 'AccessDeniedException',
        message: 'Access denied',
        name: 'AccessDeniedException'
      }
    }));

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      '/login',
      {
        from: {
          pathname: '/protected-page',
          search: '',
          hash: '',
          state: null
        },
        message: 'Your session has expired. Please log in again.'
      },
      true
    );
  });
});