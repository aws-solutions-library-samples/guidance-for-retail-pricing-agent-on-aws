#!/bin/bash

# Check Infrastructure Script
# Verifies that the required AWS resources exist

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${2:-us-east-1}

# Stack name
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"

echo "🔍 Checking infrastructure for ${ENVIRONMENT} environment..."
echo "📍 AWS Region: ${AWS_REGION}"
echo "📦 Stack Name: ${STACK_NAME}"
echo ""

# Check if stack exists
echo "📋 Checking CloudFormation stack..."
if aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "   ✅ Stack ${STACK_NAME} exists"
    
    # Get stack status
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" --query 'Stacks[0].StackStatus' --output text)
    echo "   📊 Stack Status: ${STACK_STATUS}"
    
    if [ "$STACK_STATUS" != "CREATE_COMPLETE" ] && [ "$STACK_STATUS" != "UPDATE_COMPLETE" ]; then
        echo "   ⚠️  Stack is not in a complete state. Current status: ${STACK_STATUS}"
    fi
    
else
    echo "   ❌ Stack ${STACK_NAME} not found"
    echo ""
    echo "🚀 To deploy the infrastructure, run:"
    echo "   cd src/backend && npm run deploy:infrastructure"
    exit 1
fi

# Get stack outputs
echo ""
echo "📤 Stack Outputs:"
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" --query 'Stacks[0].Outputs' --output json 2>/dev/null || echo "[]")

if [ "$STACK_OUTPUTS" = "[]" ]; then
    echo "   ⚠️  No stack outputs found"
else
    echo "$STACK_OUTPUTS" | jq -r '.[] | "   • \(.OutputKey): \(.OutputValue)"' 2>/dev/null || echo "   (Could not parse outputs)"
fi

# Check specific resources
echo ""
echo "🔍 Checking specific resources..."

# Extract resource names from outputs
BUCKET_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="AssetsBucketName") | .OutputValue' 2>/dev/null)
TABLE_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="ProductTableName") | .OutputValue' 2>/dev/null)
API_URL=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="GraphQLApiUrl") | .OutputValue' 2>/dev/null)

# Check S3 bucket
if [ "$BUCKET_NAME" != "null" ] && [ "$BUCKET_NAME" != "" ]; then
    echo "📦 S3 Bucket: ${BUCKET_NAME}"
    if aws s3 ls "s3://${BUCKET_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
        echo "   ✅ S3 bucket is accessible"
    else
        echo "   ❌ S3 bucket is not accessible"
    fi
else
    echo "   ⚠️  S3 bucket name not found in outputs"
fi

# Check DynamoDB table
if [ "$TABLE_NAME" != "null" ] && [ "$TABLE_NAME" != "" ]; then
    echo "🗄️  DynamoDB Table: ${TABLE_NAME}"
    if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
        echo "   ✅ DynamoDB table is accessible"
        
        # Check if table has data
        ITEM_COUNT=$(aws dynamodb scan --table-name "${TABLE_NAME}" --region "${AWS_REGION}" --select COUNT --output text --query 'Count' 2>/dev/null || echo "0")
        echo "   📊 Total items in table: ${ITEM_COUNT}"
        
        # Check for product items specifically
        PRODUCT_COUNT=$(aws dynamodb scan --table-name "${TABLE_NAME}" --region "${AWS_REGION}" --filter-expression "entityType = :entityType" --expression-attribute-values '{":entityType":{"S":"PRODUCT"}}' --select COUNT --output text --query 'Count' 2>/dev/null || echo "0")
        echo "   🛍️  Product items: ${PRODUCT_COUNT}"
        
    else
        echo "   ❌ DynamoDB table is not accessible"
    fi
else
    echo "   ⚠️  DynamoDB table name not found in outputs"
fi

# Check GraphQL API
if [ "$API_URL" != "null" ] && [ "$API_URL" != "" ]; then
    echo "🔗 GraphQL API: ${API_URL}"
    echo "   ✅ GraphQL API URL is available"
else
    echo "   ⚠️  GraphQL API URL not found in outputs"
fi

echo ""
echo "✅ Infrastructure check completed!"