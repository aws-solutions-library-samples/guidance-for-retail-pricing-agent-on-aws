# Margin Rules Configuration Usage Guide

## Overview

This guide explains how to use, maintain, and deploy the margin rules configuration for the Retail Pricing Agent Orchestrator system.

## Files Structure

```
src/shared/data/margin_rules/
├── margin_rules.json          # Production configuration
├── margin_rules.dev.json      # Development configuration
├── schema.json                # JSON schema for validation
├── validate-config.js         # Configuration validation utility
├── deploy-to-s3.js           # S3 deployment script
├── README.md                 # Technical documentation
└── USAGE.md                  # This usage guide
```

## Configuration Files

### Production Configuration (`margin_rules.json`)
- **Purpose**: Production-ready margin rules with strict compliance requirements
- **MAP Enforcement**: Enabled
- **Margin Thresholds**: Strict business requirements
- **Volume Thresholds**: Standard business volumes (30k, 40k units)
- **Review Thresholds**: Conservative (20%-60% margin range)

### Development Configuration (`margin_rules.dev.json`)
- **Purpose**: Development and testing with relaxed constraints
- **MAP Enforcement**: Disabled for testing flexibility
- **Margin Thresholds**: Relaxed for easier testing
- **Volume Thresholds**: Lower thresholds (20k, 30k units) for testing
- **Review Thresholds**: Wider range (15%-70% margin range)

## Using the Configuration

### 1. Validation

Always validate configuration changes before deployment:

```bash
# Validate production configuration
node validate-config.js margin_rules.json

# Validate development configuration
node validate-config.js margin_rules.dev.json

# Validate custom configuration
node validate-config.js path/to/custom/config.json
```

### 2. Deployment to S3

Deploy configuration to S3 bucket:

```bash
# Set environment variable
export S3_BUCKET=your-pricing-data-bucket

# Deploy production configuration
node deploy-to-s3.js deploy your-bucket-name margin_rules.json

# Deploy development configuration
node deploy-to-s3.js deploy your-bucket-name margin_rules.dev.json

# List deployed configurations
node deploy-to-s3.js list your-bucket-name

# Download current configuration
node deploy-to-s3.js download your-bucket-name
```

### 3. Integration with Margin Analysis Agent

The Margin Analysis Agent automatically retrieves the configuration using the `get_margin_rules` tool:

```javascript
// Agent tool usage (automatic)
const marginRules = await getMarginRules();

// Apply role-based margins
const baseMargin = marginRules.role_based[productRole].target_margin;

// Apply feature adjustments
let adjustedMargin = baseMargin;
if (product.battery === '60V_MAX') {
  adjustedMargin += marginRules.feature_adjustments.battery['60V_MAX'].adjustment;
}

// Apply volume adjustments
if (product.yearTarget > marginRules.volume_adjustments.high_volume.threshold) {
  adjustedMargin += marginRules.volume_adjustments.high_volume.adjustment;
}
```

## Configuration Management

### Making Changes

1. **Edit Configuration**: Modify the appropriate JSON file
2. **Update Metadata**: Update `last_updated` timestamp and increment `version` if needed
3. **Validate**: Run validation script to ensure correctness
4. **Test**: Deploy to development environment first
5. **Deploy**: Deploy to production after testing

### Version Management

- **Major Version**: Increment for breaking changes (e.g., 1.0 → 2.0)
- **Minor Version**: Increment for new features (e.g., 1.0 → 1.1)
- **Timestamp**: Always update `last_updated` for any change

### Backup Strategy

The deployment script automatically creates timestamped backups:
- Location: `margin_rules/backups/margin_rules_YYYY-MM-DDTHH-MM-SS.json`
- Retention: Manual cleanup required
- Metadata: Includes original version and backup timestamp

## Configuration Reference

### Role-Based Margins

Each product role (Best, Better, Good, Entry) has:

- **target_margin**: Ideal margin percentage (0-1)
- **min_margin**: Minimum acceptable margin for compliance
- **max_margin**: Maximum recommended margin
- **promo_floor**: Minimum margin during promotions
- **max_volume_discount**: Maximum volume-based discount allowed

### Feature Adjustments

#### Battery Types
- **60V MAX**: +5% margin (premium technology)
- **40V MAX**: +3% margin (high performance)
- **20V MAX**: 0% margin (standard)
- **20V**: -2% margin (basic technology)

#### Premium Features
- **metal_blade_guard**: +2% margin
- **premium_case**: +1.5% margin
- **LED_light**: +0.5% margin
- **electric_brake**: +1% margin

### Volume Adjustments

Based on `yearTarget` from product data:
- **High Volume** (>40k units): -3% margin
- **Medium Volume** (30k-40k units): -1.5% margin
- **Low Volume** (<30k units): 0% margin

### Seasonal Adjustments

- **peak**: +2% (spring/summer construction season)
- **off_season**: -2% (winter months)
- **holiday**: Dynamic based on demand
- **back_to_school**: +1% (late summer)
- **end_of_year**: -1.5% (clearance period)

## Troubleshooting

### Common Issues

1. **Validation Errors**
   - Check JSON syntax
   - Verify all required fields are present
   - Ensure numeric values are within valid ranges

2. **S3 Deployment Failures**
   - Verify AWS credentials and permissions
   - Check bucket name and region
   - Ensure bucket exists and is accessible

3. **Agent Integration Issues**
   - Verify S3 bucket permissions for Lambda execution role
   - Check CloudWatch logs for detailed error messages
   - Ensure fallback default rules are properly configured

### Error Messages

- **"Missing required field"**: Add the missing field to configuration
- **"must be between 0 and 1"**: Adjust margin percentages to valid range
- **"min_margin cannot be greater than max_margin"**: Fix margin range logic
- **"Configuration validation failed"**: Run validation script for detailed errors

### Performance Considerations

- **File Size**: Keep configuration under 1MB for optimal Lambda performance
- **Caching**: Agent caches configuration for 5 minutes to reduce S3 calls
- **Fallback**: Always maintain hardcoded defaults in agent code

## Best Practices

### Configuration Management
1. Always validate before deployment
2. Test in development environment first
3. Use version control for configuration files
4. Document all changes with business justification
5. Maintain separate dev/prod configurations

### Security
1. Use S3 server-side encryption
2. Restrict S3 bucket access to necessary roles only
3. Enable S3 access logging for audit trails
4. Use IAM policies for least-privilege access

### Monitoring
1. Set up CloudWatch alarms for configuration retrieval failures
2. Monitor agent performance after configuration changes
3. Track margin compliance rates and review flags
4. Regular audits of pricing decisions and margin calculations

## Support

For issues or questions:
1. Check validation output for specific error details
2. Review CloudWatch logs for agent execution errors
3. Verify S3 permissions and bucket configuration
4. Test with development configuration first
5. Contact the pricing systems team for business rule questions