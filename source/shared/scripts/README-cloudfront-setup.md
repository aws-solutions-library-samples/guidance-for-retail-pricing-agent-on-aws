# CloudFront Setup for Product Images

This guide explains how the CloudFront distribution is configured to serve product images securely from S3.

## Architecture Overview

```
Frontend → CloudFront Distribution → S3 Bucket (Private)
                ↓
        Origin Access Identity (OAI)
```

## Security Benefits

1. **Private S3 Bucket**: The S3 bucket is not publicly accessible
2. **Origin Access Identity**: CloudFront uses OAI to access S3 securely
3. **HTTPS Only**: All image requests are served over HTTPS
4. **Edge Caching**: Images are cached at CloudFront edge locations globally

## CDK Configuration

The CloudFront distribution is automatically created with the following features:

### Origin Access Identity (OAI)
- Grants CloudFront exclusive access to the S3 bucket
- Prevents direct S3 access from the internet
- Maintains security while allowing CDN functionality

### Cache Behaviors
- **Default Behavior**: Optimized caching for all assets
- **Images Path (`/products/images/*`)**: Specialized caching for product images
- **HTTPS Redirect**: All HTTP requests redirected to HTTPS

### Performance Optimizations
- **Caching Policy**: `CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS` for images
- **Origin Request Policy**: `CORS_S3_ORIGIN` for proper CORS handling
- **IPv6 Support**: Enabled for better global reach
- **Price Class**: Cost-optimized for development environments

## Deployment Process

### 1. Infrastructure Deployment
```bash
cd src/backend
npm run deploy:infrastructure
```

This creates:
- S3 bucket (private)
- CloudFront distribution
- Origin Access Identity
- Proper IAM permissions

### 2. Image Generation with CloudFront URLs
```bash
cd src/shared/scripts
./deploy-product-data.sh dev us-east-1 123456789012
```

The script automatically:
- Retrieves CloudFront domain from stack outputs
- Generates images and uploads to S3
- Updates product data with CloudFront URLs
- Loads updated data to DynamoDB

## URL Structure

### S3 Storage Path
```
s3://product-catalog-assets-dev-123456789012/products/images/
├── powertools/
│   ├── DEWALT-DRILLS-DCD771C2.jpg
│   └── ...
├── apparel/
│   ├── NIKE-SHIRTS-M001.jpg
│   └── ...
└── ...
```

### CloudFront URLs
```
https://d1234567890abc.cloudfront.net/products/images/apparel/NIKE-SHIRTS-M001.jpg
```

## Stack Outputs

The CDK stack provides these outputs for integration:

- `AssetsDistributionDomainName`: CloudFront domain (e.g., `d1234567890abc.cloudfront.net`)
- `AssetsDistributionId`: CloudFront distribution ID
- `AssetsBucketName`: S3 bucket name (for uploads)

## Testing CloudFront Access

### 1. Test Image Existence
```bash
node test-s3-check.js us-east-1 123456789012 dev
```

### 2. Test Image Generation
```bash
node test-image-generation.js
```

### 3. Manual URL Test
```bash
# Get CloudFront domain from stack outputs
aws cloudformation describe-stacks \
  --stack-name ProductCatalogStack-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`AssetsDistributionDomainName`].OutputValue' \
  --output text

# Test image URL
curl -I https://YOUR-CLOUDFRONT-DOMAIN/products/images/apparel/NIKE-SHIRTS-M001.jpg
```

## Troubleshooting

### Images Return 403 Forbidden
1. **Check OAI Configuration**: Ensure Origin Access Identity is properly configured
2. **Verify S3 Permissions**: CloudFront should have read access to S3 bucket
3. **Check Distribution Status**: Wait for distribution to be fully deployed

### Images Not Loading in Frontend
1. **CORS Configuration**: Verify CORS settings allow your frontend domain
2. **Cache Issues**: Try accessing images directly via CloudFront URL
3. **DynamoDB URLs**: Ensure product data has CloudFront URLs, not S3 URLs

### Slow Image Loading
1. **Cache Status**: Check CloudFront cache hit/miss ratios
2. **Edge Locations**: Verify requests are hitting nearby edge locations
3. **Image Optimization**: Consider image compression and format optimization

## Cache Management

### Cache Invalidation
If you need to update images and bypass cache:

```bash
# Invalidate specific images
aws cloudfront create-invalidation \
  --distribution-id YOUR-DISTRIBUTION-ID \
  --paths "/products/images/apparel/NIKE-SHIRTS-M001.jpg"

# Invalidate all images (expensive)
aws cloudfront create-invalidation \
  --distribution-id YOUR-DISTRIBUTION-ID \
  --paths "/products/images/*"
```

### Cache Headers
Images are served with optimized cache headers:
- **Cache-Control**: Long-term caching for performance
- **ETag**: Efficient cache validation
- **Last-Modified**: Browser cache optimization

## Cost Optimization

### Development Environment
- **Price Class 100**: Cheaper edge locations only
- **Reduced Caching**: Shorter TTL for faster updates during development

### Production Environment
- **Global Price Class**: All edge locations for best performance
- **Extended Caching**: Longer TTL for cost efficiency
- **Compression**: Automatic compression for smaller files

## Security Considerations

### Access Control
- S3 bucket blocks all public access
- Only CloudFront can access S3 via OAI
- No direct S3 URLs exposed to frontend

### HTTPS Enforcement
- All requests redirected to HTTPS
- TLS 1.2+ required
- Secure headers included in responses

### Monitoring
- CloudWatch metrics for distribution performance
- Access logs for security monitoring
- Error rate monitoring and alerting

## Integration with Frontend

The frontend automatically receives CloudFront URLs through the GraphQL API:

```typescript
// Product type includes CloudFront URL
interface Product {
  imageUrl: string; // https://d1234567890abc.cloudfront.net/products/images/...
}
```

No frontend changes required - the URLs are transparently updated to use CloudFront.

## Future Enhancements

### Planned Features
- **Image Optimization**: Automatic WebP conversion and resizing
- **Signed URLs**: Time-limited access for premium content
- **Custom Domain**: Use your own domain instead of CloudFront domain
- **WAF Integration**: Web Application Firewall for additional security

### Performance Improvements
- **HTTP/2 Push**: Preload critical images
- **Brotli Compression**: Better compression than gzip
- **Edge Computing**: Lambda@Edge for dynamic image processing