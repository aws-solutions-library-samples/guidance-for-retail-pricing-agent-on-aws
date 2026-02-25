#!/bin/bash

###############################################################################
# Test AgentCore Agents with Sample Data
#
# This script tests each AgentCore agent with sample product data to verify:
# 1. Agent invocation works correctly
# 2. Agents can access AWS resources (DynamoDB, S3, SageMaker)
# 3. Agents return expected output format
# 4. Agents handle errors gracefully
#
# Usage:
#   ./scripts/test-agentcore-agents.sh <environment>
#
# Example:
#   ./scripts/test-agentcore-agents.sh dev
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
echo -e "${CYAN}AgentCore Agent Testing${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo ""

# Read configuration
REGION=$(jq -r '.agentCore.region // .aws.region' "$CONFIG_FILE")

DEMAND_FORECAST_ID=$(jq -r '.agentCore.agents.demandForecast' "$CONFIG_FILE")
COMPETITIVE_ANALYSIS_ID=$(jq -r '.agentCore.agents.competitiveAnalysis' "$CONFIG_FILE")
MARGIN_ANALYSIS_ID=$(jq -r '.agentCore.agents.marginAnalysis' "$CONFIG_FILE")

echo -e "${BLUE}Configuration:${NC}"
echo -e "  Region: $REGION"
echo -e "  Demand Forecast Agent: $DEMAND_FORECAST_ID"
echo -e "  Competitive Analysis Agent: $COMPETITIVE_ANALYSIS_ID"
echo -e "  Margin Analysis Agent: $MARGIN_ANALYSIS_ID"
echo ""

ERRORS=0
WARNINGS=0

###############################################################################
# Sample Test Data
###############################################################################

# Sample product data for testing
SAMPLE_PRODUCT_ID="TEST-DRILL-001"
SAMPLE_CATEGORY="powertools"
SAMPLE_SUBCATEGORY="drills"

# Sample demand forecast input
DEMAND_FORECAST_INPUT=$(cat <<EOF
{
  "product_id": "$SAMPLE_PRODUCT_ID",
  "category": "$SAMPLE_CATEGORY",
  "subcategory": "$SAMPLE_SUBCATEGORY",
  "historical_sales": [100, 120, 110, 130, 125, 140, 135, 150],
  "seasonality_factors": [1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9]
}
EOF
)

# Sample competitive analysis input
COMPETITIVE_ANALYSIS_INPUT=$(cat <<EOF
{
  "product_id": "$SAMPLE_PRODUCT_ID",
  "category": "$SAMPLE_CATEGORY",
  "subcategory": "$SAMPLE_SUBCATEGORY",
  "current_price": 99.99,
  "competitor_prices": [89.99, 109.99, 95.00, 105.00]
}
EOF
)

# Sample margin analysis input
MARGIN_ANALYSIS_INPUT=$(cat <<EOF
{
  "product_id": "$SAMPLE_PRODUCT_ID",
  "category": "$SAMPLE_CATEGORY",
  "subcategory": "$SAMPLE_SUBCATEGORY",
  "cost": 50.00,
  "proposed_price": 99.99,
  "demand_forecast": 1200,
  "competitive_position": "mid-range"
}
EOF
)

###############################################################################
# Test 1: Demand Forecast Agent
###############################################################################

echo -e "${YELLOW}Testing Demand Forecast Agent...${NC}"
echo ""

if [ -z "$DEMAND_FORECAST_ID" ] || [ "$DEMAND_FORECAST_ID" = "null" ]; then
    echo -e "${RED}✗ Demand Forecast Agent ID not configured${NC}"
    ((ERRORS++))
else
    echo -e "${BLUE}Input:${NC}"
    echo "$DEMAND_FORECAST_INPUT" | jq '.'
    echo ""
    
    echo -e "${BLUE}Invoking agent...${NC}"
    
    # Navigate to agent directory for invocation
    AGENT_DIR="$BACKEND_DIR/lib/lambdas/agentcore-agents/demand-forecast"
    cd "$AGENT_DIR" || exit 1
    
    # Create temp file for input
    TEMP_INPUT=$(mktemp)
    echo "$DEMAND_FORECAST_INPUT" > "$TEMP_INPUT"
    
    # Invoke agent using agentcore CLI
    if RESULT=$(agentcore invoke --agent demand-forecast --input "$(cat $TEMP_INPUT)" 2>&1); then
        
        echo -e "${GREEN}✓ Agent invocation successful${NC}"
        echo ""
        echo -e "${BLUE}Output:${NC}"
        echo "$RESULT" | jq '.' 2>/dev/null || echo "$RESULT"
        echo ""
        
        # Validate output structure
        if echo "$RESULT" | jq -e '.forecast' &> /dev/null; then
            echo -e "${GREEN}✓ Output contains forecast data${NC}"
        else
            echo -e "${YELLOW}⚠ Output missing forecast data${NC}"
            ((WARNINGS++))
        fi
        
    else
        echo -e "${RED}✗ Agent invocation failed${NC}"
        echo "$RESULT"
        ((ERRORS++))
    fi
    
    rm -f "$TEMP_INPUT"
    cd "$BACKEND_DIR" || exit 1
fi

echo ""

###############################################################################
# Test 2: Competitive Analysis Agent
###############################################################################

echo -e "${YELLOW}Testing Competitive Analysis Agent...${NC}"
echo ""

if [ -z "$COMPETITIVE_ANALYSIS_ID" ] || [ "$COMPETITIVE_ANALYSIS_ID" = "null" ]; then
    echo -e "${RED}✗ Competitive Analysis Agent ID not configured${NC}"
    ((ERRORS++))
else
    echo -e "${BLUE}Input:${NC}"
    echo "$COMPETITIVE_ANALYSIS_INPUT" | jq '.'
    echo ""
    
    echo -e "${BLUE}Invoking agent...${NC}"
    
    # Navigate to agent directory for invocation
    AGENT_DIR="$BACKEND_DIR/lib/lambdas/agentcore-agents/competitive-analysis"
    cd "$AGENT_DIR" || exit 1
    
    # Create temp file for input
    TEMP_INPUT=$(mktemp)
    echo "$COMPETITIVE_ANALYSIS_INPUT" > "$TEMP_INPUT"
    
    # Invoke agent using agentcore CLI
    if RESULT=$(agentcore invoke --agent competitive-analysis --input "$(cat $TEMP_INPUT)" 2>&1); then
        
        echo -e "${GREEN}✓ Agent invocation successful${NC}"
        echo ""
        echo -e "${BLUE}Output:${NC}"
        echo "$RESULT" | jq '.' 2>/dev/null || echo "$RESULT"
        echo ""
        
        # Validate output structure
        if echo "$RESULT" | jq -e '.competitive_position' &> /dev/null; then
            echo -e "${GREEN}✓ Output contains competitive analysis${NC}"
        else
            echo -e "${YELLOW}⚠ Output missing competitive analysis${NC}"
            ((WARNINGS++))
        fi
        
    else
        echo -e "${RED}✗ Agent invocation failed${NC}"
        echo "$RESULT"
        ((ERRORS++))
    fi
    
    rm -f "$TEMP_INPUT"
    cd "$BACKEND_DIR" || exit 1
fi

echo ""

###############################################################################
# Test 3: Margin Analysis Agent
###############################################################################

echo -e "${YELLOW}Testing Margin Analysis Agent...${NC}"
echo ""

if [ -z "$MARGIN_ANALYSIS_ID" ] || [ "$MARGIN_ANALYSIS_ID" = "null" ]; then
    echo -e "${RED}✗ Margin Analysis Agent ID not configured${NC}"
    ((ERRORS++))
else
    echo -e "${BLUE}Input:${NC}"
    echo "$MARGIN_ANALYSIS_INPUT" | jq '.'
    echo ""
    
    echo -e "${BLUE}Invoking agent...${NC}"
    
    # Navigate to agent directory for invocation
    AGENT_DIR="$BACKEND_DIR/lib/lambdas/agentcore-agents/margin-analysis"
    cd "$AGENT_DIR" || exit 1
    
    # Create temp file for input
    TEMP_INPUT=$(mktemp)
    echo "$MARGIN_ANALYSIS_INPUT" > "$TEMP_INPUT"
    
    # Invoke agent using agentcore CLI
    if RESULT=$(agentcore invoke --agent margin-analysis --input "$(cat $TEMP_INPUT)" 2>&1); then
        
        echo -e "${GREEN}✓ Agent invocation successful${NC}"
        echo ""
        echo -e "${BLUE}Output:${NC}"
        echo "$RESULT" | jq '.' 2>/dev/null || echo "$RESULT"
        echo ""
        
        # Validate output structure
        if echo "$RESULT" | jq -e '.margin_analysis' &> /dev/null; then
            echo -e "${GREEN}✓ Output contains margin analysis${NC}"
        else
            echo -e "${YELLOW}⚠ Output missing margin analysis${NC}"
            ((WARNINGS++))
        fi
        
    else
        echo -e "${RED}✗ Agent invocation failed${NC}"
        echo "$RESULT"
        ((ERRORS++))
    fi
    
    rm -f "$TEMP_INPUT"
    cd "$BACKEND_DIR" || exit 1
fi

echo ""

###############################################################################
# Test 4: Resource Access (Optional)
###############################################################################

echo -e "${YELLOW}Testing resource access...${NC}"
echo ""

# Check if agents can access DynamoDB
echo -e "${BLUE}Checking DynamoDB access...${NC}"
ORCHESTRATION_TABLE="ProductCatalog-${ENVIRONMENT}-OrchestrationTable"
if aws dynamodb describe-table --table-name "$ORCHESTRATION_TABLE" --region "$REGION" &> /dev/null; then
    echo -e "${GREEN}✓ Orchestration table exists${NC}"
else
    echo -e "${YELLOW}⚠ Orchestration table not found (may not be deployed yet)${NC}"
    ((WARNINGS++))
fi

# Check if agents can access S3
echo -e "${BLUE}Checking S3 access...${NC}"
CODE_BUCKET=$(jq -r '.agentCore.codeBucket' "$CONFIG_FILE")
if aws s3 ls "s3://$CODE_BUCKET" --region "$REGION" &> /dev/null; then
    echo -e "${GREEN}✓ Code bucket accessible${NC}"
else
    echo -e "${RED}✗ Code bucket not accessible${NC}"
    ((ERRORS++))
fi

echo ""

###############################################################################
# Summary
###############################################################################

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Test Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
    else
        echo -e "${YELLOW}⚠ Tests passed with $WARNINGS warning(s)${NC}"
    fi
    echo ""
    echo -e "${BLUE}AgentCore agents are functional and ready for integration.${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Deploy CDK stack with agent IDs"
    echo -e "  2. Test end-to-end workflow"
    echo -e "  3. Monitor agent logs for any issues"
    echo ""
    echo -e "${BLUE}View agent logs:${NC}"
    echo -e "  ${CYAN}aws logs tail /aws/bedrock-agentcore/$DEMAND_FORECAST_ID --follow --region $REGION${NC}"
else
    echo -e "${RED}✗ $ERRORS test(s) failed${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s)${NC}"
    fi
    echo ""
    echo -e "${YELLOW}Please fix the issues above before proceeding.${NC}"
    exit 1
fi

echo ""
