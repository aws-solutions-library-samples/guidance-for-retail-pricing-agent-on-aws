/**
 * @fileoverview Tests for the useNavigation hook.
 * 
 * Tests the navigation functionality using React Router.
 */

import { renderHook } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import React from 'react';

// Mock the navigate function
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

/**
 * Wrapper component for testing hooks that require Router context.
 */
const RouterWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return React.createElement(BrowserRouter, null, children);
};

describe('useNavigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('should navigate to home page', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.navigateToHome();

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should navigate to product catalog', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.navigateToProductCatalog();

    expect(mockNavigate).toHaveBeenCalledWith('/products');
  });

  it('should navigate to pricing analysis with session ID', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    const sessionId = 'test-session-123';
    result.current.navigateToPricingAnalysis(sessionId);

    expect(mockNavigate).toHaveBeenCalledWith(`/pricing/analysis/${sessionId}`);
  });

  it('should navigate to pricing analysis without session ID', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.navigateTo('pricing-analysis');

    expect(mockNavigate).toHaveBeenCalledWith('/pricing/analysis');
  });

  it('should navigate back using goBack', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.goBack();

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('should navigate to pricing dashboard with session ID', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    const sessionId = 'dashboard-session-456';
    result.current.navigateToPricingDashboard(sessionId);

    expect(mockNavigate).toHaveBeenCalledWith(`/pricing/dashboard/${sessionId}`);
  });

  it('should navigate to pricing dashboard without session ID', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.navigateToPricingDashboard();

    expect(mockNavigate).toHaveBeenCalledWith('/pricing/dashboard');
  });

  it('should navigate to login page', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    result.current.navigateToLogin();

    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('should handle unknown navigation destination', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    // @ts-expect-error Testing invalid destination
    result.current.navigateTo('invalid-destination');

    expect(consoleSpy).toHaveBeenCalledWith('Unknown navigation destination: invalid-destination');
    
    consoleSpy.mockRestore();
  });

  it('should dispatch custom navigation event', () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: RouterWrapper,
    });

    const eventSpy = jest.spyOn(window, 'dispatchEvent');

    result.current.navigateToHome();

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigation',
        detail: { destination: 'home', params: {} }
      })
    );

    eventSpy.mockRestore();
  });
});