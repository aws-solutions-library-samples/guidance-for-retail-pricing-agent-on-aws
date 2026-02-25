/**
 * @fileoverview AccessibilityProvider component for global accessibility features.
 * 
 * Provides global accessibility context including:
 * - Skip links for main content navigation
 * - Keyboard shortcut management
 * - Screen reader announcements
 * - Focus management
 * - ARIA live regions
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  createSkipLink,
  announceToScreenReader,
  AriaLive,
  KeyCodes
} from '../utils/accessibility';
import '../styles/accessibility.css';

/**
 * Accessibility context interface.
 */
interface AccessibilityContextType {
  /** Announces a message to screen readers */
  announce: (message: string, politeness?: AriaLive) => void;
  /** Registers a keyboard shortcut */
  registerShortcut: (key: string, handler: () => void, description: string) => void;
  /** Unregisters a keyboard shortcut */
  unregisterShortcut: (key: string) => void;
  /** Gets all registered shortcuts */
  getShortcuts: () => Map<string, { handler: () => void; description: string }>;
}

/**
 * Accessibility context.
 */
const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

/**
 * Props for AccessibilityProvider component.
 */
interface AccessibilityProviderProps {
  /** Child components */
  children: React.ReactNode;
  /** ID of main content element for skip link */
  mainContentId?: string;
}

/**
 * AccessibilityProvider component.
 * 
 * Provides global accessibility features including skip links, keyboard shortcuts,
 * screen reader announcements, and focus management.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({
  children,
  mainContentId = 'main-content'
}) => {
  const [shortcuts] = useState<Map<string, { handler: () => void; description: string }>>(
    new Map()
  );
  const skipLinkRef = useRef<HTMLAnchorElement | null>(null);

  /**
   * Announces a message to screen readers.
   */
  const announce = useCallback((message: string, politeness: AriaLive = 'polite') => {
    announceToScreenReader(message, politeness);
  }, []);

  /**
   * Registers a keyboard shortcut.
   */
  const registerShortcut = useCallback((
    key: string,
    handler: () => void,
    description: string
  ) => {
    shortcuts.set(key, { handler, description });
  }, [shortcuts]);

  /**
   * Unregisters a keyboard shortcut.
   */
  const unregisterShortcut = useCallback((key: string) => {
    shortcuts.delete(key);
  }, [shortcuts]);

  /**
   * Gets all registered shortcuts.
   */
  const getShortcuts = useCallback(() => {
    return new Map(shortcuts);
  }, [shortcuts]);

  /**
   * Handles global keyboard shortcuts.
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Check for registered shortcuts
    const shortcut = shortcuts.get(event.key.toLowerCase());
    if (shortcut && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Only trigger if not in an input field
      const target = event.target as HTMLElement;
      const isInputField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      
      if (!isInputField) {
        event.preventDefault();
        shortcut.handler();
        announce(`Keyboard shortcut ${event.key} activated: ${shortcut.description}`);
      }
    }

    // Handle Escape key globally
    if (event.key === KeyCodes.ESCAPE) {
      // Close any open modals, dialogs, or expandable sections
      const openDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (openDialogs.length > 0) {
        const lastDialog = openDialogs[openDialogs.length - 1] as HTMLElement;
        const closeButton = lastDialog.querySelector('[aria-label*="Close"]') as HTMLElement;
        if (closeButton) {
          closeButton.click();
        }
      }
    }
  }, [shortcuts, announce]);

  /**
   * Effect: Set up skip link and keyboard shortcuts.
   */
  useEffect(() => {
    // Create and insert skip link
    const skipLink = createSkipLink(mainContentId);
    skipLinkRef.current = skipLink;
    document.body.insertBefore(skipLink, document.body.firstChild);

    // Add keyboard shortcut listener
    document.addEventListener('keydown', handleKeyDown);

    // Announce page load to screen readers
    announce('Pricing Dashboard loaded. Press Tab to navigate, or use skip link to jump to main content.');

    return () => {
      // Clean up skip link
      if (skipLinkRef.current && skipLinkRef.current.parentNode) {
        skipLinkRef.current.parentNode.removeChild(skipLinkRef.current);
      }

      // Remove keyboard shortcut listener
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mainContentId, handleKeyDown, announce]);

  /**
   * Effect: Add main content landmark if not present.
   */
  useEffect(() => {
    const mainContent = document.getElementById(mainContentId);
    if (mainContent && !mainContent.getAttribute('role')) {
      mainContent.setAttribute('role', 'main');
      mainContent.setAttribute('aria-label', 'Main content');
    }
  }, [mainContentId]);

  const contextValue: AccessibilityContextType = {
    announce,
    registerShortcut,
    unregisterShortcut,
    getShortcuts
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
    </AccessibilityContext.Provider>
  );
};

/**
 * Hook to access accessibility context.
 * 
 * @returns Accessibility context
 * @throws Error if used outside AccessibilityProvider
 */
export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
};

/**
 * Hook for keyboard shortcuts within a component.
 * 
 * @param shortcuts - Map of key to handler and description
 */
export const useKeyboardShortcuts = (
  shortcuts: Map<string, { handler: () => void; description: string }>
) => {
  const { registerShortcut, unregisterShortcut } = useAccessibility();

  useEffect(() => {
    // Register all shortcuts
    shortcuts.forEach((value, key) => {
      registerShortcut(key, value.handler, value.description);
    });

    // Cleanup: unregister all shortcuts
    return () => {
      shortcuts.forEach((_, key) => {
        unregisterShortcut(key);
      });
    };
  }, [shortcuts, registerShortcut, unregisterShortcut]);
};

/**
 * Hook for announcing updates to screen readers.
 * 
 * @param message - Message to announce
 * @param dependencies - Dependencies that trigger announcement
 * @param politeness - Politeness level
 */
export const useAnnouncement = (
  message: string,
  dependencies: React.DependencyList,
  politeness: AriaLive = 'polite'
) => {
  const { announce } = useAccessibility();

  useEffect(() => {
    if (message) {
      announce(message, politeness);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
};

export default AccessibilityProvider;
