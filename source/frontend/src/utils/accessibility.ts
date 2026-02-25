/**
 * @fileoverview Accessibility utilities for pricing dashboard.
 * 
 * Provides utilities for implementing WCAG 2.1 AA compliant accessibility features
 * including keyboard navigation, ARIA labels, focus management, and color contrast.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

/**
 * Keyboard key codes for navigation.
 */
export const KeyCodes = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown'
} as const;

/**
 * ARIA live region politeness levels.
 */
export type AriaLive = 'off' | 'polite' | 'assertive';

/**
 * ARIA role types for common components.
 */
export type AriaRole = 
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem';

/**
 * Valid aria-relevant values per ARIA specification.
 */
export type AriaRelevant = 
  | 'additions'
  | 'additions text'
  | 'all'
  | 'removals'
  | 'removals additions'
  | 'removals text'
  | 'text'
  | 'text additions'
  | 'text removals';

/**
 * Creates ARIA attributes for a live region.
 * 
 * @param politeness - Politeness level for announcements
 * @param atomic - Whether to announce entire region or just changes
 * @param relevant - What changes should be announced
 * @returns ARIA attributes object
 */
export const createLiveRegionAttributes = (
  politeness: AriaLive = 'polite',
  atomic: boolean = false,
  relevant: AriaRelevant = 'additions text'
) => ({
  'aria-live': politeness,
  'aria-atomic': atomic,
  'aria-relevant': relevant
});

/**
 * Creates ARIA attributes for an expandable section.
 * 
 * @param expanded - Whether section is expanded
 * @param controlsId - ID of the element being controlled
 * @returns ARIA attributes object
 */
export const createExpandableAttributes = (
  expanded: boolean,
  controlsId: string
) => ({
  'aria-expanded': expanded,
  'aria-controls': controlsId,
  role: 'button' as AriaRole,
  tabIndex: 0
});

/**
 * Creates ARIA attributes for a button.
 * 
 * @param label - Accessible label for the button
 * @param pressed - Whether button is pressed (for toggle buttons)
 * @param disabled - Whether button is disabled
 * @returns ARIA attributes object
 */
export const createButtonAttributes = (
  label: string,
  pressed?: boolean,
  disabled?: boolean
) => ({
  'aria-label': label,
  ...(pressed !== undefined && { 'aria-pressed': pressed }),
  ...(disabled && { 'aria-disabled': true }),
  role: 'button' as AriaRole,
  tabIndex: disabled ? -1 : 0
});

/**
 * Creates ARIA attributes for a progress indicator.
 * 
 * @param value - Current value
 * @param min - Minimum value
 * @param max - Maximum value
 * @param label - Accessible label
 * @returns ARIA attributes object
 */
export const createProgressAttributes = (
  value: number,
  min: number = 0,
  max: number = 100,
  label: string
) => ({
  role: 'progressbar' as AriaRole,
  'aria-valuenow': value,
  'aria-valuemin': min,
  'aria-valuemax': max,
  'aria-label': label,
  'aria-valuetext': `${value}%`
});

/**
 * Creates ARIA attributes for a status indicator.
 * 
 * @param status - Status text
 * @param label - Accessible label
 * @returns ARIA attributes object
 */
export const createStatusAttributes = (
  status: string,
  label?: string
) => ({
  role: 'status' as AriaRole,
  'aria-label': label || status,
  'aria-live': 'polite' as AriaLive
});

/**
 * Creates ARIA attributes for an alert.
 * 
 * @param message - Alert message
 * @param assertive - Whether alert should interrupt screen reader
 * @returns ARIA attributes object
 */
export const createAlertAttributes = (
  message: string,
  assertive: boolean = false
) => ({
  role: 'alert' as AriaRole,
  'aria-live': (assertive ? 'assertive' : 'polite') as AriaLive,
  'aria-atomic': true
});

/**
 * Handles keyboard navigation for interactive elements.
 * 
 * @param event - Keyboard event
 * @param onActivate - Callback when element is activated (Enter/Space)
 * @param onEscape - Optional callback when Escape is pressed
 */
export const handleKeyboardNavigation = (
  event: React.KeyboardEvent,
  onActivate: () => void,
  onEscape?: () => void
) => {
  switch (event.key) {
    case KeyCodes.ENTER:
    case KeyCodes.SPACE:
      event.preventDefault();
      onActivate();
      break;
    case KeyCodes.ESCAPE:
      if (onEscape) {
        event.preventDefault();
        onEscape();
      }
      break;
  }
};

/**
 * Manages focus trap within a container (e.g., modal, dialog).
 * 
 * @param containerRef - Reference to container element
 * @param isActive - Whether focus trap is active
 */
export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean
) => {
  React.useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== KeyCodes.TAB) return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    
    // Focus first element when trap activates
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [containerRef, isActive]);
};

/**
 * Announces a message to screen readers using a live region.
 * 
 * @param message - Message to announce
 * @param politeness - Politeness level
 */
export const announceToScreenReader = (
  message: string,
  politeness: AriaLive = 'polite'
) => {
  // Create or get existing live region
  let liveRegion = document.getElementById('sr-live-region');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-live-region';
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  // Update politeness if different
  if (liveRegion.getAttribute('aria-live') !== politeness) {
    liveRegion.setAttribute('aria-live', politeness);
  }

  // Clear and set new message
  liveRegion.textContent = '';
  setTimeout(() => {
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }, 100);
};

/**
 * Checks if color contrast meets WCAG 2.1 AA standards (4.5:1 for normal text).
 * 
 * @param foreground - Foreground color (hex)
 * @param background - Background color (hex)
 * @returns Whether contrast ratio meets AA standard
 */
export const meetsContrastRequirement = (
  foreground: string,
  background: string
): boolean => {
  const ratio = getContrastRatio(foreground, background);
  return ratio >= 4.5; // WCAG 2.1 AA for normal text
};

/**
 * Calculates contrast ratio between two colors.
 * 
 * @param color1 - First color (hex)
 * @param color2 - Second color (hex)
 * @returns Contrast ratio
 */
export const getContrastRatio = (color1: string, color2: string): number => {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Calculates relative luminance of a color.
 * 
 * @param color - Color (hex)
 * @returns Relative luminance (0-1)
 */
const getRelativeLuminance = (color: string): number => {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
    const normalized = val / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Converts hex color to RGB.
 * 
 * @param hex - Hex color string
 * @returns RGB object or null
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * Creates skip link for main content navigation.
 * 
 * @param targetId - ID of main content element
 * @returns Skip link element
 */
export const createSkipLink = (targetId: string): HTMLAnchorElement => {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = 'Skip to main content';
  skipLink.className = 'skip-link';
  skipLink.style.position = 'absolute';
  skipLink.style.left = '-10000px';
  skipLink.style.top = '0';
  skipLink.style.width = '1px';
  skipLink.style.height = '1px';
  skipLink.style.overflow = 'hidden';
  
  // Show on focus
  skipLink.addEventListener('focus', () => {
    skipLink.style.left = '0';
    skipLink.style.width = 'auto';
    skipLink.style.height = 'auto';
    skipLink.style.padding = '8px';
    skipLink.style.backgroundColor = '#0972d3';
    skipLink.style.color = '#ffffff';
    skipLink.style.zIndex = '9999';
  });
  
  skipLink.addEventListener('blur', () => {
    skipLink.style.left = '-10000px';
    skipLink.style.width = '1px';
    skipLink.style.height = '1px';
    skipLink.style.padding = '0';
  });
  
  return skipLink;
};

/**
 * Manages focus restoration after modal/dialog closes.
 */
export class FocusManager {
  private previousFocus: HTMLElement | null = null;

  /**
   * Saves current focus before opening modal/dialog.
   */
  saveFocus(): void {
    this.previousFocus = document.activeElement as HTMLElement;
  }

  /**
   * Restores focus to previously focused element.
   */
  restoreFocus(): void {
    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }

  /**
   * Moves focus to specified element.
   * 
   * @param element - Element to focus
   */
  moveFocusTo(element: HTMLElement): void {
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
  }
}

/**
 * Hook for managing focus within a component.
 * 
 * @returns Focus manager instance
 */
export const useFocusManager = (): FocusManager => {
  const managerRef = React.useRef<FocusManager>(new FocusManager());
  return managerRef.current;
};

/**
 * Hook for announcing updates to screen readers.
 * 
 * @param message - Message to announce
 * @param dependencies - Dependencies that trigger announcement
 * @param politeness - Politeness level
 */
export const useScreenReaderAnnouncement = (
  message: string,
  dependencies: React.DependencyList,
  politeness: AriaLive = 'polite'
) => {
  React.useEffect(() => {
    if (message) {
      announceToScreenReader(message, politeness);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
};

/**
 * Generates a unique ID for ARIA relationships.
 * 
 * @param prefix - Prefix for the ID
 * @returns Unique ID string
 */
export const generateAriaId = (prefix: string = 'aria'): string => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
};

// Re-export React for use in hooks
import React from 'react';
