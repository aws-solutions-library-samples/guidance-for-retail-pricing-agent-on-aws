/**
 * @fileoverview Jest test setup and global configuration for frontend tests.
 * 
 * Configures testing environment with necessary polyfills,
 * mocks, and global test utilities.
 */

import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';
import { TextEncoder, TextDecoder } from 'util';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Extend Jest matchers for better TypeScript support
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveAttribute(attr: string, value?: string): R;
      toHaveStyle(style: Record<string, any>): R;
      toHaveNoViolations(): R;
    }
  }
}

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock IntersectionObserver for lazy loading tests
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver for CloudScape components
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock WebSocket for GraphQL subscriptions
global.WebSocket = class WebSocket {
  constructor() {}
  close() {}
  send() {}
} as any;

// Mock fetch for HTTP requests
global.fetch = jest.fn();

// Mock console methods to reduce test noise
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});