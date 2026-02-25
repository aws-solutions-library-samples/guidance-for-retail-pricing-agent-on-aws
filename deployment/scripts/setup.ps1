# PowerShell setup script for Retail Pricing Generator
# This script initializes the development environment on Windows

Write-Host "🚀 Setting up Retail Pricing Generator..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
    
    # Check Node.js version (extract major version number)
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 18) {
        Write-Host "❌ Node.js version 18+ is required. Current version: $nodeVersion" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ and try again." -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Install root dependencies
Write-Host "📦 Installing root dependencies..." -ForegroundColor Blue
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install root dependencies" -ForegroundColor Red
    exit 1
}

# Install frontend dependencies
Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Blue
Set-Location src/frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location ../..

# Install backend dependencies
Write-Host "📦 Installing backend dependencies..." -ForegroundColor Blue
Set-Location src/backend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location ../..

# Check if AWS CDK is installed globally
try {
    $cdkVersion = cdk --version
    Write-Host "✅ AWS CDK version: $cdkVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  AWS CDK is not installed globally. Installing..." -ForegroundColor Yellow
    npm install -g aws-cdk
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install AWS CDK globally" -ForegroundColor Red
        exit 1
    }
    $cdkVersion = cdk --version
    Write-Host "✅ AWS CDK version: $cdkVersion" -ForegroundColor Green
}

# Create initial directory structure
Write-Host "📁 Creating directory structure..." -ForegroundColor Blue

$directories = @(
    "src/frontend/src/components",
    "src/frontend/src/pages", 
    "src/frontend/src/hooks",
    "src/frontend/src/services",
    "src/frontend/src/types",
    "src/frontend/src/utils",
    "src/frontend/src/styles",
    "src/frontend/public",
    "src/frontend/tests",
    "src/backend/lib/stacks",
    "src/backend/lib/constructs",
    "src/backend/lib/lambdas",
    "src/backend/lib/agents",
    "src/backend/tests",
    "src/shared/types",
    "src/shared/utils"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure AWS credentials: aws configure" -ForegroundColor White
Write-Host "2. Bootstrap CDK: cd src/backend && npm run bootstrap" -ForegroundColor White
Write-Host "3. Start frontend development: npm run dev:frontend" -ForegroundColor White
Write-Host "4. Deploy backend (dev): npm run deploy:backend:dev" -ForegroundColor White