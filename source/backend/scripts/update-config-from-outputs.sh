#!/bin/bash

###############################################################################
# Update Configuration from CDK Outputs
#
# This script reads CloudFormation stack outputs from a deployed CDK stack
# and writes key values back to the configuration file. This ensures the
# config file stays in sync with actual deployed resources.
#
# Values updated:
# - appSync.endpoint (GraphQL API URL)
# - appSync.apiId (GraphQL API ID)
# - appSync.wssEndpoint (GraphQL WebSocket endpoint - constructed from API ID)
# - appSync.apiKey (GraphQL API Key for development)
# - cognito.poolId (Cognito User Pool ID)
# - cognito.poolClientId (Cognito User Pool Client ID)
# - sageMakerCanvas.trainingDataBucket (actual bucket name with account suffix)
# - sageMakerCanvas.modelOutputBucket (actual bucket name with account suffix)
# - sageMakerCanvas.autopilotExecutionRoleArn (SageMaker execution role ARN)
#
# Note: The WebSocket endpoint is constructed using the pattern:
#       wss://<API_ID>.appsync-realtime-api.<REGION>.amazonaws.com/graphql
#
# Usage:
#   ./scripts/update-config-from-outputs.sh <environment>
#
# Examples:
#   ./src//backend/scripts/update-config-from-outputs.sh local
#   ./scripts/update-config-from-outputs.sh dev
#   ./scripts/update-config-from-outputs.sh prod
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

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Update Config from CDK Outputs${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo -e "${BLUE}Config File:${NC} $CONFIG_FILE"
echo ""

# Validate configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Read region from config
REGION=$(jq -r '.aws.region' "$CONFIG_FILE")

if [ -z "$REGION" ] || [ "$REGION" = "null" ]; then
    echo -e "${RED}ERROR: Region not found in configuration file${NC}"
    exit 1
fi

echo -e "${YELLOW}Fetching CloudFormation stack outputs...${NC}"

# Get stack outputs
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output json 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$STACK_OUTPUTS" ] || [ "$STACK_OUTPUTS" = "null" ]; then
    echo -e "${RED}ERROR: Could not fetch stack outputs for $STACK_NAME${NC}"
    echo -e "${YELLOW}Make sure the CDK stack has been deployed first${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Stack outputs retrieved${NC}"
echo ""

# Extract values from outputs
GRAPHQL_URL=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiUrl") | .OutputValue' 2>/dev/null)
GRAPHQL_API_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiId") | .OutputValue' 2>/dev/null)
GRAPHQL_API_KEY=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiKey") | .OutputValue' 2>/dev/null)
USER_POOL_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue' 2>/dev/null)
USER_POOL_CLIENT_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolClientId") | .OutputValue' 2>/dev/null)
TRAINING_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="CanvasTrainingDataBucket") | .OutputValue' 2>/dev/null)
MODEL_OUTPUT_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="CanvasModelOutputBucket") | .OutputValue' 2>/dev/null)
AUTOPILOT_ROLE_ARN=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="AutopilotExecutionRoleArn") | .OutputValue' 2>/dev/null)

# Construct WebSocket endpoint from API ID and region
# Pattern: wss://<API_ID>.appsync-realtime-api.<REGION>.amazonaws.com/graphql
GRAPHQL_WSS=""
if [ -n "$GRAPHQL_API_ID" ] && [ "$GRAPHQL_API_ID" != "null" ]; then
    GRAPHQL_WSS="wss://${GRAPHQL_API_ID}.appsync-realtime-api.${REGION}.amazonaws.com/graphql"
fi

echo -e "${YELLOW}Values to update:${NC}"
echo -e "  GraphQL API URL: ${GRAPHQL_URL:-<not found>}"
echo -e "  GraphQL API ID: ${GRAPHQL_API_ID:-<not found>}"
echo -e "  GraphQL WSS Endpoint: ${GRAPHQL_WSS:-<not found>}"
echo -e "  GraphQL API Key: ${GRAPHQL_API_KEY:-<not found>}"
echo -e "  Cognito User Pool ID: ${USER_POOL_ID:-<not found>}"
echo -e "  Cognito User Pool Client ID: ${USER_POOL_CLIENT_ID:-<not found>}"
echo -e "  Training Data Bucket: ${TRAINING_BUCKET:-<not found>}"
echo -e "  Model Output Bucket: ${MODEL_OUTPUT_BUCKET:-<not found>}"
echo -e "  Autopilot Role ARN: ${AUTOPILOT_ROLE_ARN:-<not found>}"
echo ""

# Create backup of config file
BACKUP_FILE="${CONFIG_FILE}.bak"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✓ Created backup: $BACKUP_FILE${NC}"

# Update configuration file using jq
echo -e "${YELLOW}Updating configuration file...${NC}"

# Build jq update expression dynamically based on what values we found
JQ_UPDATES=()

if [ -n "$GRAPHQL_URL" ] && [ "$GRAPHQL_URL" != "null" ]; then
    JQ_UPDATES+=('.appSync.endpoint = $graphqlUrl')
    echo -e "  ${BLUE}→${NC} Updating appSync.endpoint"
fi

if [ -n "$GRAPHQL_API_ID" ] && [ "$GRAPHQL_API_ID" != "null" ]; then
    JQ_UPDATES+=('.appSync.apiId = $graphqlApiId')
    echo -e "  ${BLUE}→${NC} Updating appSync.apiId"
fi

if [ -n "$GRAPHQL_WSS" ] && [ "$GRAPHQL_WSS" != "null" ]; then
    JQ_UPDATES+=('.appSync.wssEndpoint = $graphqlWss')
    echo -e "  ${BLUE}→${NC} Updating appSync.wssEndpoint"
fi

if [ -n "$GRAPHQL_API_KEY" ] && [ "$GRAPHQL_API_KEY" != "null" ] && [ "$GRAPHQL_API_KEY" != "Not configured" ]; then
    JQ_UPDATES+=('.appSync.apiKey = $graphqlApiKey')
    echo -e "  ${BLUE}→${NC} Updating appSync.apiKey"
fi

if [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "null" ]; then
    JQ_UPDATES+=('.cognito.poolId = $userPoolId')
    echo -e "  ${BLUE}→${NC} Updating cognito.poolId"
fi

if [ -n "$USER_POOL_CLIENT_ID" ] && [ "$USER_POOL_CLIENT_ID" != "null" ]; then
    JQ_UPDATES+=('.cognito.poolClientId = $userPoolClientId')
    echo -e "  ${BLUE}→${NC} Updating cognito.poolClientId"
fi

if [ -n "$TRAINING_BUCKET" ] && [ "$TRAINING_BUCKET" != "null" ]; then
    JQ_UPDATES+=('.sageMakerCanvas.trainingDataBucket = $trainingBucket')
    echo -e "  ${BLUE}→${NC} Updating sageMakerCanvas.trainingDataBucket"
fi

if [ -n "$MODEL_OUTPUT_BUCKET" ] && [ "$MODEL_OUTPUT_BUCKET" != "null" ]; then
    JQ_UPDATES+=('.sageMakerCanvas.modelOutputBucket = $modelOutputBucket')
    echo -e "  ${BLUE}→${NC} Updating sageMakerCanvas.modelOutputBucket"
fi

if [ -n "$AUTOPILOT_ROLE_ARN" ] && [ "$AUTOPILOT_ROLE_ARN" != "null" ]; then
    JQ_UPDATES+=('.sageMakerCanvas.autopilotExecutionRoleArn = $autopilotRoleArn')
    echo -e "  ${BLUE}→${NC} Updating sageMakerCanvas.autopilotExecutionRoleArn"
fi

# Check if we have any updates to make
if [ ${#JQ_UPDATES[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠ No values found to update${NC}"
    rm "$BACKUP_FILE"
    exit 0
fi

# Join updates with pipe separator for jq
JQ_EXPRESSION=$(printf " | %s" "${JQ_UPDATES[@]}")
JQ_EXPRESSION="${JQ_EXPRESSION:3}"  # Remove leading " | "

# Apply updates using jq
jq \
    --arg graphqlUrl "$GRAPHQL_URL" \
    --arg graphqlApiId "$GRAPHQL_API_ID" \
    --arg graphqlWss "$GRAPHQL_WSS" \
    --arg graphqlApiKey "$GRAPHQL_API_KEY" \
    --arg userPoolId "$USER_POOL_ID" \
    --arg userPoolClientId "$USER_POOL_CLIENT_ID" \
    --arg trainingBucket "$TRAINING_BUCKET" \
    --arg modelOutputBucket "$MODEL_OUTPUT_BUCKET" \
    --arg autopilotRoleArn "$AUTOPILOT_ROLE_ARN" \
    "$JQ_EXPRESSION" \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"

# Check if jq succeeded
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to update configuration file${NC}"
    echo -e "${YELLOW}Restoring from backup...${NC}"
    mv "$BACKUP_FILE" "$CONFIG_FILE"
    rm -f "${CONFIG_FILE}.tmp"
    exit 1
fi

# Replace original with updated version
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo -e "${GREEN}✓ Configuration file updated successfully${NC}"
echo ""

# Show what was updated
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Update Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ -n "$GRAPHQL_URL" ] && [ "$GRAPHQL_URL" != "null" ]; then
    echo -e "${GREEN}✓${NC} appSync.endpoint = $GRAPHQL_URL"
fi

if [ -n "$GRAPHQL_API_ID" ] && [ "$GRAPHQL_API_ID" != "null" ]; then
    echo -e "${GREEN}✓${NC} appSync.apiId = $GRAPHQL_API_ID"
fi

if [ -n "$GRAPHQL_WSS" ] && [ "$GRAPHQL_WSS" != "null" ]; then
    echo -e "${GREEN}✓${NC} appSync.wssEndpoint = $GRAPHQL_WSS"
fi

if [ -n "$GRAPHQL_API_KEY" ] && [ "$GRAPHQL_API_KEY" != "null" ] && [ "$GRAPHQL_API_KEY" != "Not configured" ]; then
    echo -e "${GREEN}✓${NC} appSync.apiKey = $GRAPHQL_API_KEY"
fi

if [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "null" ]; then
    echo -e "${GREEN}✓${NC} cognito.poolId = $USER_POOL_ID"
fi

if [ -n "$USER_POOL_CLIENT_ID" ] && [ "$USER_POOL_CLIENT_ID" != "null" ]; then
    echo -e "${GREEN}✓${NC} cognito.poolClientId = $USER_POOL_CLIENT_ID"
fi

if [ -n "$TRAINING_BUCKET" ] && [ "$TRAINING_BUCKET" != "null" ]; then
    echo -e "${GREEN}✓${NC} sageMakerCanvas.trainingDataBucket = $TRAINING_BUCKET"
fi

if [ -n "$MODEL_OUTPUT_BUCKET" ] && [ "$MODEL_OUTPUT_BUCKET" != "null" ]; then
    echo -e "${GREEN}✓${NC} sageMakerCanvas.modelOutputBucket = $MODEL_OUTPUT_BUCKET"
fi

if [ -n "$AUTOPILOT_ROLE_ARN" ] && [ "$AUTOPILOT_ROLE_ARN" != "null" ]; then
    echo -e "${GREEN}✓${NC} sageMakerCanvas.autopilotExecutionRoleArn = $AUTOPILOT_ROLE_ARN"
fi

echo ""
echo -e "${BLUE}Configuration file updated: $CONFIG_FILE${NC}"
echo -e "${BLUE}Backup saved as: $BACKUP_FILE${NC}"
echo ""
echo -e "${YELLOW}Note: Remember to commit these changes to version control${NC}"
echo ""
