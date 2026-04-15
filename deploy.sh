#!/bin/bash
set -e

# Usage: ./deploy.sh [--email <email>] [--region <aws-region>]
DEMO_EMAIL=""
AWS_REGION="us-east-1"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --email) DEMO_EMAIL="$2"; shift 2 ;;
        --region) AWS_REGION="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ============================================
# CONFIGURATION - Edit these variables
# ============================================
ENVIRONMENT="local"

# ============================================
# ENVIRONMENT SETUP
# ============================================
echo "============================================"
echo "One-Click Deploy: Retail Pricing Agent"
echo "============================================"
echo ""

export AWS_REGION
export AWS_SDK_LOAD_CONFIG=1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Account ID: $ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# ============================================
# PROMPT FOR DEMO USER EMAIL
# ============================================
if [[ -n "$DEMO_EMAIL" ]]; then
    if [[ ! "$DEMO_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        echo "Invalid email address provided via --email."
        exit 1
    fi
else
    while true; do
        read -rp "Enter email address for the demo user account: " DEMO_EMAIL
        if [[ "$DEMO_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            break
        fi
        echo "Invalid email address. Please try again."
    done
fi
echo ""

# ============================================
# INSTALL DEPENDENCIES
# ============================================
echo "Step 1: Installing global dependencies..."

npm install -g aws-cdk typescript

echo "Global dependencies installed."
echo ""

# ============================================
# NAVIGATE TO REPO ROOT
# ============================================
echo "Step 2: Setting working directory..."

cd "$(dirname "$0")"

echo "Working directory: $(pwd)"
echo ""

# ============================================
# INSTALL PROJECT DEPENDENCIES
# ============================================
echo "Step 3: Installing project dependencies..."

# Backend dependencies
echo "Installing backend dependencies..."
cd source/backend
npm install
cd ../..

# Frontend dependencies
echo "Installing frontend dependencies..."
cd source/frontend
npm install
cd ../..

# Shared dependencies
echo "Installing shared dependencies..."
cd source/shared
npm install
cd ../..

echo "All project dependencies installed."
echo ""

# ============================================
# CONFIGURE ENVIRONMENT
# ============================================
echo "Step 4: Creating configuration file..."

cp source/backend/config/local.json.template source/backend/config/local.json

# Replace placeholder values with actual account details
if command -v jq &> /dev/null; then
    # Use jq for reliable JSON manipulation
    jq --arg account "$ACCOUNT_ID" --arg region "$AWS_REGION" \
        '.aws.account = $account | .aws.region = $region | .bedrock.region = $region | .agentCore.region = $region' \
        source/backend/config/local.json > source/backend/config/local.json.tmp
    mv source/backend/config/local.json.tmp source/backend/config/local.json
else
    # Fallback to sed
    sed -i "s/YOUR_AWS_ACCOUNT_ID/$ACCOUNT_ID/g" source/backend/config/local.json
    sed -i "s/YOUR_PREFERRED_REGION/$AWS_REGION/g" source/backend/config/local.json
fi

echo "Configuration file created."
echo ""

# ============================================
# CDK BOOTSTRAP
# ============================================
echo "Step 5: Checking CDK bootstrap..."

CDK_BOOTSTRAP_STACK=$(aws cloudformation describe-stacks --region $AWS_REGION --query "Stacks[?StackName=='CDKToolkit'].StackName" --output text 2>/dev/null || echo "")

if [ -z "$CDK_BOOTSTRAP_STACK" ] || [ "$CDK_BOOTSTRAP_STACK" == "None" ]; then
    echo "CDK bootstrap not found. Running cdk bootstrap..."
    npx cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION --context environment=$ENVIRONMENT

    if [ $? -ne 0 ]; then
        echo "CDK bootstrap failed."
        exit 1
    fi
    echo "CDK bootstrap completed."
else
    echo "CDK is already bootstrapped in region $AWS_REGION."
fi

echo ""

# ============================================
# DEPLOY AGENTCORE AGENTS
# ============================================
echo "Step 6: Deploying AgentCore agents..."

cd source/backend
bash scripts/deploy-complete.sh $ENVIRONMENT --skip-cdk --skip-data --skip-sagemaker --skip-frontend

if [ $? -ne 0 ]; then
    echo "AgentCore deployment failed."
    exit 1
fi

echo "AgentCore agents deployed."
cd ../..
echo ""

# ============================================
# DEPLOY BACKEND INFRASTRUCTURE
# ============================================
echo "Step 7: Deploying backend infrastructure (CDK stacks)..."

cd source/backend

# Deploy all CDK stacks (backend + frontend hosting)
npx cdk deploy --all \
    --context environment=$ENVIRONMENT \
    --require-approval never

if [ $? -ne 0 ]; then
    echo "CDK deployment failed."
    exit 1
fi

echo "CDK stacks deployed successfully."
echo ""

# ============================================
# UPDATE CONFIGURATION WITH STACK OUTPUTS
# ============================================
echo "Step 7: Updating configuration with stack outputs..."

node scripts/update-frontend-config.js $ENVIRONMENT $AWS_REGION

echo "Configuration updated with stack outputs."
cd ../..
echo ""

# ============================================
# DEPLOY PRODUCT DATA
# ============================================
echo "Step 8: Deploying product data to S3..."

cd source/backend
bash scripts/deploy-complete.sh $ENVIRONMENT --data-only

if [ $? -ne 0 ]; then
    echo "Product data deployment failed."
    exit 1
fi

echo "Product data deployed."
cd ../..
echo ""

# ============================================
# SYNC AND DEPLOY FRONTEND
# ============================================
echo "Step 9: Syncing frontend configuration..."

cd source/frontend
node scripts/sync-frontend-config.cjs $ENVIRONMENT

echo "Frontend configuration synced."
echo ""

echo "Step 10: Building and deploying frontend..."

npm run build

if [ $? -ne 0 ]; then
    echo "Frontend build failed."
    exit 1
fi

bash scripts/deploy-to-amplify.sh $ENVIRONMENT

if [ $? -ne 0 ]; then
    echo "Frontend deployment to Amplify failed."
    exit 1
fi

echo "Frontend deployed to Amplify."
cd ../..
echo ""

# ============================================
# CREATE DEMO USER
# ============================================
echo "Step 11: Creating demo user..."

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "ProductCatalogStack-${ENVIRONMENT}" \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "None" ]; then
    DEMO_PASSWORD="Demo1234!"

    # Create user (suppress error if already exists)
    aws cognito-idp admin-create-user \
        --user-pool-id "$USER_POOL_ID" \
        --username "demo-user" \
        --user-attributes Name=email,Value="$DEMO_EMAIL" Name=email_verified,Value=true Name=given_name,Value=Demo Name=family_name,Value=User \
        --message-action SUPPRESS \
        --region $AWS_REGION 2>/dev/null && echo "✓ Demo user created" || echo "✓ Demo user already exists"

    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$USER_POOL_ID" \
        --username "demo-user" \
        --password "$DEMO_PASSWORD" \
        --permanent \
        --region $AWS_REGION 2>/dev/null && echo "✓ Demo user password set"

    echo "  Email:    $DEMO_EMAIL"
    echo "  Password: $DEMO_PASSWORD"
else
    echo "⚠ Could not find User Pool ID, skipping demo user creation"
fi

echo ""

# ============================================
# VALIDATION
# ============================================
echo "Step 12: Validating deployment..."

# Verify backend stack
BACKEND_STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "ProductCatalogStack-${ENVIRONMENT}" \
    --region $AWS_REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$BACKEND_STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$BACKEND_STACK_STATUS" == "UPDATE_COMPLETE" ]; then
    echo "✓ Backend stack: $BACKEND_STACK_STATUS"
else
    echo "⚠ Backend stack status: $BACKEND_STACK_STATUS"
fi

# Verify frontend stack
FRONTEND_STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "FrontendHostingStack-${ENVIRONMENT}" \
    --region $AWS_REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$FRONTEND_STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$FRONTEND_STACK_STATUS" == "UPDATE_COMPLETE" ]; then
    echo "✓ Frontend stack: $FRONTEND_STACK_STATUS"
else
    echo "⚠ Frontend stack status: $FRONTEND_STACK_STATUS"
fi

# Get Amplify App URL
AMPLIFY_URL=$(aws cloudformation describe-stacks \
    --stack-name "FrontendHostingStack-${ENVIRONMENT}" \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

echo ""
echo "============================================"
echo "Deployment completed successfully!"
echo "============================================"
echo ""
echo "Account ID: $ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Backend Stack: ProductCatalogStack-${ENVIRONMENT}"
echo "Frontend Stack: FrontendHostingStack-${ENVIRONMENT}"

if [ -n "$AMPLIFY_URL" ] && [ "$AMPLIFY_URL" != "None" ]; then
    echo "App URL: $AMPLIFY_URL"
fi

echo ""
echo "Next steps:"
echo "  1. Open the App URL in your browser"
echo "  2. Sign in with the demo account: $DEMO_EMAIL / Demo1234!"
echo "  3. Browse products and initiate pricing analyses"
echo ""
