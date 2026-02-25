/**
 * @fileoverview Simple unit tests for token security utility.
 */

import { TokenSecurity, SecurityEventType } from '../../../../src/frontend/src/utils/token-security';

// Mock console
const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('TokenSecurity - Basic Tests', () => {
  let tokenSecurity: TokenSecurity;
  let originalConsole: any;

  beforeEach(() => {
    // Mock console
    originalConsole = global.console;
    global.console = mockConsole as any;

    tokenSecurity = new TokenSecurity();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.console = originalConsole;
  });

  describe('validateTokenSignature', () => {
    it('should return true for valid JWT structure', () => {
      const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaHR0cHM6Ly9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbSIsImV4cCI6MTYxNjE2MTYxNn0.signature';

      const result = tokenSecurity.validateTokenSignature(validJWT);

      expect(result).toBe(true);
    });

    it('should return false for invalid JWT structure', () => {
      const invalidJWT = 'invalid.jwt';

      const result = tokenSecurity.validateTokenSignature(invalidJWT);

      expect(result).toBe(false);
    });
  });

  describe('validateTokenExpiration', () => {
    const createJWT = (exp: number) => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ 
        sub: '1234567890', 
        iss: 'https://cognito-idp.us-west-2.amazonaws.com',
        exp 
      }));
      return `${header}.${payload}.signature`;
    };

    it('should return valid for non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const jwt = createJWT(futureExp);

      const result = tokenSecurity.validateTokenExpiration(jwt);

      expect(result.isValid).toBe(true);
      expect(result.isExpired).toBe(false);
    });

    it('should return expired for past token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const jwt = createJWT(pastExp);

      const result = tokenSecurity.validateTokenExpiration(jwt);

      expect(result.isValid).toBe(false);
      expect(result.isExpired).toBe(true);
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events', () => {
      const event = {
        type: SecurityEventType.TOKEN_TAMPERING,
        timestamp: new Date().toISOString(),
        details: { test: 'data' },
        severity: 'HIGH' as const
      };

      tokenSecurity.logSecurityEvent(event);

      expect(mockConsole.log).toHaveBeenCalled();
    });
  });
});