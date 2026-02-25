#!/usr/bin/env node

/**
 * @fileoverview Syncs frontend configuration from backend config files.
 * 
 * This is a CONVENIENCE script that reads from already-populated backend
 * config files and syncs to frontend. It does NOT query AWS.
 * 
 * Use this when:
 * - You need to quickly sync frontend files from backend config
 * - Switching between environments locally
 * - Backend config is already populated with correct values
 * 
 * DO NOT use this for:
 * - Initial setup after CDK deployment (use src/backend/scripts/update-frontend-config.js)
 * - Getting fresh values from AWS (use src/backend/scripts/update-frontend-config.js)
 * 
 * This script reads backend config/{environment}.json and updates:
 * - src/frontend/amplify_outputs.json
 * - src/frontend/.env
 * 
 * Usage:
 *   node src/frontend/scripts/sync-frontend-config.js [environment]
 *   npm run sync:config [environment]
 * 
 * Examples:
 *   node src/frontend/scripts/sync-frontend-config.js local
 *   node src/frontend/scripts/sync-frontend-config.js dev
 *   npm run sync:config prod
 * 
 * Related Scripts:
 * - src/backend/scripts/update-frontend-config.js - Queries AWS CloudFormation
 *   and updates backend config + frontend files (use after deployment)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const ENVIRONMENT = process.argv[2] || 'local';

// File paths (now relative to src/frontend/scripts/)
const CONFIG_FILE = path.join(__dirname, '..', '..', 'backend', 'config', `${ENVIRONMENT}.json`);
const FRONTEND_DIR = path.join(__dirname, '..');
const AMPLIFY_OUTPUTS_FILE = path.join(FRONTEND_DIR, 'amplify_outputs.json');
const ENV_FILE = path.join(FRONTEND_DIR, '.env');

/**
 * Reads the backend configuration file.
 * 
 * @returns {Object} Configuration object
 */
function readBackendConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Configuration file not found: ${CONFIG_FILE}`);
  }
  
  const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(configContent);
}

/**
 * Updates the amplify_outputs.json file from backend config.
 * 
 * @param {Object} config - Backend configuration
 */
function updateAmplifyOutputsFile(config) {
  const amplifyOutputs = {
    version: '1',
    api: {
      aws_appsync_graphqlEndpoint: config.appSync?.endpoint || '',
      aws_appsync_region: config.aws?.region || 'us-east-1',
      aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS'
    },
    auth: {
      aws_region: config.aws?.region || 'us-east-1',
      user_pool_id: config.cognito?.poolId || '',
      user_pool_client_id: config.cognito?.poolClientId || ''
    }
  };

  fs.writeFileSync(AMPLIFY_OUTPUTS_FILE, JSON.stringify(amplifyOutputs, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${path.relative(process.cwd(), AMPLIFY_OUTPUTS_FILE)}`);
}

/**
 * Updates the .env file from backend config.
 * 
 * @param {Object} config - Backend configuration
 */
function updateEnvFile(config) {
  const envContent = `# GraphQL API Configuration
VITE_GRAPHQL_ENDPOINT=${config.appSync?.endpoint || ''}
VITE_GRAPHQL_WS_ENDPOINT=${config.appSync?.wssEndpoint || ''}
VITE_APPSYNC_API_KEY=${config.appSync?.apiKey || ''}

# AWS Configuration
VITE_AWS_REGION=${config.aws?.region || 'us-east-1'}
VITE_AWS_USER_POOL_ID=${config.cognito?.poolId || ''}
VITE_AWS_USER_POOL_CLIENT_ID=${config.cognito?.poolClientId || ''}

# Midway OIDC Configuration (Optional - for Amazon employee SSO)
VITE_MIDWAY_OIDC_ENABLED=${config.midwayOIDC?.enabled || false}
VITE_MIDWAY_OIDC_DOMAIN=${config.midwayOIDC?.domain || ''}
VITE_MIDWAY_OIDC_CLIENT_ID=${config.midwayOIDC?.clientIdSecretName || ''}

# Development Configuration
VITE_NODE_ENV=${config.environment === 'prod' ? 'production' : 'development'}
VITE_LOG_LEVEL=${config.monitoring?.logLevel?.toLowerCase() || 'debug'}

# Amplify Configuration
VITE_AMPLIFY_APP_ID=${config.amplify?.appId || ''}
VITE_AMPLIFY_APP_URL=${config.amplify?.appUrl || ''}
`;

  fs.writeFileSync(ENV_FILE, envContent, 'utf8');
  console.log(`✅ Updated ${path.relative(process.cwd(), ENV_FILE)}`);
}

/**
 * Validates that required configuration values are present.
 * 
 * @param {Object} config - Backend configuration
 * @returns {Array<string>} Array of missing required fields
 */
function validateConfig(config) {
  const missing = [];
  
  if (!config.appSync?.endpoint) missing.push('appSync.endpoint');
  if (!config.cognito?.poolId) missing.push('cognito.poolId');
  if (!config.cognito?.poolClientId) missing.push('cognito.poolClientId');
  
  return missing;
}

/**
 * Main execution function.
 */
function main() {
  console.log(`\n🔧 Syncing frontend configuration from ${ENVIRONMENT} environment...\n`);
  
  try {
    // Read backend configuration
    console.log(`📖 Reading configuration from: ${path.relative(process.cwd(), CONFIG_FILE)}`);
    const config = readBackendConfig();
    
    // Validate configuration
    const missingFields = validateConfig(config);
    if (missingFields.length > 0) {
      console.warn(`\n⚠️  Warning: The following required fields are missing or empty:`);
      missingFields.forEach(field => console.warn(`   - ${field}`));
      console.warn(`\n   These values are typically populated after CDK deployment.`);
      console.warn(`   Run 'node src/backend/scripts/update-frontend-config.js ${ENVIRONMENT}' after deployment.\n`);
    }
    
    // Update configuration files
    updateAmplifyOutputsFile(config);
    updateEnvFile(config);
    
    console.log(`\n✅ Frontend configuration synced successfully!`);
    
    if (config.amplify?.appUrl) {
      console.log(`\n🌐 App URL: ${config.amplify.appUrl}`);
    }
    
    if (config.appSync?.endpoint) {
      console.log(`📡 GraphQL Endpoint: ${config.appSync.endpoint}`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error(`\n❌ Error syncing frontend configuration:`, error.message);
    process.exit(1);
  }
}

// Run the script
main();
