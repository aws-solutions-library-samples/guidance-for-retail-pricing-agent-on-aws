#!/bin/bash

# Competitive Analysis Agent Rollback Script
# This script handles rollback of the competitive analysis agent deployment
# in case of failures or issues.

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

# Function to check stack status
check_stack_status() {
    local stack_name=$1
    aws cloudformation describe-stacks --stack-name "$stack_name" --region "$REGION" --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND"
}

# Function to rollback CloudFormation stack
rollback_stack() {
    local stack_name=$1
    local stack_status=$(check_stack_status "$stack_name")
    
    log_info "Current stack status: $stack_status"
    
    case "$stack_status" in
        "CREATE_FAILED"|"UPDATE_FAILED"|"UPDATE_ROLLBACK_FAILED")
            log_info "Stack is in failed state, attempting to delete..."
            aws cloudformation delete-stack --stack-name "$stack_name" --region "$REGION"
            
            log_info "Waiting for stack deletion to complete..."
            aws cloudformation wait stack-delete-complete --stack-name "$stack_name" --region "$REGION"
            log_success "Stack deleted successfully"
            ;;
            
        "CREATE_IN_PROGRESS"|"UPDATE_IN_PROGRESS")
            log_warning "Stack operation is in progress. Waiting for completion..."
            sleep 30
            rollback_stack "$stack_name"  # Recursive call to check again
            ;;
            
        "CREATE_COMPLETE"|"UPDATE_COMPLETE")
            log_warning "Stack is in good state. Are you sure you want to rollback?"
            read -p "Continue with rollback? This will delete the stack. (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "Deleting stack..."
                aws cloudformation delete-stack --stack-name "$stack_name" --region "$REGION"
                
                log_info "Waiting for stack deletion to complete..."
                aws cloudformation wait stack-delete-complete --stack-name "$stack_name" --region "$REGION"
                log_success "Stack deleted successfully"
            else
                log_info "Rollback cancelled by user"
                exit 0
            fi
            ;;
            
        "DELETE_IN_PROGRESS")
            log_info "Stack deletion already in progress. Waiting for completion..."
            aws cloudformation wait stack-delete-complete --stack-name "$stack_name" --region "$REGION"
            log_success "Stack deletion completed"
            ;;
            
        "NOT_FOUND")
            log_info "Stack not found. Nothing to rollback."
            ;;
            
        *)
            log_error "Unknown stack status: $stack_status"
            log_error "Manual intervention may be required"
            exit 1
            ;;
    esac
}

# Function to clean up orphaned resources
cleanup_orphaned_resources() {
    log_info "Cleaning up orphaned resources..."
    
    # Clean up LogGroup if it exists and is not managed by CloudFormation
    if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP_NAME" --region "$REGION" --query "logGroups[?logGroupName=='$LOG_GROUP_NAME']" --output text | grep -q "$LOG_GROUP_NAME"; then
        log_info "Found LogGroup: $LOG_GROUP_NAME"
        
        # Check if it's managed by CloudFormation
        local cf_tags=$(aws logs list-tags-log-group --log-group-name "$LOG_GROUP_NAME" --region "$REGION" --query "tags" --output json 2>/dev/null || echo "{}")
        
        if ! echo "$cf_tags" | grep -q "aws:cloudformation:stack-name"; then
            log_warning "LogGroup appears to be orphaned"
            read -p "Delete orphaned LogGroup? This will remove all logs. (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                aws logs delete-log-group --log-group-name "$LOG_GROUP_NAME" --region "$REGION"
                log_success "LogGroup deleted"
            fi
        else
            log_info "LogGroup is managed by CloudFormation (will be deleted with stack)"
        fi
    fi
    
    # Clean up any orphaned Lambda functions
    local function_name="competitive-analysis-agent-${ENVIRONMENT}"
    if aws lambda get-function --function-name "$function_name" --region "$REGION" >/dev/null 2>&1; then
        log_warning "Found orphaned Lambda function: $function_name"
        read -p "Delete orphaned Lambda function? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            aws lambda delete-function --function-name "$function_name" --region "$REGION"
            log_success "Lambda function deleted"
        fi
    fi
}

# Function to restore from backup (if available)
restore_from_backup() {
    log_info "Checking for backup configurations..."
    
    # This would be implemented if we had backup/restore functionality
    # For now, just log that no backup restore is available
    log_info "No backup restore functionality implemented"
    log_info "Manual reconfiguration may be required"
}

# Function to validate rollback
validate_rollback() {
    log_info "Validating rollback..."
    
    # Check that stack is gone
    local stack_status=$(check_stack_status "$STACK_NAME")
    if [ "$stack_status" = "NOT_FOUND" ]; then
        log_success "Stack successfully removed"
    else
        log_error "Stack still exists with status: $stack_status"
        return 1
    fi
    
    # Check that Lambda function is gone
    local function_name="competitive-analysis-agent-${ENVIRONMENT}"
    if ! aws lambda get-function --function-name "$function_name" --region "$REGION" >/dev/null 2>&1; then
        log_success "Lambda function successfully removed"
    else
        log_warning "Lambda function still exists (may be orphaned)"
    fi
    
    return 0
}

# Main rollback function
main() {
    log_info "Starting Competitive Analysis Agent rollback"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Stack: $STACK_NAME"
    
    echo
    log_warning "=== ROLLBACK WARNING ==="
    log_warning "This will remove the competitive analysis agent and all related resources"
    log_warning "Any data stored in the agent's resources will be lost"
    echo
    
    read -p "Are you sure you want to proceed with rollback? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Rollback cancelled by user"
        exit 0
    fi
    
    # Step 1: Check AWS credentials
    log_info "Step 1: Validating AWS credentials"
    if ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
        log_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    log_success "AWS credentials validated"
    
    # Step 2: Rollback CloudFormation stack
    log_info "Step 2: Rolling back CloudFormation stack"
    rollback_stack "$STACK_NAME"
    
    # Step 3: Clean up orphaned resources
    log_info "Step 3: Cleaning up orphaned resources"
    cleanup_orphaned_resources
    
    # Step 4: Validate rollback
    log_info "Step 4: Validating rollback"
    if validate_rollback; then
        log_success "Rollback validation passed"
    else
        log_error "Rollback validation failed - manual cleanup may be required"
        exit 1
    fi
    
    # Step 5: Summary
    echo
    log_success "=== ROLLBACK COMPLETED SUCCESSFULLY ==="
    echo
    log_info "The following resources have been removed:"
    log_info "- CloudFormation stack: $STACK_NAME"
    log_info "- Lambda function: competitive-analysis-agent-${ENVIRONMENT}"
    log_info "- LogGroup: $LOG_GROUP_NAME (if orphaned)"
    echo
    log_info "Next steps:"
    log_info "1. Verify no orphaned resources remain in AWS console"
    log_info "2. Check for any dependent resources that may need cleanup"
    log_info "3. Update any external references to the removed resources"
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