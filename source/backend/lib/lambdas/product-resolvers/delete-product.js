/**
 * @fileoverview Delete product resolver for AppSync GraphQL API.
 * 
 * Handles product deletion with proper validation and DynamoDB cleanup.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Deletes a product from the catalog.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Deleted product
 */
const handler = async (event) => {
  const { id } = event.arguments;
  const tableName = process.env.PRODUCT_TABLE_NAME;
  
  if (!tableName) {
    throw new Error('PRODUCT_TABLE_NAME environment variable not set');
  }

  const productKey = {
    PK: `PRODUCT#${id}`,
    SK: 'METADATA'
  };

  try {
    // First, get the existing product to return it
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: productKey
    });
    const existingProduct = await dynamodb.send(getCommand);

    if (!existingProduct.Item) {
      throw new Error(`Product with ID ${id} not found`);
    }

    // Delete the product
    const deleteCommand = new DeleteCommand({
      TableName: tableName,
      Key: productKey,
      ConditionExpression: 'attribute_exists(PK)'
    });
    await dynamodb.send(deleteCommand);

    console.log(`Product deleted successfully: ${id}`);

    // Return the deleted product (excluding DynamoDB keys)
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...product } = existingProduct.Item;
    return product;

  } catch (error) {
    console.error('Error deleting product:', error);
    
    if (error.code === 'ConditionalCheckFailedException') {
      throw new Error(`Product with ID ${id} not found`);
    }
    
    throw new Error(`Failed to delete product: ${error.message}`);
  }
};

module.exports = { handler };