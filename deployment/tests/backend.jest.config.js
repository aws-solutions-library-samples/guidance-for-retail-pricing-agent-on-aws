/**
 * @fileoverview Jest configuration for backend testing.
 * 
 * Configures Jest for testing Lambda functions, GraphQL resolvers,
 * and other backend JavaScript code.
 */

module.exports = {
  displayName: 'Backend',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../',
  setupFilesAfterEnv: ['<rootDir>/tests/backend/setup/test-setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '<rootDir>/tests/backend/**/*.(test|spec).(ts|tsx|js)'
  ],
  collectCoverageFrom: [
    'src/backend/lib/**/*.{ts,tsx,js}',
    '!src/backend/lib/**/*.d.ts',
    '!src/backend/lib/**/*.test.*',
    '!src/backend/lib/**/*.spec.*',
    '!src/backend/lib/cdk.out/**'
  ],
  coverageDirectory: 'coverage/backend',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  globals: {
    'ts-jest': {
      tsconfig: 'src/backend/tsconfig.json'
    }
  }
};