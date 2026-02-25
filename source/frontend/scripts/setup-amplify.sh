#!/bin/bash

###############################################################################
# Amplify Frontend Setup Script (DEPRECATED)
#
# ⚠️  DEPRECATED: This script is deprecated and will be removed in a future version.
#
# The Amplify setup process has been simplified. You no longer need to run
# this script or use the Amplify CLI.
#
# NEW DEPLOYMENT PROCESS:
#   1. Deploy CDK stacks (backend and frontend):
#      cd src/backend
#      cdk deploy --all --context environment=local
#
#   2. Deploy frontend code:
#      cd src/frontend
#      npm run deploy:local
#
# For migration from old setup, see: AMPLIFY-MIGRATION-GUIDE.md
#
# This script is kept for backward compatibility only.
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}⚠️  DEPRECATED SCRIPT${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${RED}This script is deprecated and no longer needed.${NC}"
echo ""
echo -e "${CYAN}New Deployment Process:${NC}"
echo ""
echo -e "  1. Deploy CDK stacks:"
echo -e "     ${GREEN}cd src/backend${NC}"
echo -e "     ${GREEN}cdk deploy --all --context environment=local${NC}"
echo ""
echo -e "  2. Deploy frontend code:"
echo -e "     ${GREEN}cd src/frontend${NC}"
echo -e "     ${GREEN}npm run deploy:local${NC}"
echo ""
echo -e "${CYAN}Benefits of new process:${NC}"
echo -e "  ✓ No Amplify CLI needed"
echo -e "  ✓ Simpler deployment workflow"
echo -e "  ✓ AWS recommended bucket+prefix method"
echo -e "  ✓ Proper stack separation"
echo ""
echo -e "${YELLOW}For migration guide, see: AMPLIFY-MIGRATION-GUIDE.md${NC}"
echo ""
echo -e "${YELLOW}========================================${NC}"
echo ""

read -p "Do you want to continue with the old setup anyway? (yes/no): " -r
echo ""
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${BLUE}Setup cancelled. Please use the new deployment process.${NC}"
    exit 0
fi

echo -e "${YELLOW}Continuing with deprecated setup...${NC}"
echo ""

# Configuration
ENVIRONMENT=${1:-local}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_CONFIG="$FRONTEND_DIR/../backend/config/${ENVIRONMENT}.json"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Amplify Frontend Setup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Check if backend config exists
if [ ! -f "$BACKEND_CONFIG" ]; then
    echo -e "${RED}❌ Backend config not found: $BACKEND_CONFIG${NC}"
    echo ""
    echo -e "${YELLOW}Please deploy the backend first:${NC}"
    echo -e "  cd ../backend"
    echo -e "  ./scripts/deploy-complete.sh $ENVIRONMENT"
    echo ""
    exit 1
fi

# Get Amplify App ID from backend config
APP_ID=$(jq -r '.amplify.appId // empty' "$BACKEND_CONFIG")
DEPLOYMENT_BUCKET=$(jq -r '.amplify.deploymentBucket // empty' "$BACKEND_CONFIG")

if [ -z "$APP_ID" ]; then
    echo -e "${RED}❌ Amplify App ID not found in backend config${NC}"
    echo ""
    echo -e "${YELLOW}Please deploy the backend and update config:${NC}"
    echo -e "  cd ../backend"
    echo -e "  ./scripts/deploy-complete.sh $ENVIRONMENT"
    echo -e "  node scripts/update-frontend-config.js $ENVIRONMENT"
    echo ""
    exit 1
fi

if [ -z "$DEPLOYMENT_BUCKET" ]; then
    echo -e "${RED}❌ Deployment bucket not found in backend config${NC}"
    echo ""
    echo -e "${YELLOW}Please deploy the backend and update config:${NC}"
    echo -e "  cd ../backend"
    echo -e "  ./scripts/deploy-complete.sh $ENVIRONMENT"
    echo -e "  node scripts/update-frontend-config.js $ENVIRONMENT"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Found Amplify App ID: $APP_ID${NC}"
echo -e "${GREEN}✓ Found Deployment Bucket: $DEPLOYMENT_BUCKET${NC}"
echo ""

# Check if Amplify CLI is installed
if ! command -v amplify &> /dev/null; then
    echo -e "${RED}❌ Amplify CLI not found${NC}"
    echo ""
    echo -e "${YELLOW}Install Amplify CLI:${NC}"
    echo -e "  npm install -g @aws-amplify/cli"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Amplify CLI installed${NC}"
echo ""

# Navigate to frontend directory
cd "$FRONTEND_DIR"

# Check if already initialized
if [ -d "amplify" ]; then
    echo -e "${YELLOW}⚠️  Amplify directory already exists${NC}"
    echo ""
    read -p "Do you want to reinitialize? This will remove existing Amplify config. (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Removing existing Amplify config...${NC}"
        rm -rf amplify .amplifyrc
        echo -e "${GREEN}✓ Removed existing config${NC}"
        echo ""
    else
        echo -e "${BLUE}Keeping existing config${NC}"
        echo ""
        echo -e "${BLUE}To publish, run:${NC}"
        echo -e "  ${CYAN}npm run build${NC}"
        echo -e "  ${CYAN}amplify publish${NC}"
        echo ""
        exit 0
    fi
fi

# Create minimal Amplify configuration
echo -e "${YELLOW}Creating Amplify configuration...${NC}"

# Create .amplifyrc file
cat > .amplifyrc << EOF
{
  "appId": "$APP_ID",
  "envName": "$ENVIRONMENT"
}
EOF

echo -e "${GREEN}✓ Created .amplifyrc${NC}"

# Create amplify directory structure
mkdir -p amplify/.config

# Create project-config.json
cat > amplify/.config/project-config.json << EOF
{
  "projectName": "RetailPricingUI",
  "version": "3.1",
  "frontend": "javascript",
  "javascript": {
    "framework": "react",
    "config": {
      "SourceDir": "src",
      "DistributionDir": "dist",
      "BuildCommand": "npm run build",
      "StartCommand": "npm run dev"
    }
  },
  "providers": [
    "awscloudformation"
  ]
}
EOF

echo -e "${GREEN}✓ Created project-config.json${NC}"

# Create local-aws-info.json
cat > amplify/.config/local-aws-info.json << EOF
{
  "useProfile": true,
  "profileName": "default"
}
EOF

echo -e "${GREEN}✓ Created local-aws-info.json${NC}"

# Create local-env-info.json (required for amplify publish)
cat > amplify/.config/local-env-info.json << EOF
{
  "projectPath": "$(pwd)",
  "defaultEditor": "vscode",
  "envName": "$ENVIRONMENT"
}
EOF

echo -e "${GREEN}✓ Created local-env-info.json${NC}"

# Create backend-config.json (minimal for hosting only)
cat > amplify/backend-config.json << EOF
{
  "hosting": {
    "amplifyhosting": {
      "service": "amplifyhosting",
      "type": "manual",
      "providerPlugin": "awscloudformation",
      "lastPushTimeStamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
    }
  }
}
EOF

echo -e "${GREEN}✓ Created backend-config.json${NC}"

# Create team-provider-info.json
REGION=$(jq -r '.aws.region // "us-east-1"' "$BACKEND_CONFIG")
ACCOUNT_ID=$(jq -r '.aws.account // "ACCOUNT_ID"' "$BACKEND_CONFIG")

cat > amplify/team-provider-info.json << EOF
{
  "$ENVIRONMENT": {
    "awscloudformation": {
      "Region": "$REGION",
      "DeploymentBucketName": "$DEPLOYMENT_BUCKET"
    },
    "categories": {
      "hosting": {
        "amplifyhosting": {
          "appId": "$APP_ID",
          "type": "manual"
        }
      }
    }
  }
}
EOF

echo -e "${GREEN}✓ Created team-provider-info.json${NC}"

# Create #current-cloud-backend directory (Amplify expects this)
mkdir -p "amplify/#current-cloud-backend"

# Copy backend-config to current-cloud-backend
cp amplify/backend-config.json "amplify/#current-cloud-backend/backend-config.json"

echo -e "${GREEN}✓ Created #current-cloud-backend${NC}"

# Create backend directory structure for hosting
mkdir -p "amplify/backend/hosting/amplifyhosting"

# Create parameters.json for hosting
cat > amplify/backend/hosting/amplifyhosting/parameters.json << EOF
{
  "appId": "$APP_ID",
  "type": "manual"
}
EOF

echo -e "${GREEN}✓ Created hosting parameters${NC}"

# Create amplify-meta.json for hosting backend
cat > amplify/backend/hosting/amplifyhosting/amplify-meta.json << EOF
{
  "service": "amplifyhosting",
  "type": "manual",
  "providerPlugin": "awscloudformation",
  "lastPushTimeStamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
}
EOF

echo -e "${GREEN}✓ Created hosting amplify-meta.json${NC}"

# Copy hosting config to #current-cloud-backend
mkdir -p "amplify/#current-cloud-backend/hosting/amplifyhosting"
cp amplify/backend/hosting/amplifyhosting/parameters.json "amplify/#current-cloud-backend/hosting/amplifyhosting/parameters.json"
cp amplify/backend/hosting/amplifyhosting/amplify-meta.json "amplify/#current-cloud-backend/hosting/amplifyhosting/amplify-meta.json"

echo -e "${GREEN}✓ Created hosting backend structure${NC}"

# Create amplify-meta.json in backend root
cat > amplify/backend/amplify-meta.json << EOF
{
  "providers": {
    "awscloudformation": {
      "Region": "$REGION"
    }
  },
  "hosting": {
    "amplifyhosting": {
      "service": "amplifyhosting",
      "type": "manual",
      "providerPlugin": "awscloudformation",
      "lastPushTimeStamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
    }
  }
}
EOF

echo -e "${GREEN}✓ Created backend amplify-meta.json${NC}"

# Copy amplify-meta.json to #current-cloud-backend
cp amplify/backend/amplify-meta.json "amplify/#current-cloud-backend/amplify-meta.json"

echo -e "${GREEN}✓ Synced #current-cloud-backend${NC}"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Setup Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Amplify is now configured for manual deployment${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Build the frontend:"
echo -e "     ${CYAN}npm run build${NC}"
echo ""
echo -e "  2. Publish to Amplify:"
echo -e "     ${CYAN}amplify publish${NC}"
echo ""
echo -e "${BLUE}Your app will be available at:${NC}"
APP_URL=$(jq -r '.amplify.appUrl // empty' "$BACKEND_CONFIG")
if [ -n "$APP_URL" ]; then
    echo -e "  ${CYAN}$APP_URL${NC}"
else
    echo -e "  ${CYAN}https://$ENVIRONMENT.$APP_ID.amplifyapp.com${NC}"
fi
echo ""
