# Deployment Guide

## AWS Credentials Setup

### Option 1: Temporary Credentials (Recommended for temporary access)

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your temporary AWS credentials:
   ```bash
   # Temporary AWS Credentials
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_SESSION_TOKEN=... (if using temporary credentials)
   
   # Account and Region
   CDK_DEFAULT_ACCOUNT=221645205538
   CDK_DEFAULT_REGION=us-west-2
   ```

3. Deploy using environment variables:
   ```bash
   # Load environment variables and deploy
   npm run deploy:dev:env
   ```

### Option 2: AWS Profile (Recommended for permanent access)

1. Create an AWS profile:
   ```bash
   aws configure --profile retail-pricing
   ```

2. Set the profile in your environment:
   ```bash
   export AWS_PROFILE=retail-pricing
   ```

3. Deploy:
   ```bash
   npm run deploy:dev
   ```

### Option 3: Direct Context Parameters

```bash
npm run deploy:dev:explicit
# or
cdk deploy --context environment=dev --context account=221645205538 --context region=us-west-2
```

## Deployment Commands

### First Time Setup
```bash
# 1. Install dependencies
npm install

# 2. Bootstrap CDK (one time per account/region)
npm run bootstrap:dev

# 3. Deploy the stack
npm run deploy:dev
```

### Regular Deployment
```bash
# Deploy to development (requires AWS profile or CLI credentials)
npm run deploy:dev

# Deploy to production (requires AWS profile or CLI credentials)
npm run deploy:prod

# Deploy with environment variables from .env file
npm run deploy:dev:env

# Deploy with environment variables (auto-approve for development)
npm run deploy:dev:env:auto
```

### Useful Commands
```bash
# Synthesize CloudFormation template
npm run synth:dev

# Check differences before deployment
cdk diff --context environment=dev

# Destroy the stack (careful!)
cdk destroy --context environment=dev
```

## Troubleshooting

### Common Issues

1. **"Unable to resolve AWS account"**
   - Ensure AWS credentials are configured
   - Check that account ID matches in config/dev.json
   - Verify AWS_PROFILE or AWS_ACCESS_KEY_ID is set

2. **"Need to bootstrap"**
   - Run `npm run bootstrap:dev` first
   - This creates the CDK toolkit stack in your account

3. **"Access Denied"**
   - Ensure your AWS credentials have sufficient permissions
   - Required permissions: CloudFormation, IAM, DynamoDB, Cognito, AppSync, Lambda

### Required AWS Permissions

Your AWS credentials need the following permissions:
- CloudFormation (full access)
- IAM (create/manage roles and policies)
- DynamoDB (create/manage tables)
- Cognito (create/manage user pools)
- AppSync (create/manage GraphQL APIs)
- Lambda (create/manage functions)
- S3 (for CDK assets)

## Team Collaboration

### For Team Members

1. **Get temporary credentials** from your AWS administrator
2. **Copy `.env.example` to `.env`** and add your credentials
3. **Never commit `.env`** to version control (it's in .gitignore)
4. **Use the same account ID** (221645205538) for consistency

### For AWS Administrators

1. **Create IAM users** with deployment permissions
2. **Generate temporary credentials** for team members
3. **Share the account ID** (221645205538) and region (us-west-2)
4. **Rotate credentials** regularly for security

## Environment Configuration

The deployment uses configuration files in `config/`:
- `dev.json` - Development environment settings
- `prod.json` - Production environment settings

These files contain:
- AWS account and region
- Service configurations (DynamoDB, API Gateway, etc.)
- Environment-specific settings

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use temporary credentials** when possible
3. **Rotate credentials** regularly
4. **Use least privilege** IAM policies
5. **Enable MFA** on AWS accounts
6. **Monitor CloudTrail** for deployment activities