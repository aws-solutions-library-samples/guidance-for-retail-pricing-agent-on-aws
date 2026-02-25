/**
 * @fileoverview Environment detection utilities.
 * 
 * Provides utilities for detecting development vs production environments
 * and adjusting security settings accordingly.
 */

/**
 * Checks if the application is running in development mode.
 * 
 * @returns True if running in development
 */
export const isDevelopment = (): boolean => {
  // Check if we're in development based on hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
  }
  
  // Fallback to NODE_ENV
  return process.env.NODE_ENV === 'development';
};

/**
 * Checks if the application is running in production mode.
 * 
 * @returns True if running in production
 */
export const isProduction = (): boolean => {
  return !isDevelopment();
};

/**
 * Gets the current environment name.
 * 
 * @returns Environment name
 */
export const getEnvironment = (): 'development' | 'production' => {
  return isDevelopment() ? 'development' : 'production';
};

/**
 * Development-specific configuration for token security.
 */
export const getDevelopmentTokenConfig = () => ({
  enforceHttps: false,
  validateSignatures: false,
  enableSecurityLogging: true,
  expiryBufferSeconds: 300
});

/**
 * Production-specific configuration for token security.
 */
export const getProductionTokenConfig = () => ({
  enforceHttps: true,
  validateSignatures: true,
  enableSecurityLogging: true,
  expiryBufferSeconds: 300
});

/**
 * Gets environment-appropriate token security configuration.
 * 
 * @returns Token security configuration
 */
export const getTokenSecurityConfig = () => {
  return isDevelopment() ? getDevelopmentTokenConfig() : getProductionTokenConfig();
};