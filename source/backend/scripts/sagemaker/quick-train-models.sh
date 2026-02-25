#!/bin/bash

###############################################################################
# Quick Train SageMaker Canvas Models
#
# This script automates the complete process of training SageMaker Canvas
# models for demand forecasting, from data preparation to model validation.
#
# Usage:
#   ./quick-train-models.sh [environment]
#
# Examples:
#   ./quick-train-models.sh dev
#   ./quick-train-models.sh prod
#
# Note: Region is read from config/<environment>.json
#
# Requirements:
#   - AWS CLI configured with appropriate credentials
#   - Node.js 18.x or higher
#   - CDK stack deployed (SageMaker Canvas infrastructure)
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

# Load region from configuration file
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${RED}[ERROR]${NC} Configuration file not found: $CONFIG_FILE"
    exit 1
fi

REGION=$(jq -r '.aws.region // empty' "$CONFIG_FILE")
if [[ -z "$REGION" ]]; then
    echo -e "${RED}[ERROR]${NC} AWS region not found in configuration file"
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Open $CONFIG_FILE"
    echo -e "  2. Add the region under the 'aws' section:"
    echo -e '     "aws": {'
    echo -e '       "region": "us-east-1"'
    echo -e '     }'
    exit 1
fi

# Functions
print_header() {
    echo ""
    echo "========================================================================"
    echo "$1"
    echo "========================================================================"
    echo ""
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install AWS CLI."
        exit 1
    fi
    print_success "AWS CLI found: $(aws --version)"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js 18.x or higher."
        exit 1
    fi
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_success "AWS credentials configured (Account: $ACCOUNT_ID)"
    
    # Check CDK outputs
    CDK_OUTPUTS_FILE="$BACKEND_DIR/cdk-outputs-${ENVIRONMENT}.json"
    if [ ! -f "$CDK_OUTPUTS_FILE" ]; then
        print_error "CDK outputs file not found: $CDK_OUTPUTS_FILE"
        print_error "Please deploy the CDK stack first: cdk deploy --context environment=$ENVIRONMENT"
        exit 1
    fi
    print_success "CDK outputs file found: $CDK_OUTPUTS_FILE"
}

setup_training_data() {
    print_header "Step 1: Setting Up Training Data"
    
    cd "$BACKEND_DIR"
    
    print_status "Generating sample training data for all categories..."
    if node scripts/sagemaker/setup-training-data-pipeline.js --environment "$ENVIRONMENT"; then
        print_success "Training data setup completed"
    else
        print_error "Training data setup failed"
        exit 1
    fi
}

train_models() {
    print_header "Step 2: Training SageMaker Canvas Models"
    
    cd "$BACKEND_DIR"
    
    print_status "Starting baseline model training..."
    print_warning "This may take 30-60 minutes per model. Please be patient."
    
    if node scripts/sagemaker/initialize-baseline-models.js --environment "$ENVIRONMENT" --region "$REGION"; then
        print_success "Model training completed"
    else
        print_error "Model training failed"
        print_warning "Check the detailed report: $BACKEND_DIR/baseline-models-report-${ENVIRONMENT}.json"
        exit 1
    fi
}

verify_models() {
    print_header "Step 3: Verifying Trained Models"
    
    print_status "Checking DynamoDB for model metadata..."
    
    # Get table name from CDK outputs
    TABLE_NAME=$(cat "$CDK_OUTPUTS_FILE" | grep -o '"ProductTableName": "[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$TABLE_NAME" ]; then
        print_error "Could not find ProductTableName in CDK outputs"
        exit 1
    fi
    
    print_status "Querying table: $TABLE_NAME"
    
    # Query for powertools model
    MODEL_COUNT=$(aws dynamodb query \
        --table-name "$TABLE_NAME" \
        --index-name GSI1 \
        --key-condition-expression "GSI1PK = :pk" \
        --expression-attribute-values '{":pk":{"S":"CATEGORY#powertools"}}' \
        --region "$REGION" \
        --query 'Count' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$MODEL_COUNT" -gt 0 ]; then
        print_success "Found $MODEL_COUNT model(s) for powertools category"
    else
        print_warning "No models found in DynamoDB. This may be normal if training just completed."
    fi
}

print_summary() {
    print_header "Training Summary"
    
    REPORT_FILE="$BACKEND_DIR/baseline-models-report-${ENVIRONMENT}.json"
    
    if [ -f "$REPORT_FILE" ]; then
        print_status "Detailed report available at: $REPORT_FILE"
        
        # Extract summary from report
        SUCCESSFUL=$(cat "$REPORT_FILE" | grep -o '"successful": [0-9]*' | cut -d' ' -f2)
        FAILED=$(cat "$REPORT_FILE" | grep -o '"failed": [0-9]*' | cut -d' ' -f2)
        AVG_ACCURACY=$(cat "$REPORT_FILE" | grep -o '"averageAccuracy": [0-9.]*' | cut -d' ' -f2)
        
        echo ""
        echo "Environment: $ENVIRONMENT"
        echo "Region: $REGION"
        echo "Successful Models: $SUCCESSFUL"
        echo "Failed Models: $FAILED"
        echo "Average Accuracy: $(echo "$AVG_ACCURACY * 100" | bc)%"
        echo ""
        
        if [ "$FAILED" -eq 0 ]; then
            print_success "🎉 All models trained successfully!"
        else
            print_warning "⚠️  Some models failed. Check the report for details."
        fi
    else
        print_warning "Report file not found. Training may have failed."
    fi
}

print_next_steps() {
    print_header "Next Steps"
    
    echo "1. Test the demand forecast agent with a product:"
    echo "   - Go to AWS Console → Bedrock → AgentCore"
    echo "   - Select the demand-forecast agent"
    echo "   - Test with product: RYOBI-SANDERS-P411"
    echo ""
    echo "2. Monitor model performance:"
    echo "   - CloudWatch → Metrics → SageMaker/Canvas/DemandForecasting"
    echo ""
    echo "3. Setup automatic retraining:"
    echo "   - EventBridge → Rules → Create weekly retraining schedule"
    echo ""
    echo "4. Review the complete implementation plan:"
    echo "   - See: SAGEMAKER_CANVAS_TRAINING_PLAN.md"
    echo ""
}

# Main execution
main() {
    print_header "SageMaker Canvas Model Training - Quick Start"
    
    echo "Environment: $ENVIRONMENT"
    echo "Region: $REGION"
    echo ""
    
    # Step 0: Prerequisites
    check_prerequisites
    
    # Step 1: Training data
    setup_training_data
    
    # Step 2: Train models
    train_models
    
    # Step 3: Verify
    verify_models
    
    # Summary
    print_summary
    
    # Next steps
    print_next_steps
    
    print_success "Training process completed!"
}

# Run main function
main
