#!/bin/bash

###############################################################################
# Complete AgentCore + CDK + Data Deployment Script
#
# This script handles the complete deployment process for the Retail Pricing
# Generator system, including:
# 1. AgentCore Runtime deployment (via JavaScript SDK)
#    - S3 bucket creation (if needed)
#    - Agent packaging
#    - S3 upload
#    - AgentCore deployment
#    - Agent ID capture and configuration update
# 2. CDK stack deployment
# 3. Product data deployment to S3
#    - Product catalog data
#    - Demand forecast data
#    - Competitive analysis data
#    - Margin rules
#    - Product images (optional)
# 4. Deployment verification
#
# The script uses the JavaScript SDK (deploy-agentcore-agents.js) for all
# AgentCore operations, including S3 bucket management, eliminating the need
# for the agentcore CLI tool.
#
# Requirements: FR-1, FR-1.1
#
# Usage:
#   ./scripts/deploy-complete.sh <environment> [options]
#
# Options:
#   --dry-run          Show what would be deployed without making changes
#   --skip-cdk         Skip CDK stack deployment
#   --skip-agentcore   Skip AgentCore agent deployment
#   --skip-data        Skip product data deployment to S3
#   --skip-sagemaker   Skip SageMaker Canvas setup
#   --skip-frontend    Skip frontend build and Amplify deployment
#   --data-only        Only deploy product data (skip agentcore and cdk)
#   --sagemaker-only   Only setup SageMaker Canvas (skip agentcore, cdk, and data)
#   --skip-images      Skip product image generation during data deployment
#   --force-images     Force regenerate all product images
#   --force            Force deployment even if validation fails
#   --validate-only    Run all validation checks without deploying
#
# Examples:
#   ./scripts/deploy-complete.sh dev
#   ./scripts/deploy-complete.sh prod
#   ./scripts/deploy-complete.sh dev --dry-run
#   ./scripts/deploy-complete.sh dev --skip-cdk
#   ./scripts/deploy-complete.sh dev --skip-agentcore
#   ./scripts/deploy-complete.sh dev --skip-data
#   ./scripts/deploy-complete.sh dev --skip-sagemaker
#   ./scripts/deploy-complete.sh dev --skip-frontend
#   ./scripts/deploy-complete.sh dev --data-only
#   ./scripts/deploy-complete.sh dev --data-only --skip-images
#   ./scripts/deploy-complete.sh dev --sagemaker-only
#   ./scripts/deploy-complete.sh dev --validate-only
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
DRY_RUN=false
SKIP_CDK=false
SKIP_AGENTCORE=false
SKIP_DATA=false
SKIP_SAGEMAKER=false
SKIP_FRONTEND=false
DATA_ONLY=false
SAGEMAKER_ONLY=false
SKIP_IMAGES=false
FORCE_IMAGES=false
FORCE=false
VALIDATE_ONLY=false

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-cdk)
            SKIP_CDK=true
            shift
            ;;
        --skip-agentcore)
            SKIP_AGENTCORE=true
            shift
            ;;
        --skip-data)
            SKIP_DATA=true
            shift
            ;;
        --skip-sagemaker)
            SKIP_SAGEMAKER=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --data-only)
            DATA_ONLY=true
            SKIP_CDK=true
            SKIP_AGENTCORE=true
            SKIP_SAGEMAKER=true
            SKIP_FRONTEND=true
            shift
            ;;
        --sagemaker-only)
            SAGEMAKER_ONLY=true
            SKIP_CDK=true
            SKIP_AGENTCORE=true
            SKIP_DATA=true
            SKIP_FRONTEND=true
            shift
            ;;
        --skip-images)
            SKIP_IMAGES=true
            shift
            ;;
        --force-images)
            FORCE_IMAGES=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --validate-only)
            VALIDATE_ONLY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$(dirname "$BACKEND_DIR")")"
SHARED_SCRIPTS_DIR="$REPO_ROOT/source/shared/scripts"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

###############################################################################
# Configuration Validation Function
###############################################################################

# Validates configuration file and required settings
# Requirements: 7.1, 7.2, 7.3
#
# Checks:
# - Configuration file exists
# - Required keys are present
# - AWS account format (12 digits)
# - Region format (standard AWS region pattern)
# - S3 bucket names are valid
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
validate_configuration() {
    local env=$1
    local config_file="$BACKEND_DIR/config/${env}.json"
    
    echo -e "${YELLOW}Validating configuration for $env environment...${NC}"
    echo ""
    
    # Check file exists
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}ERROR: Configuration file not found: $config_file${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Verify you are in the correct directory (src/backend)"
        echo -e "  2. Check that config/${env}.json exists"
        echo -e "  3. If missing, copy from config/local.json.template"
        echo ""
        return 1
    fi
    echo -e "${GREEN}✓ Configuration file exists: $config_file${NC}"
    
    # Validate JSON syntax
    if ! jq empty "$config_file" 2>/dev/null; then
        echo -e "${RED}ERROR: Invalid JSON syntax in configuration file${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Check for syntax errors in $config_file"
        echo -e "  2. Use a JSON validator or 'jq' to identify issues"
        echo -e "  3. Common issues: missing commas, trailing commas, unquoted keys"
        echo ""
        return 1
    fi
    echo -e "${GREEN}✓ Configuration file has valid JSON syntax${NC}"
    
    # Define required keys
    local required_keys=(
        ".aws.account"
        ".aws.region"
        ".agentCore.codeBucket"
        ".agentCore.region"
    )
    
    # Validate required keys exist and are non-empty
    local missing_keys=()
    for key in "${required_keys[@]}"; do
        local value=$(jq -r "$key // empty" "$config_file")
        if [ -z "$value" ] || [ "$value" = "null" ]; then
            missing_keys+=("$key")
        fi
    done
    
    if [ ${#missing_keys[@]} -gt 0 ]; then
        echo -e "${RED}ERROR: Missing required configuration keys:${NC}"
        for key in "${missing_keys[@]}"; do
            echo -e "  - $key"
        done
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Open $config_file"
        echo -e "  2. Add the missing keys with appropriate values"
        echo -e "  3. Example structure:"
        echo -e '     "aws": {'
        echo -e '       "account": "123456789012",'
        echo -e '       "region": "us-east-1"'
        echo -e '     },'
        echo -e '     "agentCore": {'
        echo -e '       "region": "us-east-1",'
        echo -e '       "codeBucket": "your-bucket-name"'
        echo -e '     }'
        echo ""
        return 1
    fi
    echo -e "${GREEN}✓ All required configuration keys are present${NC}"
    
    # Validate AWS account format (12 digits)
    local account=$(jq -r '.aws.account' "$config_file")
    if ! [[ "$account" =~ ^[0-9]{12}$ ]]; then
        echo -e "${RED}ERROR: Invalid AWS account format: $account${NC}"
        echo -e "       Expected 12-digit number"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. AWS account IDs must be exactly 12 digits"
        echo -e "  2. Update config/${env}.json with correct account ID"
        echo -e "  3. Find your account ID: aws sts get-caller-identity"
        echo ""
        return 1
    fi
    echo -e "${GREEN}✓ AWS account format is valid: $account${NC}"
    
    # Validate region format (standard AWS region pattern)
    local region=$(jq -r '.aws.region' "$config_file")
    if ! [[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]]; then
        echo -e "${YELLOW}WARNING: Region format may be invalid: $region${NC}"
        echo -e "         Expected format: us-east-1, eu-west-2, ap-southeast-1, etc."
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Verify the region name is correct"
        echo -e "  2. List available regions: aws ec2 describe-regions --query 'Regions[].RegionName'"
        echo -e "  3. Update config/${env}.json if needed"
        echo ""
        # Don't fail on region format warning, just warn
    else
        echo -e "${GREEN}✓ AWS region format is valid: $region${NC}"
    fi
    
    # Validate AgentCore region format
    local agentcore_region=$(jq -r '.agentCore.region' "$config_file")
    if ! [[ "$agentcore_region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]]; then
        echo -e "${YELLOW}WARNING: AgentCore region format may be invalid: $agentcore_region${NC}"
        echo -e "         Expected format: us-east-1, eu-west-2, ap-southeast-1, etc."
        echo ""
        # Don't fail on region format warning, just warn
    else
        echo -e "${GREEN}✓ AgentCore region format is valid: $agentcore_region${NC}"
    fi
    
    # Validate S3 bucket name format
    local code_bucket=$(jq -r '.agentCore.codeBucket' "$config_file")
    
    # S3 bucket naming rules:
    # - 3-63 characters
    # - Lowercase letters, numbers, hyphens, periods
    # - Must start and end with letter or number
    # - Cannot be formatted as IP address
    if ! [[ "$code_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
        echo -e "${RED}ERROR: Invalid S3 bucket name format: $code_bucket${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. S3 bucket names must:"
        echo -e "     - Be 3-63 characters long"
        echo -e "     - Contain only lowercase letters, numbers, hyphens, and periods"
        echo -e "     - Start and end with a letter or number"
        echo -e "  2. Update config/${env}.json with a valid bucket name"
        echo -e "  3. Example: my-agentcore-code-bucket-${env}"
        echo ""
        return 1
    fi
    
    # Additional check: bucket name should not contain consecutive periods or period-hyphen combinations
    if [[ "$code_bucket" =~ \.\. ]] || [[ "$code_bucket" =~ \.- ]] || [[ "$code_bucket" =~ -\. ]]; then
        echo -e "${RED}ERROR: Invalid S3 bucket name: $code_bucket${NC}"
        echo -e "       Bucket names cannot contain consecutive periods or period-hyphen combinations"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Remove consecutive periods (..)"
        echo -e "  2. Remove period-hyphen combinations (.- or -.)"
        echo -e "  3. Update config/${env}.json with a valid bucket name"
        echo ""
        return 1
    fi
    
    # Check if bucket name looks like an IP address (not allowed)
    if [[ "$code_bucket" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}ERROR: S3 bucket name cannot be formatted as an IP address: $code_bucket${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Choose a bucket name that is not formatted as an IP address"
        echo -e "  2. Update config/${env}.json with a valid bucket name"
        echo ""
        return 1
    fi
    
    echo -e "${GREEN}✓ S3 bucket name format is valid: $code_bucket${NC}"
    
    echo ""
    echo -e "${GREEN}✓ Configuration validation passed${NC}"
    echo ""
    return 0
}

# Print header
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Complete Deployment Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Environment:${NC} $ENVIRONMENT"
echo -e "${BLUE}Dry Run:${NC} $DRY_RUN"
echo -e "${BLUE}Skip CDK:${NC} $SKIP_CDK"
echo -e "${BLUE}Skip AgentCore:${NC} $SKIP_AGENTCORE"
echo -e "${BLUE}Skip Data:${NC} $SKIP_DATA"
echo -e "${BLUE}Skip SageMaker:${NC} $SKIP_SAGEMAKER"
echo -e "${BLUE}Skip Frontend:${NC} $SKIP_FRONTEND"
echo -e "${BLUE}Data Only:${NC} $DATA_ONLY"
echo -e "${BLUE}SageMaker Only:${NC} $SAGEMAKER_ONLY"
echo ""

# Validate configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}ERROR: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Read configuration
REGION=$(jq -r '.agentCore.region // .aws.region' "$CONFIG_FILE")
CODE_BUCKET=$(jq -r '.agentCore.codeBucket' "$CONFIG_FILE")
AWS_ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")

echo -e "${GREEN}Configuration loaded:${NC}"
echo -e "  Region: $REGION"
echo -e "  Code Bucket: $CODE_BUCKET"
echo -e "  AWS Account: $AWS_ACCOUNT"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

###############################################################################
# Validation-Only Mode
###############################################################################

# If --validate-only flag is set, run all validation checks and exit
# Requirements: 7.5
if [ "$VALIDATE_ONLY" = true ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Validation-Only Mode${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Running all validation checks without deploying...${NC}"
    echo ""
    
    # Check jq (required for validation)
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}✗ jq not found (required for JSON parsing)${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Install jq:"
        echo -e "     - macOS: brew install jq"
        echo -e "     - Linux: apt-get install jq"
        echo -e "     - Windows: choco install jq"
        echo -e "  2. Verify installation: jq --version"
        echo ""
        exit 1
    fi
    echo -e "${GREEN}✓ jq installed${NC}"
    echo ""
    
    # Run configuration validation
    if ! validate_configuration "$ENVIRONMENT"; then
        echo ""
        echo -e "${RED}✗ Configuration validation failed${NC}"
        echo ""
        echo -e "${YELLOW}To deploy after fixing issues, run:${NC}"
        echo -e "  ${CYAN}./scripts/deploy-complete.sh $ENVIRONMENT${NC}"
        echo ""
        exit 1
    fi
    
    # All validation checks passed
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Validation Complete!${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${GREEN}✓ All validation checks passed${NC}"
    echo ""
    echo -e "${BLUE}Configuration is valid for deployment.${NC}"
    echo ""
    echo -e "${BLUE}To deploy, run:${NC}"
    echo -e "  ${CYAN}./scripts/deploy-complete.sh $ENVIRONMENT${NC}"
    echo ""
    echo -e "${BLUE}Available deployment options:${NC}"
    echo -e "  ${CYAN}--skip-agentcore${NC}  Skip AgentCore agent deployment"
    echo -e "  ${CYAN}--skip-cdk${NC}        Skip CDK stack deployment"
    echo -e "  ${CYAN}--skip-data${NC}       Skip product data deployment"
    echo -e "  ${CYAN}--skip-sagemaker${NC}  Skip SageMaker Canvas setup"
    echo -e "  ${CYAN}--data-only${NC}       Only deploy product data"
    echo -e "  ${CYAN}--sagemaker-only${NC}  Only setup SageMaker Canvas"
    echo -e "  ${CYAN}--dry-run${NC}         Show what would be deployed without making changes"
    echo ""
    exit 0
fi

###############################################################################
# Step 1: Validate Prerequisites and Configuration
###############################################################################

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 1: Validating Prerequisites${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI not found${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Install AWS CLI:"
    echo -e "     - macOS: brew install awscli"
    echo -e "     - Linux: apt-get install awscli"
    echo -e "     - Windows: choco install awscli"
    echo -e "  2. Verify installation: aws --version"
    echo ""
    exit 1
fi
echo -e "${GREEN}✓ AWS CLI installed${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗ AWS credentials not configured${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Configure AWS credentials using one of:"
    echo -e "     - AWS CLI: aws configure"
    echo -e "     - Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    echo -e "     - AWS Profile: export AWS_PROFILE=your-profile"
    echo -e "  2. Verify credentials: aws sts get-caller-identity"
    echo ""
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials configured${NC}"

# Check jq
if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ jq not found (required for JSON parsing)${NC}"
    echo ""
    echo -e "${YELLOW}Resolution:${NC}"
    echo -e "  1. Install jq:"
    echo -e "     - macOS: brew install jq"
    echo -e "     - Linux: apt-get install jq"
    echo -e "     - Windows: choco install jq"
    echo -e "  2. Verify installation: jq --version"
    echo ""
    exit 1
fi
echo -e "${GREEN}✓ jq installed${NC}"

# Check Node.js (required for JavaScript SDK deployment)
if [ "$SKIP_AGENTCORE" = false ]; then
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js not found (required for AgentCore deployment)${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Install Node.js:"
        echo -e "     - macOS: brew install node"
        echo -e "     - Linux: apt-get install nodejs npm"
        echo -e "     - Windows: choco install nodejs"
        echo -e "  2. Verify installation: node --version"
        echo ""
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js installed${NC}"
fi

# Check CDK (only if not skipping CDK)
if [ "$SKIP_CDK" = false ]; then
    if ! command -v cdk &> /dev/null; then
        echo -e "${RED}✗ AWS CDK not found${NC}"
        echo ""
        echo -e "${YELLOW}Resolution:${NC}"
        echo -e "  1. Install AWS CDK:"
        echo -e "     npm install -g aws-cdk"
        echo -e "  2. Verify installation: cdk --version"
        echo ""
        exit 1
    fi
    echo -e "${GREEN}✓ AWS CDK installed${NC}"
fi

echo ""

# Validate configuration
# Requirements: 7.1, 7.4
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Validating Configuration${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if ! validate_configuration "$ENVIRONMENT"; then
    echo ""
    echo -e "${RED}✗ Configuration validation failed${NC}"
    echo ""
    echo -e "${YELLOW}Deployment cannot proceed with invalid configuration.${NC}"
    echo ""
    echo -e "${BLUE}To validate configuration only (without deploying), run:${NC}"
    echo -e "  ${CYAN}./scripts/deploy-complete.sh $ENVIRONMENT --validate-only${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Configuration validation passed - proceeding with deployment${NC}"
echo ""

###############################################################################
# Step 2: Deploy Agents to AgentCore Runtime (JavaScript SDK)
###############################################################################

if [ "$SKIP_AGENTCORE" = false ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Step 2: Deploying Agents to AgentCore${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    if [ "$DRY_RUN" = false ]; then
        # The deploy-agentcore-agents.sh script handles:
        # - Agent packaging
        # - S3 upload
        # - AgentCore deployment via JavaScript SDK
        # - Agent ID capture and configuration update
        "$SCRIPT_DIR/agentcore/deploy-agentcore-agents.sh" "$ENVIRONMENT"
        
        # Check if deployment was successful
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ AgentCore deployment completed${NC}"
            echo -e "${YELLOW}  Note: Configuration file has been updated with agent IDs${NC}"
        else
            echo -e "${RED}✗ AgentCore deployment failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}(Dry run - would deploy agents via JavaScript SDK)${NC}"
    fi

    echo ""
fi

###############################################################################
# Step 3: Deploy CDK Stacks (Backend + Frontend)
###############################################################################

if [ "$SKIP_CDK" = false ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Step 3: Deploying CDK Stacks${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Deploying CDK stacks for $ENVIRONMENT environment...${NC}"
        echo -e "${BLUE}This will deploy both backend and frontend stacks in order:${NC}"
        echo -e "  1. ProductCatalogStack-${ENVIRONMENT} (Backend)"
        echo -e "  2. FrontendHostingStack-${ENVIRONMENT} (Frontend)"
        echo ""
        
        cd "$BACKEND_DIR"
        
        # Deploy both stacks with --all flag
        # The frontend stack has an explicit dependency on the backend stack,
        # so CDK will deploy them in the correct order automatically
        npx cdk deploy --all \
            --context environment="$ENVIRONMENT" \
            --require-approval never
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Both CDK stacks deployed successfully${NC}"
            echo -e "  ${GREEN}✓${NC} ProductCatalogStack-${ENVIRONMENT} (Backend)"
            echo -e "  ${GREEN}✓${NC} FrontendHostingStack-${ENVIRONMENT} (Frontend)"
        else
            echo -e "${RED}✗ CDK stack deployment failed${NC}"
            exit 1
        fi
        
        echo ""
        
        # Update backend configuration file with deployed resource values from CloudFormation
        echo -e "${YELLOW}Updating backend configuration with CloudFormation stack outputs...${NC}"
        node "$SCRIPT_DIR/update-frontend-config.js" "$ENVIRONMENT" "$REGION"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Backend config and frontend files updated from CloudFormation${NC}"
        else
            echo -e "${YELLOW}⚠ Could not update configuration files (non-fatal)${NC}"
        fi
    else
        echo -e "${YELLOW}(Dry run - would deploy both CDK stacks)${NC}"
        echo -e "${YELLOW}  1. ProductCatalogStack-${ENVIRONMENT} (Backend)${NC}"
        echo -e "${YELLOW}  2. FrontendHostingStack-${ENVIRONMENT} (Frontend)${NC}"
        echo -e "${YELLOW}(Dry run - would update backend config and frontend files from CloudFormation)${NC}"
    fi

    echo ""
fi

###############################################################################
# Step 4: Deploy Product Data to S3
###############################################################################

if [ "$SKIP_DATA" = false ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Step 4: Deploying Product Data to S3${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    if [ "$DRY_RUN" = false ]; then
        # Check if deploy-product-data.sh exists
        DEPLOY_DATA_SCRIPT="$SHARED_SCRIPTS_DIR/deploy-product-data.sh"
        
        if [ ! -f "$DEPLOY_DATA_SCRIPT" ]; then
            echo -e "${RED}✗ Data deployment script not found: $DEPLOY_DATA_SCRIPT${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}Deploying product data for $ENVIRONMENT environment...${NC}"
        echo -e "${YELLOW}This includes: products, categories, filters, competitive data, margin rules, demand forecasts${NC}"
        echo ""
        
        # Build image flags
        IMAGE_FLAGS=""
        if [ "$SKIP_IMAGES" = true ]; then
            IMAGE_FLAGS="--skip-images"
            echo -e "${YELLOW}Skipping product image generation${NC}"
        elif [ "$FORCE_IMAGES" = true ]; then
            IMAGE_FLAGS="--force-images"
            echo -e "${YELLOW}Force regenerating all product images${NC}"
        fi
        
        # Change to shared scripts directory and run deployment
        cd "$SHARED_SCRIPTS_DIR"
        
        # Run the data deployment script
        if [ -n "$IMAGE_FLAGS" ]; then
            bash "$DEPLOY_DATA_SCRIPT" "$ENVIRONMENT" "$REGION" "$AWS_ACCOUNT" $IMAGE_FLAGS
        else
            bash "$DEPLOY_DATA_SCRIPT" "$ENVIRONMENT" "$REGION" "$AWS_ACCOUNT"
        fi
        
        # Check if deployment was successful
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Product data deployment completed${NC}"
        else
            echo -e "${RED}✗ Product data deployment failed${NC}"
            if [ "$FORCE" = false ]; then
                exit 1
            else
                echo -e "${YELLOW}Continuing due to --force flag${NC}"
            fi
        fi
        
        # Return to backend directory
        cd "$BACKEND_DIR"
    else
        echo -e "${YELLOW}(Dry run - would deploy product data to S3)${NC}"
        echo -e "${YELLOW}  Data includes: products, categories, filters, competitive data, margin rules, demand forecasts${NC}"
        if [ "$SKIP_IMAGES" = true ]; then
            echo -e "${YELLOW}  Images: would be skipped${NC}"
        elif [ "$FORCE_IMAGES" = true ]; then
            echo -e "${YELLOW}  Images: would be force regenerated${NC}"
        else
            echo -e "${YELLOW}  Images: would be generated if missing${NC}"
        fi
    fi

    echo ""
fi

###############################################################################
# Step 5: SageMaker Canvas Setup
###############################################################################

if [ "$SKIP_SAGEMAKER" = false ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Step 5: SageMaker Canvas Setup${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Setting up SageMaker Canvas training data pipeline...${NC}"
        
        # Setup training data pipeline
        node "$SCRIPT_DIR/sagemaker/setup-training-data-pipeline.js" \
            --environment "$ENVIRONMENT" \
            --region "$REGION"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ SageMaker Canvas training data pipeline setup completed${NC}"
        else
            echo -e "${YELLOW}⚠ SageMaker Canvas setup encountered issues${NC}"
            echo -e "${YELLOW}  This is optional and won't block deployment${NC}"
        fi
        
        echo ""
        echo -e "${BLUE}To initialize baseline models, run:${NC}"
        echo -e "  ${CYAN}node scripts/sagemaker/initialize-baseline-models.js --environment $ENVIRONMENT${NC}"
        echo ""
    else
        echo -e "${YELLOW}(Dry run - would setup SageMaker Canvas training data pipeline)${NC}"
    fi
    
    echo ""
else
    echo -e "${BLUE}SageMaker Canvas setup skipped (--skip-sagemaker flag)${NC}"
    echo ""
fi

###############################################################################
# Step 6: Frontend Code Deployment to Amplify
###############################################################################

if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Step 6: Frontend Code Deployment${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Deploying frontend code to Amplify...${NC}"
        echo -e "${BLUE}Using AWS CLI bucket+prefix method (no Amplify CLI needed)${NC}"
        echo ""
        
        # Navigate to frontend directory
        cd "$REPO_ROOT/source/frontend"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}Installing frontend dependencies...${NC}"
            npm install
        fi
        
        # Build the frontend
        echo -e "${YELLOW}Building frontend application...${NC}"
        npm run build
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Frontend build completed${NC}"
            echo ""
            
            # Deploy using the new deployment script
            echo -e "${YELLOW}Deploying to Amplify using AWS CLI...${NC}"
            bash scripts/deploy-to-amplify.sh "$ENVIRONMENT"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Frontend deployed to Amplify${NC}"
                
                # Get Amplify app URL from CloudFormation
                AMPLIFY_URL=$(aws cloudformation describe-stacks \
                    --stack-name "FrontendHostingStack-${ENVIRONMENT}" \
                    --region "$REGION" \
                    --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppUrl`].OutputValue' \
                    --output text 2>/dev/null || echo "")
                
                if [ -n "$AMPLIFY_URL" ] && [ "$AMPLIFY_URL" != "None" ]; then
                    echo -e "${GREEN}🌐 App URL: ${AMPLIFY_URL}${NC}"
                fi
            else
                echo -e "${RED}✗ Frontend deployment failed${NC}"
                echo -e "${YELLOW}  You can deploy manually:${NC}"
                echo -e "    ${CYAN}cd src/frontend${NC}"
                echo -e "    ${CYAN}npm run deploy:${ENVIRONMENT}${NC}"
                
                if [ "$FORCE" = false ]; then
                    cd "$BACKEND_DIR"
                    exit 1
                fi
            fi
        else
            echo -e "${RED}✗ Frontend build failed${NC}"
            if [ "$FORCE" = false ]; then
                cd "$BACKEND_DIR"
                exit 1
            fi
        fi
        
        # Return to backend directory
        cd "$BACKEND_DIR"
    else
        echo -e "${YELLOW}(Dry run - would build and deploy frontend)${NC}"
        echo -e "${YELLOW}  Steps:${NC}"
        echo -e "${YELLOW}    1. cd src/frontend${NC}"
        echo -e "${YELLOW}    2. npm install (if needed)${NC}"
        echo -e "${YELLOW}    3. npm run build${NC}"
        echo -e "${YELLOW}    4. bash scripts/deploy-to-amplify.sh ${ENVIRONMENT}${NC}"
    fi
    
    echo ""
else
    echo -e "${BLUE}Frontend deployment skipped (--skip-frontend flag)${NC}"
    echo ""
    echo -e "${BLUE}To deploy frontend manually:${NC}"
    echo -e "  ${CYAN}cd src/frontend${NC}"
    echo -e "  ${CYAN}npm run deploy:${ENVIRONMENT}${NC}"
    echo ""
fi

###############################################################################
# Step 6: Verify Deployment
###############################################################################

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 7: Verifying Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
    # Verify AgentCore agents by checking configuration file
    if [ "$SKIP_AGENTCORE" = false ]; then
        echo -e "${YELLOW}Verifying AgentCore agent IDs in configuration...${NC}"
        
        DEMAND_FORECAST_ID=$(jq -r '.agentCore.agents.demandForecast // empty' "$CONFIG_FILE")
        COMPETITIVE_ANALYSIS_ID=$(jq -r '.agentCore.agents.competitiveAnalysis // empty' "$CONFIG_FILE")
        MARGIN_ANALYSIS_ID=$(jq -r '.agentCore.agents.marginAnalysis // empty' "$CONFIG_FILE")
        
        AGENT_COUNT=0
        [ -n "$DEMAND_FORECAST_ID" ] && AGENT_COUNT=$((AGENT_COUNT + 1))
        [ -n "$COMPETITIVE_ANALYSIS_ID" ] && AGENT_COUNT=$((AGENT_COUNT + 1))
        [ -n "$MARGIN_ANALYSIS_ID" ] && AGENT_COUNT=$((AGENT_COUNT + 1))
        
        if [ "$AGENT_COUNT" -eq 3 ]; then
            echo -e "${GREEN}✓ All 3 AgentCore agents configured${NC}"
            echo -e "  Demand Forecast: $DEMAND_FORECAST_ID"
            echo -e "  Competitive Analysis: $COMPETITIVE_ANALYSIS_ID"
            echo -e "  Margin Analysis: $MARGIN_ANALYSIS_ID"
        else
            echo -e "${YELLOW}⚠ Only $AGENT_COUNT of 3 agents configured${NC}"
        fi
    fi
    
    # Verify CDK stacks
    if [ "$SKIP_CDK" = false ]; then
        echo -e "${YELLOW}Verifying CDK stacks...${NC}"
        
        # Check backend stack
        BACKEND_STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "ProductCatalogStack-${ENVIRONMENT}" \
            --region "$REGION" \
            --query 'Stacks[0].StackStatus' \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        if [ "$BACKEND_STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$BACKEND_STACK_STATUS" = "UPDATE_COMPLETE" ]; then
            echo -e "${GREEN}✓ Backend stack deployed successfully${NC}"
        else
            echo -e "${YELLOW}⚠ Backend stack status: $BACKEND_STACK_STATUS${NC}"
        fi
        
        # Check frontend stack
        FRONTEND_STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "FrontendHostingStack-${ENVIRONMENT}" \
            --region "$REGION" \
            --query 'Stacks[0].StackStatus' \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        if [ "$FRONTEND_STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$FRONTEND_STACK_STATUS" = "UPDATE_COMPLETE" ]; then
            echo -e "${GREEN}✓ Frontend stack deployed successfully${NC}"
        else
            echo -e "${YELLOW}⚠ Frontend stack status: $FRONTEND_STACK_STATUS${NC}"
        fi
    fi
    
    # Verify S3 data deployment
    if [ "$SKIP_DATA" = false ]; then
        echo -e "${YELLOW}Verifying S3 data deployment...${NC}"
        
        # Get bucket name from stack outputs
        BUCKET_NAME=$(aws cloudformation describe-stacks \
            --stack-name "ProductCatalogStack-${ENVIRONMENT}" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`AssetsBucketName`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        if [ -n "$BUCKET_NAME" ] && [ "$BUCKET_NAME" != "None" ]; then
            # Check for key data files
            PRODUCTS_EXISTS=$(aws s3 ls "s3://${BUCKET_NAME}/products/" --region "$REGION" 2>/dev/null | head -1)
            DEMAND_EXISTS=$(aws s3 ls "s3://${BUCKET_NAME}/demand_forecasts/" --region "$REGION" 2>/dev/null | head -1)
            
            if [ -n "$PRODUCTS_EXISTS" ] && [ -n "$DEMAND_EXISTS" ]; then
                echo -e "${GREEN}✓ S3 data deployed successfully${NC}"
                echo -e "  Bucket: $BUCKET_NAME"
                echo -e "  Products: ✓"
                echo -e "  Demand Forecasts: ✓"
            else
                echo -e "${YELLOW}⚠ Some S3 data may be missing${NC}"
                [ -z "$PRODUCTS_EXISTS" ] && echo -e "  Products: ✗"
                [ -z "$DEMAND_EXISTS" ] && echo -e "  Demand Forecasts: ✗"
            fi
        else
            echo -e "${YELLOW}⚠ Could not verify S3 data (bucket name not found)${NC}"
        fi
    fi
else
    echo -e "${YELLOW}(Dry run - would verify deployment)${NC}"
fi

echo ""

###############################################################################
# Summary
###############################################################################

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Deployment Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
    echo -e "${GREEN}✓ Deployment successful for $ENVIRONMENT environment${NC}"
    echo ""
    
    # Show what was deployed
    echo -e "${BLUE}Deployed components:${NC}"
    [ "$SKIP_AGENTCORE" = false ] && echo -e "  ${GREEN}✓${NC} AgentCore agents"
    [ "$SKIP_CDK" = false ] && echo -e "  ${GREEN}✓${NC} CDK infrastructure stack"
    [ "$SKIP_DATA" = false ] && echo -e "  ${GREEN}✓${NC} Product data to S3"
    [ "$SKIP_SAGEMAKER" = false ] && echo -e "  ${GREEN}✓${NC} SageMaker Canvas setup"
    [ "$SKIP_FRONTEND" = false ] && echo -e "  ${GREEN}✓${NC} Frontend to Amplify"
    echo ""
    
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Commit configuration changes:"
    echo -e "     ${CYAN}git add config/${ENVIRONMENT}.json${NC}"
    if [ "$SKIP_AGENTCORE" = false ]; then
        echo -e "     ${CYAN}git commit -m 'Update config with AgentCore agent IDs and CDK outputs for $ENVIRONMENT'${NC}"
    else
        echo -e "     ${CYAN}git commit -m 'Update config with CDK outputs for $ENVIRONMENT'${NC}"
    fi
    echo ""
    echo -e "  2. Test the deployment:"
    echo -e "     ${CYAN}./scripts/verify-deployment.sh $ENVIRONMENT${NC}"
    echo ""
    echo -e "  3. View updated configuration:"
    echo -e "     ${CYAN}cat config/${ENVIRONMENT}.json | jq '{appSync, sageMakerCanvas, agentCore}'${NC}"
else
    echo -e "${YELLOW}Dry run complete - no changes made${NC}"
    echo ""
    echo -e "${BLUE}To deploy for real, run:${NC}"
    echo -e "  ${CYAN}./scripts/deploy-complete.sh $ENVIRONMENT${NC}"
    echo ""
    echo -e "${BLUE}Available options:${NC}"
    echo -e "  ${CYAN}--skip-agentcore${NC}  Skip AgentCore agent deployment"
    echo -e "  ${CYAN}--skip-cdk${NC}        Skip CDK stack deployment"
    echo -e "  ${CYAN}--skip-data${NC}       Skip product data deployment"
    echo -e "  ${CYAN}--skip-sagemaker${NC}  Skip SageMaker Canvas setup"
    echo -e "  ${CYAN}--skip-frontend${NC}   Skip frontend build and Amplify deployment"
    echo -e "  ${CYAN}--data-only${NC}       Only deploy product data"
    echo -e "  ${CYAN}--sagemaker-only${NC}  Only setup SageMaker Canvas"
    echo -e "  ${CYAN}--skip-images${NC}     Skip product image generation"
    echo -e "  ${CYAN}--force-images${NC}    Force regenerate all images"
fi

echo ""
