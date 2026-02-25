# SageMaker Canvas Integration

## Overview

The SageMaker Canvas construct provides ML-based demand forecasting capabilities for the retail pricing system. It creates and manages SageMaker Canvas domains, user profiles, and associated infrastructure for training and deploying demand forecasting models.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                SageMaker Canvas Domain                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              User Profile                               │ │
│  │  ├─ Time Series Forecasting Enabled                    │ │
│  │  ├─ Model Training & Deployment                        │ │
│  │  └─ Forecast Generation                                │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Model Management Lambda                         │
│  ├─ Model Lifecycle Management                             │
│  ├─ Training Data Validation                               │
│  ├─ Performance Monitoring                                 │
│  └─ Automatic Retraining                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
┌───────────────────────┐   ┌───────────────────────┐
│ Training Data Bucket  │   │ Model Output Bucket   │
│ ├─ Historical sales   │   │ ├─ Trained models     │
│ ├─ Product data       │   │ ├─ Forecast results   │
│ └─ Category datasets  │   │ └─ Performance metrics│
└───────────────────────┘   └───────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DynamoDB                                  │
│  ├─ Model Metadata (PK: CANVAS_MODEL#modelName)           │
│  ├─ Training Status                                        │
│  ├─ Performance Metrics                                    │
│  └─ Model Registry                                         │
└─────────────────────────────────────────────────────────────┘
```

## Components

### SageMaker Canvas Domain
- **Purpose**: Provides the Canvas workspace environment
- **Configuration**: IAM-based authentication, time series forecasting enabled
- **Scaling**: Automatic scaling based on usage

### User Profile
- **Purpose**: Defines user access and permissions within Canvas
- **Role**: Pricing analyst profile with forecasting capabilities
- **Permissions**: Full access to training data and model outputs

### Training Data Bucket
- **Structure**: 
  ```
  s3://canvas-training-data-{env}/
  ├── training_data/
  │   ├── powertools/
  │   │   ├── historical_sales.csv
  │   │   └── product_features.csv
  │   ├── kitchen/
  │   ├── apparel/
  │   └── footwear/
  ```
- **Format**: CSV files with time series data
- **Lifecycle**: Automatic versioning and cleanup

### Model Output Bucket
- **Structure**:
  ```
  s3://canvas-model-outputs-{env}/
  ├── models/
  │   ├── demand-forecast-powertools-v1/
  │   │   ├── model_artifacts/
  │   │   └── performance_metrics.json
  ```
- **Lifecycle**: Automatic archival to Glacier after 30 days

### Model Manager Lambda
- **Functions**:
  - `ensureModelAvailability`: Check if trained model exists
  - `triggerModelTraining`: Start training for new models
  - `validateModelPerformance`: Check model accuracy and age
  - `getModelStatus`: Get current model status
  - `listModels`: List all available models

## Configuration

### Environment Variables

The construct provides environment variables for Lambda functions:

```javascript
const canvasEnvVars = sageMakerCanvas.getEnvironmentVariables();
// Returns:
// {
//   SAGEMAKER_CANVAS_DOMAIN_ID: "d-xxxxx",
//   SAGEMAKER_CANVAS_USER_PROFILE: "pricing-analyst-dev",
//   SAGEMAKER_CANVAS_EXECUTION_ROLE: "arn:aws:iam::...",
//   CANVAS_TRAINING_DATA_BUCKET: "canvas-training-data-dev",
//   CANVAS_MODEL_OUTPUT_BUCKET: "canvas-model-outputs-dev"
// }
```

### Configuration Options

```json
{
  "sageMakerCanvas": {
    "enabled": true,
    "domainNamePrefix": "pricing-canvas-dev",
    "enableVpc": false,
    "modelCategories": ["powertools", "kitchen", "apparel", "footwear"],
    "trainingSchedule": {
      "enabled": true,
      "frequency": "weekly"
    },
    "performanceThresholds": {
      "minAccuracy": 0.70,
      "maxModelAge": 90
    }
  }
}
```

## Usage

### Model Management

```javascript
// Ensure model is available for forecasting
const modelResult = await lambda.invoke({
  FunctionName: 'sagemaker-canvas-model-manager-dev',
  Payload: JSON.stringify({
    operation: 'ensureModelAvailability',
    category: 'powertools'
  })
}).promise();

// Trigger model training
const trainingResult = await lambda.invoke({
  FunctionName: 'sagemaker-canvas-model-manager-dev',
  Payload: JSON.stringify({
    operation: 'triggerModelTraining',
    category: 'powertools'
  })
}).promise();
```

### Model Metadata Structure

```javascript
{
  PK: "CANVAS_MODEL#demand-forecast-powertools-v1",
  SK: "METADATA",
  GSI1PK: "CANVAS_MODEL",
  GSI1SK: "powertools#demand-forecast-powertools-v1",
  entityType: "CANVAS_MODEL",
  modelName: "demand-forecast-powertools-v1",
  category: "powertools",
  status: "COMPLETED",
  accuracy: 0.85,
  createdAt: "2024-01-15T10:30:00Z",
  updatedAt: "2024-01-15T10:30:00Z",
  trainingDataUri: "s3://canvas-training-data-dev/training_data/powertools/",
  performanceMetrics: {
    mape: 0.15,
    rmse: 125.5,
    mae: 98.2
  }
}
```

## Security

### IAM Permissions
- **Canvas Execution Role**: Full SageMaker Canvas access
- **S3 Permissions**: Read/write access to training and output buckets
- **DynamoDB Permissions**: Read/write access to model metadata
- **Lambda Permissions**: SageMaker API access for model management

### Data Encryption
- **S3**: Server-side encryption with S3-managed keys
- **DynamoDB**: Encryption at rest enabled
- **Canvas**: Uses AWS-managed encryption for model artifacts

## Monitoring

### CloudWatch Metrics
- Model training duration
- Forecast generation latency
- Model accuracy trends
- Training data quality scores

### Alarms
- Model training failures
- Performance degradation
- Data pipeline failures
- Cost thresholds

## Cost Optimization

### Training Data Lifecycle
- Automatic cleanup of old training data versions
- Compression of historical datasets
- Intelligent tiering for infrequently accessed data

### Model Lifecycle
- Automatic model archival after replacement
- Performance-based model retirement
- Resource cleanup for failed training jobs

## Troubleshooting

### Common Issues

1. **Model Training Fails**
   - Check training data format and completeness
   - Verify IAM permissions for Canvas execution role
   - Review CloudWatch logs for detailed error messages

2. **Poor Model Performance**
   - Increase training data volume
   - Improve data quality and feature engineering
   - Adjust model hyperparameters

3. **High Costs**
   - Review model training frequency
   - Optimize data storage lifecycle policies
   - Monitor Canvas usage patterns

### Debug Commands

```bash
# Check model status
aws lambda invoke \
  --function-name sagemaker-canvas-model-manager-dev \
  --payload '{"operation":"getModelStatus","modelName":"demand-forecast-powertools-v1"}' \
  response.json

# List all models
aws lambda invoke \
  --function-name sagemaker-canvas-model-manager-dev \
  --payload '{"operation":"listModels"}' \
  response.json
```