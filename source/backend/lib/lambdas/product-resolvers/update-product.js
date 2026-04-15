/**
 * @fileoverview Update product resolver for AppSync GraphQL API.
 * 
 * Handles product updates with proper validation and DynamoDB storage.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Updates an existing product in the catalog.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Updated product
 */
const handler = async (event) => {
  const { input } = event.arguments;
  const tableName = process.env.PRODUCT_TABLE_NAME;
  
  if (!tableName) {
    throw new Error('PRODUCT_TABLE_NAME environment variable not set');
  }

  const productKey = {
    PK: `PRODUCT#${input.id}`,
    SK: 'METADATA'
  };

  try {
    // First, get the existing product
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: productKey
    });
    const existingProduct = await dynamodb.send(getCommand);

    if (!existingProduct.Item) {
      throw new Error(`Product with ID ${input.id} not found`);
    }

    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Always update the timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    // Update fields that are provided
    const updateableFields = [
      'product_id', 'category', 'subcategory', 'role', 'vendor',
      'cost', 'MSRP', 'MAP', 'yearTarget', 'attributes', 'features', 'imageUrl'
    ];

    updateableFields.forEach(field => {
      if (input[field] !== undefined && input[field] !== null) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = input[field];
      }
    });

    // Update GSI keys if category, role, or vendor changed
    if (input.category) {
      updateExpressions.push('#GSI1PK = :GSI1PK');
      expressionAttributeNames['#GSI1PK'] = 'GSI1PK';
      expressionAttributeValues[':GSI1PK'] = `CATEGORY#${input.category}`;
      
      if (input.role) {
        updateExpressions.push('#GSI1SK = :GSI1SK');
        expressionAttributeNames['#GSI1SK'] = 'GSI1SK';
        expressionAttributeValues[':GSI1SK'] = `ROLE#${input.role}#${expressionAttributeValues[':updatedAt']}`;
      }
    }

    if (input.vendor) {
      updateExpressions.push('#GSI2PK = :GSI2PK');
      expressionAttributeNames['#GSI2PK'] = 'GSI2PK';
      expressionAttributeValues[':GSI2PK'] = `VENDOR#${input.vendor}`;
      
      updateExpressions.push('#GSI2SK = :GSI2SK');
      expressionAttributeNames['#GSI2SK'] = 'GSI2SK';
      expressionAttributeValues[':GSI2SK'] = `PRODUCT#${expressionAttributeValues[':updatedAt']}`;
    }

    // Perform the update
    const updateCommand = new UpdateCommand({
      TableName: tableName,
      Key: productKey,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
      ConditionExpression: 'attribute_exists(PK)'
    });
    const updateResult = await dynamodb.send(updateCommand);

    console.log(`Product updated successfully: ${input.id}`);

    // Return the updated product (excluding DynamoDB keys)
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...product } = updateResult.Attributes;
    return product;

  } catch (error) {
    console.error('Error updating product:', error);
    
    if (error.code === 'ConditionalCheckFailedException') {
      throw new Error(`Product with ID ${input.id} not found`);
    }
    
    throw new Error(`Failed to update product: ${error.message}`);
  }
};

module.exports = { handler };