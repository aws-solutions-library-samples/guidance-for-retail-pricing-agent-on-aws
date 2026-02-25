#!/bin/bash

# Update Frontend Configuration Script
# Updates amplify_outputs.json with deployed stack outputs

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${2:-us-east-1}
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔗 Updating frontend configuration for ${ENVIRONMENT} environment...${NC}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${AWS_REGION}"
echo ""

# Get stack outputs
echo -e "${BLUE}📋 Retrieving stack outputs...${NC}"
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" --query 'Stacks[0].Outputs' --output json 2>/dev/null)

if [ "$STACK_OUTPUTS" = "null" ] || [ "$STACK_OUTPUTS" = "[]" ]; then
    echo -e "${RED}❌ Could not retrieve stack outputs. Make sure the stack is deployed:${NC}"
    echo "   cd src/backend && npm run deploy:dev"
    exit 1
fi

# Extract values from stack outputs
USER_POOL_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue' 2>/dev/null || echo "")
USER_POOL_CLIENT_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="UserPoolClientId") | .OutputValue' 2>/dev/null || echo "")
GRAPHQL_URL=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiUrl") | .OutputValue' 2>/dev/null || echo "")
GRAPHQL_API_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiId") | .OutputValue' 2>/dev/null || echo "")

# Validate required outputs
if [ -z "$USER_POOL_ID" ] || [ -z "$USER_POOL_CLIENT_ID" ] || [ -z "$GRAPHQL_URL" ]; then
    echo -e "${RED}❌ Missing required stack outputs:${NC}"
    [ -z "$USER_POOL_ID" ] && echo "   - UserPoolId"
    [ -z "$USER_POOL_CLIENT_ID" ] && echo "   - UserPoolClientId"  
    [ -z "$GRAPHQL_URL" ] && echo "   - GraphQLApiUrl"
    echo ""
    echo "Available outputs:"
    echo "$STACK_OUTPUTS" | jq -r '.[] | "   • \(.OutputKey): \(.OutputValue)"' 2>/dev/null || echo "   (Could not parse outputs)"
    exit 1
fi

echo -e "${GREEN}✅ Retrieved stack outputs:${NC}"
echo "   • User Pool ID: ${USER_POOL_ID}"
echo "   • User Pool Client ID: ${USER_POOL_CLIENT_ID}"
echo "   • GraphQL URL: ${GRAPHQL_URL}"
echo ""

# Create updated amplify_outputs.json
echo -e "${BLUE}📝 Updating amplify_outputs.json...${NC}"

cat > src/frontend/amplify_outputs.json << EOF
{
  "version": "1",
  "api": {
    "aws_appsync_graphqlEndpoint": "${GRAPHQL_URL}",
    "aws_appsync_region": "${AWS_REGION}",
    "aws_appsync_authenticationType": "AMAZON_COGNITO_USER_POOLS"
  },
  "auth": {
    "aws_region": "${AWS_REGION}",
    "user_pool_id": "${USER_POOL_ID}",
    "user_pool_client_id": "${USER_POOL_CLIENT_ID}"
  }
}
EOF

echo -e "${GREEN}✅ Frontend configuration updated successfully!${NC}"
echo ""
echo -e "${BLUE}🚀 Next steps:${NC}"
echo "   1. Start the frontend development server:"
echo "      cd src/frontend && npm run dev"
echo ""
echo "   2. Your frontend will now connect to:"
echo "      • Cognito User Pool: ${USER_POOL_ID}"
echo "      • GraphQL API: ${GRAPHQL_URL}"
echo ""
echo -e "${GREEN}✅ Configuration complete!${NC}"