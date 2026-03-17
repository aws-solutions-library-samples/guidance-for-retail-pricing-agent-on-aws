# Retail Pricing Agent Orchestrator

An AI-powered retail pricing system that orchestrates multiple specialized agents to provide comprehensive pricing analysis and recommendations for power tool products.

## Overview

This system provides end-to-end pricing intelligence by combining:
- **AI Agent Orchestration**: Multiple specialized agents working together for comprehensive analysis
- **Demand Forecasting**: Historical sales data analysis with seasonality and trend detection
- **Competitive Intelligence**: Market analysis and competitor pricing insights
- **Margin Compliance**: Automated margin rule validation and compliance checking
- **Product Catalog Management**: Visual product browsing with tier-based organization
- **Real-time Dashboard**: Comprehensive pricing recommendations with drill-down capabilities

## Architecture

- **Frontend**: React TypeScript with CloudScape Design System and Katal UI components
- **Backend**: AWS serverless architecture (Lambda, API Gateway, DynamoDB, S3)
- **AI Agents**: Specialized pricing analysis agents with orchestration
- **ML Infrastructure**: SageMaker Canvas for demand forecasting (mandatory)
- **Authentication**: AWS Cognito

## Prerequisites

- **AWS Region**: default to `us-east-1` Nova Canvas is used to generate images for deployment. At time of writing Nova Canvas is only available in ap-northeast-1, eu-west-1, us-east-1.
- **Node.js**: Version 18 or higher
- **AWS CLI**: Configured with appropriate credentials
- **AWS CDK**: Will be installed automatically during setup

## Quick Start

### Option 1: Cross-Platform Setup (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd retail-pricing-generator

# Run the cross-platform setup script
npm run setup
```

### Option 2: Platform-Specific Setup

#### macOS/Linux
```bash
npm run setup:bash
```

#### Windows (PowerShell)
```powershell
npm run setup:powershell
```

### Option 3: Manual Setup

If the automated scripts don't work, you can set up manually:

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd src/frontend
npm install
cd ../..

# Install backend dependencies
cd src/backend
npm install
cd ../..

# Install AWS CDK globally (if not already installed)
npm install -g aws-cdk
```

## Development

### Frontend Development

```bash
# Start the development server
npm run dev:frontend

# Build for production
npm run build:frontend

# Run tests
npm run test:frontend

# Type checking
npm run type-check:frontend
```

The frontend will be available at `http://localhost:3000`

### Backend Development

```bash
# Bootstrap CDK (first time only)
cd src/backend
npm run bootstrap

# Deploy to development environment
npm run deploy:backend:dev

# Deploy to production environment
npm run deploy:backend:prod

# Run tests
npm run test:backend

# Type checking
npm run type-check:backend
```

### Running All Tests

```bash
# Run all tests (frontend + backend)
npm run test:all

# Run all linting
npm run lint:all

# Run all type checking
npm run type-check:all
```

## Project Structure

```
retail-pricing-generator/
├── src/
│   ├── frontend/        # React TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/  # React components
│   │   │   ├── pages/       # Page components
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── services/    # API service calls
│   │   │   ├── types/       # TypeScript type definitions
│   │   │   ├── utils/       # Utility functions
│   │   │   └── styles/      # CSS/styling files
│   │   ├── public/          # Static assets
│   │   └── tests/           # Frontend tests
│   ├── backend/         # AWS CDK backend
│   │   ├── lib/
│   │   │   ├── stacks/      # CDK stack definitions
│   │   │   ├── constructs/  # Reusable CDK constructs
│   │   │   ├── lambdas/     # Lambda function code
│   │   │   └── agents/      # AI agent implementations
│   │   ├── config/          # Environment configurations
│   │   └── tests/           # Backend tests
│   └── shared/          # Shared types and utilities
├── docs/                # Documentation
├── scripts/             # Build and deployment scripts
└── .kiro/               # Kiro AI assistant configuration
    ├── specs/           # Feature specifications
    └── steering/        # AI guidance documents
```

## Features

The system includes 8 core features (see `.kiro/specs/backlog.md` for implementation status):

1. **Product Catalog Management** - Visual product catalog with filtering
2. **User Authentication** - AWS Cognito-based secure access
3. **Demand-Based Pricing Analysis** - AI agent analyzing demand patterns
4. **Competitive Intelligence** - Market analysis and competitor insights
5. **Margin Rules & Compliance** - Automated margin validation
6. **Multi-Agent Orchestration** - Coordinated AI agents
7. **Pricing Dashboard** - Real-time results visualization
8. **Data Management** - Secure S3/DynamoDB storage

## Configuration

### Environment Configuration

The system supports multiple environments through configuration files:

- `src/backend/config/dev.json` - Development environment
- `src/backend/config/prod.json` - Production environment
- `src/backend/config/local.json.template` - Template for local development

### SageMaker Canvas Configuration

SageMaker Canvas is **mandatory infrastructure** and will always be deployed. Configuration options include:

```json
{
  "sageMakerCanvas": {
    "domainNamePrefix": "pricing-canvas-dev",
    "enableVpc": true,
    "vpcCidr": "10.0.0.0/16"
  }
}
```

**Note**: The `enabled` field is deprecated and ignored if present. SageMaker Canvas infrastructure is always created during CDK deployment. Use deployment script flags (`--skip-sagemaker`, `--sagemaker-only`) to control data loading operations only.

### AWS Services Used

- **API Gateway**: REST API endpoints
- **Lambda**: Serverless compute for agents
- **DynamoDB**: NoSQL database for pricing data
- **S3**: Object storage for product data and assets
- **SageMaker Canvas**: ML model training for demand forecasting (mandatory infrastructure)
- **Cognito**: User authentication and authorization
- **Bedrock**: AI model access for agents
- **CloudWatch**: Monitoring and logging

### SageMaker Canvas Infrastructure

**SageMaker Canvas is mandatory infrastructure** that is always deployed with the CDK stack. It provides:

- **Demand Forecasting**: No-code/low-code ML model training for sales predictions
- **Two-Bucket Architecture**: Separate S3 buckets for training data and model outputs
  - **Training Data Bucket**: Stores raw and processed training data with long-term retention
  - **Model Output Bucket**: Stores trained model artifacts and predictions
- **AWS Best Practices**: Follows recommended patterns for ML workflows with better lifecycle management and security

**Important**: The two-bucket structure is designed for optimal ML operations:
- Different retention policies for training data vs. model outputs
- Separate IAM policies for read-heavy training data vs. write-heavy outputs
- Better audit trails and compliance for data governance
- Negligible cost difference (< $0.01/month) with significant operational benefits

#### SageMaker Canvas Bucket Structure

**Training Data Bucket** (`pricing-canvas-{env}-training-data-{account}`):
```
training_data/
├── powertools/
│   ├── raw_data/          # Original sales data
│   ├── processed_data/    # Cleaned and transformed data
│   ├── validation_data/   # Data for model validation
│   └── data_quality_reports/
├── kitchen/
├── apparel/
└── footwear/
```

**Model Output Bucket** (`pricing-canvas-{env}-model-outputs-{account}`):
```
models/
├── powertools/
│   ├── model_artifacts/   # Trained model files
│   └── predictions/       # Forecast results
├── kitchen/
├── apparel/
└── footwear/
```

This separation follows AWS best practices for ML workflows and provides:
- **Long-term retention** for training data (needed for model retraining)
- **Flexible lifecycle policies** for model outputs (can be archived more aggressively)
- **Granular access control** with different IAM policies per bucket
- **Clear audit trails** for compliance and data governance

## Development Guidelines

This project follows strict development standards:

- **TypeScript**: Strict mode enabled with comprehensive type checking
- **Documentation**: All code must have JSDoc comments
- **Testing**: Unit and integration tests required
- **Linting**: ESLint with strict rules
- **Architecture**: AWS Well-Architected Framework principles

See `.kiro/steering/` directory for detailed development guidelines.

## Deployment

### Understanding Deployment vs. Data Loading

The deployment process has two distinct phases:

1. **Infrastructure Deployment** (Always Runs)
   - Deploys all AWS resources including Lambda functions, DynamoDB tables, S3 buckets, and SageMaker Canvas
   - SageMaker Canvas infrastructure is **always deployed** regardless of flags
   - Creates the two-bucket structure for ML operations

2. **Data Loading** (Optional, Controlled by Flags)
   - Loads sample training data into SageMaker Canvas buckets
   - Controlled by deployment script flags (`--skip-sagemaker`, `--sagemaker-only`)
   - Can be run separately after infrastructure deployment

### Deployment Commands

#### Full Deployment (Infrastructure + Data)

```bash
# Development environment - deploys infrastructure and loads data
npm run deploy:backend:dev

# Production environment - deploys infrastructure and loads data
npm run deploy:backend:prod
```

#### Infrastructure Only (Skip Data Loading)

```bash
# Deploy infrastructure but skip loading SageMaker Canvas training data
cd src/backend
./scripts/deploy-complete.sh dev --skip-sagemaker
```

**Note**: The `--skip-sagemaker` flag only skips data loading. SageMaker Canvas infrastructure (buckets, domain, etc.) is still deployed.

#### Data Loading Only (After Infrastructure Exists)

```bash
# Load training data into existing SageMaker Canvas infrastructure
cd src/backend
./scripts/deploy-complete.sh dev --sagemaker-only
```

**Note**: The `--sagemaker-only` flag only runs data loading operations. Infrastructure must already be deployed.

### Deployment Script Flags

| Flag | Infrastructure Deployment | Data Loading | Use Case |
|------|--------------------------|--------------|----------|
| (none) | ✅ Yes | ✅ Yes | Full deployment with data |
| `--skip-sagemaker` | ✅ Yes | ❌ No | Deploy infrastructure without loading training data |
| `--sagemaker-only` | ❌ No | ✅ Yes | Load training data into existing infrastructure |

### First-Time Deployment

For first-time deployment, follow these steps:

```bash
# 1. Bootstrap CDK (first time only)
cd src/backend
npm run bootstrap

# 2. Deploy infrastructure and load data
npm run deploy:backend:dev

# Or deploy infrastructure only, then load data separately:
# ./scripts/deploy-complete.sh dev --skip-sagemaker
# ./scripts/deploy-complete.sh dev --sagemaker-only
```

## Troubleshooting

### Common Issues

1. **Node.js Version**: Ensure you're using Node.js 18+
2. **AWS Credentials**: Run `aws configure` to set up credentials
3. **CDK Bootstrap**: Run `cdk bootstrap` in the backend directory
4. **Permissions**: Ensure your AWS user has appropriate permissions

### SageMaker Canvas Specific Issues

1. **"SageMaker Canvas is optional" confusion**
   - **Solution**: SageMaker Canvas is now mandatory infrastructure. The `enabled` config field is deprecated.
   - Infrastructure is always deployed; use `--skip-sagemaker` flag only to skip data loading.

2. **Deployment script flags not working as expected**
   - **`--skip-sagemaker`**: Skips data loading only, NOT infrastructure deployment
   - **`--sagemaker-only`**: Runs data loading only, requires infrastructure to exist
   - Infrastructure deployment always includes SageMaker Canvas resources

3. **Missing SageMaker Canvas buckets**
   - **Solution**: Ensure CDK deployment completed successfully
   - Check CloudFormation outputs for bucket names
   - Verify no deployment errors in CloudWatch logs

4. **Training data not loading**
   - **Solution**: Run data loading separately: `./scripts/deploy-complete.sh dev --sagemaker-only`
   - Verify bucket permissions and IAM roles
   - Check that infrastructure was deployed first

### Getting Help

- Check the `docs/` directory for additional documentation
- Review the `.kiro/specs/` directory for feature specifications
- Consult the `.kiro/steering/` directory for development guidelines

## Contributing

1. Follow the development guidelines in `.kiro/steering/`
2. Update feature status in `.kiro/specs/backlog.md`
3. Ensure all tests pass before submitting changes
4. Include comprehensive documentation for new features

## License

This project is proprietary and confidential.
