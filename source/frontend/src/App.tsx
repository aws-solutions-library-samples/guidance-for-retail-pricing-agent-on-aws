/**
 * @fileoverview Main application component with routing configuration.
 * 
 * Sets up React Router for navigation between different pages of the
 * Retail Pricing Agent Orchestrator application with authentication state persistence.
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { Spinner, Container, Box } from '@cloudscape-design/components';

// Import components
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { AuthProvider } from '@/contexts';

// Import pages (with code splitting for dashboard)
import { HomePage, LoginPage, ForgotPasswordPage, ProfilePage, PricingDashboardListPage } from './pages';
import { OAuthCallback } from '@/components/OAuthCallback';
import { ProductSelector } from '@/components/ProductSelector';

// Lazy load PricingDashboardPage for code splitting (Requirement 15.1)
const PricingDashboardPage = React.lazy(() => 
  import('./pages/PricingDashboardPage').then(module => ({ default: module.PricingDashboardPage }))
);

// Lazy load PricingAnalysisPage for code splitting
const PricingAnalysisPage = React.lazy(() => 
  import('./pages/PricingAnalysisPage').then(module => ({ default: module.PricingAnalysisPage }))
);

// Import global styles
import '@cloudscape-design/global-styles/index.css';

// Import accessibility provider and styles
import { AccessibilityProvider } from '@/components/AccessibilityProvider';
import '@/styles/accessibility.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
    },
  },
});

/**
 * Application loading component displayed during authentication initialization.
 * 
 * Features:
 * - Large spinner with descriptive text
 * - Smooth fade-in animation
 * - Centered layout with proper spacing
 * - Accessible loading state announcement
 * 
 * @returns JSX element
 */
const AppLoading: React.FC = () => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fafafa',
      zIndex: 9999,
      animation: 'fadeIn 0.3s ease-in-out'
    }}
    role="status"
    aria-live="polite"
    aria-label="Loading application"
  >
    <Container>
      <Box textAlign="center" padding="xxl">
        <div
          style={{
            animation: 'pulse 2s infinite ease-in-out'
          }}
        >
          <Spinner size="large" />
        </div>
        <Box
          variant="h3"
          color="text-body-secondary"
          margin={{ top: 'l' }}
          fontWeight="normal"
        >
          Initializing authentication...
        </Box>
        <Box
          variant="p"
          color="text-body-secondary"
          margin={{ top: 's' }}
          fontSize="body-s"
        >
          Please wait while we verify your session
        </Box>
      </Box>
    </Container>

    {/* CSS animations */}
    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
      }
    `}</style>
  </div>
);

/**
 * Protected route wrapper that includes AppLayout.
 * 
 * @param children - Child components to render
 * @returns JSX element
 */
const ProtectedRouteWithLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <AppLayout>
      {children}
    </AppLayout>
  </ProtectedRoute>
);

/**
 * Main application routes component with smooth authentication state transitions.
 * 
 * Features:
 * - Smooth loading state transitions
 * - Proper authentication state handling
 * - Fade transitions between states
 * - Accessible loading announcements
 * 
 * @returns JSX element
 */
const AppRoutes: React.FC = () => {
  return (
    <Router>
      <AuthenticatedRoutes />
    </Router>
  );
};

/**
 * Authenticated routes component that uses auth hooks within Router context.
 * 
 * @returns JSX element
 */
const AuthenticatedRoutes: React.FC = () => {
  const { isLoading, isInitialized, isAuthenticated } = useAuth();
  const [showContent, setShowContent] = React.useState(false);

  // Handle smooth transitions when authentication state changes
  React.useEffect(() => {
    if (isInitialized && !isLoading) {
      // In test environment, show content immediately
      if (process.env.NODE_ENV === 'test') {
        setShowContent(true);
      } else {
        // Add a small delay for smooth transition in production
        const timer = setTimeout(() => {
          setShowContent(true);
        }, 150);

        return () => clearTimeout(timer);
      }
    } else {
      setShowContent(false);
    }
  }, [isInitialized, isLoading]);

  // Show loading spinner while authentication state is being determined
  if (isLoading || !isInitialized || !showContent) {
    return <AppLoading />;
  }

  return (
    <div
      style={{
        animation: 'fadeIn 0.4s ease-in-out',
        minHeight: '100vh'
      }}
    >
      <Routes>
        {/* Authentication routes - accessible when not authenticated */}
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <div style={{ animation: 'slideIn 0.3s ease-out' }}>
                <LoginPage />
              </div>
            )
          }
        />
        <Route
          path="/forgot-password"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <div style={{ animation: 'slideIn 0.3s ease-out' }}>
                <ForgotPasswordPage />
              </div>
            )
          }
        />

        {/* OAuth callback route - handles Midway OIDC authentication callback */}
        <Route
          path="/oauth/callback"
          element={
            <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <OAuthCallback />
            </div>
          }
        />

        {/* Protected routes - require authentication and include AppLayout */}
        <Route
          path="/"
          element={
            <div style={{ animation: 'slideIn 0.3s ease-out' }}>
              <ProtectedRouteWithLayout>
                <HomePage />
              </ProtectedRouteWithLayout>
            </div>
          }
        />

        <Route
          path="/products"
          element={
            <div style={{ animation: 'slideIn 0.3s ease-out' }}>
              <ProtectedRouteWithLayout>
                <ProductSelector />
              </ProtectedRouteWithLayout>
            </div>
          }
        />

        <Route
          path="/pricing"
          element={
            <div style={{ animation: 'slideIn 0.3s ease-out' }}>
              <ProtectedRouteWithLayout>
                <React.Suspense fallback={<AppLoading />}>
                  <PricingDashboardListPage />
                </React.Suspense>
              </ProtectedRouteWithLayout>
            </div>
          }
        />

        <Route
          path="/pricing/:sessionId"
          element={
            <div style={{ animation: 'slideIn 0.3s ease-out' }}>
              <ProtectedRouteWithLayout>
                <React.Suspense fallback={<AppLoading />}>
                  <PricingAnalysisPage />
                </React.Suspense>
              </ProtectedRouteWithLayout>
            </div>
          }
        />

        <Route
          path="/profile"
          element={
            <div style={{ animation: 'slideIn 0.3s ease-out' }}>
              <ProtectedRouteWithLayout>
                <ProfilePage />
              </ProtectedRouteWithLayout>
            </div>
          }
        />

        {/* Redirect any unknown routes to home (which will redirect to login if not authenticated) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* CSS animations for smooth transitions */}
      <style>{`
        @keyframes slideIn {
          from { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Main application component with routing and providers.
 * 
 * @returns JSX element
 */
export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <AuthProvider>
          <AccessibilityProvider mainContentId="main-content">
            <AppRoutes />
          </AccessibilityProvider>
        </AuthProvider>
      </JotaiProvider>
    </QueryClientProvider>
  );
};

export default App;