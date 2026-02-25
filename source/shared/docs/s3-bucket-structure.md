# S3 Bucket Structure for Product Catalog

## Overview
The product catalog uses S3 for storing product data and images, organized by category for optimal performance and maintainability.

## Bucket Structure

```
retail-pricing-assets/
├── products/
│   ├── categories.json                    # Category metadata
│   ├── powertools/
│   │   ├── products.json                  # Power tools product data
│   │   ├── filters.json                   # Available filter options
│   │   └── images/
│   │       ├── CMAN-SAW-PRO725.jpg
│   │       ├── DEWALT-DRILL-DCD771C2.jpg
│   │       └── ...
│   ├── apparel/
│   │   ├── products.json                  # Apparel product data
│   │   ├── filters.json                   # Available filter options
│   │   └── images/
│   │       ├── NIKE-SHIRT-M001.jpg
│   │       ├── ADIDAS-HOODIE-W002.jpg
│   │       └── ...
│   ├── footwear/
│   │   ├── products.json                  # Footwear product data
│   │   ├── filters.json                   # Available filter options
│   │   └── images/
│   │       ├── ADIDAS-SHOE-R001.jpg
│   │       ├── NIKE-SNEAKER-C002.jpg
│   │       └── ...
│   └── kitchen/
│       ├── products.json                  # Kitchen appliances product data
│       ├── filters.json                   # Available filter options
│       └── images/
│           ├── CUISINART-BLENDER-B001.jpg
│           ├── KITCHENAID-MIXER-M002.jpg
│           └── ...
└── placeholders/
    ├── product-placeholder.jpg            # Default product image
    ├── category-powertools.jpg            # Power tools category icon
    ├── category-apparel.jpg               # Apparel category icon
    ├── category-footwear.jpg              # Footwear category icon
    └── category-kitchen.jpg               # Kitchen category icon
```

## CloudFront Distribution
- All images served through CloudFront CDN for optimal performance
- Automatic image optimization and responsive sizing
- Edge caching for global delivery

## Access Patterns
1. **Category List**: `GET /products/categories.json`
2. **Category Products**: `GET /products/{category}/products.json`
3. **Category Filters**: `GET /products/{category}/filters.json`
4. **Product Images**: `GET /products/{category}/images/{product-id}.jpg`
5. **Placeholder Images**: `GET /placeholders/{placeholder-name}.jpg`

## File Formats
- **JSON**: All data files use UTF-8 encoded JSON
- **Images**: JPEG format, optimized for web delivery
- **Naming**: Kebab-case for files, UPPERCASE for product IDs
