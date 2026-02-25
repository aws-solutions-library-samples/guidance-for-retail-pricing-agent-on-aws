# Product Data Deployment Guide

## Overview

The product catalog deployment process has been updated to populate both S3 and DynamoDB with sample product data. This ensures that the frontend `/products` page will show actual products when you visit it.

## What's Included

### Product Data
- **64 products** across 4 categories:
  - **Power Tools** (16 products): Drills, saws, sanders, grinders
  - **Apparel** (16 products): Shirts, hoodies, t-shirts, polo shirts  
  - **Footwear** (16 products): Running shoes, casual shoes, walking shoes, boots
  - **Kitchen Appliances** (16 products): Blenders, mixers, coffee makers, toasters

### Data Storage
- **S3**: JSON files for backup and reference
- **DynamoDB**: Structured data for GraphQL API queries with proper indexing

## Deployment Commands

### Complete Deployment (Recommended)
```bash
# Deploy everything: infrastructure + data
cd src/shared/scripts
bash deploy-complete.sh dev us-east-1 607104513879
```

### Infrastructure Only
```bash
# Deploy just the AWS infrastructure
cd src/backend
npm run deploy:infrastructure
```

### Data Only
```bash
# Deploy just the product data (requires infrastructure to exist)
cd src/shared/scripts
bash deploy-product-data.sh dev us-east-1 607104513879
```

### DynamoDB Only
```bash
# Load just the DynamoDB data (requires table to exist)
cd src/shared/scripts
node load-products-to-dynamodb.js dev us-east-1 607104513879
```

## Verification

### Check S3 Data
```bash
aws s3 ls s3://product-catalog-assets-dev-607104513879/products/ --recursive
```

### Check DynamoDB Data
```bash
aws dynamodb scan --table-name ProductCatalog --filter-expression "entityType = :entityType" --expression-attribute-values '{":entityType":{"S":"PRODUCT"}}' --select COUNT
```

### Test GraphQL API
Visit your frontend at `http://localhost:3000/products` and select a category to see the loaded products.

## DynamoDB Structure

The products are stored with the following key structure for optimal GraphQL performance:

### Primary Table
- **PK**: `CATEGORY#{category}` (e.g., `CATEGORY#powertools`)
- **SK**: `PRODUCT#{timestamp}#{product_id}` (e.g., `PRODUCT#2025-10-17T22:24:01.405Z#DEWALT-DRILLS-DCD771C2`)

### Global Secondary Indexes

#### GSI1: Role-based filtering with price sorting
- **GSI1PK**: `ROLE#{role}#{category}` (e.g., `ROLE#best#powertools`)
- **GSI1SK**: `PRICE#{padded_price}#{product_id}` (e.g., `PRICE#00017999#DEWALT-DRILLS-DCD771C2`)

#### GSI2: Vendor-based filtering with update time sorting
- **GSI2PK**: `VENDOR#{vendor}#{category}` (e.g., `VENDOR#DEWALT#powertools`)
- **GSI2SK**: `UPDATED#{timestamp}#{product_id}` (e.g., `UPDATED#2025-10-17T22:24:01.405Z#DEWALT-DRILLS-DCD771C2`)

#### GSI3: Full-text search support
- **GSI3PK**: `SEARCH#{category}` (e.g., `SEARCH#powertools`)
- **GSI3SK**: `SEARCHABLE#{searchable_text}` (e.g., `SEARCHABLE#dewalt drill cordless brushed led light`)

## Supported GraphQL Queries

With this data structure, the following GraphQL operations are optimized:

### List Products by Category
```graphql
query ListProducts($category: ProductCategory!) {
  listProducts(category: $category, first: 20) {
    edges {
      node {
        product_id
        vendor
        MSRP
        role
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Filter by Role
```graphql
query ListProductsByRole($category: ProductCategory!, $roles: [ProductRole!]!) {
  listProducts(category: $category, filter: { roles: $roles }) {
    edges {
      node {
        product_id
        vendor
        MSRP
        role
      }
    }
  }
}
```

### Search Products
```graphql
query SearchProducts($category: ProductCategory!, $query: String!) {
  searchProducts(category: $category, query: $query) {
    edges {
      node {
        product_id
        vendor
        MSRP
        features
      }
    }
  }
}
```

## Troubleshooting

### Products Not Showing in Frontend
1. **Check DynamoDB**: Verify products are loaded with the scan command above
2. **Check GraphQL API**: Test the API directly with GraphQL queries
3. **Check Frontend**: Ensure the frontend is connecting to the correct API endpoint

### DynamoDB Loading Fails
1. **Check AWS Credentials**: Ensure AWS CLI is configured with proper permissions
2. **Check Table Exists**: Verify the DynamoDB table was created by the infrastructure deployment
3. **Check Region**: Ensure you're using the correct AWS region

### S3 Upload Fails
1. **Check Bucket Exists**: Verify the S3 bucket was created by the infrastructure deployment
2. **Check Permissions**: Ensure your AWS credentials have S3 write permissions
3. **Check File Paths**: Verify the product JSON files exist in `src/shared/data/sample-products/`

## File Structure

```
src/shared/
├── data/
│   ├── sample-products/
│   │   ├── powertools.json      # 16 power tool products
│   │   ├── apparel.json         # 16 apparel products
│   │   ├── footwear.json        # 16 footwear products
│   │   └── kitchen.json         # 16 kitchen appliance products
│   ├── categories.json          # Category metadata
│   └── category-filters/        # Filter options per category
└── scripts/
    ├── deploy-complete.sh       # Complete deployment script
    ├── deploy-product-data.sh   # Data deployment script
    ├── load-products-to-dynamodb.js  # DynamoDB loader
    └── test-dynamodb-loader.js  # Test script
```

## Next Steps

After successful deployment:

1. **Test the Frontend**: Visit `http://localhost:3000/products` and browse categories
2. **Test GraphQL**: Use the GraphQL playground to test queries
3. **Run Pricing Analysis**: Select products and test the pricing analysis workflow
4. **Monitor Logs**: Check CloudWatch logs for any issues

The product catalog should now be fully functional with real product data!