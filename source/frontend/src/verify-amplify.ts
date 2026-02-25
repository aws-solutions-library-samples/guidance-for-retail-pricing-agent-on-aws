/**
 * @fileoverview Verification script for Amplify configuration.
 * 
 * Simple script to verify that Amplify configuration is working correctly
 * without requiring a full test environment.
 */

import { configureAmplify, getAmplifyConfigInfo, isMidwayOIDCEnabled } from './amplify-config';

/**
 * Verify Amplify configuration setup.
 */
const verifyAmplifyConfig = () => {
  try {
    console.log('🔧 Verifying Amplify configuration...');
    
    // Test configuration info retrieval
    const configInfo = getAmplifyConfigInfo();
    console.log('📋 Configuration Info:', configInfo);
    
    // Test Midway OIDC detection
    const midwayEnabled = isMidwayOIDCEnabled();
    console.log('🔐 Midway OIDC Enabled:', midwayEnabled);
    
    // Test configuration (this will actually configure Amplify)
    configureAmplify();
    console.log('✅ Amplify configuration successful!');
    
    return true;
  } catch (error) {
    console.error('❌ Amplify configuration failed:', error);
    return false;
  }
};

// Export for use in other modules
export { verifyAmplifyConfig };

// Run verification if this file is executed directly
if (typeof window !== 'undefined') {
  verifyAmplifyConfig();
}