# Multi-Category Product Catalog Data Structure

This directory contains the flexible product data structure and validation system for the multi-category product catalog management feature.

## 🏗️ Architecture Overview

The system supports four product categories with flexible, category-specific attributes:

- **Power Tools**: powerType, batteryVoltage, motorType, bladeSpeed, etc.
- **Apparel**: size, color, material, gender, season, etc.
- **Footwear**: size, width, style, material, closure, etc.
- **Kitchen Appliances**: capacity, power, material, dimensions, etc.

## 📁 Directory Structure

```
src/shared/
├── schemas/
│   └── product-schemas.js          # JSON schemas for all categories
├── utils/
│   └── product-validation.js       # Validation utilities
├── data/
│   ├── categories.json             # Category metadata
│   ├── sample-products/            # Sample product data by category
│   │   ├── powertools.json
│   │   ├── apparel.json
│   │   ├── footwear.json
│   │   └── kitchen.json
│   └── category-filters/           # Filter options by category
│       ├── powertools-filters.json
│       ├── apparel-filters.json
│       ├── footwear-filters.json
│       └── kitchen-filters.json
├── scripts/
│   └── setup-product-data.js      # Data validation and setup script
└── docs/
    ├── s3-bucket-structure.md      # S3 organization documentation
    └── placeholder-images.md       # Image requirements
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd src/shared
npm install
```

### 2. Validate Data Structure

```bash
npm run setup
```

This will:

- ✅ Validate all product schemas
- ✅ Validate category metadata
- ✅ Validate filter configurations
- ✅ Generate S3 bucket structure documentation
- ✅ Generate placeholder image requirements

## 📊 Data Validation Results

All data has been validated successfully:

### Categories: 4/4 Valid

- ✅ Power Tools (powertools)
- ✅ Apparel (apparel)
- ✅ Footwear (footwear)
- ✅ Kitchen Appliances (kitchen)

### Products: 16/16 Valid

- ✅ Power Tools: 4 products (CRAFTSMAN, DEWALT, RYOBI, HARBOR FREIGHT)
- ✅ Apparel: 4 products (NIKE, ADIDAS, HANES, FRUIT OF THE LOOM)
- ✅ Footwear: 4 products (ADIDAS, NIKE, SKETCHERS, PAYLESS)
- ✅ Kitchen: 4 products (CUISINART, KITCHENAID, HAMILTON BEACH, PROCTOR SILEX)

### Filter Sets: 4/4 Valid

- ✅ Power tools filters (powerTypes, batteryVoltages, etc.)
- ✅ Apparel filters (sizes, colors, materials, genders, seasons)
- ✅ Footwear filters (sizes, widths, styles, materials)
- ✅ Kitchen filters (capacities, materials, colors)

## 🔧 Key Features

### Flexible Schema Design

- **Base Schema**: Common fields across all categories (id, category, role, pricing, etc.)
- **Category-Specific Attributes**: Flexible attributes object that varies by category
- **Validation**: Comprehensive JSON schema validation with detailed error reporting

### Multi-Category Support

- **Power Tools**: Supports cordless/corded tools with battery voltage, motor type, blade specifications
- **Apparel**: Supports clothing with size, material, season, gender targeting
- **Footwear**: Supports shoes with size, width, style, closure type
- **Kitchen**: Supports appliances with capacity, power, dimensions, material

### Data Organization

- **S3 Structure**: Category-organized data and images for optimal performance
- **CloudFront CDN**: Image delivery with automatic optimization
- **Validation**: Runtime validation with detailed error reporting and logging

## 📋 Requirements Satisfied

This implementation satisfies the following requirements:

### ✅ Requirement 1.1, 1.2: Category Selection

- Category metadata with icons and product counts
- Support for Power Tools, Apparel, Footwear, Kitchen Appliances

### ✅ Requirement 6.1, 6.2: Flexible Data Structure

- JSON format with defined schema supporting multiple categories
- Required fields: id, category, subcategory, role, cost, MSRP, MAP

### ✅ Requirement 6.3: Category-Specific Attributes

- Power Tools: powerType, batteryVoltage, motorType, bladeSpeed, cuttingDepth, bevelCapacity
- Apparel: size, color, material, season, gender
- Footwear: size, width, color, material, style
- Kitchen Appliances: capacity, power, material, features, dimensions

### ✅ Requirement 6.4, 6.5: Features and Images

- Features stored as array of strings relevant to category
- Image URLs organized by category with CloudFront CDN

### ✅ Requirement 6.6, 6.7: Validation and Error Handling

- JSON structure validation against category-specific schemas
- Error logging and exclusion of invalid products from catalog

## 🎯 Next Steps

With the data structure complete, the next tasks are:

1. **Task 2**: Implement storage service for category and product data fetching
2. **Task 3**: Create multi-category ProductType interfaces and data models
3. **Task 4**: Build CategorySelector component

The foundation is now ready for building the multi-category product catalog UI components!

##

🚀 Deployment Scripts

The `scripts/` directory contains deployment and data management scripts:

### Data Management

- **`setup-product-data.js`** - Generates and validates all product data (64 products across 4 categories)
- **`deploy-product-data.sh`** - Uploads product data to S3 after infrastructure deployment

### Complete Deployment

- **`deploy-complete.sh`** - Complete deployment script that handles infrastructure + data deployment

### Usage Examples

```bash
# Generate and validate product data
node src/shared/scripts/setup-product-data.js

# Deploy only product data (after infrastructure is deployed)
bash src/shared/scripts/deploy-product-data.sh dev us-east-1 us-west-2

# Complete deployment (infrastructure + data)
bash src/shared/scripts/deploy-complete.sh dev us-east-1 us-west-2

# Or use npm scripts from project root
npm run deploy:dev              # Complete deployment
npm run deploy:infrastructure:dev  # Infrastructure only
npm run deploy:data:dev         # Data only
```

### Script Features

#### `deploy-complete.sh`

- ✅ Validates prerequisites (AWS CLI, CDK, Node.js)
- ✅ Generates and validates product data
- ✅ Builds and deploys CDK infrastructure
- ✅ Uploads product data to S3
- ✅ Verifies deployment success
- ✅ Provides comprehensive deployment summary

#### `deploy-product-data.sh`

- ✅ Uploads categories.json to S3
- ✅ Uploads 64 products across 4 categories
- ✅ Uploads category filters and metadata
- ✅ Uploads competitive analysis data
- ✅ Uploads margin rules and compliance data
- ✅ Verifies S3 bucket structure

### Deployment Architecture

**S3 (Static Data):**

- Product catalog JSON files (64 products)
- Category metadata and filters
- Competitive training data
- Margin rules and compliance data
- Product images and assets

**DynamoDB (Dynamic Data):**

- Active pricing sessions
- Real-time agent execution results
- User authentication and session management
- Analysis state and progress tracking
- Agent coordination and orchestration data
