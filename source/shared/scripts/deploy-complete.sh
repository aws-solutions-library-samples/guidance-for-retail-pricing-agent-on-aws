#!/bin/bash

# Complete Deployment Script for Retail Pricing System
# Deploys infrastructure, generates product data, and uploads to AWS

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${2:-us-east-1}
AWS_ACCOUNT=${3:-607104513879}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "\n${BLUE}🚀 $1${NC}"
    echo "=================================================="
}

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Derived names
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"
BUCKET_NAME="product-catalog-assets-${ENVIRONMENT}-${AWS_ACCOUNT}"
TABLE_NAME="product-catalog-${ENVIRONMENT}"

log_header "Complete Retail Pricing System Deployment"
log_info "Environment: ${ENVIRONMENT}"
log_info "AWS Region: ${AWS_REGION}"
log_info "AWS Account: ${AWS_ACCOUNT}"
log_info "Stack Name: ${STACK_NAME}"
log_info "Project Root: ${PROJECT_ROOT}"
echo ""

# Step 1: Validate prerequisites
log_header "Step 1: Validating Prerequisites"

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    log_error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install it first."
    exit 1
fi

log_success "All prerequisites validated"

# Step 2: Generate and validate product data
log_header "Step 2: Generating and Validating Product Data"

log_info "Running product data setup script..."
cd "${PROJECT_ROOT}"
if node src/shared/scripts/setup-product-data.js; then
    log_success "Product data generated and validated successfully"
    log_info "Generated 64 products across 4 categories (powertools, apparel, footwear, kitchen)"
else
    log_error "Product data generation failed"
    exit 1
fi

# Step 3: Build and deploy infrastructure
log_header "Step 3: Building and Deploying Infrastructure"

log_info "Building TypeScript code..."
cd "${PROJECT_ROOT}/src/backend"
if npm run build; then
    log_success "TypeScript build completed"
else
    log_error "TypeScript build failed"
    exit 1
fi

log_info "Deploying CDK stack..."
if npm run deploy:infrastructure -- --require-approval never; then
    log_success "Infrastructure deployed successfully"
else
    log_error "Infrastructure deployment failed"
    exit 1
fi

# Get stack outputs
log_info "Retrieving stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" --query 'Stacks[0].Outputs' --output json 2>/dev/null || echo "[]")

if [ "$STACK_OUTPUTS" = "[]" ]; then
    log_warning "Could not retrieve stack outputs. Using default names."
else
    # Extract actual bucket name from outputs
    ACTUAL_BUCKET_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="AssetsBucketName") | .OutputValue' 2>/dev/null || echo "$BUCKET_NAME")
    if [ "$ACTUAL_BUCKET_NAME" != "null" ] && [ "$ACTUAL_BUCKET_NAME" != "" ]; then
        BUCKET_NAME="$ACTUAL_BUCKET_NAME"
        log_info "Using actual bucket name from stack: ${BUCKET_NAME}"
    fi
fi

# Step 4: Deploy product data to S3
log_header "Step 4: Deploying Product Data to S3"

# Wait a moment for S3 bucket to be fully ready
log_info "Waiting for S3 bucket to be ready..."
sleep 10

# Check if bucket exists
if aws s3 ls "s3://${BUCKET_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    log_success "S3 bucket ${BUCKET_NAME} is accessible"
else
    log_error "S3 bucket ${BUCKET_NAME} not found or not accessible"
    log_info "Please check if the infrastructure deployment completed successfully"
    exit 1
fi

# Change to shared scripts directory and run data deployment
cd "${PROJECT_ROOT}/src/shared/scripts"
log_info "Running product data deployment script..."
if bash deploy-product-data.sh "${ENVIRONMENT}" "${AWS_REGION}" "${AWS_ACCOUNT}"; then
    log_success "Product data deployed successfully"
else
    log_error "Product data deployment failed"
    exit 1
fi

# Step 5: Update frontend configuration
log_header "Step 5: Updating Frontend Configuration"

log_info "Updating frontend amplify_outputs.json with deployed stack outputs..."
cd "${PROJECT_ROOT}/src/shared/scripts"
if bash update-frontend-config.sh "${ENVIRONMENT}" "${AWS_REGION}"; then
    log_success "Frontend configuration updated successfully"
else
    log_warning "Frontend configuration update failed (non-critical)"
fi

# Step 6: Verify deployment
log_header "Step 6: Verifying Deployment"

# Check S3 structure
log_info "Verifying S3 bucket structure..."
S3_OBJECTS=$(aws s3 ls "s3://${BUCKET_NAME}/products/" --recursive --region "${AWS_REGION}" | wc -l)
if [ "$S3_OBJECTS" -gt 0 ]; then
    log_success "S3 bucket contains ${S3_OBJECTS} objects"
else
    log_warning "S3 bucket appears to be empty"
fi

# Check DynamoDB table
log_info "Verifying DynamoDB table..."
if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    log_success "DynamoDB table ${TABLE_NAME} is accessible"
    
    # Check if table has product data
    PRODUCT_COUNT=$(aws dynamodb scan --table-name "${TABLE_NAME}" --region "${AWS_REGION}" --filter-expression "entityType = :entityType" --expression-attribute-values '{":entityType":{"S":"PRODUCT"}}' --select COUNT --output text --query 'Count' 2>/dev/null || echo "0")
    if [ "$PRODUCT_COUNT" -gt 0 ]; then
        log_success "DynamoDB table contains ${PRODUCT_COUNT} products"
    else
        log_warning "DynamoDB table appears to be empty (no products found)"
    fi
else
    log_warning "DynamoDB table ${TABLE_NAME} not found or not accessible"
fi

# Display stack outputs
log_header "Deployment Summary"

echo ""
log_success "🎉 Complete deployment finished successfully!"
echo ""

log_info "📊 Deployed Resources:"
echo "   • Infrastructure: ${STACK_NAME}"
echo "   • S3 Bucket: ${BUCKET_NAME}"
echo "   • DynamoDB Table: ${TABLE_NAME}"
echo "   • Product Categories: 4 (powertools, apparel, footwear, kitchen)"
echo "   • Total Products: 64 (16 per category)"
echo "   • DynamoDB Products: ${PRODUCT_COUNT:-0} loaded"
echo ""

log_info "🔗 S3 Data Structure:"
echo "   s3://${BUCKET_NAME}/products/categories.json"
echo "   s3://${BUCKET_NAME}/products/powertools/products.json"
echo "   s3://${BUCKET_NAME}/products/apparel/products.json"
echo "   s3://${BUCKET_NAME}/products/footwear/products.json"
echo "   s3://${BUCKET_NAME}/products/kitchen/products.json"
echo "   s3://${BUCKET_NAME}/products/filters/"
echo ""

log_info "🗄️  DynamoDB Structure:"
echo "   • Table: ${TABLE_NAME}"
echo "   • Primary Key: PK (Category), SK (Product+Timestamp)"
echo "   • GSI1: Role-based filtering with price sorting"
echo "   • GSI2: Vendor-based filtering with update time sorting"
echo "   • GSI3: Full-text search support"
echo "   • Products: Loaded with proper cursor pagination support"
echo ""

if [ "$STACK_OUTPUTS" != "[]" ]; then
    log_info "📋 Stack Outputs:"
    echo "$STACK_OUTPUTS" | jq -r '.[] | "   • \(.OutputKey): \(.OutputValue)"' 2>/dev/null || echo "   (Could not parse outputs)"
    echo ""
fi

log_info "🎯 Next Steps:"
echo "   1. Configure your frontend with the GraphQL API URL"
echo "   2. Test the product catalog endpoints"
echo "   3. Run pricing analysis workflows"
echo "   4. Monitor CloudWatch logs for any issues"
echo ""

log_success "Deployment completed at $(date)"