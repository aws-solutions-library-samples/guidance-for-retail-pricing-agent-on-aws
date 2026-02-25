#!/bin/bash
###############################################################################
# Deploy Frontend to Amplify Hosting
#
# Uses AWS CLI with bucket+prefix method (AWS recommended approach)
# Supports three cloud environments: local, dev, prod
#
# Usage:
#   ./scripts/deploy-to-amplify.sh [environment]
#
# Examples:
#   ./scripts/deploy-to-amplify.sh local
#   ./scripts/deploy-to-amplify.sh dev
#   ./scripts/deploy-to-amplify.sh prod
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-local}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$FRONTEND_DIR/../backend"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Deploy Frontend to Amplify${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(local|dev|prod)$ ]]; then
    echo -e "${RED}❌ Invalid environment: $ENVIRONMENT${NC}"
    echo -e "${YELLOW}Valid environments: local, dev, prod${NC}"
    exit 1
fi

# Get stack outputs from CDK
FRONTEND_STACK_NAME="FrontendHostingStack-${ENVIRONMENT}"
BACKEND_STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"

echo -e "${YELLOW}Fetching stack outputs...${NC}"

# Get frontend stack outputs
APP_ID=$(aws cloudformation describe-stacks \
  --stack-name "$FRONTEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppId`].OutputValue' \
  --output text 2>/dev/null)

DEPLOYMENT_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$FRONTEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucket`].OutputValue' \
  --output text 2>/dev/null)

BRANCH_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$FRONTEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`BranchName`].OutputValue' \
  --output text 2>/dev/null)

APP_URL=$(aws cloudformation describe-stacks \
  --stack-name "$FRONTEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppUrl`].OutputValue' \
  --output text 2>/dev/null)

# Validate outputs
if [ -z "$APP_ID" ] || [ -z "$DEPLOYMENT_BUCKET" ] || [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}❌ Failed to get stack outputs${NC}"
    echo ""
    echo -e "${YELLOW}Please ensure the frontend stack is deployed:${NC}"
    echo -e "  cd $BACKEND_DIR"
    echo -e "  cdk deploy FrontendHostingStack-${ENVIRONMENT} --context environment=${ENVIRONMENT}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ App ID: $APP_ID${NC}"
echo -e "${GREEN}✓ Deployment Bucket: $DEPLOYMENT_BUCKET${NC}"
echo -e "${GREEN}✓ Branch Name: $BRANCH_NAME${NC}"
echo ""

# Get backend stack outputs for amplify_outputs.json
echo -e "${YELLOW}Fetching backend configuration...${NC}"

GRAPHQL_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$BACKEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`GraphQLApiUrl`].OutputValue' \
  --output text 2>/dev/null)

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$BACKEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text 2>/dev/null)

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "$BACKEND_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text 2>/dev/null)

# Read AWS_REGION from the config file (aws.region is read-only, never modified by deployment)
AWS_REGION=$(jq -r '.aws.region // "us-east-1"' "$BACKEND_DIR/config/${ENVIRONMENT}.json")

# Validate backend outputs
if [ -z "$GRAPHQL_ENDPOINT" ] || [ -z "$USER_POOL_ID" ] || [ -z "$USER_POOL_CLIENT_ID" ]; then
    echo -e "${RED}❌ Failed to get backend stack outputs${NC}"
    echo ""
    echo -e "${YELLOW}Please ensure the backend stack is deployed:${NC}"
    echo -e "  cd $BACKEND_DIR"
    echo -e "  cdk deploy ProductCatalogStack-${ENVIRONMENT} --context environment=${ENVIRONMENT}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ GraphQL Endpoint: $GRAPHQL_ENDPOINT${NC}"
echo -e "${GREEN}✓ User Pool ID: $USER_POOL_ID${NC}"
echo -e "${GREEN}✓ User Pool Client ID: $USER_POOL_CLIENT_ID${NC}"
echo ""

# Update backend config file with correct Amplify App ID and all related values
echo -e "${YELLOW}Updating backend config file...${NC}"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

if [ -f "$CONFIG_FILE" ]; then
    # Update all amplify-related fields in the config file
    # Note: aws.region is read-only and never modified by deployment scripts
    jq --arg appId "$APP_ID" \
       --arg appUrl "$APP_URL" \
       --arg bucket "$DEPLOYMENT_BUCKET" \
       --arg env "$ENVIRONMENT" \
       --arg graphql "$GRAPHQL_ENDPOINT" \
       --arg poolId "$USER_POOL_ID" \
       --arg clientId "$USER_POOL_CLIENT_ID" \
       '.amplify.appId = $appId | 
        .amplify.appUrl = $appUrl | 
        .amplify.deploymentBucket = $bucket | 
        .amplify.environment = $env |
        .appSync.endpoint = $graphql |
        .cognito.poolId = $poolId |
        .cognito.poolClientId = $clientId' \
       "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
    
    echo -e "${GREEN}✓ Updated backend config file:${NC}"
    echo -e "  - amplify.appId: $APP_ID"
    echo -e "  - amplify.appUrl: $APP_URL"
    echo -e "  - amplify.deploymentBucket: $DEPLOYMENT_BUCKET"
    echo -e "  - appSync.endpoint: $GRAPHQL_ENDPOINT"
    echo -e "  - cognito.poolId: $USER_POOL_ID"
    echo -e "  - cognito.poolClientId: $USER_POOL_CLIENT_ID"
    echo -e "  (aws.region preserved: $AWS_REGION)"
else
    echo -e "${YELLOW}⚠ Backend config file not found: $CONFIG_FILE${NC}"
fi

echo ""
# Navigate to frontend directory
cd "$FRONTEND_DIR"

# Update amplify_outputs.json with current backend configuration
echo -e "${YELLOW}Updating amplify_outputs.json...${NC}"

cat > amplify_outputs.json << EOF
{
  "version": "1",
  "api": {
    "aws_appsync_graphqlEndpoint": "$GRAPHQL_ENDPOINT",
    "aws_appsync_region": "$AWS_REGION",
    "aws_appsync_authenticationType": "AMAZON_COGNITO_USER_POOLS"
  },
  "auth": {
    "aws_region": "$AWS_REGION",
    "user_pool_id": "$USER_POOL_ID",
    "user_pool_client_id": "$USER_POOL_CLIENT_ID"
  }
}
EOF

echo -e "${GREEN}✓ Updated amplify_outputs.json${NC}"
echo ""

# Build frontend (Vite will bundle the amplify_outputs.json)
echo -e "${YELLOW}Building frontend with updated configuration...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed: dist directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Sync to S3 using bucket+prefix method (AWS recommended)
echo -e "${YELLOW}Uploading to S3...${NC}"
aws s3 sync dist/ "s3://${DEPLOYMENT_BUCKET}/builds/latest/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.map"

# Upload index.html separately with no-cache
aws s3 cp dist/index.html "s3://${DEPLOYMENT_BUCKET}/builds/latest/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo -e "${GREEN}✓ Upload complete${NC}"
echo ""

# Deploy to Amplify using bucket+prefix method
echo -e "${YELLOW}Deploying to Amplify...${NC}"
DEPLOYMENT_OUTPUT=$(aws amplify start-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH_NAME" \
  --source-url "s3://${DEPLOYMENT_BUCKET}/builds/latest/" \
  --source-url-type BUCKET_PREFIX \
  --output json)

JOB_ID=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.jobSummary.jobId')

echo -e "${GREEN}✓ Deployment initiated${NC}"
echo -e "${BLUE}Job ID: $JOB_ID${NC}"
echo ""

# Wait for deployment to complete
echo -e "${YELLOW}Waiting for deployment to complete...${NC}"
while true; do
    JOB_STATUS=$(aws amplify get-job \
      --app-id "$APP_ID" \
      --branch-name "$BRANCH_NAME" \
      --job-id "$JOB_ID" \
      --query 'job.summary.status' \
      --output text)
    
    if [ "$JOB_STATUS" == "SUCCEED" ]; then
        echo -e "${GREEN}✓ Deployment successful!${NC}"
        break
    elif [ "$JOB_STATUS" == "FAILED" ] || [ "$JOB_STATUS" == "CANCELLED" ]; then
        echo -e "${RED}❌ Deployment failed with status: $JOB_STATUS${NC}"
        exit 1
    else
        echo -e "${BLUE}Status: $JOB_STATUS${NC}"
        sleep 10
    fi
done

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Deployment Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}Your app is available at:${NC}"
echo -e "  ${CYAN}$APP_URL${NC}"
echo ""
