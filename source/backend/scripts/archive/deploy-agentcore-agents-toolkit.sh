#!/bin/bash

###############################################################################
# Deploy AgentCore Runtime Agents
#
# This script deploys the three pricing analysis agents to Amazon Bedrock
# AgentCore Runtime using the AgentCore Starter Toolkit.
#
# Prerequisites:
# - AgentCore Starter Toolkit installed (uv tool install bedrock-agentcore-starter-toolkit)
# - AWS credentials configured
# - Agent packages created (run package-agentcore-agents.sh first)
# - S3 bucket for agent code
#
# Requirements: FR-1, FR-1.1
#
# Usage:
#   ./scripts/deploy-agentcore-agents.sh <environment>
#
# Example:
#   ./scripts/deploy-agentcore-agents.sh dev
#   ./scripts/deploy-agentcore-agents.sh prod
#
# Configuration is read from: config/<environment>.json
#   - agentCore.region: Target AWS region for AgentCore deployment
#   - agentCore.codeBucket: S3 bucket for agent code packages
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
ENVIRONMENT=${1:-dev}

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$BACKEND_DIR/dist/agents"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Read configuration from JSON file
REGION=$(jq -r '.agentCore.region // .aws.region' "$CONFIG_FILE")
CODE_BUCKET=$(jq -r '.agentCore.codeBucket' "$CONFIG_FILE")

# Validate configuration
if [ -z "$REGION" ] || [ "$REGION" == "null" ]; then
    echo -e "${RED}ERROR: Region not found in configuration${NC}"
    exit 1
fi

if [ -z "$CODE_BUCKET" ] || [ "$CODE_BUCKET" == "null" ]; then
    echo -e "${RED}ERROR: Code bucket not found in configuration${NC}"
    echo "Please set 'agentCore.codeBucket' in $CONFIG_FILE"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying AgentCore Runtime Agents${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo -e "${BLUE}Region:${NC} $REGION"
echo -e "${BLUE}Code Bucket:${NC} $CODE_BUCKET"
echo ""

# Configuration loaded successfully
echo -e "${GREEN}Configuration loaded from: $CONFIG_FILE${NC}"

# Check if packages exist
if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}ERROR: Agent packages not found. Run package-agentcore-agents.sh first.${NC}"
    exit 1
fi

# Check if AgentCore Starter Toolkit is installed
if ! command -v agentcore &> /dev/null; then
    echo -e "${YELLOW}AgentCore Starter Toolkit not found. Installing...${NC}"
    uv tool install bedrock-agentcore-starter-toolkit
    echo -e "${GREEN}✓ AgentCore Starter Toolkit installed${NC}"
    echo ""
fi

# Function to set environment variables for agent deployment
set_agent_env_vars() {
    local environment=$1
    
    # Set environment variables for AgentCore configuration substitution
    export ENVIRONMENT="$environment"
    export AWS_REGION="$REGION"
    
    # Set table names based on environment
    export PRICING_TABLE="ProductCatalog-${environment}-PricingTable"
    export PRODUCT_TABLE="ProductCatalog-${environment}-ProductTable"
    export ORCHESTRATION_TABLE="ProductCatalog-${environment}-OrchestrationTable"
    
    # Set logging level
    export LOG_LEVEL="${LOG_LEVEL:-INFO}"
    
    echo -e "${BLUE}Environment variables set:${NC}"
    echo -e "  ENVIRONMENT=$ENVIRONMENT"
    echo -e "  AWS_REGION=$AWS_REGION"
    echo -e "  PRICING_TABLE=$PRICING_TABLE"
    echo -e "  PRODUCT_TABLE=$PRODUCT_TABLE"
    echo -e "  ORCHESTRATION_TABLE=$ORCHESTRATION_TABLE"
    echo ""
}

# Function to deploy agent using AgentCore Starter Toolkit
deploy_agent() {
    local agent_name=$1
    local agent_display_name=$2
    local folder_name=$3
    local agent_dir="$BACKEND_DIR/lib/lambdas/agentcore-agents/${folder_name}"
    
    echo -e "${YELLOW}Deploying $agent_display_name...${NC}"
    
    # Check if agent directory exists
    if [ ! -d "$agent_dir" ]; then
        echo -e "${RED}  ✗ Agent directory not found: $agent_dir${NC}"
        return 1
    fi
    
    # Check if configuration file exists
    if [ ! -f "$agent_dir/.bedrock_agentcore.yaml" ]; then
        echo -e "${RED}  ✗ Configuration file not found: $agent_dir/.bedrock_agentcore.yaml${NC}"
        return 1
    fi
    
    # Navigate to agent directory
    cd "$agent_dir" || return 1
    
    # Deploy using AgentCore Starter Toolkit with configuration file
    echo -e "${BLUE}  Running: agentcore launch --agent $agent_name${NC}"
    
    # Launch with auto-update enabled, force rebuild, and environment variables
    if agentcore launch \
        --agent "$agent_name" \
        --auto-update-on-conflict \
        --force-rebuild-deps \
        --env "PRICING_TABLE=$PRICING_TABLE" \
        --env "PRODUCT_TABLE=$PRODUCT_TABLE" \
        --env "ORCHESTRATION_TABLE=$ORCHESTRATION_TABLE" \
        --env "AWS_REGION=$AWS_REGION" \
        --env "ENVIRONMENT=$ENVIRONMENT" \
        --env "LOG_LEVEL=${LOG_LEVEL:-INFO}"; then
        echo -e "${GREEN}  ✓ $agent_display_name deployed successfully${NC}"
        
        # Get agent status and ID
        echo -e "${BLUE}  Getting agent status...${NC}"
        agentcore status --agent "$agent_name" | head -20
        
        return 0
    else
        echo -e "${RED}  ✗ Failed to deploy $agent_display_name${NC}"
        echo -e "${YELLOW}  Check logs above for details${NC}"
        return 1
    fi
    
    # Return to original directory
    cd "$BACKEND_DIR" || return 1
}

# Function to verify agent deployment
verify_agent() {
    local agent_name=$1
    local folder_name=$2
    local agent_dir="$BACKEND_DIR/lib/lambdas/agentcore-agents/${folder_name}"
    
    echo -e "${YELLOW}Verifying $agent_name deployment...${NC}"
    
    # Navigate to agent directory
    cd "$agent_dir" || return 1
    
    # Get agent status
    if agentcore status --agent "$agent_name" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Agent is deployed and accessible${NC}"
        
        # Show brief status
        agentcore status --agent "$agent_name" | grep -E "(Agent ID|Status|Runtime)" | head -5
        
        cd "$BACKEND_DIR" || return 1
        return 0
    else
        echo -e "${RED}  ✗ Agent not found or not accessible${NC}"
        cd "$BACKEND_DIR" || return 1
        return 1
    fi
}

echo "Starting deployment process..."
echo ""

# Step 1: Set environment variables
echo -e "${BLUE}Step 1: Setting environment variables${NC}"
echo ""

set_agent_env_vars "$ENVIRONMENT"

echo ""

# Step 2: Deploy agents to AgentCore Runtime
echo -e "${BLUE}Step 2: Deploying agents to AgentCore Runtime${NC}"
echo ""

deploy_agent "demand_forecast" "Demand Forecast Agent" "demand-forecast" || exit 1

echo ""

deploy_agent "competitive_analysis" "Competitive Analysis Agent" "competitive-analysis" || exit 1

echo ""

deploy_agent "margin_analysis" "Margin Analysis Agent" "margin-analysis" || exit 1

echo ""
echo -e "${GREEN}✓ All agents deployed successfully${NC}"
echo ""

# Step 3: Verify deployments
echo -e "${BLUE}Step 3: Verifying agent deployments${NC}"
echo ""

verify_agent "demand_forecast" "demand-forecast" || exit 1
verify_agent "competitive_analysis" "competitive-analysis" || exit 1
verify_agent "margin_analysis" "margin-analysis" || exit 1

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "All agents are deployed and verified."
echo ""
echo -e "${BLUE}Capturing Agent Runtime IDs...${NC}"
echo ""

# Function to get agent ID from status output
get_agent_id() {
    local agent_name=$1
    local folder_name=$2
    local agent_dir="$BACKEND_DIR/lib/lambdas/agentcore-agents/${folder_name}"
    
    cd "$agent_dir" || return 1
    local agent_id=$(agentcore status --agent "$agent_name" 2>/dev/null | grep "Agent ID" | awk '{print $NF}' | tr -d '\n')
    cd "$BACKEND_DIR" || return 1
    
    echo "$agent_id"
}

DEMAND_FORECAST_ID=$(get_agent_id "demand_forecast" "demand-forecast")
COMPETITIVE_ANALYSIS_ID=$(get_agent_id "competitive_analysis" "competitive-analysis")
MARGIN_ANALYSIS_ID=$(get_agent_id "margin_analysis" "margin-analysis")

echo -e "${GREEN}Agent Runtime IDs:${NC}"
echo -e "  Demand Forecast: ${CYAN}$DEMAND_FORECAST_ID${NC}"
echo -e "  Competitive Analysis: ${CYAN}$COMPETITIVE_ANALYSIS_ID${NC}"
echo -e "  Margin Analysis: ${CYAN}$MARGIN_ANALYSIS_ID${NC}"
echo ""

# Update configuration file with agent IDs
echo -e "${BLUE}Updating configuration file with agent IDs...${NC}"

# Use jq to update the config file
jq --arg df "$DEMAND_FORECAST_ID" \
   --arg ca "$COMPETITIVE_ANALYSIS_ID" \
   --arg ma "$MARGIN_ANALYSIS_ID" \
   '.agentCore.agents.demandForecast = $df | 
    .agentCore.agents.competitiveAnalysis = $ca | 
    .agentCore.agents.marginAnalysis = $ma' \
   "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo -e "${GREEN}✓ Configuration file updated: $CONFIG_FILE${NC}"
echo ""

echo -e "${BLUE}Next steps:${NC}"
echo "  1. Review agent IDs in: $CONFIG_FILE"
echo "  2. Deploy CDK stack with agent IDs:"
echo "     ${CYAN}cd $BACKEND_DIR${NC}"
echo "     ${CYAN}cdk deploy --context environment=$ENVIRONMENT${NC}"
echo ""
echo "  3. Test agent invocation:"
echo "     ${CYAN}cd $BACKEND_DIR/lib/lambdas/agentcore-agents/demand-forecast${NC}"
echo "     ${CYAN}agentcore invoke --agent demand-forecast --input '{\"product_id\":\"TEST-001\"}'${NC}"
echo ""
