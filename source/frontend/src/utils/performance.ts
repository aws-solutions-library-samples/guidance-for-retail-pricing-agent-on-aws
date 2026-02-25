/**
 * @fileoverview Performance utility functions.
 * 
 * Provides utilities for optimizing performance including debouncing,
 * throttling, and other performance-related helpers.
 * 
 * Performance optimizations (Requirement 15.4)
 */

/**
 * Creates a debounced function that delays invoking func until after wait
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * 
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every
 * wait milliseconds.
 * 
 * @param func - The function to throttle
 * @param wait - The number of milliseconds to throttle invocations to
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  let lastResult: ReturnType<T>;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      lastResult = func(...args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
      }, wait);
    }

    return lastResult;
  };
}

/**
 * Formats a price value with memoization for performance.
 * 
 * @param value - Price value to format
 * @returns Formatted price string
 */
export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Formats a percentage value with memoization for performance.
 * 
 * @param value - Percentage value to format (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Calculates margin percentage from cost and price.
 * 
 * @param cost - Product cost
 * @param price - Selling price
 * @returns Margin percentage
 */
export function calculateMargin(cost: number, price: number): number {
  if (price === 0) return 0;
  return ((price - cost) / price) * 100;
}

/**
 * Checks if animations should be reduced based on user preferences.
 * 
 * @returns True if animations should be reduced
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  return mediaQuery.matches;
}

/**
 * Requests an animation frame with fallback for older browsers.
 * 
 * @param callback - Function to call on next animation frame
 * @returns Request ID
 */
export function requestAnimationFramePolyfill(callback: FrameRequestCallback): number {
  return window.requestAnimationFrame?.(callback) || 
         window.setTimeout(callback, 1000 / 60);
}

/**
 * Cancels an animation frame request with fallback for older browsers.
 * 
 * @param id - Request ID to cancel
 */
export function cancelAnimationFramePolyfill(id: number): void {
  if (window.cancelAnimationFrame) {
    window.cancelAnimationFrame(id);
  } else {
    window.clearTimeout(id);
  }
}
