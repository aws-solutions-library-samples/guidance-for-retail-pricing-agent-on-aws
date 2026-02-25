/**
 * @fileoverview Navigation hook for routing between pages.
 * 
 * Provides navigation functionality using React Router for the application.
 * Replaces the previous hash-based navigation with proper routing.
 */

import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';

/**
 * Navigation destinations.
 */
export type NavigationDestination = 
  | 'home'
  | 'product-catalog'
  | 'pricing-analysis'
  | 'pricing-dashboard'
  | 'login';

/**
 * Navigation parameters for different destinations.
 */
export interface NavigationParams {
  'pricing-analysis': { sessionId: string };
  'pricing-dashboard': { sessionId?: string };
  'product-catalog': Record<string, never>;
  'home': Record<string, never>;
  'login': Record<string, never>;
}

/**
 * Hook for navigation functionality using React Router.
 * 
 * @returns Navigation functions
 */
export const useNavigation = () => {
  const navigate = useRouterNavigate();

  /**
   * Navigate to a specific destination.
   * 
   * @param destination - Where to navigate
   * @param params - Navigation parameters
   */
  const navigateTo = useCallback(<T extends NavigationDestination>(
    destination: T,
    params?: NavigationParams[T]
  ) => {
    console.log(`Navigating to ${destination}`, params);
    
    // Use React Router navigation
    switch (destination) {
      case 'home':
        navigate('/');
        break;
      case 'product-catalog':
        navigate('/products');
        break;
      case 'pricing-analysis':
        // Updated route: /pricing/:sessionId instead of /pricing/analysis/:sessionId
        if (params && 'sessionId' in params) {
          navigate(`/pricing/${params.sessionId}`);
        } else {
          navigate('/pricing');
        }
        break;
      case 'pricing-dashboard':
        // Updated route: /pricing/:sessionId instead of /pricing/dashboard/:sessionId
        if (params && 'sessionId' in params && params.sessionId) {
          navigate(`/pricing/${params.sessionId}`);
        } else {
          navigate('/pricing');
        }
        break;
      case 'login':
        navigate('/login');
        break;
      default:
        console.warn(`Unknown navigation destination: ${destination}`);
    }
    
    // Dispatch a custom event for other components to listen to
    window.dispatchEvent(new CustomEvent('navigation', {
      detail: { destination, params }
    }));
  }, [navigate]);

  /**
   * Navigate back to the previous page.
   */
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  /**
   * Navigate to the pricing analysis page with a session ID.
   * 
   * @param sessionId - Pricing session ID
   */
  const navigateToPricingAnalysis = useCallback((sessionId: string) => {
    navigateTo('pricing-analysis', { sessionId });
  }, [navigateTo]);

  /**
   * Navigate to the pricing dashboard.
   * 
   * @param sessionId - Optional session ID to view specific session
   */
  const navigateToPricingDashboard = useCallback((sessionId?: string) => {
    navigateTo('pricing-dashboard', { sessionId });
  }, [navigateTo]);

  /**
   * Navigate to the product catalog.
   */
  const navigateToProductCatalog = useCallback(() => {
    navigateTo('product-catalog', {});
  }, [navigateTo]);

  /**
   * Navigate to the home page.
   */
  const navigateToHome = useCallback(() => {
    navigateTo('home', {});
  }, [navigateTo]);

  /**
   * Navigate to the login page.
   */
  const navigateToLogin = useCallback(() => {
    navigateTo('login', {});
  }, [navigateTo]);

  return {
    navigateTo,
    goBack,
    navigateToPricingAnalysis,
    navigateToPricingDashboard,
    navigateToProductCatalog,
    navigateToHome,
    navigateToLogin
  };
};