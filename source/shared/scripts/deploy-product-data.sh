#!/bin/bash

# Deploy Product Data Script
# Uploads product data to S3 and optionally populates DynamoDB

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${2:-us-east-1}
AWS_ACCOUNT=${3:-123456789012}

# Stack name
STACK_NAME="ProductCatalogStack-${ENVIRONMENT}"

# Get actual resource names from CloudFormation stack outputs
echo "🔍 Retrieving resource names from CloudFormation stack..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --region "${AWS_REGION}" --query 'Stacks[0].Outputs' --output json 2>/dev/null || echo "[]")

if [ "$STACK_OUTPUTS" = "[]" ]; then
    echo "❌ Could not retrieve stack outputs for ${STACK_NAME}. Make sure the infrastructure is deployed first:"
    echo "   cd src/backend && npm run deploy:infrastructure"
    exit 1
fi

# Extract actual resource names from outputs
BUCKET_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="AssetsBucketName") | .OutputValue' 2>/dev/null)
TABLE_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="ProductTableName") | .OutputValue' 2>/dev/null)
CLOUDFRONT_DOMAIN=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="AssetsDistributionDomainName") | .OutputValue' 2>/dev/null)

# Fallback to default names if outputs not found
if [ "$BUCKET_NAME" = "null" ] || [ "$BUCKET_NAME" = "" ]; then
    BUCKET_NAME="product-catalog-assets-${ENVIRONMENT}-${AWS_ACCOUNT}"
    echo "⚠️  Using fallback bucket name: ${BUCKET_NAME}"
fi

if [ "$TABLE_NAME" = "null" ] || [ "$TABLE_NAME" = "" ]; then
    TABLE_NAME="product-catalog-${ENVIRONMENT}"
    echo "⚠️  Using fallback table name: ${TABLE_NAME}"
fi

if [ "$CLOUDFRONT_DOMAIN" = "null" ] || [ "$CLOUDFRONT_DOMAIN" = "" ]; then
    echo "⚠️  CloudFront domain not found in stack outputs"
    echo "   Images will use direct S3 URLs (not recommended for production)"
    CLOUDFRONT_DOMAIN=""
else
    echo "📡 CloudFront Domain: ${CLOUDFRONT_DOMAIN}"
fi

echo "🚀 Deploying product data to ${ENVIRONMENT} environment..."
echo "📍 AWS Region: ${AWS_REGION}"
echo "🪣 S3 Bucket: ${BUCKET_NAME}"
echo "🗄️  DynamoDB Table: ${TABLE_NAME}"

# Check if bucket exists
if ! aws s3 ls "s3://${BUCKET_NAME}" --region ${AWS_REGION} >/dev/null 2>&1; then
    echo "❌ S3 bucket ${BUCKET_NAME} not found. Make sure you've deployed the infrastructure first:"
    echo "   cd src/backend && npm run deploy:infrastructure"
    exit 1
fi

# Upload product data to S3
echo "📤 Uploading product data to S3..."

# Upload categories
aws s3 cp ../data/categories.json "s3://${BUCKET_NAME}/products/categories.json" --region ${AWS_REGION}
echo "   ✅ Categories uploaded"

# Upload product files for each category
for category in powertools apparel footwear kitchen; do
    aws s3 cp "../data/sample-products/${category}.json" "s3://${BUCKET_NAME}/products/${category}/products.json" --region ${AWS_REGION}
    echo "   ✅ ${category} products uploaded"
done

# Upload category filters
aws s3 cp ../data/category-filters/ "s3://${BUCKET_NAME}/products/filters/" --recursive --region ${AWS_REGION}
echo "   ✅ Category filters uploaded"

# Upload competitive data
if [ -d "../data/competitive_data" ]; then
    aws s3 cp ../data/competitive_data/ "s3://${BUCKET_NAME}/competitive-data/" --recursive --region ${AWS_REGION}
    echo "   ✅ Competitive data uploaded"
fi

# Upload margin rules
if [ -d "../data/margin_rules" ]; then
    aws s3 cp ../data/margin_rules/ "s3://${BUCKET_NAME}/margin-rules/" --recursive --region ${AWS_REGION}
    echo "   ✅ Margin rules uploaded"
fi

# Upload demand forecast data
if [ -d "../data/demand-forecasts" ]; then
    aws s3 sync ../data/demand-forecasts/ "s3://${BUCKET_NAME}/demand_forecasts/" --exclude "_summary.json" --region ${AWS_REGION}
    echo "   ✅ Demand forecast data uploaded"
fi

# Upload pre-built product images to S3
echo ""
echo "🎨 Uploading product images..."

IMAGES_DIR="$(dirname "$0")/../data/product-images"
if [ -d "$IMAGES_DIR" ] && [[ "$*" != *"--skip-images"* ]]; then
    # Update image URLs in product JSON to use this deployment's CloudFront domain
    for category_dir in "$IMAGES_DIR"/*/; do
        category=$(basename "$category_dir")
        for img in "$category_dir"*.jpg; do
            [ -f "$img" ] || continue
            product_id=$(basename "$img" .jpg)
            # Update the imageUrl in the corresponding product JSON
            DATA_FILE="$(dirname "$0")/../data/sample-products/${category}.json"
            if [ -f "$DATA_FILE" ] && command -v jq &> /dev/null; then
                jq --arg pid "$product_id" --arg url "https://${CLOUDFRONT_DOMAIN}/products/images/${category}/${product_id}.jpg" \
                    '[ .[] | if .product_id == $pid then .imageUrl = $url else . end ]' \
                    "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
            fi
        done
    done

    aws s3 sync "$IMAGES_DIR" "s3://${BUCKET_NAME}/products/images/" \
        --region "${AWS_REGION}" --cache-control "max-age=31536000" --content-type "image/jpeg" --quiet
    echo "   ✅ Product images uploaded"
else
    if [[ "$*" == *"--skip-images"* ]]; then
        echo "   ⏭️  Skipping image upload (--skip-images flag provided)"
    else
        echo "   ⚠️  No pre-built images found at $IMAGES_DIR"
    fi
fi

# Load product data into DynamoDB (including updated image URLs)
echo ""
echo "📥 Loading product data into DynamoDB..."
echo "   🔄 This will include any newly generated image URLs"

# Check if DynamoDB table exists
if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region ${AWS_REGION} >/dev/null 2>&1; then
    echo "❌ DynamoDB table ${TABLE_NAME} not found. Make sure you've deployed the infrastructure first:"
    echo "   cd src/backend && npm run deploy:infrastructure"
    exit 1
fi

# Run the DynamoDB loader script
node load-products-to-dynamodb.js "${ENVIRONMENT}" "${AWS_REGION}" "${AWS_ACCOUNT}"

if [ $? -eq 0 ]; then
    echo "   ✅ Product data loaded into DynamoDB successfully"
else
    echo "   ❌ Failed to load product data into DynamoDB"
    exit 1
fi

echo ""
echo "✅ Product data deployment completed successfully!"
echo ""
echo "📊 Data uploaded:"
echo "   - Categories: 4 categories"
echo "   - Products: 64 products across 4 categories"
echo "   - Product Images: AI-generated with Bedrock Nova"
echo "   - Filters: Category-specific filter options"
echo "   - Competitive data: Market analysis data"
echo "   - Margin rules: Pricing compliance rules"
echo "   - Demand forecasts: Historical data + 12-month forecasts"
echo ""
echo "🔗 S3 Structure:"
echo "   s3://${BUCKET_NAME}/products/categories.json"
echo "   s3://${BUCKET_NAME}/products/powertools/products.json"
echo "   s3://${BUCKET_NAME}/products/apparel/products.json"
echo "   s3://${BUCKET_NAME}/products/footwear/products.json"
echo "   s3://${BUCKET_NAME}/products/kitchen/products.json"
echo "   s3://${BUCKET_NAME}/products/filters/"
echo "   s3://${BUCKET_NAME}/products/images/"
echo "   s3://${BUCKET_NAME}/competitive-data/"
echo "   s3://${BUCKET_NAME}/margin-rules/"
echo "   s3://${BUCKET_NAME}/demand_forecasts/"
echo ""
echo "🗄️  DynamoDB Data:"
echo "   - Table: ${TABLE_NAME}"
echo "   - Products: 64 products loaded with proper DynamoDB structure"
echo "   - Access patterns: Category, role, vendor, price-based queries"
echo ""
echo "🎯 Next steps:"
echo "   1. Test the GraphQL API endpoints"
echo "   2. Verify data access from the frontend"
echo "   3. Run pricing analysis tests"
echo ""
echo "🎨 Image Generation Options:"
echo "   - Skip images: ./deploy-product-data.sh ${ENVIRONMENT} ${AWS_REGION} ${AWS_ACCOUNT} --skip-images"
echo "   - Force regenerate: ./deploy-product-data.sh ${ENVIRONMENT} ${AWS_REGION} ${AWS_ACCOUNT} --force-images"
echo "   - Manual generation: node generate-product-images.js ${ENVIRONMENT} ${AWS_REGION} ${AWS_ACCOUNT}"
echo ""
echo "🧪 Testing Options:"
echo "   - Test CloudFront CORS: node test-cloudfront-cors.js ${ENVIRONMENT} ${AWS_REGION}"
echo "   - Test S3 existence: node test-s3-check.js ${AWS_REGION} ${AWS_ACCOUNT} ${ENVIRONMENT}"