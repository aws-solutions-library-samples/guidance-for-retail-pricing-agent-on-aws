# Competitive Intelligence Data Structure

## Overview

This directory contains historical competitive analysis data used as fallback when SageMaker Canvas ML models are unavailable. The data follows a structured schema to ensure consistency and reliability for the Competitive Analysis Agent.

## Directory Structure

```
competitive_data/
├── README.md                    # This documentation file
├── schema.json                  # JSON schema for competitive analysis data
├── CMAN-SAW-PRO725.json        # Competitive analysis for Craftsman saw (best tier)
├── DEWALT-DRILL-DCD771C2.json  # Competitive analysis for DeWalt drill (better tier)
├── RYOBI-SANDER-P411.json      # Competitive analysis for Ryobi sander (good tier)
└── HARBOR-GRINDER-62281.json   # Competitive analysis for Harbor Freight grinder (entry tier)
```

## Data Schema

Each competitive analysis file follows the schema defined in `schema.json` and contains:

### Required Fields

1. **product_id**: Product identifier matching the main catalog
2. **data_source**: Always "historical-fallback" for this data
3. **analysis_timestamp**: ISO timestamp of last analysis update
4. **market_statistics**: Market price statistics and volatility
5. **competitive_positioning**: Primary competitor and positioning data
6. **strategic_insights**: Market position assessment and strategy recommendations
7. **data_quality_metrics**: Data freshness and completeness indicators

### Market Statistics

- `lowest_market_price`: Minimum competitor price
- `highest_market_price`: Maximum competitor price  
- `average_market_price`: Mean market price
- `median_market_price`: Median market price
- `market_volatility`: Price volatility index (0-1)
- `competitor_count`: Number of competitors analyzed

### Competitive Positioning

- `primary_competitor`: Name of main competitor
- `competitive_relevance_score`: Relevance for comparison (0-1)
- `market_share_estimate`: Estimated competitor market share (0-1)
- `price_positioning`: Competitor's position (premium/mid-premium/mid-range/value)
- `competitive_advantages`: Array of our advantages over competitors

### Strategic Insights

- `market_position_assessment`: Our market position (premium/mid-premium/mid-range/value)
- `recommended_strategy`: Pricing strategy (undercut/match/premium_position/value_leader)
- `strategy_rationale`: Explanation for recommended strategy
- `confidence_intervals`: Confidence scores for recommendations (0-1)

### Data Quality Metrics

- `data_freshness_days`: Age of data in days
- `sample_size`: Number of data points analyzed
- `data_completeness_score`: Completeness score (0-1)
- `outliers_excluded`: Number of outliers removed

## Confidence Intervals

Historical fallback data has reduced confidence scores compared to ML-generated analysis:

- **Price Recommendation Confidence**: 0.65-0.72 (vs 0.85-0.95 for ML)
- **Market Position Confidence**: 0.71-0.78 (vs 0.88-0.95 for ML)
- **Competitive Analysis Confidence**: 0.63-0.71 (vs 0.82-0.92 for ML)

## Usage by Competitive Analysis Agent

The Competitive Analysis Agent uses this data when:

1. SageMaker Canvas models are unavailable
2. Model training is in progress
3. Model performance falls below acceptable thresholds
4. As validation data for ML model outputs

## Data Maintenance

- Update analysis_timestamp when refreshing data
- Increment data_freshness_days based on last update
- Review and update competitive_advantages quarterly
- Validate market_statistics against current market conditions
- Ensure outliers_excluded reflects actual data cleaning

## Integration with SageMaker Canvas

This historical data serves as:

- **Fallback Data**: When ML models are unavailable
- **Training Validation**: Baseline for model performance comparison
- **Cold Start Data**: Initial recommendations for new products
- **Confidence Calibration**: Reference for confidence interval adjustment

## File Naming Convention

Files are named using the exact product_id from the main product catalog:
- Format: `{PRODUCT_ID}.json`
- Example: `CMAN-SAW-PRO725.json`

This ensures direct mapping between products and their competitive analysis data.