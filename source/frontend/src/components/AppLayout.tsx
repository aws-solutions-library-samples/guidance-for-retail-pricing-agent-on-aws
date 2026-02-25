/**
 * @fileoverview Application layout component with header and navigation.
 * 
 * Provides the main application layout with header containing navigation
 * and user profile dropdown when authenticated.
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  SpaceBetween
} from '@cloudscape-design/components';
import { ProfileDropdown } from './ProfileDropdown';
import { DemoResetButton } from './DemoResetButton';
import { useAuth } from '../hooks/useAuth';

/**
 * Props for AppLayout component.
 */
export interface AppLayoutProps {
  /** Child components to render in the main content area */
  children: React.ReactNode;
  /** Optional navigation items for the sidebar */
  navigationItems?: Array<{
    type: 'link' | 'section' | 'divider';
    text?: string;
    href?: string;
    items?: Array<{ type: 'link'; text: string; href: string }>;
  }>;
  /** Whether to hide the navigation sidebar */
  navigationHide?: boolean;
  /** Optional breadcrumbs */
  breadcrumbs?: React.ReactNode;
  /** Optional content header */
  contentHeader?: React.ReactNode;
  /** Optional tools panel */
  tools?: React.ReactNode;
  /** Whether tools panel is open */
  toolsOpen?: boolean;
  /** Callback when tools panel open state changes */
  onToolsChange?: (event: { detail: { open: boolean } }) => void;
}

/**
 * Custom header component that includes TopNavigation and ProfileDropdown.
 * 
 * @returns JSX element
 */
const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  /**
   * Handles navigation to home page.
   */
  const handleLogoClick = () => {
    navigate('/');
  };

  /**
   * Handles profile dropdown logout callback.
   */
  const handleLogout = () => {
    console.log('User logged out from profile dropdown');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Top Navigation */}
      <header style={{ 
        height: '60px', 
        backgroundColor: '#232f3e', 
        color: 'white', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 16px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <h1 
          style={{ 
            margin: 0, 
            fontSize: '18px', 
            cursor: 'pointer' 
          }}
          onClick={handleLogoClick}
        >
          Retail Pricing Agent Orchestrator
        </h1>
      </header>
      
      {/* Demo Reset Button and Profile Dropdown positioned in top-right corner */}
      {isAuthenticated && user && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '16px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <DemoResetButton
            variant="normal"
            iconName="refresh"
            ariaLabel="Reset demo data"
          />
          <ProfileDropdown
            user={user}
            onLogout={handleLogout}
            showLogoutConfirmation={true}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Main application layout component with header and optional navigation.
 * 
 * Features:
 * - Top navigation with application branding
 * - User profile dropdown when authenticated (positioned in top-right corner)
 * - Responsive sidebar navigation
 * - Breadcrumb support
 * - Tools panel support
 * 
 * @param props - Component props
 * @returns AppLayout component
 */
export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  navigationItems = [],
  navigationHide = false,
  breadcrumbs,
  contentHeader,
  tools,
  toolsOpen = false,
  onToolsChange
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Default navigation items
  const defaultNavigationItems = [
    {
      type: 'link' as const,
      text: 'Home',
      href: '/'
    },
    {
      type: 'link' as const,
      text: 'Product Catalog',
      href: '/products'
    },
    {
      type: 'section' as const,
      text: 'Analysis',
      items: [
        {
          type: 'link' as const,
          text: 'Pricing Analysis',
          href: '/pricing'
        }
      ]
    }
  ];

  // Use provided navigation items or defaults
  const navItems = navigationItems.length > 0 ? navigationItems : defaultNavigationItems;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Custom Header with ProfileDropdown */}
      <AppHeader />

      {/* Main Application Layout */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        {/* Navigation Sidebar */}
        {!navigationHide && isAuthenticated && (
          <nav style={{ width: '250px', padding: '16px', borderRight: '1px solid #e0e0e0' }}>
            <SpaceBetween direction="vertical" size="l">
              {navItems.map((item, index) => {
                if (item.type === 'link') {
                  return (
                    <Box key={index}>
                      <a
                        href={item.href}
                        onClick={(e) => {
                          e.preventDefault();
                          if (item.href) {
                            navigate(item.href);
                          }
                        }}
                        style={{
                          textDecoration: 'none',
                          color: location.pathname === item.href ? '#0073bb' : 'inherit',
                          fontWeight: location.pathname === item.href ? 'bold' : 'normal'
                        }}
                      >
                        {item.text}
                      </a>
                    </Box>
                  );
                } else if (item.type === 'section' && item.items) {
                  return (
                    <Box key={index}>
                      <Box fontSize="heading-xs" fontWeight="bold" margin={{ bottom: 'xs' }}>
                        {item.text}
                      </Box>
                      <SpaceBetween direction="vertical" size="xs">
                        {item.items.map((subItem, subIndex) => (
                          <Box key={subIndex} margin={{ left: 's' }}>
                            <a
                              href={subItem.href}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(subItem.href);
                              }}
                              style={{
                                textDecoration: 'none',
                                color: location.pathname === subItem.href ? '#0073bb' : 'inherit',
                                fontWeight: location.pathname === subItem.href ? 'bold' : 'normal'
                              }}
                            >
                              {subItem.text}
                            </a>
                          </Box>
                        ))}
                      </SpaceBetween>
                    </Box>
                  );
                }
                return null;
              })}
            </SpaceBetween>
          </nav>
        )}

        {/* Main Content Area */}
        <main style={{ flex: 1, padding: '16px' }}>
          {breadcrumbs && <div style={{ marginBottom: '16px' }}>{breadcrumbs}</div>}
          {contentHeader && <div style={{ marginBottom: '16px' }}>{contentHeader}</div>}
          {children}
        </main>

        {/* Tools Panel */}
        {tools && toolsOpen && (
          <aside style={{ width: '300px', padding: '16px', borderLeft: '1px solid #e0e0e0' }}>
            {tools}
          </aside>
        )}
      </div>
    </div>
  );
};

export default AppLayout;