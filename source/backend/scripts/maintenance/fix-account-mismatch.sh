#!/bin/bash

###############################################################################
# Fix Account Mismatch Script
#
# This script fixes CDK deployment issues caused by account mismatches.
# It cleans cached CDK context, verifies account configuration, and
# re-bootstraps CDK if needed.
#
# Usage:
#   ./scripts/fix-account-mismatch.sh <environment>
#
# Examples:
#   ./scripts/fix-account-mismatch.sh local
#   ./scripts/fix-account-mismatch.sh dev
###############################################################################

set -e  # Exit on error

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
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

# Print header
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Fix Account Mismatch Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Create configuration file:"
    echo -e "     cp config/local.json.template config/${ENVIRONMENT}.json"
    echo -e "  2. Update with your AWS account and region"
    echo ""
    exit 1
fi

# Check jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}ERROR: jq not found (required for JSON parsing)${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  Install jq:"
    echo -e "    - macOS: brew install jq"
    echo -e "    - Linux: apt-get install jq"
    echo ""
    exit 1
fi

# Get current AWS account
echo -e "${YELLOW}Step 1: Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}ERROR: AWS credentials not configured${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  Configure AWS credentials:"
    echo -e "    aws configure"
    echo -e "  Or set AWS profile:"
    echo -e "    export AWS_PROFILE=your-profile"
    echo ""
    exit 1
fi

CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
CURRENT_REGION=$(aws configure get region || echo "us-east-1")

echo -e "${GREEN}✓ AWS credentials configured${NC}"
echo -e "  Current Account: ${CURRENT_ACCOUNT}"
echo -e "  Current Region: ${CURRENT_REGION}"
echo ""

# Get config file account
echo -e "${YELLOW}Step 2: Checking configuration file...${NC}"
CONFIG_ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")
CONFIG_REGION=$(jq -r '.aws.region' "$CONFIG_FILE")

echo -e "  Config Account: ${CONFIG_ACCOUNT}"
echo -e "  Config Region: ${CONFIG_REGION}"
echo ""

# Check for mismatch
ACCOUNT_MISMATCH=false
REGION_MISMATCH=false

if [ "$CURRENT_ACCOUNT" != "$CONFIG_ACCOUNT" ]; then
    ACCOUNT_MISMATCH=true
    echo -e "${YELLOW}⚠ Account mismatch detected!${NC}"
    echo -e "  Current AWS account: ${CURRENT_ACCOUNT}"
    echo -e "  Config file account: ${CONFIG_ACCOUNT}"
    echo ""
fi

if [ "$CURRENT_REGION" != "$CONFIG_REGION" ]; then
    REGION_MISMATCH=true
    echo -e "${YELLOW}⚠ Region mismatch detected!${NC}"
    echo -e "  Current AWS region: ${CURRENT_REGION}"
    echo -e "  Config file region: ${CONFIG_REGION}"
    echo ""
fi

# Offer to update config file
if [ "$ACCOUNT_MISMATCH" = true ] || [ "$REGION_MISMATCH" = true ]; then
    echo -e "${YELLOW}Do you want to update the config file to match current AWS credentials? (y/N)${NC}"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Updating config file...${NC}"
        
        # Create temporary file with updated values
        jq ".aws.account = \"$CURRENT_ACCOUNT\" | .aws.region = \"$CURRENT_REGION\"" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
        mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        
        echo -e "${GREEN}✓ Config file updated${NC}"
        echo ""
        
        CONFIG_ACCOUNT=$CURRENT_ACCOUNT
        CONFIG_REGION=$CURRENT_REGION
    else
        echo -e "${YELLOW}Config file not updated. Continuing with current values...${NC}"
        echo ""
    fi
fi

# Clean CDK cache
echo -e "${YELLOW}Step 3: Cleaning CDK cache...${NC}"

cd "$BACKEND_DIR"

if [ -f "cdk.context.json" ]; then
    rm -f cdk.context.json
    echo -e "${GREEN}✓ Removed cdk.context.json${NC}"
else
    echo -e "${BLUE}  No cdk.context.json found (already clean)${NC}"
fi

# Clean output files
OUTPUT_FILES=$(ls cdk-outputs-*.json 2>/dev/null || true)
if [ -n "$OUTPUT_FILES" ]; then
    rm -f cdk-outputs-*.json
    echo -e "${GREEN}✓ Removed CDK output files${NC}"
else
    echo -e "${BLUE}  No CDK output files found${NC}"
fi

echo ""

# Check if CDK is bootstrapped
echo -e "${YELLOW}Step 4: Checking CDK bootstrap status...${NC}"

BOOTSTRAP_STACK_NAME="CDKToolkit"
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$BOOTSTRAP_STACK_NAME" \
    --region "$CONFIG_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_EXISTS" = "NOT_FOUND" ]; then
    echo -e "${YELLOW}⚠ CDK not bootstrapped in this account/region${NC}"
    echo ""
    echo -e "${YELLOW}Do you want to bootstrap CDK now? (y/N)${NC}"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Bootstrapping CDK...${NC}"
        bash "$SCRIPT_DIR/bootstrap-cdk.sh" "$ENVIRONMENT"
    else
        echo -e "${YELLOW}Skipping bootstrap. You'll need to run it manually:${NC}"
        echo -e "  npm run bootstrap:${ENVIRONMENT}"
        echo ""
    fi
else
    echo -e "${GREEN}✓ CDK already bootstrapped${NC}"
    echo -e "  Stack Status: ${STACK_EXISTS}"
    echo ""
    
    # Check if bootstrap is for correct account
    BOOTSTRAP_ACCOUNT=$(aws cloudformation describe-stacks \
        --stack-name "$BOOTSTRAP_STACK_NAME" \
        --region "$CONFIG_REGION" \
        --query 'Stacks[0].Tags[?Key==`aws-cdk:bootstrap-version`].Value' \
        --output text 2>/dev/null || echo "")
    
    if [ "$ACCOUNT_MISMATCH" = true ]; then
        echo -e "${YELLOW}⚠ Bootstrap may be for a different account${NC}"
        echo -e "${YELLOW}Do you want to re-bootstrap CDK? (y/N)${NC}"
        read -r response
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}Re-bootstrapping CDK...${NC}"
            bash "$SCRIPT_DIR/bootstrap-cdk.sh" "$ENVIRONMENT"
        fi
    fi
fi

# Summary
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Fix Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ CDK cache cleaned${NC}"
echo -e "${GREEN}✓ Configuration verified${NC}"
echo ""
echo -e "${BLUE}Current configuration:${NC}"
echo -e "  Account: ${CONFIG_ACCOUNT}"
echo -e "  Region: ${CONFIG_REGION}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Validate configuration:"
echo -e "     ${CYAN}npm run validate:config:${ENVIRONMENT}${NC}"
echo ""
echo -e "  2. Deploy:"
echo -e "     ${CYAN}npm run deploy:backend:${ENVIRONMENT}${NC}"
echo ""
echo -e "  Or deploy specific components:"
echo -e "     ${CYAN}npm run deploy:cdk:only:${ENVIRONMENT}${NC}"
echo -e "     ${CYAN}npm run deploy:agentcore:only:${ENVIRONMENT}${NC}"
echo ""
