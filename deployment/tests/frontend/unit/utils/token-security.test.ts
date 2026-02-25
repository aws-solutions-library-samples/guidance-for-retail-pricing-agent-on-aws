/**
 * @fileoverview Unit tests for token security utility.
 * 
 * Tests token security measures including HTTPS verification, secure storage validation,
 * token tampering detection, expiration checks, secure deletion, and security logging.
 */

import { 
  TokenSecurity, 
  SecurityEventType, 
  verifySecureConnection,
  logSecurityEvent
} from '../../../../src/frontend/src/utils/token-security';

// Mock AWS Amplify Auth
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
  getCurrentUser: jest.fn()
}));

// Mock window object for browser environment tests
const mockWindow = {
  location: {
    protocol: 'https:',
    hostname: 'example.com',
    href: 'https://example.com/app'
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (Test Browser)'
  },
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn()
  },
  sessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn()
  }
};

// Mock console methods
const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe('TokenSecurity', () => {
  let tokenSecurity: TokenSecurity;
  let originalWindow: any;
  let originalConsole: any;

  beforeEach(() => {
    // Mock window object
    originalWindow = global.window;
    (global as any).window = mockWindow;
    
    // Mock console
    originalConsole = global.console;
    global.console = mockConsole as any;

    // Create fresh instance
    tokenSecurity = new TokenSecurity();

    // Reset mocks
    jest.clearAllMocks();
    mockConsole.log.mockClear();
    mockConsole.warn.mockClear();
    mockConsole.error.mockClear();
  });

  afterEach(() => {
    // Restore original window and console
    global.window = originalWindow;
    global.console = originalConsole;
  });

  describe('verifyHttpsConnection', () => {
    it('should return true for HTTPS connections', () => {
      mockWindow.location.protocol = 'https:';
      mockWindow.location.hostname = 'example.com';

      const result = tokenSecurity.verifyHttpsConnection();

      expect(result).toBe(true);
    });

    it('should return true for localhost HTTP connections', () => {
      mockWindow.location.protocol = 'http:';
      mockWindow.location.hostname = 'localhost';

      const result = tokenSecurity.verifyHttpsConnection();

      expect(result).toBe(true);
    });

    it('should return true for 127.0.0.1 HTTP connections', () => {
      mockWindow.location.protocol = 'http:';
      mockWindow.location.hostname = '127.0.0.1';

      const result = tokenSecurity.verifyHttpsConnection();

      expect(result).toBe(true);
    });

    it('should return false for HTTP connections on non-localhost', () => {
      mockWindow.location.protocol = 'http:';
      mockWindow.location.hostname = 'example.com';

      const result = tokenSecurity.verifyHttpsConnection();

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith(
        'Insecure connection detected. Authentication requires HTTPS.'
      );
    });

    it('should return true in server-side environment', () => {
      global.window = undefined as any;

      const result = tokenSecurity.verifyHttpsConnection();

      expect(result).toBe(true);
    });
  });

  describe('validateSecureStorage', () => {
    beforeEach(() => {
      // Mock Object.keys for localStorage
      Object.keys = jest.fn().mockReturnValue([]);
    });

    it('should return true when no suspicious keys are found', () => {
      Object.keys = jest.fn().mockReturnValue(['user_preferences', 'theme', 'language']);

      const result = tokenSecurity.validateSecureStorage();

      expect(result).toBe(true);
    });

    it('should return false when token-related keys are found', () => {
      Object.keys = jest.fn().mockReturnValue(['access_token', 'user_preferences', 'jwt_token']);

      const result = tokenSecurity.validateSecureStorage();

      expect(result).toBe(false);
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Potential authentication tokens found in localStorage:',
        ['access_token', 'jwt_token']
      );
    });

    it('should return false when auth-related keys are found', () => {
      Object.keys = jest.fn().mockReturnValue(['auth_state', 'refresh_token']);

      const result = tokenSecurity.validateSecureStorage();

      expect(result).toBe(false);
    });

    it('should return true in server-side environment', () => {
      global.window = undefined as any;

      const result = tokenSecurity.validateSecureStorage();

      expect(result).toBe(true);
    });
  });

  describe('validateTokenSignature', () => {
    const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaXNzIjoiaHR0cHM6Ly9jb2duaXRvLmlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbSIsImV4cCI6MTYxNjE2MTYxNn0.signature';

    it('should return true for valid JWT structure', () => {
      const result = tokenSecurity.validateTokenSignature(validJWT);

      expect(result).toBe(true);
    });

    it('should return false for invalid JWT structure (wrong number of parts)', () => {
      const invalidJWT = 'invalid.jwt';

      const result = tokenSecurity.validateTokenSignature(invalidJWT);

      expect(result).toBe(false);
    });

    it('should return false for JWT with invalid header', () => {
      const invalidHeaderJWT = 'aW52YWxpZA.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';

      const result = tokenSecurity.validateTokenSignature(invalidHeaderJWT);

      expect(result).toBe(false);
    });

    it('should return false for JWT with invalid payload', () => {
      const invalidPayloadJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aW52YWxpZA.signature';

      const result = tokenSecurity.validateTokenSignature(invalidPayloadJWT);

      expect(result).toBe(false);
    });

    it('should return true when signature validation is disabled', () => {
      const tokenSecurityNoValidation = new TokenSecurity({ validateSignatures: false });
      const invalidJWT = 'invalid.jwt';

      const result = tokenSecurityNoValidation.validateTokenSignature(invalidJWT);

      expect(result).toBe(true);
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
      expect(result.errors).toHaveLength(0);
    });

    it('should return expired for past token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const jwt = createJWT(pastExp);

      const result = tokenSecurity.validateTokenExpiration(jwt);

      expect(result.isValid).toBe(false);
      expect(result.isExpired).toBe(true);
      expect(result.errors).toContain('Token has expired');
    });

    it('should warn for token expiring soon', () => {
      const soonExp = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
      const jwt = createJWT(soonExp);

      const result = tokenSecurity.validateTokenExpiration(jwt);

      expect(result.isValid).toBe(false);
      expect(result.isExpired).toBe(false);
      expect(result.errors.some(e => e.includes('expires soon'))).toBe(true);
    });

    it('should handle token without expiration claim', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: '1234567890' })); // No exp claim
      const jwt = `${header}.${payload}.signature`;

      const result = tokenSecurity.validateTokenExpiration(jwt);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Token missing expiration claim');
    });
  });

  describe('validateCurrentSession', () => {
    it('should return invalid for insecure connection', async () => {
      mockWindow.location.protocol = 'http:';
      mockWindow.location.hostname = 'example.com';

      const result = await tokenSecurity.validateCurrentSession();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Insecure connection detected');
    });
  });

  describe('secureTokenDeletion', () => {
    beforeEach(() => {
      // Mock localStorage and sessionStorage keys
      Object.keys = jest.fn()
        .mockReturnValueOnce(['token', 'user_preferences', 'auth_state']) // localStorage
        .mockReturnValueOnce(['jwt_token', 'theme']); // sessionStorage
    });

    it('should successfully delete tokens from storage', async () => {
      const result = await tokenSecurity.secureTokenDeletion();

      expect(result).toBe(true);
      expect(mockWindow.localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(mockWindow.localStorage.removeItem).toHaveBeenCalledWith('auth_state');
      expect(mockWindow.sessionStorage.removeItem).toHaveBeenCalledWith('jwt_token');
    });

    it('should handle errors during token deletion', async () => {
      mockWindow.localStorage.removeItem = jest.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = await tokenSecurity.secureTokenDeletion();

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith(
        'Error during secure token deletion:',
        expect.any(Error)
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events when logging is enabled', () => {
      const event = {
        type: SecurityEventType.TOKEN_TAMPERING,
        timestamp: new Date().toISOString(),
        details: { test: 'data' },
        severity: 'HIGH' as const
      };

      tokenSecurity.logSecurityEvent(event);

      expect(mockConsole.log).toHaveBeenCalledWith(
        'Security Event:',
        expect.stringContaining(SecurityEventType.TOKEN_TAMPERING)
      );
    });

    it('should not log when logging is disabled', () => {
      const tokenSecurityNoLogging = new TokenSecurity({ enableSecurityLogging: false });
      const event = {
        type: SecurityEventType.TOKEN_TAMPERING,
        timestamp: new Date().toISOString(),
        details: { test: 'data' },
        severity: 'HIGH' as const
      };

      tokenSecurityNoLogging.logSecurityEvent(event);

      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should log critical events with error level', () => {
      const event = {
        type: SecurityEventType.TOKEN_TAMPERING,
        timestamp: new Date().toISOString(),
        details: { test: 'data' },
        severity: 'CRITICAL' as const
      };

      tokenSecurity.logSecurityEvent(event);

      expect(mockConsole.error).toHaveBeenCalledWith(
        'CRITICAL SECURITY EVENT:',
        expect.any(Object)
      );
    });
  });

  describe('utility functions', () => {
    describe('verifySecureConnection', () => {
      it('should verify secure connection', () => {
        mockWindow.location.protocol = 'https:';

        const result = verifySecureConnection();

        expect(result).toBe(true);
      });
    });

    describe('logSecurityEvent', () => {
      it('should log security events', () => {
        logSecurityEvent(
          SecurityEventType.FAILED_LOGIN_ATTEMPT,
          { email: 'test@example.com' },
          'MEDIUM'
        );

        expect(mockConsole.log).toHaveBeenCalledWith(
          'Security Event:',
          expect.stringContaining(SecurityEventType.FAILED_LOGIN_ATTEMPT)
        );
      });
    });
  });
});