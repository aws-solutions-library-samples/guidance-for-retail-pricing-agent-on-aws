/**
 * @fileoverview Tests for accessibility utilities.
 * 
 * Tests WCAG 2.1 AA compliance utilities including ARIA attributes,
 * keyboard navigation, focus management, and color contrast.
 */

import {
  KeyCodes,
  createLiveRegionAttributes,
  createExpandableAttributes,
  createButtonAttributes,
  createProgressAttributes,
  createStatusAttributes,
  createAlertAttributes,
  handleKeyboardNavigation,
  announceToScreenReader,
  meetsContrastRequirement,
  getContrastRatio,
  generateAriaId
} from '../../../../src/frontend/src/utils/accessibility';

describe('Accessibility Utilities', () => {
  describe('KeyCodes', () => {
    it('should define all required key codes', () => {
      expect(KeyCodes.ENTER).toBe('Enter');
      expect(KeyCodes.SPACE).toBe(' ');
      expect(KeyCodes.ESCAPE).toBe('Escape');
      expect(KeyCodes.TAB).toBe('Tab');
      expect(KeyCodes.ARROW_UP).toBe('ArrowUp');
      expect(KeyCodes.ARROW_DOWN).toBe('ArrowDown');
      expect(KeyCodes.ARROW_LEFT).toBe('ArrowLeft');
      expect(KeyCodes.ARROW_RIGHT).toBe('ArrowRight');
    });
  });

  describe('createLiveRegionAttributes', () => {
    it('should create polite live region attributes', () => {
      const attrs = createLiveRegionAttributes('polite');
      
      expect(attrs['aria-live']).toBe('polite');
      expect(attrs['aria-atomic']).toBe(false);
      expect(attrs['aria-relevant']).toBe('additions text');
    });

    it('should create assertive live region attributes', () => {
      const attrs = createLiveRegionAttributes('assertive', true, 'all');
      
      expect(attrs['aria-live']).toBe('assertive');
      expect(attrs['aria-atomic']).toBe(true);
      expect(attrs['aria-relevant']).toBe('all');
    });
  });

  describe('createExpandableAttributes', () => {
    it('should create expanded attributes', () => {
      const attrs = createExpandableAttributes(true, 'content-1');
      
      expect(attrs['aria-expanded']).toBe(true);
      expect(attrs['aria-controls']).toBe('content-1');
      expect(attrs.role).toBe('button');
      expect(attrs.tabIndex).toBe(0);
    });

    it('should create collapsed attributes', () => {
      const attrs = createExpandableAttributes(false, 'content-2');
      
      expect(attrs['aria-expanded']).toBe(false);
      expect(attrs['aria-controls']).toBe('content-2');
    });
  });

  describe('createButtonAttributes', () => {
    it('should create basic button attributes', () => {
      const attrs = createButtonAttributes('Click me');
      
      expect(attrs['aria-label']).toBe('Click me');
      expect(attrs.role).toBe('button');
      expect(attrs.tabIndex).toBe(0);
    });

    it('should create toggle button attributes', () => {
      const attrs = createButtonAttributes('Toggle', true);
      
      expect(attrs['aria-label']).toBe('Toggle');
      expect(attrs['aria-pressed']).toBe(true);
    });

    it('should create disabled button attributes', () => {
      const attrs = createButtonAttributes('Disabled', undefined, true);
      
      expect(attrs['aria-label']).toBe('Disabled');
      expect(attrs['aria-disabled']).toBe(true);
      expect(attrs.tabIndex).toBe(-1);
    });
  });

  describe('createProgressAttributes', () => {
    it('should create progress bar attributes', () => {
      const attrs = createProgressAttributes(75, 0, 100, 'Loading');
      
      expect(attrs.role).toBe('progressbar');
      expect(attrs['aria-valuenow']).toBe(75);
      expect(attrs['aria-valuemin']).toBe(0);
      expect(attrs['aria-valuemax']).toBe(100);
      expect(attrs['aria-label']).toBe('Loading');
      expect(attrs['aria-valuetext']).toBe('75%');
    });
  });

  describe('createStatusAttributes', () => {
    it('should create status attributes', () => {
      const attrs = createStatusAttributes('Processing', 'Current status');
      
      expect(attrs.role).toBe('status');
      expect(attrs['aria-label']).toBe('Current status');
      expect(attrs['aria-live']).toBe('polite');
    });

    it('should use status as label if no label provided', () => {
      const attrs = createStatusAttributes('Complete');
      
      expect(attrs['aria-label']).toBe('Complete');
    });
  });

  describe('createAlertAttributes', () => {
    it('should create polite alert attributes', () => {
      const attrs = createAlertAttributes('Information message');
      
      expect(attrs.role).toBe('alert');
      expect(attrs['aria-live']).toBe('polite');
      expect(attrs['aria-atomic']).toBe(true);
    });

    it('should create assertive alert attributes', () => {
      const attrs = createAlertAttributes('Error message', true);
      
      expect(attrs.role).toBe('alert');
      expect(attrs['aria-live']).toBe('assertive');
      expect(attrs['aria-atomic']).toBe(true);
    });
  });

  describe('handleKeyboardNavigation', () => {
    it('should call onActivate for Enter key', () => {
      const onActivate = jest.fn();
      const event = {
        key: 'Enter',
        preventDefault: jest.fn()
      } as any;
      
      handleKeyboardNavigation(event, onActivate);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onActivate).toHaveBeenCalled();
    });

    it('should call onActivate for Space key', () => {
      const onActivate = jest.fn();
      const event = {
        key: ' ',
        preventDefault: jest.fn()
      } as any;
      
      handleKeyboardNavigation(event, onActivate);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onActivate).toHaveBeenCalled();
    });

    it('should call onEscape for Escape key', () => {
      const onActivate = jest.fn();
      const onEscape = jest.fn();
      const event = {
        key: 'Escape',
        preventDefault: jest.fn()
      } as any;
      
      handleKeyboardNavigation(event, onActivate, onEscape);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(onActivate).not.toHaveBeenCalled();
      expect(onEscape).toHaveBeenCalled();
    });

    it('should not call callbacks for other keys', () => {
      const onActivate = jest.fn();
      const event = {
        key: 'a',
        preventDefault: jest.fn()
      } as any;
      
      handleKeyboardNavigation(event, onActivate);
      
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onActivate).not.toHaveBeenCalled();
    });
  });

  describe('announceToScreenReader', () => {
    beforeEach(() => {
      // Clean up any existing live regions
      const existing = document.getElementById('sr-live-region');
      if (existing) {
        existing.remove();
      }
    });

    it('should create live region if not exists', () => {
      announceToScreenReader('Test message');
      
      const liveRegion = document.getElementById('sr-live-region');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    });

    it('should announce message to screen reader', (done) => {
      announceToScreenReader('Test announcement');
      
      setTimeout(() => {
        const liveRegion = document.getElementById('sr-live-region');
        expect(liveRegion?.textContent).toBe('Test announcement');
        done();
      }, 150);
    });

    it('should update politeness level', () => {
      announceToScreenReader('First message', 'polite');
      announceToScreenReader('Second message', 'assertive');
      
      const liveRegion = document.getElementById('sr-live-region');
      expect(liveRegion?.getAttribute('aria-live')).toBe('assertive');
    });
  });

  describe('Color Contrast', () => {
    describe('meetsContrastRequirement', () => {
      it('should return true for sufficient contrast (4.5:1)', () => {
        // Black on white: 21:1
        expect(meetsContrastRequirement('#000000', '#FFFFFF')).toBe(true);
        
        // Dark gray on white: ~9.7:1
        expect(meetsContrastRequirement('#414d5c', '#FFFFFF')).toBe(true);
        
        // Blue on white: ~4.5:1
        expect(meetsContrastRequirement('#0972d3', '#FFFFFF')).toBe(true);
      });

      it('should return false for insufficient contrast', () => {
        // Light gray on white: ~1.5:1
        expect(meetsContrastRequirement('#CCCCCC', '#FFFFFF')).toBe(false);
        
        // Yellow on white: ~1.1:1
        expect(meetsContrastRequirement('#FFFF00', '#FFFFFF')).toBe(false);
      });
    });

    describe('getContrastRatio', () => {
      it('should calculate correct contrast ratio for black on white', () => {
        const ratio = getContrastRatio('#000000', '#FFFFFF');
        expect(ratio).toBeCloseTo(21, 0);
      });

      it('should calculate correct contrast ratio for white on black', () => {
        const ratio = getContrastRatio('#FFFFFF', '#000000');
        expect(ratio).toBeCloseTo(21, 0);
      });

      it('should calculate correct contrast ratio for same colors', () => {
        const ratio = getContrastRatio('#FFFFFF', '#FFFFFF');
        expect(ratio).toBeCloseTo(1, 0);
      });

      it('should calculate correct contrast ratio for blue on white', () => {
        const ratio = getContrastRatio('#0972d3', '#FFFFFF');
        expect(ratio).toBeGreaterThan(4.5);
      });
    });
  });

  describe('generateAriaId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateAriaId();
      const id2 = generateAriaId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^aria-/);
      expect(id2).toMatch(/^aria-/);
    });

    it('should use custom prefix', () => {
      const id = generateAriaId('custom');
      
      expect(id).toMatch(/^custom-/);
    });
  });
});
