#!/usr/bin/env node
/**
 * @fileoverview CDK app entry point for Retail Pricing Agent Orchestrator.
 * 
 * Creates and deploys the complete serverless stack including
 * product catalog management, authentication, and pricing analysis.
 * 
 * Loads configuration from JSON files and supports multiple sources for
 * AWS account and region specification.
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as fs from 'fs';
import { ProductCatalogStack } from '../lib/stacks/product-catalog-stack';
import { FrontendHostingStack } from '../lib/stacks/frontend-hosting-stack';

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';

// Load configuration from JSON file
const configPath = path.join(__dirname, '..', 'config', `${environment}.json`);
let config: any = {};

try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`Loaded configuration from ${configPath}`);
  } else {
    console.warn(`Configuration file not found: ${configPath}`);
  }
} catch (error) {
  console.warn(`Warning: Could not load config file ${configPath}:`, (error as Error).message);
}

// Get account and region from multiple sources (priority order):
// 1. CDK context parameters (--context account=xxx --context region=xxx)
// 2. JSON configuration file (config/dev.json or config/prod.json)
// 3. Environment variables (CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION)

// Track configuration sources for logging
let accountSource: string;
let account: string | undefined;

if (app.node.tryGetContext('account')) {
  account = app.node.tryGetContext('account');
  accountSource = 'CLI context parameter';
} else if (config.aws?.account) {
  account = config.aws.account;
  accountSource = `JSON configuration file (${configPath})`;
} else if (process.env.CDK_DEFAULT_ACCOUNT) {
  account = process.env.CDK_DEFAULT_ACCOUNT;
  accountSource = 'Environment variable (CDK_DEFAULT_ACCOUNT)';
} else {
  accountSource = 'not provided';
}

let regionSource: string;
let region: string | undefined;

if (app.node.tryGetContext('region')) {
  region = app.node.tryGetContext('region');
  regionSource = 'CLI context parameter';
} else if (config.aws?.region) {
  region = config.aws.region;
  regionSource = `JSON configuration file (${configPath})`;
} else if (process.env.CDK_DEFAULT_REGION) {
  region = process.env.CDK_DEFAULT_REGION;
  regionSource = 'Environment variable (CDK_DEFAULT_REGION)';
} else {
  regionSource = 'not provided';
}

// Validate required values with enhanced error messages
if (!account) {
  console.error(`❌ ERROR: AWS account not specified
  
Configuration Error: Missing AWS account ID

Resolution Steps:
1. Option 1 - Use CLI context parameter:
   cdk deploy --context account=123456789012  // OK: Example account ID for documentation

2. Option 2 - Add to configuration file:
   Edit config/${environment}.json and add:
   {
     "aws": {
       "account": "123456789012",  // OK: Example account ID for documentation
       "region": "us-east-1"  // OK: Example region for documentation
     }
   }

3. Option 3 - Set environment variable:
   export CDK_DEFAULT_ACCOUNT=123456789012  // OK: Example account ID for documentation

To find your AWS account ID:
   aws sts get-caller-identity --query Account --output text

Current configuration source: ${accountSource}
`);
  process.exit(1);
}

if (!region) {
  console.error(`❌ ERROR: AWS region not specified

Configuration Error: Missing AWS region

Resolution Steps:
1. Option 1 - Use CLI context parameter:
   cdk deploy --context region=us-east-1  // OK: Example region for documentation

2. Option 2 - Add to configuration file:
   Edit config/${environment}.json and add:
   {
     "aws": {
       "account": "123456789012",  // OK: Example account ID for documentation
       "region": "us-east-1"  // OK: Example region for documentation
     }
   }

3. Option 3 - Set environment variable:
   export CDK_DEFAULT_REGION=us-east-1  // OK: Example region for documentation

Common AWS regions:
   - us-east-1 (N. Virginia)
   - us-west-2 (Oregon)
   - eu-west-1 (Ireland)
   - ap-southeast-1 (Singapore)

Current configuration source: ${regionSource}
`);
  process.exit(1);
}

console.log(`🚀 Deploying to environment: ${environment}`);
console.log(`📋 Configuration file: ${configPath}`);
console.log(`📍 AWS Account: ${account} (source: ${accountSource})`);
console.log(`🌍 AWS Region: ${region} (source: ${regionSource})`);

// Validate configuration completeness
console.log('\n🔍 Validating configuration completeness...');

// Validate AWS account format (12 digits)
const accountPattern = /^[0-9]{12}$/;
if (!accountPattern.test(account)) {
  console.error(`❌ ERROR: Invalid AWS account format

Configuration Error: AWS account ID must be exactly 12 digits

Current value: ${account}
Expected format: 123456789012 (12 digits)  // OK: Example account ID for documentation

Resolution Steps:
1. Verify your AWS account ID:
   aws sts get-caller-identity --query Account --output text

2. Update the configuration with the correct 12-digit account ID:
   - CLI: cdk deploy --context account=123456789012  // OK: Example account ID for documentation
   - JSON: Edit config/${environment}.json
   - Env: export CDK_DEFAULT_ACCOUNT=123456789012  // OK: Example account ID for documentation

Current configuration source: ${accountSource}
`);
  process.exit(1);
}
console.log(`✓ AWS account format valid: ${account}`);

// Validate region format (standard AWS region pattern)
const regionPattern = /^[a-z]{2}-[a-z]+-[0-9]$/;
if (!regionPattern.test(region)) {
  console.error(`❌ ERROR: Invalid AWS region format

Configuration Error: AWS region format is invalid

Current value: ${region}
Expected format: us-east-1, eu-west-1, ap-southeast-1, etc.

Valid AWS region format:
   - Two lowercase letters (country code)
   - Hyphen
   - One or more lowercase letters (location)
   - Hyphen
   - Single digit (zone number)

Common AWS regions:
   - us-east-1 (N. Virginia)  // OK: Example region for documentation
   - us-west-2 (Oregon)  // OK: Example region for documentation
   - eu-west-1 (Ireland)  // OK: Example region for documentation
   - eu-central-1 (Frankfurt)  // OK: Example region for documentation
   - ap-southeast-1 (Singapore)  // OK: Example region for documentation
   - ap-northeast-1 (Tokyo)  // OK: Example region for documentation

Resolution Steps:
1. Update the configuration with a valid AWS region:
   - CLI: cdk deploy --context region=us-east-1  // OK: Example region for documentation
   - JSON: Edit config/${environment}.json
   - Env: export CDK_DEFAULT_REGION=us-east-1  // OK: Example region for documentation

Current configuration source: ${regionSource}
`);
  process.exit(1);
}
console.log(`✓ AWS region format valid: ${region}`);

// Validate required configuration keys exist
const requiredKeys = [
  { path: 'environment', value: config.environment },
  { path: 'aws', value: config.aws },
  { path: 'aws.account', value: config.aws?.account },
  { path: 'aws.region', value: config.aws?.region },
  { path: 'agentCore', value: config.agentCore },
  { path: 'agentCore.region', value: config.agentCore?.region },
  { path: 'agentCore.codeBucket', value: config.agentCore?.codeBucket },
  { path: 'agentCore.agents', value: config.agentCore?.agents }
];

const missingKeys = requiredKeys.filter(key => !key.value);

if (missingKeys.length > 0) {
  console.error(`❌ ERROR: Missing required configuration keys

Configuration Error: Required keys are missing from config/${environment}.json

Missing keys:
${missingKeys.map(key => `   - ${key.path}`).join('\n')}

Resolution Steps:
1. Add the missing keys to config/${environment}.json

2. Required configuration structure:
   {
     "environment": "${environment}",
     "aws": {
       "account": "123456789012",  // OK: Example account ID for documentation
       "region": "us-east-1"  // OK: Example region for documentation
     },
     "agentCore": {
       "region": "us-east-1",  // OK: Example region for documentation
       "codeBucket": "your-bucket-name",
       "agents": {
         "demandForecast": "",
         "competitiveAnalysis": "",
         "marginAnalysis": ""
       }
     }
   }

3. Verify the configuration file exists and is valid JSON:
   cat config/${environment}.json | jq .

4. For a complete configuration template, see:
   config/local.json.template
`);
  process.exit(1);
}

console.log('✓ All required configuration keys present');
console.log('✓ Configuration validation passed\n');

// Validate AgentCore configuration with enhanced error messages
if (!config.agentCore) {
  console.error(`❌ ERROR: AgentCore configuration section missing

Configuration Error: Missing agentCore section in config/${environment}.json

Resolution Steps:
1. Add the agentCore configuration section to config/${environment}.json:
   {
     "agentCore": {
       "region": "us-east-1",  // OK: Example region for documentation
       "codeBucket": "your-bucket-name",
       "agents": {
         "demandForecast": "",
         "competitiveAnalysis": "",
         "marginAnalysis": ""
       }
     }
   }

2. Deploy AgentCore agents to populate agent IDs:
   npm run deploy:agentcore:${environment}

3. After deployment, agent IDs will be automatically added to the config file

Note: AgentCore agents must be deployed before the CDK infrastructure stack.
`);
  process.exit(1);
}

if (!config.agentCore.agents) {
  console.error(`❌ ERROR: AgentCore agents configuration missing

Configuration Error: Missing agentCore.agents section in config/${environment}.json

Resolution Steps:
1. Add the agents section to your agentCore configuration:
   {
     "agentCore": {
       "region": "${region}",
       "codeBucket": "your-bucket-name",
       "agents": {
         "demandForecast": "",
         "competitiveAnalysis": "",
         "marginAnalysis": ""
       }
     }
   }

2. Deploy AgentCore agents to populate agent IDs:
   npm run deploy:agentcore:${environment}

3. The deployment script will automatically update the config file with agent IDs

Required agents:
   - demandForecast: Analyzes historical demand patterns
   - competitiveAnalysis: Provides market intelligence
   - marginAnalysis: Validates pricing against margin rules
`);
  process.exit(1);
}

// Validate individual agent IDs
const requiredAgents = ['demandForecast', 'competitiveAnalysis', 'marginAnalysis'];
const missingAgents = requiredAgents.filter(agent => !config.agentCore.agents[agent]);

if (missingAgents.length > 0) {
  console.error(`❌ ERROR: AgentCore agent IDs not configured

Configuration Error: Missing agent IDs in config/${environment}.json

Missing agents: ${missingAgents.join(', ')}

Resolution Steps:
1. Deploy the missing AgentCore agents:
   npm run deploy:agentcore:${environment}

2. This will automatically update config/${environment}.json with agent IDs

3. Verify the agent IDs are populated in the config file:
   {
     "agentCore": {
       "agents": {
         "demandForecast": "AGENT_ID_HERE",
         "competitiveAnalysis": "AGENT_ID_HERE",
         "marginAnalysis": "AGENT_ID_HERE"
       }
     }
   }

4. Then retry the CDK deployment:
   npm run deploy:cdk:${environment}

Note: Agent IDs are generated during AgentCore deployment and must be deployed first.
`);
  process.exit(1);
}

// Stack naming convention
const backendStackName = `ProductCatalogStack-${environment}`;
const frontendStackName = `FrontendHostingStack-${environment}`;

console.log(`\n📦 Creating stacks:`);
console.log(`   Backend:  ${backendStackName}`);
console.log(`   Frontend: ${frontendStackName}`);

// 1. Create Backend Stack (API, Lambda, DynamoDB, Cognito, etc.)
const backendStack = new ProductCatalogStack(app, backendStackName, {
  env: {
    account,
    region
  },
  environment,
  midwayOIDC: config.midwayOIDC,
  sageMakerCanvas: config.sageMakerCanvas,
  agentCore: config.agentCore,
  description: `Backend infrastructure for Retail Pricing Agent Orchestrator - ${environment} environment`,
  stackName: backendStackName
});

// 2. Create Frontend Stack (Amplify hosting)
const frontendStack = new FrontendHostingStack(app, frontendStackName, {
  env: {
    account,
    region
  },
  environment,
  stackName: frontendStackName,
  description: `Frontend hosting infrastructure for Retail Pricing Agent Orchestrator - ${environment} environment`,
  
  // Pass backend outputs to frontend
  userPool: backendStack.userPool,
  userPoolClient: backendStack.userPoolClient,
  graphqlApi: backendStack.graphqlApi,
  region: region!,
  accountId: account!
});

// 3. Explicit dependency: Frontend depends on Backend
frontendStack.addDependency(backendStack);

console.log(`\n✅ Stack configuration complete`);
console.log(`   Frontend stack depends on backend stack`);
console.log(`   Deploy order: Backend → Frontend\n`);