#!/bin/bash

###############################################################################
# Amplify Setup Verification Script
#
# Verifies that all required Amplify configuration files exist and are valid.
#
# Usage:
#   ./scripts/verify-amplify-setup.sh
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Amplify Setup Verification${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

cd "$FRONTEND_DIR"

# Track overall status
ALL_CHECKS_PASSED=true

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description: ${BLUE}$file${NC}"
        return 0
    else
        echo -e "${RED}✗${NC} $description: ${RED}$file (missing)${NC}"
        ALL_CHECKS_PASSED=false
        return 1
    fi
}

# Function to check directory exists
check_dir() {
    local dir=$1
    local description=$2
    
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description: ${BLUE}$dir${NC}"
        return 0
    else
        echo -e "${RED}✗${NC} $description: ${RED}$dir (missing)${NC}"
        ALL_CHECKS_PASSED=false
        return 1
    fi
}

# Function to check JSON file is valid
check_json() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        if jq empty "$file" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $description: ${BLUE}$file${NC} (valid JSON)"
            return 0
        else
            echo -e "${RED}✗${NC} $description: ${RED}$file (invalid JSON)${NC}"
            ALL_CHECKS_PASSED=false
            return 1
        fi
    else
        echo -e "${RED}✗${NC} $description: ${RED}$file (missing)${NC}"
        ALL_CHECKS_PASSED=false
        return 1
    fi
}

echo -e "${YELLOW}Checking core configuration files...${NC}"
echo ""

# Check .amplifyrc
check_json ".amplifyrc" ".amplifyrc"

# Check amplify/.config files
check_json "amplify/.config/project-config.json" "Project config"
check_json "amplify/.config/local-aws-info.json" "AWS info"
check_json "amplify/.config/local-env-info.json" "Environment info"

echo ""
echo -e "${YELLOW}Checking backend configuration...${NC}"
echo ""

# Check backend files
check_json "amplify/backend-config.json" "Backend config"
check_json "amplify/team-provider-info.json" "Team provider info"
check_json "amplify/backend/amplify-meta.json" "Backend metadata"

echo ""
echo -e "${YELLOW}Checking hosting configuration...${NC}"
echo ""

# Check hosting backend structure
check_dir "amplify/backend/hosting/amplifyhosting" "Hosting backend directory"
check_json "amplify/backend/hosting/amplifyhosting/parameters.json" "Hosting parameters"
check_json "amplify/backend/hosting/amplifyhosting/amplify-meta.json" "Hosting metadata"

echo ""
echo -e "${YELLOW}Checking #current-cloud-backend...${NC}"
echo ""

# Check #current-cloud-backend
check_dir "amplify/#current-cloud-backend" "#current-cloud-backend directory"
check_json "amplify/#current-cloud-backend/backend-config.json" "Cloud backend config"
check_json "amplify/#current-cloud-backend/amplify-meta.json" "Cloud backend metadata"
check_dir "amplify/#current-cloud-backend/hosting/amplifyhosting" "Cloud hosting directory"
check_json "amplify/#current-cloud-backend/hosting/amplifyhosting/parameters.json" "Cloud hosting parameters"
check_json "amplify/#current-cloud-backend/hosting/amplifyhosting/amplify-meta.json" "Cloud hosting metadata"

echo ""
echo -e "${YELLOW}Checking App ID configuration...${NC}"
echo ""

# Check App ID in .amplifyrc
if [ -f ".amplifyrc" ]; then
    APP_ID=$(jq -r '.appId // empty' .amplifyrc)
    if [ -n "$APP_ID" ]; then
        echo -e "${GREEN}✓${NC} App ID in .amplifyrc: ${CYAN}$APP_ID${NC}"
    else
        echo -e "${RED}✗${NC} App ID missing in .amplifyrc"
        ALL_CHECKS_PASSED=false
    fi
fi

# Check App ID in team-provider-info.json
if [ -f "amplify/team-provider-info.json" ]; then
    ENV_NAME=$(jq -r '.envName // "local"' .amplifyrc 2>/dev/null)
    TEAM_APP_ID=$(jq -r ".[\"$ENV_NAME\"].categories.hosting.amplifyhosting.appId // empty" amplify/team-provider-info.json)
    if [ -n "$TEAM_APP_ID" ]; then
        echo -e "${GREEN}✓${NC} App ID in team-provider-info.json: ${CYAN}$TEAM_APP_ID${NC}"
    else
        echo -e "${RED}✗${NC} App ID missing in team-provider-info.json"
        ALL_CHECKS_PASSED=false
    fi
fi

echo ""
echo -e "${YELLOW}Checking build output...${NC}"
echo ""

# Check if dist directory exists
if [ -d "dist" ]; then
    echo -e "${GREEN}✓${NC} Build output directory exists: ${BLUE}dist/${NC}"
    
    # Check if dist has files
    FILE_COUNT=$(find dist -type f | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Build output contains $FILE_COUNT files"
    else
        echo -e "${YELLOW}⚠${NC}  Build output is empty (run ${CYAN}npm run build${NC})"
    fi
else
    echo -e "${YELLOW}⚠${NC}  Build output not found (run ${CYAN}npm run build${NC})"
fi

echo ""
echo -e "${CYAN}========================================${NC}"

if [ "$ALL_CHECKS_PASSED" = true ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo -e "${BLUE}Your Amplify setup is complete.${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Build: ${CYAN}npm run build${NC}"
    echo -e "  2. Publish: ${CYAN}amplify publish${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo ""
    echo -e "${YELLOW}To fix the issues:${NC}"
    echo -e "  1. Remove existing config: ${CYAN}rm -rf amplify .amplifyrc${NC}"
    echo -e "  2. Re-run setup: ${CYAN}npm run setup:amplify${NC}"
    echo -e "  3. Verify again: ${CYAN}npm run verify:amplify${NC}"
    echo ""
    exit 1
fi
