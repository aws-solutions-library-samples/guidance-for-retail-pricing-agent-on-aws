#!/usr/bin/env node

/**
 * @fileoverview Deploy AgentCore agents using AWS SDK for JavaScript.
 * 
 * This script deploys agents to Amazon Bedrock AgentCore Runtime using the
 * official AWS SDK v3 for JavaScript. It packages agent code, uploads to S3,
 * and creates/updates AgentCore Runtime agents.
 * 
 * Usage:
 *   node deploy-agentcore-agents.js <environment>
 * 
 * Example:
 *   node deploy-agentcore-agents.js dev
 */

const { 
  BedrockAgentCoreControlClient, 
  CreateAgentRuntimeCommand,
  UpdateAgentRuntimeCommand,
  ListAgentRuntimesCommand,
  GetAgentRuntimeCommand
} = require('@aws-sdk/client-bedrock-agentcore-control');

const { 
  S3Client, 
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand
} = require('@aws-sdk/client-s3');

const { 
  IAMClient, 
  CreateRoleCommand, 
  GetRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand
} = require('@aws-sdk/client-iam');

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { promisify } = require('util');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Print colored message to console.
 * 
 * @param {string} message - Message to print
 * @param {string} color - Color code
 */
function printColor(message, color) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Get AppSync API ID from endpoint URL by querying AWS.
 * 
 * The subdomain in the AppSync URL is NOT the API ID - we need to query AWS
 * to find the actual API ID that corresponds to the endpoint.
 * 
 * @param {string} endpoint - AppSync GraphQL endpoint URL
 * @param {string} region - AWS region
 * @returns {Promise<string>} API ID or '*' if not found
 */
async function getAppSyncApiId(endpoint, region) {
  if (!endpoint) return '*';
  
  try {
    const { AppSyncClient, ListGraphqlApisCommand } = require('@aws-sdk/client-appsync');
    const appsyncClient = new AppSyncClient({ region });
    
    // List all AppSync APIs and find the one matching our endpoint
    const response = await appsyncClient.send(new ListGraphqlApisCommand({}));
    
    for (const api of response.graphqlApis || []) {
      if (api.uris?.GRAPHQL === endpoint) {
        printColor(`  Found AppSync API ID: ${api.apiId} for endpoint ${endpoint}`, colors.blue);
        return api.apiId;
      }
    }
    
    printColor(`  ⚠ Warning: Could not find API ID for endpoint ${endpoint}, using wildcard`, colors.yellow);
    return '*';
  } catch (error) {
    printColor(`  ⚠ Warning: Failed to query AppSync API ID: ${error.message}, using wildcard`, colors.yellow);
    return '*';
  }
}

/**
 * Load configuration from JSON file.
 * 
 * @param {string} environment - Environment name (dev, prod)
 * @returns {Object} Configuration object
 */
function loadConfig(environment) {
  const configPath = path.join(__dirname, '..', '..', 'config', `${environment}.json`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configContent);
}

/**
 * Install Python dependencies for agent.
 * 
 * @param {string} agentDir - Path to agent directory
 * @returns {Promise<string>} Path to dependencies directory
 */
async function installPythonDependencies(agentDir) {
  const requirementsPath = path.join(agentDir, 'requirements.txt');
  
  if (!fs.existsSync(requirementsPath)) {
    printColor(`  ⚠ No requirements.txt found, skipping dependency installation`, colors.yellow);
    return null;
  }
  
  printColor(`  Installing Python dependencies...`, colors.blue);
  
  // Create temporary directory for dependencies
  const depsDir = path.join(agentDir, '.deps_temp');
  if (fs.existsSync(depsDir)) {
    fs.rmSync(depsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(depsDir, { recursive: true });
  
  try {
    // Use pip to install dependencies for ARM64 platform
    const { execSync } = require('child_process');
    
    // Determine which pip command to use
    let pipCommand = 'pip3';
    try {
      execSync('which pip3', { stdio: 'pipe' });
    } catch {
      try {
        execSync('which pip', { stdio: 'pipe' });
        pipCommand = 'pip';
      } catch {
        throw new Error('Neither pip3 nor pip found in PATH');
      }
    }
    
    printColor(`    Using: ${pipCommand}`, colors.blue);
    printColor(`    Installing to: ${depsDir}`, colors.blue);
    
    // Install dependencies with all transitive dependencies
    // CRITICAL: Use --no-compile to prevent .pyc files from local Python version
    const installCommand = `${pipCommand} install -t "${depsDir}" -r "${requirementsPath}" --platform manylinux2014_aarch64 --only-binary=:all: --python-version 3.11 --implementation cp --abi cp311 --no-compile --upgrade`;
    
    printColor(`    Running: ${installCommand}`, colors.blue);
    
    const output = execSync(installCommand, { 
      cwd: agentDir,
      encoding: 'utf8',
      stdio: 'inherit'  // Show pip output for debugging
    });
    
    // Remove any __pycache__ directories that might have been created
    printColor(`    Cleaning up __pycache__ directories...`, colors.blue);
    const removePycache = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name === '__pycache__') {
            fs.rmSync(fullPath, { recursive: true, force: true });
            printColor(`      Removed: ${fullPath.replace(depsDir, '')}`, colors.yellow);
          } else {
            removePycache(fullPath);
          }
        }
      }
    };
    removePycache(depsDir);
    
    // Check if dependencies were actually installed
    const installedFiles = fs.readdirSync(depsDir);
    if (installedFiles.length === 0) {
      throw new Error('No dependencies were installed - directory is empty');
    }
    
    printColor(`  ✓ Dependencies installed (${installedFiles.length} items)`, colors.green);
    
    // List some of the installed packages for verification
    const packages = installedFiles.filter(f => !f.startsWith('.')).slice(0, 5);
    printColor(`    Installed: ${packages.join(', ')}${installedFiles.length > 5 ? '...' : ''}`, colors.blue);
    
    // Verify we have the expected core dependencies
    const expectedDeps = ['bedrock_agentcore', 'boto3', 'botocore'];
    const missingDeps = expectedDeps.filter(dep => !installedFiles.includes(dep));
    if (missingDeps.length > 0) {
      printColor(`  ⚠ Warning: Missing expected dependencies: ${missingDeps.join(', ')}`, colors.yellow);
    }
    
    return depsDir;
    
  } catch (error) {
    printColor(`  ✗ ERROR: Failed to install dependencies: ${error.message}`, colors.red);
    
    if (error.stdout) {
      printColor(`  stdout: ${error.stdout.toString().substring(0, 500)}`, colors.yellow);
    }
    if (error.stderr) {
      printColor(`  stderr: ${error.stderr.toString().substring(0, 500)}`, colors.yellow);
    }
    
    printColor(`  ⚠ CRITICAL: Agent will fail at runtime without dependencies!`, colors.red);
    
    // Clean up failed installation
    if (fs.existsSync(depsDir)) {
      fs.rmSync(depsDir, { recursive: true, force: true });
    }
    
    // Don't continue - this is a critical error
    throw new Error(`Dependency installation failed for ${path.basename(agentDir)}: ${error.message}`);
  }
}

/**
 * Copy shared utilities into agent directory for packaging.
 * 
 * @param {string} agentDir - Path to agent directory
 * @returns {string|null} Path to copied shared directory or null if not found
 */
function copySharedUtilities(agentDir) {
  const agentsDir = path.dirname(agentDir);
  const sharedSourceDir = path.join(agentsDir, 'shared');
  const sharedDestDir = path.join(agentDir, 'shared');
  
  // Check if shared directory exists
  if (!fs.existsSync(sharedSourceDir)) {
    printColor(`  ⚠ No shared directory found at ${sharedSourceDir}`, colors.yellow);
    return null;
  }
  
  // Remove existing shared directory in agent if it exists
  if (fs.existsSync(sharedDestDir)) {
    fs.rmSync(sharedDestDir, { recursive: true, force: true });
  }
  
  // Copy shared directory
  printColor(`  Copying shared utilities...`, colors.blue);
  fs.mkdirSync(sharedDestDir, { recursive: true });
  
  const files = fs.readdirSync(sharedSourceDir);
  let copiedCount = 0;
  
  for (const file of files) {
    // Skip __pycache__, test files, and README
    if (file === '__pycache__' || file.startsWith('test_') || file === 'README.md' || file === 'requirements.txt') {
      continue;
    }
    
    const sourcePath = path.join(sharedSourceDir, file);
    const destPath = path.join(sharedDestDir, file);
    
    if (fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, destPath);
      copiedCount++;
      printColor(`    Copied: shared/${file}`, colors.blue);
    }
  }
  
  if (copiedCount === 0) {
    printColor(`  ⚠ No files copied from shared directory`, colors.yellow);
    return null;
  }
  
  printColor(`  ✓ Copied ${copiedCount} shared utility files`, colors.green);
  return sharedDestDir;
}

/**
 * Create deployment package (zip) for agent.
 * 
 * @param {string} agentDir - Path to agent directory
 * @returns {Promise<Buffer>} Zip file buffer
 */
async function createAgentPackage(agentDir) {
  printColor(`  Creating deployment package for ${path.basename(agentDir)}...`, colors.blue);
  
  // Copy shared utilities into agent directory
  const copiedSharedDir = copySharedUtilities(agentDir);
  
  // Install Python dependencies first
  const depsDir = await installPythonDependencies(agentDir);
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => {
      // Clean up temporary directories
      if (depsDir && fs.existsSync(depsDir)) {
        fs.rmSync(depsDir, { recursive: true, force: true });
      }
      if (copiedSharedDir && fs.existsSync(copiedSharedDir)) {
        fs.rmSync(copiedSharedDir, { recursive: true, force: true });
        printColor(`  Cleaned up copied shared directory`, colors.blue);
      }
      
      const buffer = Buffer.concat(chunks);
      const sizeKB = (buffer.length / 1024).toFixed(2);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      printColor(`  ✓ Package created (${sizeMB} MB, ${sizeKB} KB)`, colors.green);
      
      // Verify ZIP is not empty
      if (buffer.length < 100) {
        reject(new Error('ZIP file is too small - likely empty'));
        return;
      }
      
      resolve(buffer);
    });
    archive.on('error', (err) => {
      // Clean up on error
      if (depsDir && fs.existsSync(depsDir)) {
        fs.rmSync(depsDir, { recursive: true, force: true });
      }
      if (copiedSharedDir && fs.existsSync(copiedSharedDir)) {
        fs.rmSync(copiedSharedDir, { recursive: true, force: true });
      }
      reject(err);
    });
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        printColor(`  ⚠ Warning: ${err.message}`, colors.yellow);
      } else {
        reject(err);
      }
    });
    
    // First, add dependencies to root of ZIP (if they exist)
    if (depsDir && fs.existsSync(depsDir)) {
      printColor(`    Adding Python dependencies from ${path.basename(depsDir)}/`, colors.blue);
      archive.directory(depsDir, false); // false = add contents to root, not as subdirectory
    }
    
    // Then add agent source files
    const files = fs.readdirSync(agentDir);
    let fileCount = 0;
    
    for (const file of files) {
      // Skip temporary dependencies directory and build artifacts
      if (file === '.deps_temp' || file === 'build' || file === 'node_modules' || file === '__pycache__') {
        continue;
      }
      
      const filePath = path.join(agentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        // Add file to root of ZIP
        archive.file(filePath, { name: file });
        fileCount++;
        printColor(`    Adding: ${file}`, colors.blue);
      } else if (stat.isDirectory()) {
        // Add subdirectories
        archive.directory(filePath, file);
        printColor(`    Adding directory: ${file}/`, colors.blue);
      }
    }
    
    if (fileCount === 0) {
      reject(new Error('No files found in agent directory'));
      return;
    }
    
    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Ensure S3 bucket exists, create if not.
 * 
 * @param {S3Client} s3Client - S3 client instance
 * @param {string} bucket - Bucket name
 * @param {string} region - AWS region
 */
async function ensureBucketExists(s3Client, bucket, region) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    printColor(`  ✓ S3 bucket exists: ${bucket}`, colors.green);
  } catch (error) {
    if (error.name === 'NotFound') {
      printColor(`  Creating S3 bucket: ${bucket}...`, colors.blue);
      
      // Build CreateBucket parameters - omit CreateBucketConfiguration for us-east-1
      const createBucketParams = { Bucket: bucket };
      if (region !== 'us-east-1') {
        createBucketParams.CreateBucketConfiguration = { LocationConstraint: region };
      }
      
      await s3Client.send(new CreateBucketCommand(createBucketParams));
      printColor(`  ✓ S3 bucket created`, colors.green);
    } else {
      throw error;
    }
  }
}

/**
 * Upload agent package to S3.
 * 
 * @param {S3Client} s3Client - S3 client instance
 * @param {Buffer} zipBuffer - Zip file buffer
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @returns {Promise<string>} S3 URI
 */
async function uploadToS3(s3Client, zipBuffer, bucket, key) {
  printColor(`  Uploading to S3: s3://${bucket}/${key}`, colors.blue);
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: zipBuffer,
    ContentType: 'application/zip'
  }));
  
  printColor(`  ✓ Uploaded successfully`, colors.green);
  return `s3://${bucket}/${key}`;
}

/**
 * Create or get IAM execution role for AgentCore.
 * 
 * @param {IAMClient} iamClient - IAM client instance
 * @param {string} roleName - Role name
 * @param {string} tableName - DynamoDB table name
 * @param {string} bucketName - S3 bucket name
 * @param {Object} config - Configuration object
 * @returns {Promise<string>} Role ARN
 */
async function createExecutionRole(iamClient, roleName, tableName, bucketName, config) {
  printColor(`  Checking IAM execution role: ${roleName}`, colors.blue);
  
  // Get the correct AppSync API ID by querying AWS
  const appSyncApiId = await getAppSyncApiId(config.appSync?.endpoint || '', config.aws.region);
  
  // Trust policy for AgentCore
  const trustPolicy = {
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: {
        Service: 'bedrock-agentcore.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }]
  };
  
  try {
    // Try to get existing role
    const response = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    const roleArn = response.Role.Arn;
    printColor(`  ✓ Role exists: ${roleArn}`, colors.green);
    printColor(`  Updating role permissions...`, colors.blue);
    
    // Update the inline policy even if role exists to ensure correct permissions
    // Requirements: 10.5, 10.6 (Agent Integration Pattern - AppSync mutations)
    const inlinePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:Scan'
          ],
          Resource: `arn:aws:dynamodb:*:*:table/${tableName}*`
        },
        {
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:PutObject'
          ],
          Resource: `arn:aws:s3:::${bucketName}/*`
        },
        {
          Effect: 'Allow',
          Action: [
            'bedrock:InvokeModel'
          ],
          Resource: '*'
        },
        {
          // AppSync permissions for real-time communication
          // Agents invoke AppSync mutations to:
          // - Write chat messages (createChatMessage) for progress updates
          // - Update session state (updatePricingSession) with results
          Effect: 'Allow',
          Action: [
            'appsync:GraphQL'
          ],
          Resource: [
            // Allow agents to invoke any mutation/query on the AppSync API
            // Using correct API ID queried from AWS (not extracted from URL)
            `arn:aws:appsync:${config.aws.region}:${config.aws.account}:apis/${appSyncApiId}/types/Mutation/*`,
            `arn:aws:appsync:${config.aws.region}:${config.aws.account}:apis/${appSyncApiId}/types/Query/*`
          ]
        }
      ]
    };
    
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'AgentCoreExecutionPolicy',
      PolicyDocument: JSON.stringify(inlinePolicy)
    }));
    
    printColor(`  ✓ Role permissions updated with API ID: ${appSyncApiId}`, colors.green);
    return roleArn;
  } catch (error) {
    // Check for NoSuchEntity error (role doesn't exist)
    // AWS SDK v3 can return error in different formats
    if (error.name === 'NoSuchEntity' || 
        error.name === 'NoSuchEntityException' ||
        error.Code === 'NoSuchEntity' ||
        error.$metadata?.httpStatusCode === 404) {
      // Create new role
      printColor(`  Creating IAM role: ${roleName}...`, colors.blue);
      
      const createResponse = await iamClient.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
        Description: 'Execution role for AgentCore Runtime agents'
      }));
      
      const roleArn = createResponse.Role.Arn;
      
      // Attach basic execution policy
      await iamClient.send(new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      }));
      
      // Add inline policy for DynamoDB, S3, Bedrock, and AppSync access
      // Requirements: 10.5, 10.6 (Agent Integration Pattern - AppSync mutations)
      const inlinePolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:Query',
              'dynamodb:Scan'
            ],
            Resource: `arn:aws:dynamodb:*:*:table/${tableName}*`
          },
          {
            Effect: 'Allow',
            Action: [
              's3:GetObject',
              's3:PutObject'
            ],
            Resource: `arn:aws:s3:::${bucketName}/*`
          },
          {
            Effect: 'Allow',
            Action: [
              'bedrock:InvokeModel'
            ],
            Resource: '*'
          },
          {
            // AppSync permissions for real-time communication
            // Agents invoke AppSync mutations to:
            // - Write chat messages (createChatMessage) for progress updates
            // - Update session state (updatePricingSession) with results
            Effect: 'Allow',
            Action: [
              'appsync:GraphQL'
            ],
            Resource: [
              // Allow agents to invoke any mutation/query on the AppSync API
              // Using correct API ID queried from AWS (not extracted from URL)
              `arn:aws:appsync:${config.aws.region}:${config.aws.account}:apis/${appSyncApiId}/types/Mutation/*`,
              `arn:aws:appsync:${config.aws.region}:${config.aws.account}:apis/${appSyncApiId}/types/Query/*`
            ]
          }
        ]
      };
      
      await iamClient.send(new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'AgentCoreExecutionPolicy',
        PolicyDocument: JSON.stringify(inlinePolicy)
      }));
      
      printColor(`  ✓ Created role with API ID: ${appSyncApiId}`, colors.green);
      printColor(`  ⏳ Waiting 10 seconds for IAM role propagation...`, colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      return roleArn;
    }
    throw error;
  }
}

/**
 * Deploy agent to AgentCore Runtime.
 * 
 * @param {BedrockAgentCoreControlClient} agentCoreClient - AgentCore client
 * @param {string} agentName - Agent name
 * @param {string} s3Uri - S3 URI of agent package
 * @param {string} roleArn - IAM role ARN
 * @param {Object} config - Configuration object
 * @returns {Promise<string>} Agent Runtime ID
 */
async function deployAgent(agentCoreClient, agentName, s3Uri, roleArn, config) {
  printColor(`\nDeploying ${agentName}...`, colors.yellow);
  
  // Parse S3 URI correctly: s3://bucket/path/to/file.zip
  const s3Path = s3Uri.replace('s3://', '');
  const firstSlashIndex = s3Path.indexOf('/');
  const bucket = s3Path.substring(0, firstSlashIndex);
  const fullKey = s3Path.substring(firstSlashIndex + 1);
  
  // Extract prefix (directory path) and object name
  const lastSlashIndex = fullKey.lastIndexOf('/');
  const prefix = lastSlashIndex >= 0 ? fullKey.substring(0, lastSlashIndex) : '';
  const objectName = lastSlashIndex >= 0 ? fullKey.substring(lastSlashIndex + 1) : fullKey;
  
  printColor(`  S3 Location: bucket=${bucket}, prefix=${prefix}, object=${objectName}`, colors.blue);
  
  // Configuration matching AWS Console successful deployment
  const agentConfig = {
      agentRuntimeName: agentName,
      description: `${agentName} agent for pricing analysis`,
      agentRuntimeArtifact: {
        codeConfiguration: {
          code: {
            s3: {
              bucket: bucket,
              prefix: `${prefix}/${objectName}`
            }
          },
          runtime: 'PYTHON_3_11',
          entryPoint: ['agent_handler.py']
        }
      },
      roleArn: roleArn,
      networkConfiguration: {
        networkMode: 'PUBLIC'
      },
      // Environment variables are a TOP-LEVEL parameter, not inside codeConfiguration
      // Requirements: 7.1, 10.1, 10.2, 10.3, 10.4 (Agent Integration Pattern)
      environmentVariables: {
        PRICING_TABLE_NAME: config.tableNames.pricingTable,
        PRODUCT_TABLE_NAME: config.tableNames.productTable,
        // Use full bucket name with account suffix (matches CDK pattern)
        TRAINING_DATA_BUCKET: `${config.agentCore.codeBucket}-${config.aws.account}`,
        AWS_REGION: config.aws.region,
        LOG_LEVEL: config.monitoring.logLevel || 'INFO',
        // AppSync endpoint for real-time communication
        // Agents use this to invoke createChatMessage and updatePricingSession mutations
        APPSYNC_ENDPOINT: config.appSync?.endpoint || ''
      }
    };
  
  const command = new CreateAgentRuntimeCommand(agentConfig)
  try {
    // Try to create new agent
    printColor(`  Creating agent runtime...`, colors.blue);
    
    const response = await agentCoreClient.send(command);
    
    const agentId = response.agentRuntimeId;
    printColor(`  ✓ Agent deployed successfully`, colors.green);
    printColor(`  Agent Runtime ID: ${agentId}`, colors.cyan);
    
    return agentId;
    
  } catch (error) {
    if (error.name === 'ConflictException' || error.message?.includes('already exists')) {
      // Agent already exists, update it
      printColor(`  Agent already exists, updating...`, colors.yellow);
      
      // List agents to find the ID
      const listResponse = await agentCoreClient.send(new ListAgentRuntimesCommand({}));
      let agentId = null;
      
      for (const agent of listResponse.agentRuntimes || []) {
        // printColor(`  Agent Name = ${agent.agentRuntimeName}`, colors.yellow);
        if (agent.agentRuntimeName === agentName) {
          agentId = agent.agentRuntimeId;
          break;
        }
      }
      
      if (!agentId) {
        throw new Error(`Could not find existing agent: ${agentName}`);
      }
      
      // Update agent (including environment variables)
      await agentCoreClient.send(new UpdateAgentRuntimeCommand({
        agentRuntimeId: agentId,
        agentRuntimeArtifact: agentConfig.agentRuntimeArtifact,
        networkConfiguration: agentConfig.networkConfiguration,
        roleArn: agentConfig.roleArn,
        environmentVariables: agentConfig.environmentVariables
      }));
      
      printColor(`  ✓ Agent updated successfully`, colors.green);
      printColor(`  Agent Runtime ID: ${agentId}`, colors.cyan);
      
      return agentId;
    }
    
    throw error;
  }
}

/**
 * Update configuration file with agent IDs.
 * 
 * @param {string} configPath - Path to configuration file
 * @param {Object} agentIds - Map of agent names to IDs
 */
function updateConfigFile(configPath, agentIds) {
  printColor(`\nUpdating configuration file...`, colors.blue);
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Update agent IDs
  if (!config.agentCore) {
    config.agentCore = {};
  }
  if (!config.agentCore.agents) {
    config.agentCore.agents = {};
  }
  
  config.agentCore.agents.demandForecast = agentIds.demand_forecast || '';
  config.agentCore.agents.competitiveAnalysis = agentIds.competitive_analysis || '';
  config.agentCore.agents.marginAnalysis = agentIds.margin_analysis || '';
  
  // Write back with pretty formatting
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  
  printColor(`✓ Configuration updated: ${configPath}`, colors.green);
}

/**
 * Main deployment function.
 * 
 * Deploys AgentCore agents to AWS Bedrock AgentCore Runtime.
 * 
 * Process:
 * 1. Load environment configuration
 * 2. Apply account-number suffix to S3 bucket name for global uniqueness
 * 3. Create S3 bucket if it doesn't exist
 * 4. Create/update IAM execution role
 * 5. Package each agent with dependencies
 * 6. Upload packages to S3
 * 7. Deploy/update agents in AgentCore Runtime
 * 8. Update configuration file with agent IDs
 * 
 * Bucket Naming Convention:
 * - Config specifies base name: "retail-pricing-agentcore-code-local"
 * - Script appends account ID: "retail-pricing-agentcore-code-local-221645205538"
 * - This matches the CDK pattern for all S3 buckets in the system
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    printColor('Usage: node deploy-agentcore-agents.js <environment>', colors.red);
    process.exit(1);
  }
  
  const environment = args[0];
  
  printColor('='.repeat(60), colors.cyan);
  printColor('AgentCore Deployment (JavaScript SDK)', colors.cyan);
  printColor('='.repeat(60), colors.cyan);
  printColor(`\nEnvironment: ${environment}\n`, colors.blue);
  
  try {
    // Load configuration
    const config = loadConfig(environment); console.log('config', config);
    const region = config.aws.region;
    const account = config.aws.account;
    const s3BucketBase = config.agentCore.codeBucket;
    
    // Apply account-number suffix for global uniqueness (matching CDK pattern)
    const s3Bucket = `${s3BucketBase}-${environment}-${account}`;
    const tableName = 'PricingOrchestration'; // DynamoDB table name from orchestration-table.ts
    
    printColor(`Region: ${region}`, colors.blue);
    printColor(`Account: ${account}`, colors.blue);
    printColor(`S3 Bucket Base: ${s3BucketBase}`, colors.blue);
    printColor(`S3 Bucket (with account suffix): ${s3Bucket}`, colors.blue);
    
    // Initialize AWS clients
    const s3Client = new S3Client({ region });
    const iamClient = new IAMClient({ region });
    const agentCoreClient = new BedrockAgentCoreControlClient({ region });
    
    // Ensure S3 bucket exists
    await ensureBucketExists(s3Client, s3Bucket, region);
    
    // Create execution role
    const roleName = `AgentCoreExecutionRole-${environment}`;
    const executionRoleArn = await createExecutionRole(iamClient, roleName, tableName, s3Bucket, config);
    
    // Agent directories
    const agentsDir = path.join(__dirname, '..', '..', 'lib', 'lambdas', 'agentcore-agents');
    
    const agents = {
      demand_forecast: path.join(agentsDir, 'demand-forecast'),
      competitive_analysis: path.join(agentsDir, 'competitive-analysis'),
      margin_analysis: path.join(agentsDir, 'margin-analysis')
    };
    
    // Deploy each agent
    const agentIds = {};
    
    for (const [agentName, agentDir] of Object.entries(agents)) {
      if (!fs.existsSync(agentDir)) {
        printColor(`✗ Agent directory not found: ${agentDir}`, colors.red);
        continue;
      }
      
      try {
        // Create package
        const zipBuffer = await createAgentPackage(agentDir);
        
        // Upload to S3
        const s3Key = `agents/${agentName}.zip`;
        const s3Uri = await uploadToS3(s3Client, zipBuffer, s3Bucket, s3Key);
        
        // Wait for S3 eventual consistency and verify object exists
        printColor(`  ⏳ Waiting for S3 consistency (2 seconds)...`, colors.yellow);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify S3 object exists and is accessible
        try {
          const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
          await s3Client.send(new HeadObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key
          }));
          printColor(`  ✓ S3 object verified`, colors.green);
        } catch (verifyError) {
          printColor(`  ⚠ Warning: Could not verify S3 object: ${verifyError.message}`, colors.yellow);
        }
        
        // Deploy to AgentCore
        const agentId = await deployAgent(agentCoreClient, agentName, s3Uri, executionRoleArn, config);
        agentIds[agentName] = agentId;
        
      } catch (error) {
        printColor(`✗ Failed to deploy ${agentName}: ${error.message}`, colors.red);
        console.error(error);
      }
    }
    
    // Update configuration file
    const configPath = path.join(__dirname, '..', '..', 'config', `${environment}.json`);
    updateConfigFile(configPath, agentIds);
    
    // Summary
    printColor('\n' + '='.repeat(60), colors.cyan);
    printColor('Deployment Complete!', colors.cyan);
    printColor('='.repeat(60), colors.cyan);
    printColor('\nAgent Runtime IDs:', colors.green);
    
    for (const [agentName, agentId] of Object.entries(agentIds)) {
      printColor(`  ${agentName}: ${agentId}`, colors.cyan);
    }
    
    printColor('\nNext steps:', colors.blue);
    printColor('  1. Verify deployment:', colors.blue);
    printColor(`     npm run verify:deployment ${environment}`, colors.blue);
    printColor('  2. Test agents:', colors.blue);
    printColor(`     npm run test:agentcore ${environment}`, colors.blue);
    printColor('  3. Deploy CDK stack with agent IDs:', colors.blue);
    printColor(`     cd src/backend && cdk deploy --context environment=${environment}`, colors.blue);
    
  } catch (error) {
    printColor(`\n✗ Deployment failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };
