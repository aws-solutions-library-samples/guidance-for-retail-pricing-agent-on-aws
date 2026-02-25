#!/bin/bash

###############################################################################
# CDK Bootstrap Script
#
# Bootstraps AWS CDK in the specified environment using configuration from
# the environment's JSON config file.
#
# Usage:
#   ./scripts/bootstrap-cdk.sh <environment>
#
# Examples:
#   ./scripts/bootstrap-cdk.sh local
#   ./scripts/bootstrap-cdk.sh dev
#   ./scripts/bootstrap-cdk.sh prod
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
ENVIRONMENT=${1:-dev}

if [ -z "$ENVIRONMENT" ]; then
    echo -e "${RED}ERROR: Environment argument required${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo -e "  ./scripts/bootstrap-cdk.sh <environment>"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  ./scripts/bootstrap-cdk.sh local"
    echo -e "  ./scripts/bootstrap-cdk.sh dev"
    echo -e "  ./scripts/bootstrap-cdk.sh prod"
    echo ""
    exit 1
fi

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

# Print header
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}CDK Bootstrap Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Validate configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Verify you are in the correct directory (src/backend)"
    echo -e "  2. Check that config/${ENVIRONMENT}.json exists"
    echo -e "  3. If missing, copy from config/local.json.template"
    echo ""
    exit 1
fi

# Check jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}ERROR: jq not found (required for JSON parsing)${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Install jq:"
    echo -e "     - macOS: brew install jq"
    echo -e "     - Linux: apt-get install jq"
    echo -e "     - Windows: choco install jq"
    echo -e "  2. Verify installation: jq --version"
    echo ""
    exit 1
fi

# Read configuration
ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")
REGION=$(jq -r '.aws.region' "$CONFIG_FILE")

# Validate account and region
if [ -z "$ACCOUNT" ] || [ "$ACCOUNT" = "null" ]; then
    echo -e "${RED}ERROR: AWS account not found in configuration${NC}"
    echo -e "       Check .aws.account in $CONFIG_FILE"
    echo ""
    exit 1
fi

if [ -z "$REGION" ] || [ "$REGION" = "null" ]; then
    echo -e "${RED}ERROR: AWS region not found in configuration${NC}"
    echo -e "       Check .aws.region in $CONFIG_FILE"
    echo ""
    exit 1
fi

# Validate account format (12 digits)
if ! [[ "$ACCOUNT" =~ ^[0-9]{12}$ ]]; then
    echo -e "${RED}ERROR: Invalid AWS account format: $ACCOUNT${NC}"
    echo -e "       Expected 12-digit number"
    echo ""
    exit 1
fi

echo -e "${GREEN}Configuration loaded:${NC}"
echo -e "  Account: $ACCOUNT"
echo -e "  Region: $REGION"
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}ERROR: AWS credentials not configured${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Configure AWS credentials using one of:"
    echo -e "     - AWS CLI: aws configure"
    echo -e "     - Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    echo -e "     - AWS Profile: export AWS_PROFILE=your-profile"
    echo -e "  2. Verify credentials: aws sts get-caller-identity"
    echo ""
    exit 1
fi

# Verify we're using the correct account
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$CURRENT_ACCOUNT" != "$ACCOUNT" ]; then
    echo -e "${YELLOW}WARNING: Current AWS account ($CURRENT_ACCOUNT) does not match config ($ACCOUNT)${NC}"
    echo ""
    echo -e "${YELLOW}Do you want to continue? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Bootstrap cancelled${NC}"
        exit 0
    fi
    echo ""
fi

# Bootstrap CDK
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Bootstrapping CDK${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}Running: npx cdk bootstrap aws://${ACCOUNT}/${REGION} --context environment=${ENVIRONMENT}${NC}"
echo ""

cd "$BACKEND_DIR"
npx cdk bootstrap "aws://${ACCOUNT}/${REGION}" --context environment="${ENVIRONMENT}"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ CDK bootstrap completed successfully${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Deploy the stack:"
    echo -e "     ${CYAN}npm run deploy:backend:${ENVIRONMENT}${NC}"
    echo ""
    echo -e "  2. Or deploy specific components:"
    echo -e "     ${CYAN}npm run deploy:cdk:only:${ENVIRONMENT}${NC}"
    echo -e "     ${CYAN}npm run deploy:agentcore:only:${ENVIRONMENT}${NC}"
    echo -e "     ${CYAN}npm run deploy:data:only:${ENVIRONMENT}${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ CDK bootstrap failed${NC}"
    echo ""
    exit 1
fi
