#!/bin/bash

# Competitive Analysis Agent Deployment Script
# This script handles the deployment of the competitive analysis agent with proper error handling
# and LogGroup management to avoid CloudFormation conflicts.

set -e  # Exit on any error

# Configuration
ENVIRONMENT=${1:-dev}
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"
LOG_GROUP_NAME="/aws/lambda/competitive-analysis-agent-${ENVIRONMENT}"

# Script directory
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

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if LogGroup exists
check_log_group_exists() {
    local log_group_name=$1
    log_info "Checking if LogGroup exists: $log_group_name"
    
    if aws logs describe-log-groups --log-group-name-prefix "$log_group_name" --region "$REGION" --query "logGroups[?logGroupName=='$log_group_name']" --output text | grep -q "$log_group_name"; then
        return 0  # LogGroup exists
    else
        return 1  # LogGroup does not exist
    fi
}

# Function to delete LogGroup if it exists and is not managed by CloudFormation
cleanup_orphaned_log_group() {
    local log_group_name=$1
    
    if check_log_group_exists "$log_group_name"; then
        log_warning "Found existing LogGroup: $log_group_name"
        
        # Check if LogGroup is managed by CloudFormation
        local cf_tags=$(aws logs list-tags-log-group --log-group-name "$log_group_name" --region "$REGION" --query "tags" --output json 2>/dev/null || echo "{}")
        
        if echo "$cf_tags" | grep -q "aws:cloudformation:stack-name"; then
            log_error "LogGroup is managed by CloudFormation. Manual intervention required."
            log_error "Please delete the CloudFormation stack or remove the LogGroup resource from the stack."
            exit 1
        else
            log_warning "LogGroup appears to be orphaned (not managed by CloudFormation)"
            read -p "Do you want to delete the existing LogGroup? This will remove all existing logs. (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "Deleting orphaned LogGroup: $log_group_name"
                aws logs delete-log-group --log-group-name "$log_group_name" --region "$REGION"
                log_success "LogGroup deleted successfully"
            else
                log_error "Deployment cannot continue with existing LogGroup. Please resolve manually."
                exit 1
            fi
        fi
    fi
}

# Function to set LogGroup retention policy after deployment
set_log_group_retention() {
    local log_group_name=$1
    local retention_days=$2
    
    log_info "Setting LogGroup retention policy: $log_group_name -> $retention_days days"
    
    # Wait for LogGroup to be created by Lambda
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if check_log_group_exists "$log_group_name"; then
            log_success "LogGroup found, setting retention policy"
            aws logs put-retention-policy --log-group-name "$log_group_name" --retention-in-days "$retention_days" --region "$REGION"
            log_success "Retention policy set to $retention_days days"
            return 0
        else
            log_info "Waiting for LogGroup to be created... (attempt $attempt/$max_attempts)"
            sleep 10
            ((attempt++))
        fi
    done
    
    log_warning "LogGroup was not created within expected time. Retention policy not set."
    return 1
}

# Function to validate deployment
validate_deployment() {
    local stack_name=$1
    
    log_info "Validating deployment..."
    
    # Check stack status
    local stack_status=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$REGION" --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$stack_status" = "CREATE_COMPLETE" ] || [ "$stack_status" = "UPDATE_COMPLETE" ]; then
        log_success "CloudFormation stack is in good state: $stack_status"
    else
        log_error "CloudFormation stack is in unexpected state: $stack_status"
        return 1
    fi
    
    # Check Lambda function
    local function_name="competitive-analysis-agent-${ENVIRONMENT}"
    local function_status=$(aws lambda get-function --function-name "$function_name" --region "$REGION" --query "Configuration.State" --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$function_status" = "Active" ]; then
        log_success "Lambda function is active: $function_name"
    else
        log_error "Lambda function is not active: $function_status"
        return 1
    fi
    
    return 0
}

# Function to test agent functionality
test_agent_functionality() {
    local function_name="competitive-analysis-agent-${ENVIRONMENT}"
    
    log_info "Testing agent functionality..."
    
    # Create test payload
    local test_payload='{
        "product_id": "CMAN-SAW-PRO725",
        "session_id": "test-session-' $(date +%s) '",
        "user_input": "Analyze competitive landscape for CMAN-SAW-PRO725"
    }'
    
    # Invoke function asynchronously to avoid timeout
    local invocation_result=$(aws lambda invoke \
        --function-name "$function_name" \
        --invocation-type Event \
        --payload "$test_payload" \
        --region "$REGION" \
        /tmp/test-response.json 2>&1)
    
    if echo "$invocation_result" | grep -q "StatusCode.*202"; then
        log_success "Test invocation successful (async)"
        log_info "Check CloudWatch logs for detailed results"
    else
        log_warning "Test invocation may have failed. Check CloudWatch logs."
        log_info "Invocation result: $invocation_result"
    fi
}

# Main deployment function
main() {
    log_info "Starting Competitive Analysis Agent deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Stack: $STACK_NAME"
    
    # Step 1: Pre-deployment checks
    log_info "Step 1: Pre-deployment checks"
    
    # Check AWS CLI configuration
    if ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
        log_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    
    log_success "AWS credentials validated"
    
    # Step 2: Handle existing LogGroup conflicts
    log_info "Step 2: Checking for LogGroup conflicts"
    cleanup_orphaned_log_group "$LOG_GROUP_NAME"
    
    # Step 3: CDK deployment
    log_info "Step 3: Deploying CDK stack"
    
    # Navigate to backend directory
    cd "$(dirname "$0")/.."
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing CDK dependencies..."
        npm install
    fi
    
    # Bootstrap CDK if needed (only for first deployment)
    if ! aws cloudformation describe-stacks --stack-name "CDKToolkit" --region "$REGION" >/dev/null 2>&1; then
        log_info "Bootstrapping CDK..."
        npx cdk bootstrap --context environment="$ENVIRONMENT"
    fi
    
    # Deploy the stack
    log_info "Deploying CDK stack..."
    if npx cdk deploy --context environment="$ENVIRONMENT" --require-approval never; then
        log_success "CDK deployment completed successfully"
    else
        log_error "CDK deployment failed"
        exit 1
    fi
    
    # Step 4: Post-deployment configuration
    log_info "Step 4: Post-deployment configuration"
    
    # Set LogGroup retention policy
    local retention_days=7
    if [ "$ENVIRONMENT" = "prod" ]; then
        retention_days=30
    fi
    
    set_log_group_retention "$LOG_GROUP_NAME" "$retention_days"
    
    # Step 5: Validation
    log_info "Step 5: Deployment validation"
    if validate_deployment "$STACK_NAME"; then
        log_success "Deployment validation passed"
    else
        log_error "Deployment validation failed"
        exit 1
    fi
    
    # Step 6: Functionality test
    log_info "Step 6: Functionality test"
    test_agent_functionality
    
    # Step 7: Output important information
    log_info "Step 7: Deployment summary"
    
    echo
    log_success "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    echo
    log_info "Stack Name: $STACK_NAME"
    log_info "Function Name: competitive-analysis-agent-${ENVIRONMENT}"
    log_info "LogGroup: $LOG_GROUP_NAME"
    log_info "Region: $REGION"
    echo
    log_info "Next steps:"
    log_info "1. Check CloudWatch logs for any errors"
    log_info "2. Test the agent through the pricing dashboard"
    log_info "3. Monitor performance metrics in CloudWatch"
    echo
    log_info "CloudWatch Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=competitive-analysis-${ENVIRONMENT}"
    log_info "Lambda Function: https://console.aws.amazon.com/lambda/home?region=${REGION}#/functions/competitive-analysis-agent-${ENVIRONMENT}"
    echo
}

# Script entry point
if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev"
    echo "Example: $0 prod"
    echo ""
    echo "Note: Region is read from config/<environment>.json"
    exit 1
fi

main "$@"