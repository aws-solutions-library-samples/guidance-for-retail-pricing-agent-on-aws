#!/bin/bash

###############################################################################
# Hardcoded Configuration Detection Script
#
# Purpose: Scans the codebase for hardcoded configuration values that should
#          be externalized to configuration files.
#
# Usage: ./scripts/detect-hardcoded-config.sh
#
# Exit Codes:
#   0 - No hardcoded configuration found
#   1 - Hardcoded configuration detected
#
# Requirements: 11.8
###############################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "=========================================="
echo "Hardcoded Configuration Detection"
echo "=========================================="
echo ""

###############################################################################
# Check for hardcoded AWS account IDs (12-digit numbers)
###############################################################################
echo "Checking for hardcoded AWS account IDs..."

# Search for 12-digit numbers in TypeScript/JavaScript files
# Exclude:
#   - Lines with "// OK:" comment (explicitly approved)
#   - Lines with "example" (documentation examples)
#   - Test files with mock data
#   - node_modules and other dependencies
ACCOUNT_MATCHES=$(grep -rn '\b[0-9]\{12\}\b' \
  src/backend/lib/stacks/ \
  src/backend/lib/constructs/ \
  src/backend/lib/lambdas/ \
  src/backend/bin/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v '# OK:' | \
  grep -v 'example' | \
  grep -v 'Example' | \
  grep -v 'EXAMPLE' | \
  grep -v '.test.' | \
  grep -v '.spec.' | \
  grep -v 'mock' | \
  grep -v 'Mock' || true)

if [ -n "$ACCOUNT_MATCHES" ]; then
    echo -e "${RED}❌ Found hardcoded AWS account IDs:${NC}"
    echo "$ACCOUNT_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Replace hardcoded account IDs with configuration references"
    echo "  - Use config.aws.account from configuration files"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No hardcoded AWS account IDs found${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded AWS regions in TypeScript/JavaScript
###############################################################################
echo "Checking for hardcoded AWS regions in code..."

# Search for region patterns like us-east-1, eu-west-1, etc.
# Exclude:
#   - Lines with "// OK:" comment
#   - Documentation and examples
#   - Test files
#   - Comments explaining regions
REGION_MATCHES=$(grep -rn "region.*['\"][a-z]\{2\}-[a-z]\+-[0-9]['\"]" \
  src/backend/lib/stacks/ \
  src/backend/lib/constructs/ \
  src/backend/lib/lambdas/ \
  src/backend/bin/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v '# OK:' | \
  grep -v 'example' | \
  grep -v 'Example' | \
  grep -v 'EXAMPLE' | \
  grep -v '.test.' | \
  grep -v '.spec.' | \
  grep -v 'comment' | \
  grep -v 'Comment' | \
  grep -v '//' || true)

if [ -n "$REGION_MATCHES" ]; then
    echo -e "${RED}❌ Found hardcoded AWS regions in code:${NC}"
    echo "$REGION_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Replace hardcoded regions with configuration references"
    echo "  - Use config.aws.region from configuration files"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No hardcoded AWS regions found in code${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded regions in bash scripts
###############################################################################
echo "Checking for hardcoded regions in scripts..."

# Search for REGION="us-east-1" patterns in bash scripts # OK: This is a comment explaining the pattern
SCRIPT_REGION_MATCHES=$(grep -rn 'REGION="[a-z]\{2\}-[a-z]\+-[0-9]"' \
  src/backend/scripts/ \
  scripts/ \
  2>/dev/null | \
  grep -v '# OK:' | \
  grep -v 'example' | \
  grep -v 'Example' || true)

if [ -n "$SCRIPT_REGION_MATCHES" ]; then
    echo -e "${RED}❌ Found hardcoded regions in scripts:${NC}"
    echo "$SCRIPT_REGION_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Replace with: REGION=\$(jq -r '.aws.region' \"\$CONFIG_FILE\")"
    echo "  - Ensure scripts read from configuration files"
    echo "  - If this is intentional, add '# OK:' comment to the line"
    echo ""
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No hardcoded regions in scripts${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded S3 bucket names
###############################################################################
echo "Checking for hardcoded S3 bucket names..."

# Search for bucket name patterns without environment variables
# Look for patterns like: bucket: "my-bucket-name"
BUCKET_MATCHES=$(grep -rn "bucket.*['\"][a-z0-9-]\+['\"]" \
  src/backend/lib/stacks/ \
  src/backend/lib/constructs/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v 'bucketName' | \
  grep -v 'process.env' | \
  grep -v '\${' | \
  grep -v 'config\.' | \
  grep -v 'props\.' | \
  grep -v 'example' | \
  grep -v '.test.' | \
  grep -v 'Bucket.fromBucket' || true)

if [ -n "$BUCKET_MATCHES" ]; then
    echo -e "${YELLOW}⚠️  Found potential hardcoded S3 bucket names:${NC}"
    echo "$BUCKET_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Verify these bucket names are from configuration"
    echo "  - Use config.storage.bucketName or similar"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No hardcoded S3 bucket names found${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded DynamoDB table names
###############################################################################
echo "Checking for hardcoded DynamoDB table names..."

# Search for table name patterns without environment variables
TABLE_MATCHES=$(grep -rn "tableName.*['\"][A-Za-z0-9-]\+['\"]" \
  src/backend/lib/stacks/ \
  src/backend/lib/constructs/ \
  src/backend/lib/lambdas/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v 'process.env' | \
  grep -v '\${' | \
  grep -v 'config\.' | \
  grep -v 'props\.' | \
  grep -v 'example' | \
  grep -v '.test.' | \
  grep -v 'Table.fromTable' || true)

if [ -n "$TABLE_MATCHES" ]; then
    echo -e "${YELLOW}⚠️  Found potential hardcoded DynamoDB table names:${NC}"
    echo "$TABLE_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Verify these table names are from configuration"
    echo "  - Use config.tableNames or environment variables"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No hardcoded DynamoDB table names found${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded ARNs with account IDs
###############################################################################
echo "Checking for hardcoded ARNs with account IDs..."

# Search for ARN patterns with embedded account IDs
ARN_MATCHES=$(grep -rn "arn:aws:[a-z0-9-]\+:[a-z0-9-]*:[0-9]\{12\}:" \
  src/backend/lib/stacks/ \
  src/backend/lib/constructs/ \
  src/backend/lib/lambdas/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v 'example' | \
  grep -v '.test.' || true)

if [ -n "$ARN_MATCHES" ]; then
    echo -e "${RED}❌ Found hardcoded ARNs with account IDs:${NC}"
    echo "$ARN_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Use CDK constructs to reference resources instead of ARNs"
    echo "  - Use Stack.formatArn() with account from configuration"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No hardcoded ARNs with account IDs found${NC}"
fi

echo ""

###############################################################################
# Check for hardcoded endpoint URLs with regions
###############################################################################
echo "Checking for hardcoded endpoint URLs..."

# Search for AWS service endpoint URLs with embedded regions
ENDPOINT_MATCHES=$(grep -rn "https://[a-z0-9-]\+\.[a-z]\{2\}-[a-z]\+-[0-9]\.amazonaws\.com" \
  src/backend/lib/lambdas/ \
  src/backend/lib/stacks/ \
  2>/dev/null | \
  grep -v '// OK:' | \
  grep -v 'example' | \
  grep -v '.test.' || true)

if [ -n "$ENDPOINT_MATCHES" ]; then
    echo -e "${YELLOW}⚠️  Found potential hardcoded endpoint URLs:${NC}"
    echo "$ENDPOINT_MATCHES"
    echo ""
    echo "Resolution:"
    echo "  - Use AWS SDK with region from configuration"
    echo "  - Let SDK construct endpoints automatically"
    echo "  - If this is intentional, add '// OK:' comment to the line"
    echo ""
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No hardcoded endpoint URLs found${NC}"
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo "=========================================="
echo "Detection Summary"
echo "=========================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ No hardcoded configuration values detected${NC}"
    echo ""
    echo "All configuration appears to be properly externalized."
    exit 0
else
    if [ $ERRORS -gt 0 ]; then
        echo -e "${RED}❌ Found $ERRORS categories of hardcoded configuration (ERRORS)${NC}"
    fi
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Found $WARNINGS categories of potential issues (WARNINGS)${NC}"
    fi
    echo ""
    echo "Please review the findings above and:"
    echo "  1. Replace hardcoded values with configuration references"
    echo "  2. Add '// OK:' or '# OK:' comments for intentional hardcoded values"
    echo "  3. Re-run this script to verify fixes"
    echo ""
    
    if [ $ERRORS -gt 0 ]; then
        exit 1
    else
        # Warnings only - exit with success but inform user
        echo "Note: Warnings do not fail the build, but should be reviewed."
        exit 0
    fi
fi
