# SageMaker Canvas Training Data Structure

## Overview

This directory contains training datasets for SageMaker Canvas ML models used in competitive analysis. The data is organized by product category and subcategory to enable category-specific model training.

## Directory Structure

```
competitive_training_data/
├── README.md                           # This documentation file
└── powertools/                         # Power tools category training data
    ├── training_schema.json            # Schema for training data format
    ├── saws_training_data.csv          # Training data for circular saws
    ├── drills_training_data.csv        # Training data for drills
    ├── sanders_training_data.csv       # Training data for sanders
    └── grinders_training_data.csv      # Training data for grinders
```

## Training Data Schema

Each CSV file contains the following columns for SageMaker Canvas model training:

### Product Features
- `product_id`: Unique product identifier
- `category`: Product category (e.g., "powertools")
- `subcategory`: Product subcategory (e.g., "saws", "drills")
- `role`: Product tier (best/better/good/entry)
- `our_msrp`: Our manufacturer suggested retail price
- `our_map`: Our minimum advertised price
- `our_cost`: Our product cost
- `features_count`: Number of key product features

### Target Variable
- `market_position_score`: Target for ML model (0-1 scale)
  - 0.0-0.25: Value positioning
  - 0.26-0.50: Mid-range positioning  
  - 0.51-0.75: Mid-premium positioning
  - 0.76-1.00: Premium positioning

### Competitor Data (Up to 3 competitors per product)
For each competitor (1-3):
- `competitor_X_name`: Competitor brand/model name
- `competitor_X_price`: Competitor's retail price
- `competitor_X_features`: Number of competitor's key features
- `competitor_X_market_share`: Estimated market share (0-1)
- `competitor_X_brand_strength`: Brand strength score (0-1)

## Model Training Process

### 1. Data Preparation
- Combine all subcategory CSV files for category-level training
- Validate data completeness and quality
- Handle missing values and outliers
- Normalize price and feature data

### 2. Model Configuration
- **Model Type**: Tabular regression model
- **Target Column**: `market_position_score`
- **Problem Type**: Regression (predicting continuous market position score)
- **Validation**: 80/20 train/validation split

### 3. Feature Engineering
SageMaker Canvas automatically handles:
- Price ratio calculations (our_price vs competitor_price)
- Feature advantage scoring (our_features vs competitor_features)
- Market share weighting
- Brand strength normalization

### 4. Model Performance Metrics
- **Accuracy Threshold**: Minimum 75% for production use
- **RMSE Target**: < 0.15 for market position score prediction
- **R² Target**: > 0.70 for explained variance

## Data Quality Requirements

### Completeness
- Minimum 50 products per subcategory for training
- At least 2 competitors per product (3 preferred)
- All required fields must be populated

### Accuracy
- Price data updated within 90 days
- Market share estimates validated quarterly
- Brand strength scores reviewed annually

### Consistency
- Consistent feature counting methodology
- Standardized competitor selection criteria
- Uniform market position scoring

## Model Deployment Strategy

### Category-Specific Models
Each product category gets its own trained model:
- `competitive-analysis-powertools-v1`
- `competitive-analysis-kitchen-v1` (future)
- `competitive-analysis-apparel-v1` (future)

### Model Versioning
- Version increments with significant data updates
- A/B testing for model performance comparison
- Rollback capability to previous versions

### Training Schedule
- **Initial Training**: Manual trigger for new categories
- **Retraining**: Automatic when performance degrades below 75%
- **Data Updates**: Monthly refresh of training datasets
- **Model Refresh**: Quarterly retraining with updated data

## Integration with Competitive Analysis Agent

### Model Selection
The agent selects models based on:
1. Product category match
2. Model availability and status
3. Performance metrics above threshold
4. Data freshness requirements

### Fallback Strategy
When ML models are unavailable:
1. Check for category-specific historical data
2. Use generic competitive analysis templates
3. Apply reduced confidence intervals
4. Trigger model training for future use

## Data Sources and Updates

### Historical Sales Data
- Internal sales performance by product
- Market share estimates from industry reports
- Competitive pricing from market research

### Competitive Intelligence
- Competitor feature analysis
- Brand strength surveys and studies
- Market positioning research

### Update Process
1. Monthly data collection from various sources
2. Data validation and quality checks
3. CSV file updates with new training examples
4. Model retraining trigger when data volume increases 20%

## File Naming Conventions

### Training Data Files
- Format: `{subcategory}_training_data.csv`
- Examples: `saws_training_data.csv`, `drills_training_data.csv`

### Model Names
- Format: `competitive-analysis-{category}-v{version}`
- Examples: `competitive-analysis-powertools-v1.2`

This structure ensures scalable, maintainable ML model training for competitive analysis across product categories.