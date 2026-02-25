/**
 * @fileoverview DynamoDB table construct optimized for GraphQL cursor-based pagination.
 * 
 * Implements single-table design with multiple access patterns for efficient
 * product querying, filtering, and pagination at scale.
 */

import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode, StreamViewType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export class ProductTableConstruct extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new Table(this, 'ProductTable', {
      tableName: 'ProductCatalog',
      
      // Primary key design for category-based queries
      partitionKey: { 
        name: 'PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'SK', 
        type: AttributeType.STRING 
      },
      
      // Serverless billing for cost optimization
      billingMode: BillingMode.PAY_PER_REQUEST,
      
      // Enable streams for real-time subscriptions
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      
      // Point-in-time recovery for data protection
      pointInTimeRecovery: true,
      
      // TTL for temporary data (user sessions, etc.)
      timeToLiveAttribute: 'ttl',
      
      // Removal policy (adjust for production)
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Add Global Secondary Indexes for different access patterns
    // GSI1: Role-based queries with price sorting
    this.table.addGlobalSecondaryIndex({
      indexName: 'RolePriceIndex',
      partitionKey: { 
        name: 'GSI1PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI1SK', 
        type: AttributeType.STRING 
      },
      projectionType: ProjectionType.ALL
    });

    // GSI2: Vendor-based queries with update time sorting
    this.table.addGlobalSecondaryIndex({
      indexName: 'VendorUpdateIndex',
      partitionKey: { 
        name: 'GSI2PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI2SK', 
        type: AttributeType.STRING 
      },
      projectionType: ProjectionType.ALL
    });

    // GSI3: Full-text search support (for OpenSearch integration)
    this.table.addGlobalSecondaryIndex({
      indexName: 'SearchIndex',
      partitionKey: { 
        name: 'GSI3PK', 
        type: AttributeType.STRING 
      },
      sortKey: { 
        name: 'GSI3SK', 
        type: AttributeType.STRING 
      },
      projectionType: ProjectionType.KEYS_ONLY
    });
  }
}

/**
 * DynamoDB item structure for products optimized for GraphQL queries.
 */
export interface ProductItem {
  // Primary key structure
  PK: string;                    // CATEGORY#{category}
  SK: string;                    // PRODUCT#{timestamp}#{product_id}
  
  // GSI1: Role and price-based queries
  GSI1PK: string;               // ROLE#{role}#{category}
  GSI1SK: string;               // PRICE#{padded_price}#{product_id}
  
  // GSI2: Vendor and update time queries
  GSI2PK: string;               // VENDOR#{vendor}#{category}
  GSI2SK: string;               // UPDATED#{timestamp}#{product_id}
  
  // GSI3: Search support
  GSI3PK: string;               // SEARCH#{category}
  GSI3SK: string;               // SEARCHABLE#{searchable_text}
  
  // Entity metadata
  entityType: 'PRODUCT';
  id: string;                   // UUID for GraphQL
  product_id: string;           // Business identifier
  
  // Product data
  category: string;
  subcategory: string;
  role: 'best' | 'better' | 'good' | 'entry';
  vendor: string;
  cost: number;
  MSRP: number;
  MAP: number;
  yearTarget: number;
  attributes: Record<string, any>;
  features: string[];
  imageUrl: string;
  
  // Timestamps
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
  
  // Optional TTL for temporary items
  ttl?: number;
  
  // Cursor support for pagination
  cursor: string;               // Base64 encoded cursor for pagination
}

/**
 * Example product items showing the key structure.
 */
export const EXAMPLE_PRODUCT_ITEMS: ProductItem[] = [
  {
    // Primary access pattern: List products by category
    PK: 'CATEGORY#powertools',
    SK: 'PRODUCT#2024-01-15T10:30:00.000Z#CMAN-SAW-PRO725',
    
    // GSI1: Filter by role and sort by price
    GSI1PK: 'ROLE#best#powertools',
    GSI1SK: 'PRICE#000179.99#CMAN-SAW-PRO725',
    
    // GSI2: Filter by vendor and sort by update time
    GSI2PK: 'VENDOR#CRAFTSMAN#powertools',
    GSI2SK: 'UPDATED#2024-01-15T10:30:00.000Z#CMAN-SAW-PRO725',
    
    // GSI3: Search support
    GSI3PK: 'SEARCH#powertools',
    GSI3SK: 'SEARCHABLE#craftsman saw pro cordless brushless',
    
    entityType: 'PRODUCT',
    id: 'prod_01HMX8K9J2N3P4Q5R6S7T8U9V0',
    product_id: 'CMAN-SAW-PRO725',
    
    category: 'powertools',
    subcategory: 'saws',
    role: 'best',
    vendor: 'CRAFTSMAN',
    cost: 89.99,
    MSRP: 179.99,
    MAP: 149.99,
    yearTarget: 5000,
    
    attributes: {
      powerType: 'cordless',
      batteryVoltage: '60V MAX',
      motorType: 'brushless',
      bladeSpeed: '5200 RPM',
      cuttingDepth: '2.5 inches',
      bevelCapacity: '50 degrees',
      color: 'red',
      size: 7.25
    },
    
    features: ['Brushless Motor', 'LED Light', 'Dust Blower'],
    imageUrl: 'https://cdn.example.com/products/powertools/CMAN-SAW-PRO725.jpg',
    
    createdAt: '2024-01-15T10:30:00.000Z',
    updatedAt: '2024-01-15T10:30:00.000Z',
    
    cursor: 'eyJ0aW1lc3RhbXAiOiIyMDI0LTAxLTE1VDEwOjMwOjAwLjAwMFoiLCJpZCI6IkNNQU4tU0FXLVBSTzcyNSJ9'
  }
];

/**
 * Access patterns supported by this table design:
 * 
 * 1. List products by category (paginated)
 *    PK = CATEGORY#{category}
 *    SK begins_with PRODUCT#
 *    
 * 2. Filter products by role within category
 *    GSI1PK = ROLE#{role}#{category}
 *    GSI1SK for price-based sorting
 *    
 * 3. Filter products by vendor within category
 *    GSI2PK = VENDOR#{vendor}#{category}
 *    GSI2SK for update time sorting
 *    
 * 4. Search products within category
 *    GSI3PK = SEARCH#{category}
 *    GSI3SK contains searchable text
 *    
 * 5. Cursor-based pagination
 *    Use SK values as cursors for consistent pagination
 */