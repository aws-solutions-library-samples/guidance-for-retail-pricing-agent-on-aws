#!/usr/bin/env node

/**
 * @fileoverview Load product data from JSON files into DynamoDB.
 * 
 * Reads the sample product JSON files and loads them into DynamoDB
 * with the proper table structure for GraphQL cursor-based pagination.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

// Configuration
const ENVIRONMENT = process.argv[2] || 'dev';
const AWS_REGION = process.argv[3] || 'us-east-1';
const AWS_ACCOUNT = process.argv[4] || '607104513879';

const TABLE_NAME = `product-catalog-${ENVIRONMENT}`;
const BATCH_SIZE = 25; // DynamoDB batch write limit

// Configure AWS SDK v3
const client = new DynamoDBClient({ region: AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Generates a unique ID using timestamp and random string.
 * 
 * @returns {string} Unique identifier
 */
function generateId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `prod_${timestamp}_${randomStr}`;
}

/**
 * Pads a number with leading zeros for consistent sorting.
 * 
 * @param {number} num - Number to pad
 * @param {number} length - Total length after padding
 * @returns {string} Padded number string
 */
function padNumber(num, length = 8) {
    return num.toString().padStart(length, '0');
}

/**
 * Transforms a product from JSON format to DynamoDB item format.
 * 
 * @param {Object} product - Product from JSON file
 * @returns {Object} DynamoDB item with proper keys and structure
 */
function transformProductToDynamoDBItem(product) {
    const timestamp = product.updatedAt || new Date().toISOString();
    const id = generateId();
    
    // Pad price for consistent sorting (assuming max price is 99999.99)
    const paddedPrice = padNumber(Math.floor((product.MSRP || 0) * 100), 8);
    
    return {
        // Primary key structure
        PK: `CATEGORY#${product.category}`,
        SK: `PRODUCT#${timestamp}#${product.product_id}`,
        
        // GSI1: Role and price-based queries
        GSI1PK: `ROLE#${product.role}#${product.category}`,
        GSI1SK: `PRICE#${paddedPrice}#${product.product_id}`,
        
        // GSI2: Vendor and update time queries
        GSI2PK: `VENDOR#${product.vendor}#${product.category}`,
        GSI2SK: `UPDATED#${timestamp}#${product.product_id}`,
        
        // Entity metadata
        entityType: 'PRODUCT',
        id: id,
        product_id: product.product_id,
        
        // Product data
        category: product.category,
        subcategory: product.subcategory,
        role: product.role,
        vendor: product.vendor,
        cost: product.cost,
        MSRP: product.MSRP,
        MAP: product.MAP,
        yearTarget: product.yearTarget,
        attributes: product.attributes || {},
        features: product.features || [],
        imageUrl: product.imageUrl,
        
        // Timestamps
        createdAt: product.createdAt || timestamp,
        updatedAt: timestamp,
        
        // Cursor for pagination
        cursor: Buffer.from(JSON.stringify({
            timestamp: timestamp,
            id: product.product_id
        })).toString('base64')
    };
}

/**
 * Loads products from a JSON file and transforms them for DynamoDB.
 * 
 * @param {string} category - Product category
 * @returns {Array} Array of DynamoDB items
 */
function loadProductsFromFile(category) {
    const filePath = path.join(__dirname, `../data/sample-products/${category}.json`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Product file not found: ${filePath}`);
        return [];
    }
    
    try {
        const productsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return productsData.map(transformProductToDynamoDBItem);
    } catch (error) {
        console.error(`❌ Error reading ${category} products:`, error.message);
        return [];
    }
}

/**
 * Writes items to DynamoDB in batches.
 * 
 * @param {Array} items - DynamoDB items to write
 * @returns {Promise<void>}
 */
async function batchWriteItems(items) {
    const batches = [];
    
    // Split items into batches of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        batches.push(items.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`   📦 Writing ${items.length} items in ${batches.length} batches...`);
    
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const requestItems = {
            [TABLE_NAME]: batch.map(item => ({
                PutRequest: { Item: item }
            }))
        };
        
        try {
            let unprocessedItems = requestItems;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (unprocessedItems && Object.keys(unprocessedItems).length > 0 && retryCount < maxRetries) {
                const command = new BatchWriteCommand({
                    RequestItems: unprocessedItems
                });
                const result = await dynamodb.send(command);
                
                unprocessedItems = result.UnprocessedItems;
                
                if (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
                    retryCount++;
                    console.log(`   ⏳ Retrying batch ${i + 1} (attempt ${retryCount})...`);
                    // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
                }
            }
            
            if (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
                console.error(`   ❌ Failed to write batch ${i + 1} after ${maxRetries} retries`);
                throw new Error(`Batch write failed for batch ${i + 1}`);
            }
            
            console.log(`   ✅ Batch ${i + 1}/${batches.length} completed`);
            
        } catch (error) {
            console.error(`   ❌ Error writing batch ${i + 1}:`, error.message);
            throw error;
        }
    }
}

/**
 * Clears existing product data from the table.
 * 
 * @returns {Promise<void>}
 */
async function clearExistingProducts() {
    console.log('🧹 Clearing existing product data...');
    
    try {
        // Scan for all product items
        let items = [];
        let lastEvaluatedKey = null;
        
        do {
            const scanParams = {
                TableName: TABLE_NAME,
                FilterExpression: 'entityType = :entityType',
                ExpressionAttributeValues: {
                    ':entityType': 'PRODUCT'
                },
                ProjectionExpression: 'PK, SK'
            };
            
            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const command = new ScanCommand(scanParams);
            const result = await dynamodb.send(command);
            items = items.concat(result.Items || []);
            lastEvaluatedKey = result.LastEvaluatedKey;
            
        } while (lastEvaluatedKey);
        
        if (items.length === 0) {
            console.log('   ✅ No existing products found');
            return;
        }
        
        console.log(`   📋 Found ${items.length} existing products to delete`);
        
        // Delete in batches
        const deleteBatches = [];
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            deleteBatches.push(items.slice(i, i + BATCH_SIZE));
        }
        
        for (let i = 0; i < deleteBatches.length; i++) {
            const batch = deleteBatches[i];
            const requestItems = {
                [TABLE_NAME]: batch.map(item => ({
                    DeleteRequest: {
                        Key: {
                            PK: item.PK,
                            SK: item.SK
                        }
                    }
                }))
            };
            
            const deleteCommand = new BatchWriteCommand({
                RequestItems: requestItems
            });
            await dynamodb.send(deleteCommand);
            
            console.log(`   🗑️  Delete batch ${i + 1}/${deleteBatches.length} completed`);
        }
        
        console.log('   ✅ Existing products cleared');
        
    } catch (error) {
        console.error('   ❌ Error clearing existing products:', error.message);
        throw error;
    }
}

/**
 * Verifies that the DynamoDB table exists and is accessible.
 * 
 * @returns {Promise<void>}
 */
async function verifyTable() {
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            Limit: 1
        });
        const result = await dynamodb.send(command);
        
        console.log(`✅ DynamoDB table ${TABLE_NAME} is accessible`);
    } catch (error) {
        console.error(`❌ Cannot access DynamoDB table ${TABLE_NAME}:`, error.message);
        throw error;
    }
}

/**
 * Main function to load all product data into DynamoDB.
 */
async function loadProductData() {
    console.log('🚀 Loading product data into DynamoDB...');
    console.log(`📍 Environment: ${ENVIRONMENT}`);
    console.log(`📍 Region: ${AWS_REGION}`);
    console.log(`📍 Table: ${TABLE_NAME}`);
    console.log('');
    
    try {
        // Verify table access
        await verifyTable();
        
        // Clear existing products
        await clearExistingProducts();
        
        // Load products for each category
        const categories = ['powertools', 'apparel', 'footwear', 'kitchen'];
        let totalProducts = 0;
        
        for (const category of categories) {
            console.log(`📦 Loading ${category} products...`);
            
            const products = loadProductsFromFile(category);
            if (products.length === 0) {
                console.log(`   ⚠️  No products found for ${category}`);
                continue;
            }
            
            await batchWriteItems(products);
            totalProducts += products.length;
            
            console.log(`   ✅ ${products.length} ${category} products loaded`);
        }
        
        console.log('');
        console.log('✅ Product data loading completed successfully!');
        console.log(`📊 Total products loaded: ${totalProducts}`);
        console.log('📋 Data structure:');
        console.log('   - Primary access: PK=CATEGORY#{category}, SK=PRODUCT#{timestamp}#{product_id}');
        console.log('   - Role filtering: GSI1PK=ROLE#{role}#{category}, GSI1SK=PRICE#{price}#{product_id}');
        console.log('   - Vendor filtering: GSI2PK=VENDOR#{vendor}#{category}, GSI2SK=UPDATED#{timestamp}#{product_id}');
        console.log('   - Search support: GSI3PK=SEARCH#{category}, GSI3SK=SEARCHABLE#{text}');
        console.log('');
        
    } catch (error) {
        console.error('❌ Product data loading failed:', error.message);
        process.exit(1);
    }
}

// Run the loader
if (require.main === module) {
    loadProductData();
}

module.exports = {
    loadProductData,
    transformProductToDynamoDBItem,
    loadProductsFromFile
};