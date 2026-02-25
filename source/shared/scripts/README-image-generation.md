# Product Image Generation with Amazon Bedrock Nova

This directory contains scripts for generating AI-powered product images using Amazon Bedrock's Nova Canvas model.

## Overview

The image generation system automatically creates professional product images based on product descriptions, attributes, and features. Images are generated using Amazon Bedrock Nova Canvas and stored in S3 with proper URLs updated in the product data.

## Scripts

### `generate-product-images.js`
Main script for generating product images using Bedrock Nova model.

**Usage:**
```bash
node generate-product-images.js [environment] [region] [account] [--force]
```

**Parameters:**
- `environment`: Target environment (dev/prod) - default: dev
- `region`: AWS region - default: us-east-1  
- `account`: AWS account ID - default: 607104513879
- `--force`: Force regenerate existing images

**Examples:**
```bash
# Generate images for dev environment
node generate-product-images.js dev us-east-1 607104513879

# Force regenerate all images
node generate-product-images.js dev us-east-1 607104513879 --force

# Generate for production
node generate-product-images.js prod us-east-1 987654321098
```

### Integration with `deploy-product-data.sh`

The deployment script automatically includes image generation:

```bash
# Deploy with image generation (default)
./deploy-product-data.sh dev us-east-1 607104513879

# Skip image generation
./deploy-product-data.sh dev us-east-1 607104513879 --skip-images

# Force regenerate all images
./deploy-product-data.sh dev us-east-1 607104513879 --force-images
```

## How It Works

### 1. Product Description Generation
The script analyzes product data to create detailed descriptions:

```javascript
// Example generated description
"Professional drills from DEWALT, power tool, cordless powered, 20V MAX battery, yellow color scheme, featuring High Speed Transmission, Compact Design, LED Work Light, product photography, white background, professional lighting, high quality, detailed, commercial product shot, 4K resolution"
```

### 2. AI Image Generation
Uses Amazon Bedrock Nova Canvas model with optimized parameters:
- **Model**: `amazon.nova-canvas-v1:0`
- **Resolution**: 1024x1024 pixels
- **CFG Scale**: 8.0 (balanced creativity/adherence)
- **Format**: JPEG for web optimization

### 3. S3 Storage
Images are uploaded to S3 with organized structure:
```
s3://bucket-name/products/images/
├── powertools/
│   ├── DEWALT-DRILLS-DCD771C2.jpg
│   ├── MILWAUKEE-DRILLS-M18-2804.jpg
│   └── ...
├── apparel/
│   ├── NIKE-SHIRTS-DRI-FIT-001.jpg
│   └── ...
├── footwear/
└── kitchen/
```

### 4. URL Updates
Product JSON files are automatically updated with new S3 URLs:
```json
{
  "product_id": "DEWALT-DRILLS-DCD771C2",
  "imageUrl": "https://bucket-name.s3.us-east-1.amazonaws.com/products/images/powertools/DEWALT-DRILLS-DCD771C2.jpg",
  "imageGeneratedAt": "2025-10-22T19:18:07.681Z"
}
```

## Configuration

### AWS Services Required
- **Amazon Bedrock**: Nova Canvas model access
- **Amazon S3**: Image storage bucket
- **IAM Permissions**: Bedrock and S3 access

### Rate Limiting
- **Batch Size**: 5 images per batch
- **Delay**: 2 seconds between batches
- **Retry Logic**: Automatic retry with exponential backoff

### Error Handling
- Failed generations use placeholder images
- Errors are logged but don't stop the process
- Partial failures are reported in summary

## Prerequisites

### 1. Bedrock Model Access
Ensure Nova Canvas model is available in your region:
```bash
aws bedrock list-foundation-models --region us-east-1 --query 'modelSummaries[?contains(modelId, `nova-canvas`)]'
```

### 2. IAM Permissions
Required IAM permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-canvas-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::product-catalog-assets-*/*"
    }
  ]
}
```

### 3. S3 Bucket
The target S3 bucket must exist and be accessible.

## Troubleshooting

### Common Issues

#### "Model not available in region"
- Check if Nova Canvas is available in your AWS region
- Consider using a different region (us-east-1, us-west-2)

#### "Access denied to Bedrock"
- Verify IAM permissions for Bedrock
- Check if model access is enabled in Bedrock console

#### "S3 bucket not found"
- Ensure infrastructure is deployed first
- Verify bucket name matches environment/account pattern

#### Rate limiting errors
- Reduce BATCH_SIZE in script
- Increase DELAY_BETWEEN_BATCHES

### Debug Mode
Enable verbose logging by setting environment variable:
```bash
export DEBUG=1
node generate-product-images.js
```

## Cost Considerations

### Bedrock Nova Pricing
- **Image Generation**: ~$0.040 per image (1024x1024)
- **64 products**: ~$2.56 per full regeneration

### S3 Storage
- **Storage**: ~$0.023 per GB per month
- **64 images (~50MB)**: ~$0.001 per month

### Optimization Tips
- Use `--skip-images` for development deployments
- Only use `--force` when necessary
- Consider batch processing for large catalogs

## Monitoring

### CloudWatch Metrics
Monitor Bedrock and S3 usage:
- Bedrock InvokeModel calls
- S3 PutObject operations
- Error rates and latency

### Logging
All operations are logged with:
- Product ID and category
- Generation success/failure
- S3 upload status
- Error details for troubleshooting

## Future Enhancements

### Planned Features
- **Style Templates**: Category-specific image styles
- **Batch Optimization**: Parallel processing improvements  
- **Image Variants**: Multiple angles/styles per product
- **Quality Validation**: Automated image quality checks
- **CDN Integration**: CloudFront distribution setup

### Integration Options
- **Lambda Function**: Serverless image generation
- **Step Functions**: Orchestrated batch processing
- **EventBridge**: Event-driven regeneration
- **API Gateway**: On-demand image generation endpoint