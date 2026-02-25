#!/bin/bash

###############################################################################
# Verify AgentCore + CDK Deployment
#
# This script verifies that all components are deployed correctly:
# 1. AgentCore agents are deployed and accessible
# 2. CDK stack is deployed successfully
# 3. Configuration is correct
# 4. End-to-end workflow can be tested
#
# Usage:
#   ./scripts/verify-deployment.sh <environment>
#
# Example:
#   ./scripts/verify-deployment.sh dev
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
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Deployment Verification${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Read configuration
REGION=$(jq -r '.agentCore.region // .aws.region' "$CONFIG_FILE")
CODE_BUCKET=$(jq -r '.agentCore.codeBucket' "$CONFIG_FILE")

DEMAND_FORECAST_ID=$(jq -r '.agentCore.agents.demandForecast' "$CONFIG_FILE")
COMPETITIVE_ANALYSIS_ID=$(jq -r '.agentCore.agents.competitiveAnalysis' "$CONFIG_FILE")
MARGIN_ANALYSIS_ID=$(jq -r '.agentCore.agents.marginAnalysis' "$CONFIG_FILE")

echo -e "${BLUE}Configuration:${NC}"
echo -e "  Region: $REGION"
echo -e "  Code Bucket: $CODE_BUCKET"
echo ""

ERRORS=0

###############################################################################
# Check 1: S3 Bucket
###############################################################################

echo -e "${YELLOW}Checking S3 bucket...${NC}"
if aws s3 ls "s3://$CODE_BUCKET" &> /dev/null; then
    echo -e "${GREEN}✓ S3 bucket exists${NC}"
else
    echo -e "${RED}✗ S3 bucket not found${NC}"
    ((ERRORS++))
fi
echo ""

###############################################################################
# Check 2: AgentCore Agents
###############################################################################

echo -e "${YELLOW}Checking AgentCore agents...${NC}"

# Function to check agent status
check_agent() {
    local agent_name=$1
    local agent_id=$2
    local agent_dir="$BACKEND_DIR/lib/lambdas/agentcore-agents/${agent_name}"
    
    if [ -n "$agent_id" ] && [ "$agent_id" != "null" ] && [ "$agent_id" != "" ]; then
        # Navigate to agent directory
        cd "$agent_dir" || return 1
        
        # Check agent status using agentcore CLI
        if agentcore status --agent "$agent_name" &> /dev/null; then
            echo -e "${GREEN}✓ ${agent_name^} Agent: $agent_id${NC}"
            cd "$BACKEND_DIR" || return 1
            return 0
        else
            echo -e "${RED}✗ ${agent_name^} Agent not found: $agent_id${NC}"
            cd "$BACKEND_DIR" || return 1
            return 1
        fi
    else
        echo -e "${RED}✗ ${agent_name^} Agent ID not configured${NC}"
        return 1
    fi
}

# Check Demand Forecast Agent
if ! check_agent "demand-forecast" "$DEMAND_FORECAST_ID"; then
    ((ERRORS++))
fi

# Check Competitive Analysis Agent
if ! check_agent "competitive-analysis" "$COMPETITIVE_ANALYSIS_ID"; then
    ((ERRORS++))
fi

# Check Margin Analysis Agent
if ! check_agent "margin-analysis" "$MARGIN_ANALYSIS_ID"; then
    ((ERRORS++))
fi

echo ""

###############################################################################
# Check 3: CDK Stack
###############################################################################

echo -e "${YELLOW}Checking CDK stack...${NC}"
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "ProductCatalogStack-${ENVIRONMENT}" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
    echo -e "${GREEN}✓ CDK stack deployed: $STACK_STATUS${NC}"
else
    echo -e "${RED}✗ CDK stack status: $STACK_STATUS${NC}"
    ((ERRORS++))
fi

echo ""

###############################################################################
# Check 4: Configuration Consistency
###############################################################################

echo -e "${YELLOW}Checking configuration consistency...${NC}"

# Check all regions are the same
AWS_REGION=$(jq -r '.aws.region' "$CONFIG_FILE")
AGENTCORE_REGION=$(jq -r '.agentCore.region' "$CONFIG_FILE")
BEDROCK_REGION=$(jq -r '.bedrock.region' "$CONFIG_FILE")

if [ "$AWS_REGION" = "$AGENTCORE_REGION" ] && [ "$AWS_REGION" = "$BEDROCK_REGION" ]; then
    echo -e "${GREEN}✓ All regions consistent: $AWS_REGION${NC}"
else
    echo -e "${RED}✗ Region mismatch:${NC}"
    echo -e "  AWS: $AWS_REGION"
    echo -e "  AgentCore: $AGENTCORE_REGION"
    echo -e "  Bedrock: $BEDROCK_REGION"
    ((ERRORS++))
fi

echo ""

###############################################################################
# Summary
###############################################################################

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Verification Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo -e "${BLUE}Deployment is ready for testing.${NC}"
    echo ""
    echo -e "${BLUE}Test commands:${NC}"
    echo -e "  # Test agent invocation"
    echo -e "  ${CYAN}cd $BACKEND_DIR/lib/lambdas/agentcore-agents/demand-forecast${NC}"
    echo -e "  ${CYAN}agentcore invoke --agent demand-forecast --input '{\"product_id\":\"TEST-001\"}'${NC}"
    echo ""
    echo -e "  # View agent status"
    echo -e "  ${CYAN}agentcore status --agent demand-forecast${NC}"
else
    echo -e "${RED}✗ $ERRORS check(s) failed${NC}"
    echo ""
    echo -e "${YELLOW}Please fix the issues above and redeploy:${NC}"
    echo -e "  ${CYAN}./scripts/deploy-complete.sh $ENVIRONMENT${NC}"
    exit 1
fi

echo ""
