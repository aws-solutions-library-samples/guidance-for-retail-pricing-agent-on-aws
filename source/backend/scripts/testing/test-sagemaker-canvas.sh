#!/bin/bash

###############################################################################
# SageMaker Canvas Testing Script
#
# Tests SageMaker Canvas infrastructure and model functionality.
# Validates infrastructure deployment, model training, and prediction capabilities.
#
# Usage:
#   ./scripts/testing/test-sagemaker-canvas.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV    Environment to test (dev|prod) [default: dev]
#   -r, --region REGION      AWS region
#   -p, --profile PROFILE    AWS CLI profile to use
#   --skip-validation        Skip infrastructure validation
#   --skip-model-check       Skip model status checks
#   -h, --help              Show this help message
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
REGION=""
PROFILE=""
SKIP_VALIDATION=false
SKIP_MODEL_CHECK=false

# Function to print colored output
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

print_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Test SageMaker Canvas infrastructure and models"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment to test (dev|prod) [default: dev]"
    echo "  -r, --region REGION      AWS region to test in"
    echo "  -p, --profile PROFILE    AWS CLI profile to use"
    echo "  --skip-validation        Skip infrastructure validation"
    echo "  --skip-model-check       Skip model status checks"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --environment dev --region us-east-1"
    echo "  $0 -e prod -r us-west-2"
    echo "  $0 --skip-validation  # Only check models"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --skip-model-check)
            SKIP_MODEL_CHECK=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    print_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Set AWS CLI profile if provided
if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
    print_status "Using AWS profile: $PROFILE"
fi

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Change to backend directory
cd "$BACKEND_DIR"

print_step "🧪 Starting SageMaker Canvas testing"
print_status "Environment: $ENVIRONMENT"

# Check if config file exists
CONFIG_FILE="config/${ENVIRONMENT}.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Load configuration
print_status "Loading configuration from $CONFIG_FILE"

# Extract region from config if not provided
if [[ -z "$REGION" ]]; then
    REGION=$(jq -r '.aws.region // empty' "$CONFIG_FILE")
fi

if [[ -z "$REGION" ]]; then
    print_error "AWS region is required. Specify via --region or in config file."
    exit 1
fi

print_status "Target AWS Region: $REGION"

# Check if SageMaker Canvas is enabled
CANVAS_ENABLED=$(jq -r '.sageMakerCanvas.enabled // false' "$CONFIG_FILE")
if [[ "$CANVAS_ENABLED" != "true" ]]; then
    print_warning "SageMaker Canvas is not enabled in $CONFIG_FILE"
    print_status "Skipping SageMaker Canvas tests"
    exit 0
fi

print_success "SageMaker Canvas is enabled in configuration"

# Step 1: Validate Infrastructure
if [[ "$SKIP_VALIDATION" != "true" ]]; then
    print_step "🔍 Step 1: Validating Infrastructure"
    
    node scripts/sagemaker/validate-sagemaker-canvas.js \
        --environment "$ENVIRONMENT" \
        --region "$REGION"
    
    if [[ $? -ne 0 ]]; then
        print_error "Infrastructure validation failed"
        exit 1
    fi
    
    print_success "Infrastructure validation passed"
else
    print_warning "Skipping infrastructure validation"
fi

# Step 2: Check Model Status
if [[ "$SKIP_MODEL_CHECK" != "true" ]]; then
    print_step "🤖 Step 2: Checking Model Status"
    
    # Check if model report exists
    MODEL_REPORT="baseline-models-report-${ENVIRONMENT}.json"
    if [[ -f "$MODEL_REPORT" ]]; then
        print_status "Model report found: $MODEL_REPORT"
        
        # Extract summary from report
        SUCCESSFUL_MODELS=$(jq -r '.successful // 0' "$MODEL_REPORT")
        TOTAL_CATEGORIES=$(jq -r '.totalCategories // 0' "$MODEL_REPORT")
        AVERAGE_ACCURACY=$(jq -r '.averageAccuracy // 0' "$MODEL_REPORT")
        
        print_status "Model Summary:"
        print_status "  - Successful models: $SUCCESSFUL_MODELS/$TOTAL_CATEGORIES"
        print_status "  - Average accuracy: $(echo "$AVERAGE_ACCURACY * 100" | bc -l | cut -d. -f1)%"
        
        if [[ "$SUCCESSFUL_MODELS" -eq "$TOTAL_CATEGORIES" ]]; then
            print_success "All models are operational!"
        else
            print_warning "Some models are not operational. Check the detailed report."
        fi
    else
        print_warning "Model report not found. Models may not be initialized yet."
        print_status "Run: npm run sagemaker:init:$ENVIRONMENT"
    fi
else
    print_warning "Skipping model status checks"
fi

# Step 3: Test Summary
print_step "📋 Test Summary"

echo ""
echo "==================================================================="
echo "           SAGEMAKER CANVAS TEST SUMMARY"
echo "==================================================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Determine overall success
OVERALL_SUCCESS=true

if [[ "$SKIP_VALIDATION" != "true" ]] && [[ -f "canvas-validation-${ENVIRONMENT}.json" ]]; then
    VALIDATION_STATUS=$(jq -r '.validation.overall.status // "unknown"' "canvas-validation-${ENVIRONMENT}.json")
    echo "Infrastructure Status: $VALIDATION_STATUS"
    
    if [[ "$VALIDATION_STATUS" == "failed" ]]; then
        OVERALL_SUCCESS=false
    fi
fi

if [[ "$SKIP_MODEL_CHECK" != "true" ]] && [[ -f "baseline-models-report-${ENVIRONMENT}.json" ]]; then
    FAILED_MODELS=$(jq -r '.failed // 0' "baseline-models-report-${ENVIRONMENT}.json")
    TOTAL_CATEGORIES=$(jq -r '.totalCategories // 0' "baseline-models-report-${ENVIRONMENT}.json")
    
    echo "Model Status: $SUCCESSFUL_MODELS/$TOTAL_CATEGORIES operational"
    
    if [[ "$FAILED_MODELS" -gt 0 ]] && [[ "$FAILED_MODELS" -eq "$TOTAL_CATEGORIES" ]]; then
        OVERALL_SUCCESS=false
    fi
fi

echo ""

if [[ "$OVERALL_SUCCESS" == "true" ]]; then
    print_success "🎉 All SageMaker Canvas tests passed!"
    echo "==================================================================="
    exit 0
else
    print_warning "⚠️  Some tests failed. Check the reports for details."
    echo "==================================================================="
    exit 1
fi
