#!/bin/bash

/**
 * @fileoverview Test runner script for consolidated test architecture.
 * 
 * Runs all tests using the new consolidated test structure with separate
 * frontend and backend test configurations in the tests/ directory.
 */

set -e

echo "🧪 Running Consolidated Test Suite"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if tests directory exists
if [ ! -d "tests" ]; then
    print_error "Tests directory not found. Please ensure the test restructuring is complete."
    exit 1
fi

# Track test results
FRONTEND_RESULT=""
BACKEND_RESULT=""

print_status "Starting test execution with consolidated test structure..."

# Frontend Tests
echo ""
print_status "Running Frontend Tests..."
echo "=========================="

print_status "Testing: Static Category Utilities, Apollo Client, Hooks, and Integration Tests"
if jest --config tests/frontend.jest.config.js --silent; then
    FRONTEND_RESULT="✅ Frontend Tests"
    print_success "All frontend tests passed"
else
    FRONTEND_RESULT="❌ Frontend Tests"
    print_error "Some frontend tests failed"
fi

# Backend Tests
echo ""
print_status "Running Backend Tests..."
echo "========================"

print_status "Testing: GraphQL Resolvers, Lambda Functions, and Integration Tests"
if jest --config tests/backend.jest.config.js --silent; then
    BACKEND_RESULT="✅ Backend Tests"
    print_success "All backend tests passed"
else
    BACKEND_RESULT="❌ Backend Tests"
    print_error "Some backend tests failed"
fi

# Generate Test Report
echo ""
echo "🔍 Test Results Summary"
echo "======================"

echo ""
echo "Test Results:"
echo "-------------"
echo "  $FRONTEND_RESULT"
echo "  $BACKEND_RESULT"

# Count passed/failed tests
TOTAL_TESTS=2
PASSED_TESTS=0
FAILED_TESTS=0

if [[ $FRONTEND_RESULT == *"✅"* ]]; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi

if [[ $BACKEND_RESULT == *"✅"* ]]; then
    ((PASSED_TESTS++))
else
    ((FAILED_TESTS++))
fi

echo ""
echo "Overall Results:"
echo "---------------"
echo "Total Test Suites: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    print_success "🎉 All tests passed! Consolidated test architecture is working correctly."
    echo ""
    echo "✨ Test Coverage Summary:"
    echo "  • Frontend: Static utilities, GraphQL client, hooks, and integration tests"
    echo "  • Backend: GraphQL resolvers, Lambda functions, and unit tests"
    echo "  • Architecture: Consolidated test structure with separate configurations"
    exit 0
else
    print_error "❌ $FAILED_TESTS test suite(s) failed. Please review the output above."
    echo ""
    echo "🔧 Troubleshooting Tips:"
    echo "  • Check that all dependencies are installed (npm install)"
    echo "  • Verify test files are in the correct locations under tests/"
    echo "  • Ensure Jest configurations are properly set up"
    echo "  • Check import paths in test files"
    echo "  • Review test setup files for proper mocking"
    exit 1
fi