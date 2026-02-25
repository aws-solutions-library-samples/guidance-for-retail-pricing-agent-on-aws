#!/bin/bash

###############################################################################
# Fix Missing S3 Bucket Script
#
# This script fixes the issue where CloudFormation thinks the S3 bucket exists
# but it was actually deleted. It forces CloudFormation to recreate the bucket.
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-local}
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"
REGION="us-east-1"

echo -e "${BLUE}Fixing missing S3 bucket for ${ENVIRONMENT} environment...${NC}"
echo ""

# Get AWS account ID from config
CONFIG_FILE="config/${ENVIRONMENT}.json"
AWS_ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")

if [ -z "$AWS_ACCOUNT" ] || [ "$AWS_ACCOUNT" = "null" ]; then
    echo -e "${RED}✗ Could not read AWS account from ${CONFIG_FILE}${NC}"
    exit 1
fi

# Construct bucket name using the same pattern as CDK stack
# Pattern: product-catalog-assets-{environment}-{account}
BUCKET_NAME="product-catalog-assets-${ENVIRONMENT}-${AWS_ACCOUNT}"

echo -e "${YELLOW}Expected bucket name: ${BUCKET_NAME}${NC}"
echo -e "${YELLOW}(Derived from: product-catalog-assets-${ENVIRONMENT}-${AWS_ACCOUNT})${NC}"
echo ""

# Check if bucket exists
echo -e "${YELLOW}Checking if bucket exists in S3...${NC}"
if aws s3 ls "s3://${BUCKET_NAME}" --region ${REGION} >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Bucket exists! No fix needed.${NC}"
    exit 0
else
    echo -e "${RED}✗ Bucket does not exist in S3${NC}"
fi

# Check CloudFormation stack status
echo -e "${YELLOW}Checking CloudFormation stack...${NC}"
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region ${REGION} \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo -e "${RED}✗ Stack not found. Please deploy the stack first:${NC}"
    echo -e "  ${BLUE}npm run deploy:backend:${ENVIRONMENT}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Stack exists with status: ${STACK_STATUS}${NC}"
echo ""

# Check if bucket resource exists in CloudFormation
echo -e "${YELLOW}Checking if CloudFormation knows about the bucket...${NC}"
CF_BUCKET=$(aws cloudformation list-stack-resources \
    --stack-name "${STACK_NAME}" \
    --region ${REGION} \
    --query 'StackResourceSummaries[?ResourceType==`AWS::S3::Bucket`].PhysicalResourceId' \
    --output text 2>/dev/null || echo "")

if [ -z "$CF_BUCKET" ]; then
    echo -e "${RED}✗ CloudFormation doesn't have any S3 buckets${NC}"
    echo -e "${YELLOW}This means the stack needs to be updated to include the bucket.${NC}"
    echo ""
    echo -e "${BLUE}Solution: Redeploy the CDK stack:${NC}"
    echo -e "  ${GREEN}cd src/backend${NC}"
    echo -e "  ${GREEN}npx cdk deploy --context environment=${ENVIRONMENT}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ CloudFormation thinks bucket exists: ${CF_BUCKET}${NC}"
echo ""

# The bucket is missing but CloudFormation thinks it exists - this is drift
echo -e "${YELLOW}Detected CloudFormation drift: bucket was deleted outside of CloudFormation${NC}"
echo ""
echo -e "${BLUE}Solution: Force CloudFormation to recreate the bucket${NC}"
echo ""
echo -e "${YELLOW}Option 1 - Manually create the bucket (Quick):${NC}"
echo -e "  ${GREEN}aws s3 mb s3://${BUCKET_NAME} --region ${REGION}${NC}"
echo ""
echo -e "${YELLOW}Option 2 - Update the stack to force recreation (Recommended):${NC}"
echo -e "  This will temporarily rename the bucket in CDK, deploy, then rename back"
echo ""

read -p "Do you want to manually create the bucket now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Creating bucket...${NC}"
    
    # Create the bucket
    aws s3 mb "s3://${BUCKET_NAME}" --region ${REGION}
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "${BUCKET_NAME}" \
        --versioning-configuration Status=Enabled \
        --region ${REGION}
    
    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "${BUCKET_NAME}" \
        --server-side-encryption-configuration '{
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                }
            }]
        }' \
        --region ${REGION}
    
    # Add CORS configuration
    aws s3api put-bucket-cors \
        --bucket "${BUCKET_NAME}" \
        --cors-configuration '{
            "CORSRules": [{
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["GET", "HEAD"],
                "AllowedOrigins": ["*"],
                "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Last-Modified"],
                "MaxAgeSeconds": 3600
            }]
        }' \
        --region ${REGION}
    
    echo ""
    echo -e "${GREEN}✓ Bucket created successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Deploy product data:"
    echo -e "     ${GREEN}npm run deploy:data:only:${ENVIRONMENT}${NC}"
    echo ""
    echo -e "  2. Or run a full deployment:"
    echo -e "     ${GREEN}npm run deploy:backend:${ENVIRONMENT}${NC}"
else
    echo ""
    echo -e "${YELLOW}Bucket not created. You can create it manually later with:${NC}"
    echo -e "  ${GREEN}aws s3 mb s3://${BUCKET_NAME} --region ${REGION}${NC}"
fi

echo ""
