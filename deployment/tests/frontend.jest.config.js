/**
 * @fileoverview Jest configuration for frontend testing.
 * 
 * Configures Jest for testing React TypeScript components with
 * Apollo Client, GraphQL, and CloudScape Design System.
 */

module.exports = {
  displayName: 'Frontend',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '../',
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup/test-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/frontend/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/frontend/src/components/$1',
    '^@/types/(.*)$': '<rootDir>/src/frontend/src/types/$1',
    '^@/services/(.*)$': '<rootDir>/src/frontend/src/services/$1',
    '^@/utils/(.*)$': '<rootDir>/src/frontend/src/utils/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/frontend/src/hooks/$1',
    '^@/graphql/(.*)$': '<rootDir>/src/frontend/src/graphql/$1',
    '^@/data/(.*)$': '<rootDir>/src/frontend/src/data/$1',
    '^@cloudscape-design/components$': '<rootDir>/tests/frontend/setup/__mocks__/@cloudscape-design/components.tsx',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tests/frontend/tsconfig.json'
    }],
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '<rootDir>/tests/frontend/**/*.(test|spec).(ts|tsx|js)'
  ],
  collectCoverageFrom: [
    'src/frontend/src/**/*.{ts,tsx}',
    '!src/frontend/src/**/*.d.ts',
    '!src/frontend/src/**/*.test.*',
    '!src/frontend/src/**/*.spec.*'
  ],
  coverageDirectory: 'coverage/frontend',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  transformIgnorePatterns: [
    'node_modules/(?!(@cloudscape-design|@testing-library)/)'
  ],

};