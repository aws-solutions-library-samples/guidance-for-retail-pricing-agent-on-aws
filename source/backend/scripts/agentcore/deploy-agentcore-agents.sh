#!/bin/bash

###############################################################################
# Deploy AgentCore Runtime Agents using AWS SDK for JavaScript
#
# This script uses AWS SDK v3 for JavaScript to deploy agents to Amazon
# Bedrock AgentCore Runtime. It packages agent code, uploads to S3, and
# creates/updates AgentCore Runtime agents.
#
# Usage:
#   ./scripts/deploy-agentcore-agents.sh <environment>
#
# Example:
#   ./scripts/deploy-agentcore-agents.sh dev
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ENVIRONMENT=${1:-dev}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}AgentCore Deployment (JavaScript SDK)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is required but not found${NC}"
    exit 1
fi

# Run JavaScript deployment script
node "$SCRIPT_DIR/deploy-agentcore-agents.js" "$ENVIRONMENT"

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Deployment completed successfully${NC}"
else
    echo ""
    echo -e "${RED}✗ Deployment failed with exit code: $exit_code${NC}"
    exit $exit_code
fi
