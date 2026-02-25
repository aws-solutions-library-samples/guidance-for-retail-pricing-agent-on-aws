#!/bin/bash
##
# @fileoverview Test script for configuration validation in CDK app.
# 
# Tests various configuration scenarios to verify validation logic:
# - Valid configuration (should succeed)
# - Invalid account format (should fail)
# - Invalid region format (should fail)
# - Missing required keys (should fail)
##

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/src/backend"
CONFIG_DIR="$BACKEND_DIR/config"

echo "🧪 Testing CDK Configuration Validation"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local config_file="$2"
    local should_pass="$3"
    
    echo "Test: $test_name"
    
    # Run CDK synth with the test config
    if npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1; then
        if [ "$should_pass" = "true" ]; then
            echo -e "${GREEN}✓ PASS${NC} - Validation succeeded as expected"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAIL${NC} - Validation should have failed but succeeded"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        if [ "$should_pass" = "false" ]; then
            echo -e "${GREEN}✓ PASS${NC} - Validation failed as expected"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAIL${NC} - Validation should have succeeded but failed"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
    echo ""
}

# Backup original dev.json
if [ -f "$CONFIG_DIR/dev.json" ]; then
    cp "$CONFIG_DIR/dev.json" "$CONFIG_DIR/dev.json.backup"
fi

# Test 1: Valid configuration (using existing dev.json)
echo "Test 1: Valid Configuration"
echo "----------------------------"
if (cd "$BACKEND_DIR" && npx cdk synth --context environment=dev --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${GREEN}✓ PASS${NC} - Valid configuration accepted"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} - Valid configuration rejected"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 2: Invalid account format (11 digits)
echo "Test 2: Invalid Account Format (11 digits)"
echo "-------------------------------------------"
cat > "$CONFIG_DIR/test.json" << 'EOF'
{
  "environment": "test",
  "aws": {
    "account": "12345678901",
    "region": "us-east-1"
  },
  "agentCore": {
    "region": "us-east-1",
    "codeBucket": "test-bucket",
    "agents": {
      "demandForecast": "test-agent-1",
      "competitiveAnalysis": "test-agent-2",
      "marginAnalysis": "test-agent-3"
    }
  }
}
EOF

if (cd "$BACKEND_DIR" && npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${RED}✗ FAIL${NC} - Invalid account format accepted"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - Invalid account format rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Test 3: Invalid account format (13 digits)
echo "Test 3: Invalid Account Format (13 digits)"
echo "-------------------------------------------"
cat > "$CONFIG_DIR/test.json" << 'EOF'
{
  "environment": "test",
  "aws": {
    "account": "1234567890123",
    "region": "us-east-1"
  },
  "agentCore": {
    "region": "us-east-1",
    "codeBucket": "test-bucket",
    "agents": {
      "demandForecast": "test-agent-1",
      "competitiveAnalysis": "test-agent-2",
      "marginAnalysis": "test-agent-3"
    }
  }
}
EOF

if (cd "$BACKEND_DIR" && npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${RED}✗ FAIL${NC} - Invalid account format accepted"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - Invalid account format rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Test 4: Invalid region format
echo "Test 4: Invalid Region Format"
echo "------------------------------"
cat > "$CONFIG_DIR/test.json" << 'EOF'
{
  "environment": "test",
  "aws": {
    "account": "123456789012",
    "region": "invalid-region"
  },
  "agentCore": {
    "region": "us-east-1",
    "codeBucket": "test-bucket",
    "agents": {
      "demandForecast": "test-agent-1",
      "competitiveAnalysis": "test-agent-2",
      "marginAnalysis": "test-agent-3"
    }
  }
}
EOF

if (cd "$BACKEND_DIR" && npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${RED}✗ FAIL${NC} - Invalid region format accepted"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - Invalid region format rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Test 5: Missing required key (aws.account)
echo "Test 5: Missing Required Key (aws.account)"
echo "-------------------------------------------"
cat > "$CONFIG_DIR/test.json" << 'EOF'
{
  "environment": "test",
  "aws": {
    "region": "us-east-1"
  },
  "agentCore": {
    "region": "us-east-1",
    "codeBucket": "test-bucket",
    "agents": {
      "demandForecast": "test-agent-1",
      "competitiveAnalysis": "test-agent-2",
      "marginAnalysis": "test-agent-3"
    }
  }
}
EOF

if (cd "$BACKEND_DIR" && npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${RED}✗ FAIL${NC} - Missing required key accepted"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - Missing required key rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Test 6: Missing agentCore section
echo "Test 6: Missing agentCore Section"
echo "----------------------------------"
cat > "$CONFIG_DIR/test.json" << 'EOF'
{
  "environment": "test",
  "aws": {
    "account": "123456789012",
    "region": "us-east-1"
  }
}
EOF

if (cd "$BACKEND_DIR" && npx cdk synth --context environment=test --app "node bin/app.js" > /dev/null 2>&1); then
    echo -e "${RED}✗ FAIL${NC} - Missing agentCore section accepted"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - Missing agentCore section rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Cleanup
rm -f "$CONFIG_DIR/test.json"
if [ -f "$CONFIG_DIR/dev.json.backup" ]; then
    mv "$CONFIG_DIR/dev.json.backup" "$CONFIG_DIR/dev.json"
fi

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
