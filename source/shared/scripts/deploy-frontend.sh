#!/bin/bash

# Frontend Build Script
# Builds the frontend for production deployment

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${2:-us-east-1}

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

log_header "Frontend Production Build"
log_info "Environment: ${ENVIRONMENT}"
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Step 1: Update frontend configuration
log_header "Step 1: Updating Frontend Configuration"
log_info "Ensuring frontend points to deployed backend..."

cd "${PROJECT_ROOT}"
if bash src/shared/scripts/update-frontend-config.sh "${ENVIRONMENT}" "${AWS_REGION}"; then
    log_success "Frontend configuration updated"
else
    log_error "Failed to update frontend configuration"
    exit 1
fi

# Step 2: Build frontend
log_header "Step 2: Building Frontend for Production"
cd "${PROJECT_ROOT}/src/frontend"

log_info "Installing dependencies..."
if npm install; then
    log_success "Dependencies installed"
else
    log_error "Failed to install dependencies"
    exit 1
fi

log_info "Running TypeScript type check..."
if npm run type-check; then
    log_success "Type check passed"
else
    log_error "TypeScript type check failed"
    exit 1
fi

log_info "Building production bundle..."
if npm run build; then
    log_success "Frontend built successfully"
else
    log_error "Frontend build failed"
    exit 1
fi

# Step 3: Build complete
log_header "Build Complete"

log_success "🎉 Frontend built successfully!"
echo ""
log_info "📊 Build Summary:"
echo "   • Environment: ${ENVIRONMENT}"
echo "   • Build output: src/frontend/dist/"
echo "   • Ready for deployment"
echo ""

log_info "🚀 Deployment Options:"
echo "   1. AWS Amplify: cd src/frontend && npm run deploy:amplify"
echo "   2. Netlify: Drag and drop the dist/ folder to netlify.com"
echo "   3. Vercel: Connect your GitHub repo to vercel.com"
echo "   4. Any static hosting service"
echo ""

log_info "📁 Built files location:"
echo "   ${PROJECT_ROOT}/src/frontend/dist/"

cd "${PROJECT_ROOT}"