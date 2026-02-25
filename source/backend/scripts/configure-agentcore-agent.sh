#!/bin/bash

###############################################################################
# Configure AgentCore Agent using CLI
#
# This script uses agentcore configure to properly set up agent configuration
# instead of relying solely on YAML files
#
# Usage:
#   ./configure-agentcore-agent.sh <agent-name> <environment>
#
# Examples:
#   ./configure-agentcore-agent.sh demand-forecast dev
#   ./configure-agentcore-agent.sh competitive-analysis prod
###############################################################################

set -e

AGENT_NAME=${1:-demand-forecast}
ENVIRONMENT=${2:-dev}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
AGENT_DIR="$BACKEND_DIR/lib/lambdas/agentcore-agents/${AGENT_NAME}"
CONFIG_FILE="$BACKEND_DIR/config/${ENVIRONMENT}.json"

echo "Configuring agent: $AGENT_NAME"
echo "Environment: $ENVIRONMENT"
echo "Agent directory: $AGENT_DIR"

# Check if config file exists
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Load configuration from JSON file
REGION=$(jq -r '.aws.region // empty' "$CONFIG_FILE")
CODE_BUCKET=$(jq -r '.agentCore.codeBucket // empty' "$CONFIG_FILE")

if [[ -z "$REGION" ]]; then
    echo "ERROR: AWS region not found in configuration file"
    exit 1
fi

if [[ -z "$CODE_BUCKET" ]]; then
    echo "ERROR: AgentCore code bucket not found in configuration file"
    exit 1
fi

echo "Region: $REGION"
echo "Code Bucket: $CODE_BUCKET"

# Navigate to agent directory
cd "$AGENT_DIR" || exit 1

# Configure agent using CLI with values from configuration
agentcore configure \
  --name "$AGENT_NAME" \
  --entrypoint main.py \
  --deployment-type direct_code_deploy \
  --runtime PYTHON_3_11 \
  --region "$REGION" \
  --execution-role auto \
  --idle-timeout 300 \
  --max-lifetime 28800 \
  --s3 "$CODE_BUCKET" \
  --non-interactive

echo "✓ Agent configured successfully"
echo ""
echo "Configuration file created/updated:"
ls -la .bedrock_agentcore.yaml

echo ""
echo "To deploy, run:"
echo "  agentcore launch --agent $AGENT_NAME"
