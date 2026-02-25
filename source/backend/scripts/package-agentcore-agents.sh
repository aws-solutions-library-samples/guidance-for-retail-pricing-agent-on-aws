#!/bin/bash

###############################################################################
# Package AgentCore Runtime Agents
#
# This script packages the three pricing analysis agents for deployment to
# Amazon Bedrock AgentCore Runtime. Each agent is packaged as a .zip file
# containing:
# - Python entry point (main.py)
# - JavaScript agent implementation
# - Python dependencies (from requirements.txt)
# - Node.js dependencies (from package.json)
#
# Requirements: FR-1, FR-1.1
#
# Usage:
#   ./scripts/package-agentcore-agents.sh
#
# Output:
#   dist/agents/demand-forecast-agent.zip
#   dist/agents/competitive-analysis-agent.zip
#   dist/agents/margin-analysis-agent.zip
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$BACKEND_DIR/lib/lambdas/agentcore-agents"
DIST_DIR="$BACKEND_DIR/dist/agents"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Packaging AgentCore Runtime Agents${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Create dist directory
mkdir -p "$DIST_DIR"

# Function to package an agent
package_agent() {
    local agent_name=$1
    local agent_dir="$AGENTS_DIR/$agent_name"
    local output_file="$DIST_DIR/${agent_name}-agent.zip"
    
    echo -e "${YELLOW}Packaging $agent_name agent...${NC}"
    
    # Check if agent directory exists
    if [ ! -d "$agent_dir" ]; then
        echo -e "${RED}ERROR: Agent directory not found: $agent_dir${NC}"
        return 1
    fi
    
    # Create temporary build directory
    local build_dir="$agent_dir/build"
    rm -rf "$build_dir"
    mkdir -p "$build_dir"
    
    # Copy Python entry point
    if [ -f "$agent_dir/main.py" ]; then
        cp "$agent_dir/main.py" "$build_dir/"
        echo "  ✓ Copied main.py"
    else
        echo -e "${RED}  ✗ main.py not found${NC}"
        return 1
    fi
    
    # Copy JavaScript agent implementation
    if [ -f "$agent_dir/${agent_name}-agent-runtime.js" ]; then
        cp "$agent_dir/${agent_name}-agent-runtime.js" "$build_dir/"
        echo "  ✓ Copied ${agent_name}-agent-runtime.js"
    else
        echo -e "${RED}  ✗ ${agent_name}-agent-runtime.js not found${NC}"
        return 1
    fi
    
    # Install Python dependencies
    if [ -f "$agent_dir/requirements.txt" ]; then
        echo "  → Installing Python dependencies..."
        pip install -r "$agent_dir/requirements.txt" -t "$build_dir" --quiet
        echo "  ✓ Python dependencies installed"
    else
        echo -e "${YELLOW}  ⚠ requirements.txt not found, skipping Python dependencies${NC}"
    fi
    
    # Install Node.js dependencies
    if [ -f "$agent_dir/package.json" ]; then
        echo "  → Installing Node.js dependencies..."
        cd "$agent_dir"
        npm install --production --silent
        cp -r node_modules "$build_dir/"
        echo "  ✓ Node.js dependencies installed"
    else
        echo -e "${YELLOW}  ⚠ package.json not found, skipping Node.js dependencies${NC}"
    fi
    
    # Copy existing agent implementation (if separate directory)
    local source_agent_dir="$BACKEND_DIR/lib/lambdas/${agent_name}-agent"
    if [ -d "$source_agent_dir" ]; then
        echo "  → Copying agent implementation from $source_agent_dir..."
        # Copy JavaScript files but exclude node_modules and test files
        find "$source_agent_dir" -name "*.js" -not -path "*/node_modules/*" -not -name "*.test.js" -exec cp {} "$build_dir/" \;
        echo "  ✓ Agent implementation copied"
    fi
    
    # Create zip file
    echo "  → Creating zip package..."
    cd "$build_dir"
    zip -r "$output_file" . -q
    cd "$BACKEND_DIR"
    
    # Get file size
    local file_size=$(du -h "$output_file" | cut -f1)
    
    # Clean up build directory
    rm -rf "$build_dir"
    
    echo -e "${GREEN}  ✓ Package created: $output_file ($file_size)${NC}"
    echo ""
    
    return 0
}

# Package each agent
echo "Starting agent packaging..."
echo ""

# Demand Forecast Agent
if package_agent "demand-forecast"; then
    echo -e "${GREEN}✓ Demand Forecast Agent packaged successfully${NC}"
else
    echo -e "${RED}✗ Failed to package Demand Forecast Agent${NC}"
    exit 1
fi

# Competitive Analysis Agent
if package_agent "competitive-analysis"; then
    echo -e "${GREEN}✓ Competitive Analysis Agent packaged successfully${NC}"
else
    echo -e "${RED}✗ Failed to package Competitive Analysis Agent${NC}"
    exit 1
fi

# Margin Analysis Agent
if package_agent "margin-analysis"; then
    echo -e "${GREEN}✓ Margin Analysis Agent packaged successfully${NC}"
else
    echo -e "${RED}✗ Failed to package Margin Analysis Agent${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All agents packaged successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Package location: $DIST_DIR"
echo ""
echo "Next steps:"
echo "  1. Upload packages to S3:"
echo "     aws s3 cp $DIST_DIR/ s3://YOUR-BUCKET/agents/ --recursive"
echo ""
echo "  2. Deploy agents using CDK:"
echo "     cd $BACKEND_DIR"
echo "     cdk deploy --context environment=dev"
echo ""
