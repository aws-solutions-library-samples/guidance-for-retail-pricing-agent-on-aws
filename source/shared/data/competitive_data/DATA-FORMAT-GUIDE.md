# Competitive Data Format Guide

This guide provides comprehensive documentation for the competitive analysis data format used by the Competitive Analysis Agent, including schema specifications, validation rules, and usage examples.

## Table of Contents

1. [Overview](#overview)
2. [Data Structure](#data-structure)
3. [Schema Specification](#schema-specification)
4. [Field Definitions](#field-definitions)
5. [Data Quality Requirements](#data-quality-requirements)
6. [Validation Rules](#validation-rules)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)
9. [Migration Guide](#migration-guide)

## Overview

The competitive analysis data format is designed to provide consistent, structured competitive intelligence for pricing analysis. It serves as both the input format for SageMaker Canvas ML models and the fallback format for historical competitive data.

### Key Characteristics

- **JSON Format**: Human-readable and machine-parseable
- **Versioned Schema**: Supports schema evolution and backward compatibility
- **Comprehensive Coverage**: Includes market statistics, competitive positioning, and strategic insights
- **Quality Metrics**: Built-in data quality and confidence scoring
- **Extensible Design**: Supports additional fields for future enhancements

### Data Sources

1. **SageMaker Canvas Output**: ML-generated competitive analysis with high confidence
2. **Historical Fallback Data**: Pre-analyzed competitive data with reduced confidence
3. **Manual Analysis**: Expert-curated competitive intelligence
4. **Third-Party Data**: External competitive intelligence services

## Data Structure

### High-Level Structure

```json
{
  "product_id": "string",
  "data_source": "string",
  "analysis_timestamp": "ISO 8601 datetime",
  "model_metadata": { ... },
  "market_statistics": { ... },
  "competitive_positioning": { ... },
  "strategic_insights": { ... },
  "data_quality_metrics": { ... },
  "validation_results": { ... }
}
```

### Hierarchical Organization

```
Competitive Analysis Data
├── Product Identification
│   ├── product_id
│   └── product_category
├── Data Provenance
│   ├── data_source
│   ├── analysis_timestamp
│   └── model_metadata
├── Market Analysis
│   ├── market_statistics
│   ├── price_distribution
│   └── market_trends
├── Competitive Intelligence
│   ├── competitive_positioning
│   ├── competitor_analysis
│   └── competitive_advantages
├── Strategic Recommendations
│   ├── strategic_insights
│   ├── pricing_strategies
│   └── confidence_intervals
└── Quality Assurance
    ├── data_quality_metrics
    ├── validation_results
    └── audit_trail
```

## Schema Specification

### Core Schema (v1.2.0)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Competitive Analysis Data Schema",
  "description": "Comprehensive schema for competitive analysis data",
  "version": "1.2.0",
  "type": "object",
  "required": [
    "product_id",
    "data_source",
    "analysis_timestamp",
    "market_statistics",
    "competitive_positioning",
    "strategic_insights",
    "data_quality_metrics"
  ],
  "properties": {
    "product_id": {
      "type": "string",
      "description": "Unique product identifier matching the main product catalog",
      "pattern": "^[A-Z0-9-]+$",
      "minLength": 5,
      "maxLength": 50,
      "examples": ["CMAN-SAW-PRO725", "DEWALT-DRILL-DCD771C2"]
    },
    "data_source": {
      "type": "string",
      "enum": [
        "sagemaker-canvas",
        "historical-fallback",
        "manual-analysis",
        "third-party-api"
      ],
      "description": "Source of the competitive analysis data"
    },
    "analysis_timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when this analysis was generated or last updated"
    },
    "schema_version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Version of the data schema used",
      "default": "1.2.0"
    }
  }
}
```

### Extended Schema Components

#### Model Metadata Schema
```json
{
  "model_metadata": {
    "type": "object",
    "description": "Metadata about the ML model or analysis method used",
    "properties": {
      "model_name": {
        "type": "string",
        "description": "Name of the ML model or analysis method"
      },
      "model_version": {
        "type": "string",
        "description": "Version of the model used"
      },
      "model_accuracy": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Model accuracy score (0-1)"
      },
      "training_date": {
        "type": "string",
        "format": "date-time",
        "description": "When the model was last trained"
      },
      "feature_importance": {
        "type": "object",
        "description": "Feature importance scores for model interpretability"
      }
    }
  }
}
```

#### Market Statistics Schema
```json
{
  "market_statistics": {
    "type": "object",
    "required": [
      "lowest_market_price",
      "highest_market_price",
      "average_market_price",
      "median_market_price",
      "market_volatility",
      "competitor_count"
    ],
    "properties": {
      "lowest_market_price": {
        "type": "number",
        "minimum": 0,
        "description": "Minimum competitor price in the market",
        "examples": [159.99, 89.50]
      },
      "highest_market_price": {
        "type": "number",
        "minimum": 0,
        "description": "Maximum competitor price in the market",
        "examples": [299.99, 450.00]
      },
      "average_market_price": {
        "type": "number",
        "minimum": 0,
        "description": "Mean market price across all competitors",
        "examples": [189.45, 225.75]
      },
      "median_market_price": {
        "type": "number",
        "minimum": 0,
        "description": "Median market price across all competitors",
        "examples": [185.99, 220.00]
      },
      "market_volatility": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Price volatility index (0-1, where 1 is highly volatile)",
        "examples": [0.18, 0.35]
      },
      "competitor_count": {
        "type": "integer",
        "minimum": 0,
        "description": "Number of competitors analyzed",
        "examples": [8, 15]
      },
      "price_distribution": {
        "type": "object",
        "description": "Statistical distribution of competitor prices",
        "properties": {
          "quartile_1": { "type": "number", "minimum": 0 },
          "quartile_3": { "type": "number", "minimum": 0 },
          "interquartile_range": { "type": "number", "minimum": 0 },
          "standard_deviation": { "type": "number", "minimum": 0 },
          "skewness": { "type": "number" },
          "kurtosis": { "type": "number" }
        }
      },
      "market_trends": {
        "type": "object",
        "description": "Market trend analysis",
        "properties": {
          "trend_direction": {
            "type": "string",
            "enum": ["increasing", "decreasing", "stable", "volatile"]
          },
          "trend_strength": {
            "type": "string",
            "enum": ["weak", "moderate", "strong"]
          },
          "trend_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "seasonal_patterns": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "season": { "type": "string" },
                "price_adjustment": { "type": "number" },
                "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
              }
            }
          }
        }
      }
    }
  }
}
```

#### Competitive Positioning Schema
```json
{
  "competitive_positioning": {
    "type": "object",
    "required": [
      "primary_competitor",
      "competitive_relevance_score",
      "market_share_estimate",
      "price_positioning"
    ],
    "properties": {
      "primary_competitor": {
        "type": "string",
        "description": "Name of the primary competitor",
        "examples": ["DeWalt Pro Series", "Bosch Professional"]
      },
      "competitive_relevance_score": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Relevance score for competitive comparison (0-1)",
        "examples": [0.94, 0.87]
      },
      "market_share_estimate": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Estimated market share of primary competitor (0-1)",
        "examples": [0.23, 0.18]
      },
      "price_positioning": {
        "type": "string",
        "enum": ["premium", "mid-premium", "mid-range", "value"],
        "description": "Primary competitor's price positioning in market"
      },
      "competitive_advantages": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "advantage": {
              "type": "string",
              "description": "Description of our competitive advantage"
            },
            "strength": {
              "type": "string",
              "enum": ["weak", "moderate", "strong"],
              "description": "Strength of this advantage"
            },
            "confidence": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Confidence in this advantage assessment"
            },
            "impact_on_pricing": {
              "type": "string",
              "enum": ["negative", "neutral", "positive"],
              "description": "Impact of this advantage on pricing power"
            }
          }
        },
        "description": "List of our competitive advantages over primary competitor"
      },
      "competitor_analysis": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "competitor_name": { "type": "string" },
            "price_point": { "type": "number", "minimum": 0 },
            "market_share": { "type": "number", "minimum": 0, "maximum": 1 },
            "relevance_score": { "type": "number", "minimum": 0, "maximum": 1 },
            "positioning": {
              "type": "string",
              "enum": ["premium", "mid-premium", "mid-range", "value"]
            },
            "key_features": {
              "type": "array",
              "items": { "type": "string" }
            },
            "strengths": {
              "type": "array",
              "items": { "type": "string" }
            },
            "weaknesses": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        },
        "description": "Detailed analysis of all competitors"
      }
    }
  }
}
```

#### Strategic Insights Schema
```json
{
  "strategic_insights": {
    "type": "object",
    "required": [
      "market_position_assessment",
      "recommended_strategy",
      "confidence_intervals"
    ],
    "properties": {
      "market_position_assessment": {
        "type": "string",
        "enum": ["premium", "mid-premium", "mid-range", "value"],
        "description": "Our assessed position in the market"
      },
      "recommended_strategy": {
        "type": "string",
        "enum": ["undercut", "match", "premium_position", "value_leader"],
        "description": "Recommended pricing strategy based on competitive analysis"
      },
      "strategy_rationale": {
        "type": "string",
        "description": "Detailed explanation for the recommended pricing strategy",
        "minLength": 50,
        "maxLength": 1000
      },
      "alternative_strategies": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "strategy": {
              "type": "string",
              "enum": ["undercut", "match", "premium_position", "value_leader"]
            },
            "rationale": { "type": "string" },
            "expected_outcome": { "type": "string" },
            "risk_level": {
              "type": "string",
              "enum": ["low", "medium", "high"]
            },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        },
        "description": "Alternative pricing strategies with analysis"
      },
      "confidence_intervals": {
        "type": "object",
        "required": [
          "price_recommendation_confidence",
          "market_position_confidence",
          "competitive_analysis_confidence"
        ],
        "properties": {
          "price_recommendation_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence in pricing recommendation (0-1, reduced for historical data)"
          },
          "market_position_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence in market position assessment (0-1)"
          },
          "competitive_analysis_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Overall confidence in competitive analysis (0-1)"
          },
          "data_quality_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence in underlying data quality"
          }
        }
      },
      "risk_assessment": {
        "type": "object",
        "description": "Risk analysis for recommended strategy",
        "properties": {
          "market_risks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "risk": { "type": "string" },
                "probability": {
                  "type": "string",
                  "enum": ["low", "medium", "high"]
                },
                "impact": {
                  "type": "string",
                  "enum": ["low", "medium", "high"]
                },
                "mitigation": { "type": "string" }
              }
            }
          },
          "competitive_risks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "risk": { "type": "string" },
                "probability": {
                  "type": "string",
                  "enum": ["low", "medium", "high"]
                },
                "impact": {
                  "type": "string",
                  "enum": ["low", "medium", "high"]
                },
                "mitigation": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

#### Data Quality Metrics Schema
```json
{
  "data_quality_metrics": {
    "type": "object",
    "required": [
      "data_freshness_days",
      "sample_size",
      "data_completeness_score"
    ],
    "properties": {
      "data_freshness_days": {
        "type": "integer",
        "minimum": 0,
        "description": "Age of the competitive data in days",
        "examples": [1, 30, 90]
      },
      "sample_size": {
        "type": "integer",
        "minimum": 0,
        "description": "Number of data points used in analysis",
        "examples": [8, 15, 25]
      },
      "data_completeness_score": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Completeness score of the competitive data (0-1)",
        "examples": [0.85, 0.92]
      },
      "outliers_excluded": {
        "type": "integer",
        "minimum": 0,
        "description": "Number of outlier data points excluded from analysis",
        "examples": [2, 0, 5]
      },
      "data_sources": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source_name": { "type": "string" },
            "data_points": { "type": "integer", "minimum": 0 },
            "reliability_score": { "type": "number", "minimum": 0, "maximum": 1 },
            "last_updated": { "type": "string", "format": "date-time" }
          }
        },
        "description": "Details about data sources used in analysis"
      },
      "validation_results": {
        "type": "object",
        "description": "Results of data validation checks",
        "properties": {
          "schema_validation": {
            "type": "object",
            "properties": {
              "passed": { "type": "boolean" },
              "errors": { "type": "array", "items": { "type": "string" } },
              "warnings": { "type": "array", "items": { "type": "string" } }
            }
          },
          "business_rules_validation": {
            "type": "object",
            "properties": {
              "passed": { "type": "boolean" },
              "failed_rules": { "type": "array", "items": { "type": "string" } }
            }
          },
          "statistical_validation": {
            "type": "object",
            "properties": {
              "passed": { "type": "boolean" },
              "anomalies_detected": { "type": "integer", "minimum": 0 },
              "statistical_tests": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "test_name": { "type": "string" },
                    "result": { "type": "string", "enum": ["pass", "fail", "warning"] },
                    "p_value": { "type": "number", "minimum": 0, "maximum": 1 },
                    "interpretation": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Field Definitions

### Core Fields

#### product_id
- **Type**: String
- **Format**: Alphanumeric with hyphens (A-Z, 0-9, -)
- **Length**: 5-50 characters
- **Purpose**: Unique identifier linking to product catalog
- **Examples**: `CMAN-SAW-PRO725`, `DEWALT-DRILL-DCD771C2`
- **Validation**: Must match existing product in catalog

#### data_source
- **Type**: Enumerated String
- **Values**: 
  - `sagemaker-canvas`: ML-generated analysis (highest confidence)
  - `historical-fallback`: Pre-analyzed data (reduced confidence)
  - `manual-analysis`: Expert-curated analysis
  - `third-party-api`: External service data
- **Purpose**: Indicates analysis method and expected confidence level

#### analysis_timestamp
- **Type**: ISO 8601 DateTime
- **Format**: `YYYY-MM-DDTHH:MM:SS.sssZ`
- **Purpose**: Tracks data freshness and analysis recency
- **Example**: `2024-01-15T14:30:00.000Z`

### Market Statistics Fields

#### Price Fields (lowest_market_price, highest_market_price, etc.)
- **Type**: Number (Float)
- **Constraints**: Must be positive, realistic price values
- **Currency**: USD (implied)
- **Precision**: 2 decimal places recommended
- **Validation**: 
  - `lowest_market_price ≤ median_market_price ≤ highest_market_price`
  - All prices > 0
  - Price range should be reasonable for product category

#### market_volatility
- **Type**: Number (Float)
- **Range**: 0.0 to 1.0
- **Interpretation**:
  - 0.0-0.2: Low volatility (stable market)
  - 0.2-0.5: Moderate volatility
  - 0.5-1.0: High volatility (unstable market)
- **Calculation**: Coefficient of variation normalized to 0-1 scale

#### competitor_count
- **Type**: Integer
- **Minimum**: 0
- **Recommended Minimum**: 3 (for statistical significance)
- **Purpose**: Indicates analysis reliability (more competitors = higher confidence)

### Competitive Positioning Fields

#### competitive_relevance_score
- **Type**: Number (Float)
- **Range**: 0.0 to 1.0
- **Interpretation**:
  - 0.8-1.0: Highly relevant competitor
  - 0.6-0.8: Moderately relevant
  - 0.4-0.6: Somewhat relevant
  - 0.0-0.4: Low relevance
- **Purpose**: Indicates how comparable the competitor is to our product

#### market_share_estimate
- **Type**: Number (Float)
- **Range**: 0.0 to 1.0 (percentage as decimal)
- **Purpose**: Estimated market share of primary competitor
- **Note**: May be approximate or modeled estimate

### Strategic Insights Fields

#### Confidence Intervals
- **Type**: Number (Float)
- **Range**: 0.0 to 1.0
- **Purpose**: Quantifies uncertainty in analysis
- **Interpretation**:
  - 0.9-1.0: Very high confidence
  - 0.8-0.9: High confidence
  - 0.7-0.8: Moderate confidence
  - 0.6-0.7: Low confidence
  - 0.0-0.6: Very low confidence (may require manual review)

## Data Quality Requirements

### Minimum Quality Standards

#### Completeness Requirements
- **Core Fields**: 100% completion required
- **Market Statistics**: All price fields must be present and valid
- **Competitive Positioning**: Primary competitor must be identified
- **Strategic Insights**: Confidence intervals must be provided

#### Accuracy Requirements
- **Price Data**: Prices must be current within data freshness threshold
- **Competitor Information**: Competitor names must be standardized
- **Confidence Scores**: Must reflect actual analysis reliability

#### Consistency Requirements
- **Price Relationships**: Logical price ordering must be maintained
- **Confidence Alignment**: Confidence scores should align with data quality
- **Temporal Consistency**: Timestamps should be consistent across related data

### Quality Scoring

#### Data Completeness Score Calculation
```javascript
/**
 * Calculates data completeness score
 * @param {Object} data - Competitive analysis data
 * @returns {number} Completeness score (0-1)
 */
function calculateCompletenessScore(data) {
  const requiredFields = [
    'product_id', 'data_source', 'analysis_timestamp',
    'market_statistics.lowest_market_price',
    'market_statistics.highest_market_price',
    'market_statistics.average_market_price',
    'market_statistics.median_market_price',
    'competitive_positioning.primary_competitor',
    'strategic_insights.market_position_assessment',
    'strategic_insights.recommended_strategy'
  ];
  
  let presentFields = 0;
  requiredFields.forEach(field => {
    if (getNestedValue(data, field) !== undefined) {
      presentFields++;
    }
  });
  
  return presentFields / requiredFields.length;
}
```

#### Data Freshness Score Calculation
```javascript
/**
 * Calculates data freshness score based on age
 * @param {string} timestamp - Analysis timestamp
 * @returns {number} Freshness score (0-1)
 */
function calculateFreshnessScore(timestamp) {
  const ageInDays = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  
  if (ageInDays <= 1) return 1.0;      // Same day: 100%
  if (ageInDays <= 7) return 0.9;      // Within week: 90%
  if (ageInDays <= 30) return 0.7;     // Within month: 70%
  if (ageInDays <= 90) return 0.5;     // Within quarter: 50%
  return 0.3;                          // Older: 30%
}
```

## Validation Rules

### Schema Validation Rules

#### Structural Validation
1. **Required Fields**: All required fields must be present
2. **Data Types**: All fields must match specified data types
3. **Format Validation**: Strings must match specified patterns
4. **Range Validation**: Numeric values must be within specified ranges

#### Business Logic Validation
1. **Price Consistency**: `lowest_price ≤ median_price ≤ highest_price`
2. **Confidence Alignment**: Higher data quality should correlate with higher confidence
3. **Temporal Consistency**: Analysis timestamp should be recent for fresh data
4. **Competitor Relevance**: Primary competitor should have high relevance score

#### Statistical Validation
1. **Outlier Detection**: Identify and flag statistical outliers in price data
2. **Distribution Analysis**: Validate price distribution characteristics
3. **Correlation Checks**: Verify expected correlations between related metrics

### Validation Implementation

```javascript
/**
 * Comprehensive data validation for competitive analysis
 */
class CompetitiveDataValidator {
  /**
   * Validates competitive analysis data
   * @param {Object} data - Data to validate
   * @returns {Object} Validation results
   */
  validate(data) {
    const results = {
      isValid: true,
      errors: [],
      warnings: [],
      qualityScore: 0
    };

    // Schema validation
    const schemaResults = this.validateSchema(data);
    results.errors.push(...schemaResults.errors);
    results.warnings.push(...schemaResults.warnings);

    // Business logic validation
    const businessResults = this.validateBusinessLogic(data);
    results.errors.push(...businessResults.errors);
    results.warnings.push(...businessResults.warnings);

    // Statistical validation
    const statisticalResults = this.validateStatistics(data);
    results.warnings.push(...statisticalResults.warnings);

    // Calculate overall quality score
    results.qualityScore = this.calculateQualityScore(data, results);
    results.isValid = results.errors.length === 0;

    return results;
  }

  validateSchema(data) {
    // Implementation of schema validation
    // Uses JSON Schema validation library
  }

  validateBusinessLogic(data) {
    const errors = [];
    const warnings = [];

    // Price consistency checks
    const stats = data.market_statistics;
    if (stats) {
      if (stats.lowest_market_price > stats.median_market_price) {
        errors.push('Lowest price cannot be greater than median price');
      }
      if (stats.median_market_price > stats.highest_market_price) {
        errors.push('Median price cannot be greater than highest price');
      }
      if (stats.competitor_count < 3) {
        warnings.push('Low competitor count may affect analysis reliability');
      }
    }

    // Confidence validation
    const insights = data.strategic_insights;
    if (insights?.confidence_intervals) {
      Object.entries(insights.confidence_intervals).forEach(([key, value]) => {
        if (value < 0.3) {
          warnings.push(`Very low confidence for ${key}: ${value}`);
        }
      });
    }

    return { errors, warnings };
  }

  validateStatistics(data) {
    const warnings = [];
    
    // Statistical outlier detection
    const stats = data.market_statistics;
    if (stats) {
      const priceRange = stats.highest_market_price - stats.lowest_market_price;
      const medianPrice = stats.median_market_price;
      
      if (priceRange / medianPrice > 2.0) {
        warnings.push('Large price range detected - may indicate market fragmentation');
      }
      
      if (stats.market_volatility > 0.7) {
        warnings.push('High market volatility detected - analysis may be less reliable');
      }
    }

    return { warnings };
  }

  calculateQualityScore(data, validationResults) {
    let score = 1.0;

    // Penalize for errors and warnings
    score -= validationResults.errors.length * 0.2;
    score -= validationResults.warnings.length * 0.1;

    // Factor in data completeness
    const completeness = calculateCompletenessScore(data);
    score *= completeness;

    // Factor in data freshness
    const freshness = calculateFreshnessScore(data.analysis_timestamp);
    score *= freshness;

    return Math.max(0, Math.min(1, score));
  }
}
```

## Usage Examples

### Example 1: SageMaker Canvas Output

```json
{
  "product_id": "CMAN-SAW-PRO725",
  "data_source": "sagemaker-canvas",
  "analysis_timestamp": "2024-01-15T14:30:00.000Z",
  "schema_version": "1.2.0",
  "model_metadata": {
    "model_name": "competitive-analysis-powertools-v1.2",
    "model_version": "1.2.3",
    "model_accuracy": 0.89,
    "training_date": "2024-01-10T08:00:00.000Z",
    "feature_importance": {
      "price": 0.35,
      "features": 0.25,
      "brand_strength": 0.20,
      "market_position": 0.20
    }
  },
  "market_statistics": {
    "lowest_market_price": 159.99,
    "highest_market_price": 229.99,
    "average_market_price": 189.45,
    "median_market_price": 185.99,
    "market_volatility": 0.18,
    "competitor_count": 8,
    "price_distribution": {
      "quartile_1": 175.00,
      "quartile_3": 205.00,
      "interquartile_range": 30.00,
      "standard_deviation": 22.15,
      "skewness": 0.12,
      "kurtosis": -0.45
    },
    "market_trends": {
      "trend_direction": "stable",
      "trend_strength": "weak",
      "trend_confidence": 0.75,
      "seasonal_patterns": [
        {
          "season": "holiday",
          "price_adjustment": -0.15,
          "confidence": 0.82
        }
      ]
    }
  },
  "competitive_positioning": {
    "primary_competitor": "DeWalt Pro Series DCS570B",
    "competitive_relevance_score": 0.94,
    "market_share_estimate": 0.23,
    "price_positioning": "mid-premium",
    "competitive_advantages": [
      {
        "advantage": "Superior LED lighting system",
        "strength": "strong",
        "confidence": 0.88,
        "impact_on_pricing": "positive"
      },
      {
        "advantage": "Enhanced safety features",
        "strength": "moderate",
        "confidence": 0.75,
        "impact_on_pricing": "positive"
      }
    ],
    "competitor_analysis": [
      {
        "competitor_name": "DeWalt Pro Series DCS570B",
        "price_point": 185.99,
        "market_share": 0.23,
        "relevance_score": 0.94,
        "positioning": "mid-premium",
        "key_features": ["Brushless motor", "Dust blower", "Bevel capacity"],
        "strengths": ["Brand recognition", "Durability", "Professional grade"],
        "weaknesses": ["Higher price", "Limited LED features"]
      }
    ]
  },
  "strategic_insights": {
    "market_position_assessment": "mid-premium",
    "recommended_strategy": "premium_position",
    "strategy_rationale": "Based on superior LED lighting system and enhanced safety features, recommend premium positioning to capture value from differentiated features while maintaining competitive market presence.",
    "alternative_strategies": [
      {
        "strategy": "match",
        "rationale": "Match primary competitor pricing to maximize market share",
        "expected_outcome": "Higher volume, lower margins",
        "risk_level": "low",
        "confidence": 0.85
      }
    ],
    "confidence_intervals": {
      "price_recommendation_confidence": 0.89,
      "market_position_confidence": 0.92,
      "competitive_analysis_confidence": 0.87,
      "data_quality_confidence": 0.91
    },
    "risk_assessment": {
      "market_risks": [
        {
          "risk": "New competitor entry with disruptive pricing",
          "probability": "medium",
          "impact": "high",
          "mitigation": "Monitor market entry signals and prepare rapid response strategy"
        }
      ],
      "competitive_risks": [
        {
          "risk": "Primary competitor feature enhancement",
          "probability": "high",
          "impact": "medium",
          "mitigation": "Accelerate product development roadmap"
        }
      ]
    }
  },
  "data_quality_metrics": {
    "data_freshness_days": 1,
    "sample_size": 8,
    "data_completeness_score": 0.95,
    "outliers_excluded": 1,
    "data_sources": [
      {
        "source_name": "ML_Model_Training_Data",
        "data_points": 150,
        "reliability_score": 0.92,
        "last_updated": "2024-01-10T08:00:00.000Z"
      }
    ],
    "validation_results": {
      "schema_validation": {
        "passed": true,
        "errors": [],
        "warnings": []
      },
      "business_rules_validation": {
        "passed": true,
        "failed_rules": []
      },
      "statistical_validation": {
        "passed": true,
        "anomalies_detected": 1,
        "statistical_tests": [
          {
            "test_name": "price_distribution_normality",
            "result": "pass",
            "p_value": 0.15,
            "interpretation": "Price distribution appears normal"
          }
        ]
      }
    }
  }
}
```

### Example 2: Historical Fallback Data

```json
{
  "product_id": "DEWALT-DRILL-DCD771C2",
  "data_source": "historical-fallback",
  "analysis_timestamp": "2023-12-15T10:00:00.000Z",
  "schema_version": "1.2.0",
  "model_metadata": {
    "model_name": "historical-analysis",
    "model_version": "1.0.0",
    "model_accuracy": 0.70,
    "training_date": null
  },
  "market_statistics": {
    "lowest_market_price": 89.99,
    "highest_market_price": 149.99,
    "average_market_price": 119.50,
    "median_market_price": 115.99,
    "market_volatility": 0.25,
    "competitor_count": 6
  },
  "competitive_positioning": {
    "primary_competitor": "Ryobi ONE+ HP Brushless",
    "competitive_relevance_score": 0.78,
    "market_share_estimate": 0.18,
    "price_positioning": "mid-range",
    "competitive_advantages": [
      {
        "advantage": "Established brand reputation",
        "strength": "strong",
        "confidence": 0.85,
        "impact_on_pricing": "positive"
      }
    ]
  },
  "strategic_insights": {
    "market_position_assessment": "mid-range",
    "recommended_strategy": "match",
    "strategy_rationale": "Historical analysis suggests matching competitor pricing for market share maintenance in established drill market segment.",
    "confidence_intervals": {
      "price_recommendation_confidence": 0.65,
      "market_position_confidence": 0.70,
      "competitive_analysis_confidence": 0.68,
      "data_quality_confidence": 0.60
    }
  },
  "data_quality_metrics": {
    "data_freshness_days": 31,
    "sample_size": 6,
    "data_completeness_score": 0.75,
    "outliers_excluded": 0,
    "validation_results": {
      "schema_validation": {
        "passed": true,
        "errors": [],
        "warnings": ["Reduced confidence due to historical data source"]
      }
    }
  }
}
```

## Best Practices

### Data Creation Best Practices

1. **Comprehensive Data Collection**
   - Include all available competitors in analysis
   - Collect data from multiple reliable sources
   - Validate data accuracy before processing

2. **Consistent Formatting**
   - Use standardized competitor names
   - Maintain consistent price formatting
   - Follow ISO 8601 for all timestamps

3. **Quality Documentation**
   - Document data sources and collection methods
   - Include confidence assessments for all metrics
   - Provide clear rationale for strategic recommendations

### Data Maintenance Best Practices

1. **Regular Updates**
   - Update competitive data at least monthly
   - Refresh ML models quarterly
   - Monitor data quality metrics continuously

2. **Version Control**
   - Track schema version changes
   - Maintain backward compatibility
   - Document breaking changes

3. **Validation Automation**
   - Implement automated validation pipelines
   - Set up quality monitoring alerts
   - Regular data quality audits

### Usage Best Practices

1. **Confidence-Based Decision Making**
   - Use confidence scores to guide decision making
   - Require manual review for low-confidence analysis
   - Combine multiple data sources for critical decisions

2. **Context-Aware Analysis**
   - Consider market conditions and trends
   - Factor in seasonal patterns
   - Account for competitive dynamics

3. **Continuous Improvement**
   - Monitor analysis accuracy over time
   - Collect feedback on recommendations
   - Refine models based on outcomes

## Migration Guide

### Schema Version Migration

#### From v1.0 to v1.2

**Breaking Changes:**
- Added required `schema_version` field
- Enhanced `confidence_intervals` structure
- Added `model_metadata` section

**Migration Steps:**

1. **Add Schema Version**
   ```javascript
   // Add to existing data
   data.schema_version = "1.2.0";
   ```

2. **Update Confidence Structure**
   ```javascript
   // Old format
   data.strategic_insights.confidence_intervals = {
     price_recommendation_confidence: 0.8,
     market_position_confidence: 0.85,
     competitive_analysis_confidence: 0.82
   };
   
   // New format (add data quality confidence)
   data.strategic_insights.confidence_intervals.data_quality_confidence = 0.80;
   ```

3. **Add Model Metadata**
   ```javascript
   // For historical data
   data.model_metadata = {
     model_name: "historical-analysis",
     model_version: "1.0.0",
     model_accuracy: 0.70,
     training_date: null
   };
   ```

#### Automated Migration Script

```javascript
/**
 * Migrates competitive analysis data from v1.0 to v1.2
 * @param {Object} oldData - Data in v1.0 format
 * @returns {Object} Data in v1.2 format
 */
function migrateToV12(oldData) {
  const newData = { ...oldData };
  
  // Add schema version
  newData.schema_version = "1.2.0";
  
  // Add model metadata for historical data
  if (!newData.model_metadata) {
    newData.model_metadata = {
      model_name: oldData.data_source === "sagemaker-canvas" ? "legacy-ml-model" : "historical-analysis",
      model_version: "1.0.0",
      model_accuracy: oldData.data_source === "sagemaker-canvas" ? 0.75 : 0.70,
      training_date: null
    };
  }
  
  // Enhance confidence intervals
  if (newData.strategic_insights?.confidence_intervals) {
    if (!newData.strategic_insights.confidence_intervals.data_quality_confidence) {
      // Estimate data quality confidence based on other factors
      const avgConfidence = Object.values(newData.strategic_insights.confidence_intervals)
        .reduce((sum, val) => sum + val, 0) / Object.keys(newData.strategic_insights.confidence_intervals).length;
      newData.strategic_insights.confidence_intervals.data_quality_confidence = avgConfidence * 0.9;
    }
  }
  
  // Add validation results if missing
  if (!newData.data_quality_metrics.validation_results) {
    newData.data_quality_metrics.validation_results = {
      schema_validation: { passed: true, errors: [], warnings: [] },
      business_rules_validation: { passed: true, failed_rules: [] },
      statistical_validation: { passed: true, anomalies_detected: 0, statistical_tests: [] }
    };
  }
  
  return newData;
}
```

---

*This data format guide is maintained by the Competitive Analysis Agent development team. For questions about data format or schema changes, please contact the development team or create an issue in the project repository.*