#!/bin/bash

# AWS Credentials Setup Script for Retail Pricing Generator
# This script helps set up AWS credentials for CDK deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
ENVIRONMENT=${1:-local}

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config/${ENVIRONMENT}.json"

echo -e "${CYAN}🔧 AWS Credentials Setup for Retail Pricing Generator${NC}"
echo -e "${CYAN}==================================================${NC}"
echo ""
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found (needed to read config file)${NC}"
    echo -e "${YELLOW}   Install with: brew install jq (macOS) or apt-get install jq (Linux)${NC}"
    echo ""
fi

# Read account and region from config file
if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE" 2>/dev/null || echo "")
    REGION=$(jq -r '.aws.region' "$CONFIG_FILE" 2>/dev/null || echo "")
    
    if [ -n "$ACCOUNT" ] && [ "$ACCOUNT" != "null" ]; then
        echo -e "${GREEN}✓ Configuration loaded from: ${CONFIG_FILE}${NC}"
        echo -e "  Account: ${ACCOUNT}"
        echo -e "  Region: ${REGION}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Could not read account/region from config file${NC}"
        echo -e "   Using defaults for display purposes only"
        echo ""
        ACCOUNT="YOUR_AWS_ACCOUNT_ID"
        REGION="YOUR_PREFERRED_REGION"
    fi
else
    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${YELLOW}⚠️  Configuration file not found: ${CONFIG_FILE}${NC}"
        echo -e "   Create it from template:"
        echo -e "   ${CYAN}cp config/local.json.template config/${ENVIRONMENT}.json${NC}"
        echo ""
    fi
    ACCOUNT="YOUR_AWS_ACCOUNT_ID"
    REGION="YOUR_PREFERRED_REGION"
fi

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists. Backing up to .env.backup${NC}"
    cp .env .env.backup
fi

# Copy template
cp .env.example .env
echo -e "${GREEN}✅ Created .env file from template${NC}"

echo ""
echo -e "${BLUE}📝 Please edit the .env file and add your AWS credentials:${NC}"
echo ""
echo -e "${CYAN}For temporary credentials (recommended):${NC}"
echo "  AWS_ACCESS_KEY_ID=your_access_key"
echo "  AWS_SECRET_ACCESS_KEY=your_secret_key"
echo "  AWS_SESSION_TOKEN=your_session_token (if using temporary credentials)"
echo ""
echo -e "${CYAN}For AWS profile (alternative):${NC}"
echo "  AWS_PROFILE=your_profile_name"
echo ""
echo -e "${CYAN}Account and region configuration:${NC}"
echo "  CDK_DEFAULT_ACCOUNT=${ACCOUNT}"
echo "  CDK_DEFAULT_REGION=${REGION}"
echo ""
echo -e "${YELLOW}Note: Account and region are read from config/${ENVIRONMENT}.json${NC}"
echo -e "${YELLOW}      Update the config file to change these values${NC}"
echo ""

# Offer to open the file for editing
if command -v code &> /dev/null; then
    read -p "Would you like to open .env in VS Code for editing? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        code .env
    fi
elif command -v nano &> /dev/null; then
    read -p "Would you like to edit .env with nano? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        nano .env
    fi
fi

echo ""
echo -e "${CYAN}🚀 Next steps:${NC}"
echo "1. Edit .env with your AWS credentials"
echo "2. Run: npm install"
echo "3. Run: npm run bootstrap:${ENVIRONMENT} (first time only)"
echo "4. Run: npm run deploy:backend:${ENVIRONMENT}"
echo ""
echo -e "${BLUE}📚 For more details, see:${NC}"
echo "   - DEPLOYMENT.md"
echo "   - config/README.md"
echo "   - docs/operations/first-time-deployment-guide.md"
echo ""