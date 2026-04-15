#!/usr/bin/env node

/**
 * @fileoverview Updates frontend configuration files after CDK deployment.
 * 
 * This script reads CDK stack outputs and updates:
 * - source/frontend/.env
 * - source/frontend/amplify_outputs.json
 * - source/backend/config/{environment}.json (AppSync, Cognito, Amplify, SageMaker Canvas sections)
 * 
 * The script will:
 * 1. Query CloudFormation for backend stack outputs (ProductCatalogStack)
 * 2. Query CloudFormation for frontend stack outputs (FrontendHostingStack)
 * 3. Optionally query Amplify API for default domain (if app ID is available)
 * 4. Update backend config with all available values including SageMaker Canvas buckets
 * 5. Update frontend files with the configuration
 * 
 * Note: Requires @aws-sdk/client-amplify for Amplify domain lookup
 *       Install with: npm install @aws-sdk/client-amplify
 */

const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const fs = require('fs');
const path = require('path');

// Configuration
const ENVIRONMENT = process.argv[2] || 'dev';
const BACKEND_STACK_NAME = `ProductCatalogStack-${ENVIRONMENT}`;
const FRONTEND_STACK_NAME = `FrontendHostingStack-${ENVIRONMENT}`;
const REGION = process.argv[3] || 'us-east-1';

// File paths
const FRONTEND_DIR = path.join(__dirname, '../../..', 'source', 'frontend');
const ENV_FILE = path.join(FRONTEND_DIR, '.env');
const AMPLIFY_OUTPUTS_FILE = path.join(FRONTEND_DIR, 'amplify_outputs.json');
const CONFIG_FILE = path.join(__dirname, '..', 'config', `${ENVIRONMENT}.json`);

// Initialize AWS SDK client
const cfnClient = new CloudFormationClient({ region: REGION });

/**
 * Gets the Amplify default domain from the Amplify API.
 * This is separate from CloudFormation outputs because the domain
 * is not immediately available when the app is first created.
 * 
 * @param {string} appId - Amplify App ID
 * @returns {Promise<string|null>} Default domain or null if not available
 */
async function getAmplifyDefaultDomain(appId) {
  if (!appId) return null;
  
  try {
    const { AmplifyClient, GetAppCommand } = require('@aws-sdk/client-amplify');
    const amplifyClient = new AmplifyClient({ region: REGION });
    
    const command = new GetAppCommand({ appId });
    const response = await amplifyClient.send(command);
    
    return response.app?.defaultDomain || null;
  } catch (error) {
    console.warn(`   Could not fetch Amplify default domain: ${error.message}`);
    return null;
  }
}

/**
 * Gets stack outputs from CloudFormation for a specific stack.
 * 
 * @param {string} stackName - Name of the CloudFormation stack
 * @returns {Promise<Object>} Stack outputs as key-value pairs
 */
async function getStackOutputs(stackName) {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await cfnClient.send(command);
    
    if (!response.Stacks || response.Stacks.length === 0) {
      console.warn(`   Stack ${stackName} not found`);
      return {};
    }
    
    const outputs = {};
    for (const output of response.Stacks[0].Outputs || []) {
      const key = output.OutputKey;
      const value = output.OutputValue;
      
      // Map CDK-generated output keys to expected keys
      // CDK adds unique suffixes like "AmplifyFrontendAmplifyAppId1C6DDAB8"
      if (key.includes('AmplifyAppId') && !key.includes('AmplifyAppUrl')) {
        outputs.AmplifyAppId = value;
      } else if (key.includes('AmplifyAppUrl')) {
        outputs.AmplifyAppUrl = value;
      } else if (key.includes('AmplifyDefaultDomain')) {
        outputs.AmplifyDefaultDomain = value;
      } else if (key.includes('AmplifyDeploymentBucket') || key === 'DeploymentBucket') {
        outputs.AmplifyDeploymentBucket = value;
      } else if (key.includes('GraphQLApiUrl') || key.includes('GraphQLEndpoint')) {
        outputs.GraphQLApiUrl = value;
      } else if (key.includes('GraphQLApiId')) {
        outputs.GraphQLApiId = value;
      } else if (key.includes('GraphQLWssEndpoint') || key.includes('GraphQLWebSocketEndpoint')) {
        outputs.GraphQLWssEndpoint = value;
      } else if (key.includes('GraphQLApiKey')) {
        outputs.GraphQLApiKey = value;
      } else if (key.includes('UserPoolId') && !key.includes('Client')) {
        outputs.UserPoolId = value;
      } else if (key.includes('UserPoolClientId')) {
        outputs.UserPoolClientId = value;
      } else if (key.includes('CanvasTrainingDataBucket')) {
        outputs.CanvasTrainingDataBucket = value;
      } else if (key.includes('CanvasModelOutputBucket')) {
        outputs.CanvasModelOutputBucket = value;
      } else if (key.includes('AutopilotExecutionRoleArn')) {
        outputs.AutopilotExecutionRoleArn = value;
      } else {
        // Keep original key for any other outputs
        outputs[key] = value;
      }
    }
    
    return outputs;
  } catch (error) {
    console.warn(`   Error fetching stack outputs for ${stackName}:`, error.message);
    return {};
  }
}

/**
 * Gets combined outputs from both backend and frontend stacks.
 * 
 * @returns {Promise<Object>} Combined stack outputs as key-value pairs
 */
async function getAllStackOutputs() {
  console.log(`📡 Fetching outputs from backend stack: ${BACKEND_STACK_NAME}`);
  const backendOutputs = await getStackOutputs(BACKEND_STACK_NAME);
  
  console.log(`📡 Fetching outputs from frontend stack: ${FRONTEND_STACK_NAME}`);
  const frontendOutputs = await getStackOutputs(FRONTEND_STACK_NAME);
  
  // Merge outputs, frontend takes precedence for Amplify-related values
  return { ...backendOutputs, ...frontendOutputs };
}

/**
 * Updates the .env file with CDK outputs.
 * 
 * @param {Object} outputs - Stack outputs
 */
function updateEnvFile(outputs) {
  const envContent = `# GraphQL API Configuration
VITE_GRAPHQL_ENDPOINT=${outputs.GraphQLApiUrl || ''}
VITE_GRAPHQL_WS_ENDPOINT=${outputs.GraphQLWssEndpoint || ''}
VITE_APPSYNC_API_KEY=${outputs.GraphQLApiKey || ''}

# AWS Configuration
VITE_AWS_REGION=${REGION}
VITE_AWS_USER_POOL_ID=${outputs.UserPoolId || ''}
VITE_AWS_USER_POOL_CLIENT_ID=${outputs.UserPoolClientId || ''}

# Midway OIDC Configuration (Optional - for Amazon employee SSO)
VITE_MIDWAY_OIDC_ENABLED=false
VITE_MIDWAY_OIDC_DOMAIN=your-midway-domain.auth.us-west-2.amazoncognito.com
VITE_MIDWAY_OIDC_CLIENT_ID=your-midway-client-id

# Development Configuration
VITE_NODE_ENV=${ENVIRONMENT === 'prod' ? 'production' : 'development'}
VITE_LOG_LEVEL=${ENVIRONMENT === 'prod' ? 'info' : 'debug'}

# Amplify Configuration
VITE_AMPLIFY_APP_ID=${outputs.AmplifyAppId || ''}
VITE_AMPLIFY_APP_URL=${outputs.AmplifyAppUrl || ''}
`;

  fs.writeFileSync(ENV_FILE, envContent, 'utf8');
  console.log(`✅ Updated ${ENV_FILE}`);
}

/**
 * Updates the amplify_outputs.json file with CDK outputs.
 * 
 * @param {Object} outputs - Stack outputs
 */
function updateAmplifyOutputsFile(outputs) {
  const amplifyOutputs = {
    version: '1',
    api: {
      aws_appsync_graphqlEndpoint: outputs.GraphQLApiUrl || '',
      aws_appsync_region: REGION,
      aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS'
    },
    auth: {
      aws_region: REGION,
      user_pool_id: outputs.UserPoolId || '',
      user_pool_client_id: outputs.UserPoolClientId || ''
    }
  };

  fs.writeFileSync(AMPLIFY_OUTPUTS_FILE, JSON.stringify(amplifyOutputs, null, 2), 'utf8');
  console.log(`✅ Updated ${AMPLIFY_OUTPUTS_FILE}`);
}

/**
 * Updates the backend config file with CDK stack outputs.
 * 
 * @param {Object} outputs - Stack outputs
 */
function updateBackendConfig(outputs) {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.warn(`⚠️  Config file not found: ${CONFIG_FILE}`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  
  // Update Amplify section (only if Amplify outputs are available)
  if (!config.amplify) {
    config.amplify = {};
  }
  
  // Only update Amplify fields if they exist in outputs
  if (outputs.AmplifyAppId) {
    config.amplify.appId = outputs.AmplifyAppId;
  }
  
  if (outputs.AmplifyAppUrl) {
    config.amplify.appUrl = outputs.AmplifyAppUrl;
  }
  
  if (outputs.AmplifyDeploymentBucket) {
    config.amplify.deploymentBucket = outputs.AmplifyDeploymentBucket;
  }
  
  // Note: AmplifyDefaultDomain is not available from CDK outputs
  // It can be retrieved separately using: aws amplify get-app --app-id <APP_ID>
  if (outputs.AmplifyDefaultDomain) {
    config.amplify.defaultDomain = outputs.AmplifyDefaultDomain;
  }
  
  config.amplify.environment = ENVIRONMENT;
  
  // Update AppSync section
  if (!config.appSync) {
    config.appSync = {};
  }
  
  if (outputs.GraphQLApiUrl) {
    config.appSync.endpoint = outputs.GraphQLApiUrl;
  }
  
  if (outputs.GraphQLApiId) {
    config.appSync.apiId = outputs.GraphQLApiId;
  }
  
  if (outputs.GraphQLWssEndpoint) {
    config.appSync.wssEndpoint = outputs.GraphQLWssEndpoint;
  }
  
  if (outputs.GraphQLApiKey) {
    config.appSync.apiKey = outputs.GraphQLApiKey;
  }
  
  // Update Cognito section
  if (!config.cognito) {
    config.cognito = {};
  }
  
  if (outputs.UserPoolId) {
    config.cognito.poolId = outputs.UserPoolId;
  }
  
  if (outputs.UserPoolClientId) {
    config.cognito.poolClientId = outputs.UserPoolClientId;
  }
  
  // Update SageMaker Canvas section
  if (!config.sageMakerCanvas) {
    config.sageMakerCanvas = {};
  }
  
  if (outputs.CanvasTrainingDataBucket) {
    config.sageMakerCanvas.trainingDataBucket = outputs.CanvasTrainingDataBucket;
  }
  
  if (outputs.CanvasModelOutputBucket) {
    config.sageMakerCanvas.modelOutputBucket = outputs.CanvasModelOutputBucket;
  }
  
  if (outputs.AutopilotExecutionRoleArn) {
    config.sageMakerCanvas.autopilotExecutionRoleArn = outputs.AutopilotExecutionRoleArn;
  }
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${CONFIG_FILE}`);
  
  // Log what was updated
  const updatedFields = [];
  if (outputs.AmplifyAppId) updatedFields.push('Amplify App ID');
  if (outputs.AmplifyAppUrl) updatedFields.push('Amplify App URL');
  if (outputs.AmplifyDeploymentBucket) updatedFields.push('Amplify Deployment Bucket');
  if (outputs.GraphQLApiUrl) updatedFields.push('AppSync Endpoint');
  if (outputs.UserPoolId) updatedFields.push('Cognito Pool ID');
  if (outputs.CanvasTrainingDataBucket) updatedFields.push('Canvas Training Data Bucket');
  if (outputs.CanvasModelOutputBucket) updatedFields.push('Canvas Model Output Bucket');
  if (outputs.AutopilotExecutionRoleArn) updatedFields.push('Autopilot Execution Role ARN');
  
  if (updatedFields.length > 0) {
    console.log(`   Updated: ${updatedFields.join(', ')}`);
  }
  
  // Warn about missing Amplify outputs
  if (!outputs.AmplifyAppId || !outputs.AmplifyAppUrl) {
    console.warn(`\n⚠️  Note: Amplify outputs not found in stacks.`);
    console.warn(`   This is normal if Amplify is deployed separately.`);
    console.warn(`   Amplify values in config will remain unchanged.`);
  }
}

/**
 * Main execution function.
 */
async function main() {
  console.log(`\n🔧 Updating frontend configuration for ${ENVIRONMENT} environment...\n`);
  
  try {
    // Get stack outputs from both backend and frontend stacks
    const outputs = await getAllStackOutputs();
    
    // Log what outputs were found (for debugging)
    console.log(`\n📋 Found ${Object.keys(outputs).length} stack outputs:`);
    const outputKeys = Object.keys(outputs).sort();
    outputKeys.forEach(key => {
      // Don't log sensitive values like API keys
      if (key.includes('ApiKey')) {
        console.log(`   - ${key}: [REDACTED]`);
      } else {
        console.log(`   - ${key}: ${outputs[key]}`);
      }
    });
    console.log('');
    
    // Try to get Amplify default domain if we have an app ID
    if (outputs.AmplifyAppId) {
      console.log(`📡 Fetching Amplify default domain...`);
      const defaultDomain = await getAmplifyDefaultDomain(outputs.AmplifyAppId);
      if (defaultDomain) {
        outputs.AmplifyDefaultDomain = defaultDomain;
        console.log(`   Found: ${defaultDomain}`);
      }
    }
    
    // Update configuration files
    updateEnvFile(outputs);
    updateAmplifyOutputsFile(outputs);
    updateBackendConfig(outputs);
    
    console.log(`\n✅ Frontend configuration updated successfully!`);
    
    // Show next steps if Amplify is configured
    if (outputs.AmplifyAppId && outputs.AmplifyAppUrl) {
      console.log(`\n📝 Next steps for Amplify deployment:`);
      console.log(`   1. cd source/frontend`);
      console.log(`   2. npm run build`);
      console.log(`   3. bash scripts/deploy-to-amplify.sh ${ENVIRONMENT}`);
      console.log(`\n🌐 Your app will be available at: ${outputs.AmplifyAppUrl}`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error(`\n❌ Error updating frontend configuration:`, error.message);
    process.exit(1);
  }
}

// Run the script
main();
