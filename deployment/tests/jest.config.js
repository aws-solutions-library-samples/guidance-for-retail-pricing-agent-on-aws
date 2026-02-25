/**
 * @fileoverview Master Jest configuration for all tests.
 * 
 * Configures Jest projects for frontend and backend testing
 * with unified coverage reporting.
 */

module.exports = {
  projects: [
    '<rootDir>/frontend.jest.config.js',
    '<rootDir>/backend.jest.config.js'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js}',
    '!src/**/*.d.ts',
    '!src/**/node_modules/**',
    '!src/**/cdk.out/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};