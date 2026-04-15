/**
 * @fileoverview Create product resolver for AppSync GraphQL API.
 * 
 * Handles product creation with proper validation and DynamoDB storage.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Generates a simple unique ID using timestamp and random string.
 * 
 * @returns {string} Unique identifier
 */
const generateId = () => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${randomStr}`;
};

/**
 * Creates a new product in the catalog.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Created product
 */
const handler = async (event) => {
    const { input } = event.arguments;
    const tableName = process.env.PRODUCT_TABLE_NAME;

    if (!tableName) {
        throw new Error('PRODUCT_TABLE_NAME environment variable not set');
    }

    // Generate unique ID and timestamps
    const productId = generateId();
    const timestamp = new Date().toISOString();

    // Create product item with proper DynamoDB structure
    const productItem = {
        PK: `PRODUCT#${productId}`,
        SK: 'METADATA',
        GSI1PK: `CATEGORY#${input.category}`,
        GSI1SK: `ROLE#${input.role}#${timestamp}`,
        GSI2PK: `VENDOR#${input.vendor}`,
        GSI2SK: `PRODUCT#${timestamp}`,

        // Product data
        id: productId,
        product_id: input.product_id,
        category: input.category,
        subcategory: input.subcategory,
        role: input.role,
        vendor: input.vendor,
        cost: input.cost,
        MSRP: input.MSRP,
        MAP: input.MAP,
        yearTarget: input.yearTarget,
        attributes: input.attributes,
        features: input.features,
        imageUrl: input.imageUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
        entityType: 'PRODUCT'
    };

    try {
        // Store in DynamoDB
        const command = new PutCommand({
            TableName: tableName,
            Item: productItem,
            ConditionExpression: 'attribute_not_exists(PK)'
        });
        await dynamodb.send(command);

        console.log(`Product created successfully: ${productId}`);

        // Return the created product (excluding DynamoDB keys)
        const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...product } = productItem;
        return product;

    } catch (error) {
        console.error('Error creating product:', error);

        if (error.code === 'ConditionalCheckFailedException') {
            throw new Error('Product with this ID already exists');
        }

        throw new Error(`Failed to create product: ${error.message}`);
    }
};

module.exports = { handler };