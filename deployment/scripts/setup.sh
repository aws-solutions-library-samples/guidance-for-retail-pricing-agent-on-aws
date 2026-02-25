#!/bin/bash

# Setup script for Retail Pricing Generator
# This script initializes the development environment

set -e

echo "🚀 Setting up Retail Pricing Generator..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd src/frontend
npm install
cd ../..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd src/backend
npm install
cd ../..

# Install shared dependencies
echo "📦 Installing shared dependencies..."
cd src/shared
npm install
cd ../..

# Check if AWS CDK is installed globally
if ! command -v cdk &> /dev/null; then
    echo "⚠️  AWS CDK is not installed globally. Installing..."
    npm install -g aws-cdk
fi

echo "✅ AWS CDK version: $(cdk --version)"

# Create initial directory structure
echo "📁 Creating directory structure..."
mkdir -p src/frontend/src/{components,pages,hooks,services,types,utils,styles}
mkdir -p src/frontend/public
mkdir -p src/frontend/tests
mkdir -p src/backend/lib/{stacks,constructs,lambdas,agents}
mkdir -p src/backend/tests
mkdir -p src/shared/{types,utils}

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure AWS credentials: aws configure"
echo "2. Bootstrap CDK: cd src/backend && npm run bootstrap"
echo "3. Start frontend development: npm run dev:frontend"
echo "4. Deploy backend (dev): npm run deploy:backend:dev"