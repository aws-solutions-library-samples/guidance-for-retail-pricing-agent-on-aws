# Margin Rules Configuration

## Overview

This directory contains the margin rules configuration used by the Margin Analysis Agent to calculate pricing boundaries and validate compliance with business rules.

## Files

### margin_rules.json

The main configuration file containing all margin rules and adjustments:

- **Role-based margins**: Target margins for each product tier (Best, Better, Good, Entry)
- **Feature adjustments**: Margin modifications based on product features and battery types
- **Volume adjustments**: Margin modifications based on expected sales volume
- **Seasonal adjustments**: Margin modifications based on market seasonality
- **Compliance rules**: MAP and margin enforcement settings
- **Calculation rules**: Formulas and precision settings

## Configuration Structure

### Role-Based Margins

Each product role has the following margin configuration:
- `target_margin`: The ideal margin percentage for the role
- `min_margin`: Minimum acceptable margin (compliance threshold)
- `max_margin`: Maximum recommended margin
- `promo_floor`: Minimum margin during promotional periods
- `max_volume_discount`: Maximum volume-based discount allowed

### Feature Adjustments

#### Battery Types
- **60V MAX**: +5% margin adjustment for premium battery technology
- **40V MAX**: +3% margin adjustment for high-performance battery
- **20V MAX**: 0% margin adjustment (baseline)
- **20V**: -2% margin adjustment for basic battery technology

#### Premium Features
- **Metal Blade Guard**: +2% margin adjustment
- **Premium Case**: +1.5% margin adjustment
- **LED Light**: +0.5% margin adjustment
- **Electric Brake**: +1% margin adjustment

### Volume Adjustments

Based on `yearTarget` field from product data:
- **High Volume** (>40,000 units): -3% margin adjustment
- **Medium Volume** (30,000-40,000 units): -1.5% margin adjustment
- **Low Volume** (<30,000 units): 0% margin adjustment

### Seasonal Adjustments

- **Peak Season**: +2% margin adjustment (spring/summer)
- **Off-Season**: -2% margin adjustment (winter)
- **Holiday**: Dynamic adjustment based on demand patterns
- **Back-to-School**: +1% margin adjustment
- **End-of-Year**: -1.5% margin adjustment

## Usage

The Margin Analysis Agent retrieves this configuration from S3 using the `get_margin_rules` tool. If S3 retrieval fails, the agent falls back to hardcoded default rules.

## Updates

To update margin rules:
1. Modify the `margin_rules.json` file
2. Update the `last_updated` timestamp
3. Increment the `version` if making breaking changes
4. Deploy the updated file to S3

The system will automatically use the new rules on the next analysis without requiring code changes.

## Validation

The configuration includes validation rules to ensure:
- All margin percentages are between 0 and 1
- Volume thresholds are positive integers
- Seasonal adjustments are reasonable (-0.05 to +0.05)
- All required fields are present

## Compliance

The configuration supports:
- **MAP Compliance**: Ensures all prices meet Minimum Advertised Price requirements
- **Margin Compliance**: Validates margins meet minimum requirements for each role
- **Review Flags**: Automatically flags pricing for manual review when thresholds are exceeded