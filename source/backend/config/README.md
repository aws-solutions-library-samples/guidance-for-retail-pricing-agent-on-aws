# Configuration Guide

## Overview

This directory contains environment-specific configuration files for the Retail Pricing Agent Orchestrator system. Each environment (dev, prod, local) has its own JSON configuration file that defines AWS resources, service settings, and deployment parameters.

## Configuration Files

- **dev.json** - Shared development environment configuration
- **prod.json** - Production environment configuration
- **local.json.template** - Template for local developer environments (copy to `local.json`)

## Setting Up Local Development

To set up your local development environment:

1. **Copy the template:**
   ```bash
   cp src/backend/config/local.json.template src/backend/config/local.json
   ```

2. **Update the following placeholders:**
   - `YOUR_AWS_ACCOUNT_ID` - Your 12-digit AWS account ID (find with: `aws sts get-caller-identity`)
   - `YOUR_PREFERRED_REGION` - AWS region (e.g., `us-east-1`, `us-west-2`)
   
   **Note:** Bucket names will automatically have your account ID appended for global uniqueness.

3. **Bootstrap CDK (first time only):**
   ```bash
   cd src/backend
   npm run bootstrap:local
   ```

4. **Deploy to your local environment:**
   ```bash
   npm run deploy:backend:local
   ```

## Configuration Sections

### 1. Environment (`environment`)

**Purpose:** Identifies the deployment environment.

**Values:** `dev`, `prod`, or `local`

**Example:**
```json
"environment": "local"
```

---

### 2. AWS Account and Region (`aws`)

**Purpose:** Specifies the AWS account and region for deployment.

**Fields:**
- `account` - 12-digit AWS account ID
- `region` - AWS region code

**Example:**
```json
"aws": {
  "account": "123456789012",
  "region": "us-east-1"
}
```

**How to find your account ID:**
```bash
aws sts get-caller-identity --query Account --output text
```

---

### 3. API Gateway (`apiGateway`)

**Purpose:** Configures API Gateway throttling and CORS settings.

**Fields:**
- `throttling.rateLimit` - Maximum requests per second
- `throttling.burstLimit` - Maximum burst capacity
- `cors.allowOrigins` - Allowed origins for CORS
- `cors.allowMethods` - Allowed HTTP methods
- `cors.allowHeaders` - Allowed HTTP headers

**Example:**
```json
"apiGateway": {
  "throttling": {
    "rateLimit": 10,
    "burstLimit": 20
  },
  "cors": {
    "allowOrigins": ["http://localhost:3000"],
    "allowMethods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allowHeaders": ["Content-Type", "Authorization"]
  }
}
```

**Local Development Notes:**
- Low throttling limits are appropriate for local testing
- CORS should allow `http://localhost:3000` for frontend development

---

### 4. Database (`database`)

**Purpose:** Configures DynamoDB settings.

**Fields:**
- `type` - Database type (always `dynamodb`)
- `billingMode` - `PAY_PER_REQUEST` or `PROVISIONED`
- `pointInTimeRecovery` - Enable backup and restore (boolean)
- `readCapacity` - (Optional) Read capacity units for PROVISIONED mode
- `writeCapacity` - (Optional) Write capacity units for PROVISIONED mode

**Example:**
```json
"database": {
  "type": "dynamodb",
  "billingMode": "PAY_PER_REQUEST",
  "pointInTimeRecovery": false
}
```

**Local Development Notes:**
- Use `PAY_PER_REQUEST` for cost efficiency
- Disable point-in-time recovery for local environments

---

### 5. Table Names (`tableNames`)

**Purpose:** Defines DynamoDB table names.

**Fields:**
- `productTable` - Product catalog table name
- `pricingTable` - Pricing orchestration table name

**Example:**
```json
"tableNames": {
  "productTable": "ProductCatalog",
  "pricingTable": "PricingOrchestration"
}
```

---

### 6. Storage (`storage`)

**Purpose:** Configures S3 bucket settings.

**Fields:**
- `s3.bucketName` - S3 bucket name base (account ID will be appended automatically)
- `s3.versioning` - Enable object versioning (boolean)
- `s3.encryption` - Encryption type (`AES256` or `aws:kms`)

**Example:**
```json
"storage": {
  "s3": {
    "bucketName": "retail-pricing-data-local",
    "versioning": false,
    "encryption": "AES256",
    "note": "Actual bucket name will be: retail-pricing-data-local-{ACCOUNT_ID}"
  }
}
```

**Bucket Naming Convention:**
- **Base name:** `retail-pricing-data-local` (from config)
- **Actual bucket:** `retail-pricing-data-local-221645205538` (account ID appended by CDK)
- **Why:** S3 bucket names must be globally unique across ALL AWS accounts. Appending the account ID guarantees uniqueness without requiring manual configuration.

**Local Development Notes:**
- No need to customize bucket names - account ID ensures uniqueness
- Use `AES256` encryption for simplicity (no KMS key required)
- Disable versioning to reduce costs

---

### 7. Bedrock (`bedrock`)

**Purpose:** Configures Amazon Bedrock AI models.

**Fields:**
- `region` - AWS region for Bedrock service
- `models.classifier` - Model for classification tasks
- `models.specialized` - Model for specialized analysis
- `models.supervisor` - Model for supervisory tasks

**Example:**
```json
"bedrock": {
  "region": "us-east-1",
  "models": {
    "classifier": "anthropic.claude-3-5-haiku-20241022-v1:0",
    "specialized": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "supervisor": "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  }
}
```

**Local Development Notes:**
- Ensure Bedrock is available in your chosen region
- Model IDs should match available models in your region

---

### 8. AgentCore (`agentCore`)

**Purpose:** Configures Amazon Bedrock AgentCore settings.

**Fields:**
- `region` - AWS region for AgentCore
- `codeBucket` - S3 bucket base name for agent code packages (account ID appended automatically)
- `agents.demandForecast` - Demand forecast agent ID (populated after deployment)
- `agents.competitiveAnalysis` - Competitive analysis agent ID (populated after deployment)
- `agents.marginAnalysis` - Margin analysis agent ID (populated after deployment)

**Example:**
```json
"agentCore": {
  "region": "us-east-1",
  "codeBucket": "retail-pricing-agentcore-code-local",
  "note": "Actual bucket name will be: retail-pricing-agentcore-code-local-{ACCOUNT_ID}",
  "agents": {
    "demandForecast": "",
    "competitiveAnalysis": "",
    "marginAnalysis": ""
  }
}
```

**Bucket Naming Convention:**
- **Base name:** `retail-pricing-agentcore-code-local` (from config)
- **Actual bucket:** `retail-pricing-agentcore-code-local-221645205538` (account ID appended)
- **Why:** Ensures global uniqueness without manual configuration

**Local Development Notes:**
- Agent IDs are empty initially and populated during agent deployment
- No need to customize bucket name - account ID ensures uniqueness

---

### 9. AppSync (`appSync`)

**Purpose:** Stores the AppSync GraphQL API endpoint.

**Fields:**
- `endpoint` - AppSync GraphQL endpoint URL (populated after CDK deployment)

**Example:**
```json
"appSync": {
  "endpoint": "https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql"
}
```

**Local Development Notes:**
- This field is empty initially and populated after CDK deployment

---

### 10. Monitoring (`monitoring`)

**Purpose:** Configures logging and monitoring settings.

**Fields:**
- `logLevel` - Log verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`)
- `metricsEnabled` - Enable CloudWatch metrics (boolean)
- `tracingEnabled` - Enable X-Ray tracing (boolean)
- `alarms` - (Optional) CloudWatch alarm thresholds

**Example:**
```json
"monitoring": {
  "logLevel": "DEBUG",
  "metricsEnabled": false,
  "tracingEnabled": false
}
```

**Local Development Notes:**
- Use `DEBUG` log level for detailed troubleshooting
- Disable metrics and tracing to reduce costs

---

### 11. Midway OIDC (`midwayOIDC`)

**Purpose:** Configures Amazon Midway OIDC authentication (optional).

**Fields:**
- `enabled` - Enable Midway OIDC integration (boolean)
- `domain` - Cognito domain for OIDC
- `clientIdSecretName` - AWS Secrets Manager secret name for client ID
- `clientSecretSecretName` - AWS Secrets Manager secret name for client secret
- `scopes` - OAuth scopes
- `callbackUrls` - OAuth callback URLs
- `logoutUrls` - OAuth logout URLs

**Example:**
```json
"midwayOIDC": {
  "enabled": false,
  "domain": "",
  "clientIdSecretName": "",
  "clientSecretSecretName": "",
  "scopes": ["email", "openid", "profile"],
  "callbackUrls": ["http://localhost:3000/oauth/callback"],
  "logoutUrls": ["http://localhost:3000/login"]
}
```

**Local Development Notes:**
- Keep `enabled: false` unless you need Midway OIDC integration
- Callback URLs should point to your local frontend

---

### 12. SageMaker Canvas (`sageMakerCanvas`)

**Purpose:** Configures Amazon SageMaker Canvas for ML model training.

**Fields:**
- `enabled` - Enable SageMaker Canvas integration (boolean)
- `domainNamePrefix` - Prefix for SageMaker domain name
- `enableVpc` - Deploy in VPC (boolean)
- `vpcCidr` - VPC CIDR block
- `modelCategories` - Product categories for ML models
- `trainingSchedule.enabled` - Enable automated training (boolean)
- `trainingSchedule.frequency` - Training frequency (`daily`, `weekly`)
- `performanceThresholds.minAccuracy` - Minimum model accuracy threshold
- `performanceThresholds.maxModelAge` - Maximum model age in days

**Example:**
```json
"sageMakerCanvas": {
  "enabled": false,
  "domainNamePrefix": "pricing-canvas-local",
  "enableVpc": false,
  "vpcCidr": "10.2.0.0/16",
  "modelCategories": ["powertools", "kitchen", "apparel", "footwear"],
  "trainingSchedule": {
    "enabled": false,
    "frequency": "weekly"
  },
  "performanceThresholds": {
    "minAccuracy": 0.7,
    "maxModelAge": 90
  }
}
```

**Local Development Notes:**
- Keep `enabled: false` for local development to avoid SageMaker costs
- SageMaker Canvas is expensive and typically not needed for local testing

---

## Configuration Resolution Priority

The system resolves configuration values in the following priority order:

1. **CLI Context Parameters** (highest priority)
   ```bash
   cdk deploy --context account=123456789012 --context region=us-west-2
   ```

2. **JSON Configuration Files**
   ```bash
   cdk deploy --context environment=local
   # Loads config/local.json
   ```

3. **Environment Variables** (lowest priority)
   ```bash
   export CDK_DEFAULT_ACCOUNT=123456789012
   export CDK_DEFAULT_REGION=us-east-1
   ```

## CDK Bootstrap

Before deploying for the first time, you must bootstrap CDK in your AWS account/region. The bootstrap commands automatically read account and region information from your configuration files.

### Bootstrap Commands

```bash
# Bootstrap for local environment
npm run bootstrap:local

# Bootstrap for dev environment
npm run bootstrap:dev

# Bootstrap for prod environment
npm run bootstrap:prod
```

### What Bootstrap Does

CDK bootstrap creates the necessary AWS resources for CDK deployments:
- S3 bucket for storing CDK assets (Lambda code, Docker images, etc.)
- IAM roles for CloudFormation to assume during deployments
- ECR repository for Docker images (if using containers)

### When to Bootstrap

- **First time deploying** to a new AWS account/region combination
- **After major CDK version upgrades** (check CDK release notes)
- **When switching to a different AWS account** for the same environment

### Bootstrap Verification

After bootstrapping, verify the resources were created:

```bash
# Check for CDK toolkit stack
aws cloudformation describe-stacks \
  --stack-name CDKToolkit \
  --region <your-region>

# List CDK bootstrap resources
aws s3 ls | grep cdk
```

### Troubleshooting Bootstrap

**Error: Stack already exists**
```
Stack [CDKToolkit] already exists
```
**Solution:** Bootstrap is already complete. You can proceed with deployment.

**Error: Insufficient permissions**
```
User is not authorized to perform: cloudformation:CreateStack
```
**Solution:** Ensure your AWS credentials have administrator access or the required CDK bootstrap permissions.

**Error: Account mismatch**
```
Current AWS account (111111111111) does not match config (222222222222)
```
**Solution:** Either:
1. Switch to the correct AWS profile: `export AWS_PROFILE=your-profile`
2. Update the configuration file with the correct account ID
3. Continue anyway if you intentionally want to use a different account

## Validation

Before deploying, validate your configuration:

```bash
# Check configuration syntax
jq empty src/backend/config/local.json

# Validate AWS credentials
aws sts get-caller-identity

# Validate configuration completeness (after implementing validation script)
npm run validate:config
```

## Security Notes

- **Never commit `local.json`** - It contains your personal AWS account information
- **Use IAM roles** - Prefer IAM roles over access keys when possible
- **Rotate credentials** - Regularly rotate AWS access keys
- **Least privilege** - Use minimal required permissions for local development

## Troubleshooting

### Configuration file not found
```
ERROR: Configuration file not found: config/local.json
```
**Solution:** Copy `local.json.template` to `local.json` and update placeholders.

### Invalid AWS account format
```
ERROR: Invalid AWS account format: 12345
```
**Solution:** AWS account IDs must be exactly 12 digits. Find yours with:
```bash
aws sts get-caller-identity --query Account --output text
```

### S3 bucket name already exists
```
ERROR: Bucket name already exists
```
**Solution:** This should not occur with the account-number suffix pattern. If it does, the bucket may already exist in your account from a previous deployment. Check with:
```bash
aws s3 ls | grep retail-pricing
```

### Bedrock not available in region
```
ERROR: Bedrock service not available in region
```
**Solution:** Check Bedrock availability in your region. Use `us-east-1` or `us-west-2` for best availability.

## Related Documentation

- [Deployment Guide](../../../docs/operations/deployment-guide.md)
- [Local Developer Setup](../../../docs/development/local-deployment-setup.md)
- [Configuration Validation](../../../docs/operations/deployment-configuration-guide.md)

## Questions?

For questions about configuration:
1. Check this README
2. Review existing `dev.json` and `prod.json` for examples
3. Consult the deployment documentation
4. Ask the development team
