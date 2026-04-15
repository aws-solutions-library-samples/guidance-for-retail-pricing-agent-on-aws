/**
 * @fileoverview Lambda resolver for resetting demo data.
 * 
 * Deletes all pricing sessions from DynamoDB while preserving product catalog data.
 * Implements batch delete operations with pagination for large datasets and
 * comprehensive error handling with structured logging.
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Maximum number of items per batch delete operation (DynamoDB limit).
 */
const BATCH_SIZE = 25;

/**
 * Resets demo data by deleting all pricing sessions from DynamoDB.
 * 
 * This function:
 * - Scans DynamoDB for all items with PK starting with 'PRICING#'
 * - Deletes items in batches of 25 (DynamoDB batch write limit)
 * - Handles pagination for large datasets
 * - Preserves product catalog data (items not starting with 'PRICING#')
 * - Logs operation details with user identity and timestamps
 * 
 * @param {Object} event - AppSync resolver event
 * @param {Object} event.identity - User identity from Cognito
 * @returns {Promise<Object>} Reset operation result
 */
const handler = async (event) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Get user identity for logging
  const userId = event.identity?.sub || event.identity?.username || 'unknown';
  const userEmail = event.identity?.claims?.email || 'unknown';
  
  console.log(JSON.stringify({
    message: 'Demo reset initiated',
    timestamp,
    userId,
    userEmail,
    requestId: event.requestContext?.requestId
  }));

  try {
    // Validate user authentication
    if (!event.identity?.sub && !event.identity?.username) {
      throw new Error('User authentication required for demo reset');
    }

    let deletedCount = 0;
    let lastEvaluatedKey = undefined;
    let scanCount = 0;

    // Scan and delete pricing sessions in batches
    do {
      scanCount++;
      
      // Scan for pricing session items
      const scanParams = {
        TableName: process.env.PRODUCT_TABLE_NAME,
        FilterExpression: 'begins_with(PK, :pricingPrefix)',
        ExpressionAttributeValues: {
          ':pricingPrefix': 'PRICING#'
        },
        ProjectionExpression: 'PK, SK',
        Limit: 100 // Scan in chunks of 100 items
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      console.log(JSON.stringify({
        message: 'Scanning for pricing sessions',
        scanIteration: scanCount,
        hasLastEvaluatedKey: !!lastEvaluatedKey
      }));

      const scanCommand = new ScanCommand(scanParams);
      const scanResult = await dynamodb.send(scanCommand);

      const items = scanResult.Items || [];
      console.log(JSON.stringify({
        message: 'Scan completed',
        itemsFound: items.length,
        scanIteration: scanCount
      }));

      // Delete items in batches of 25
      if (items.length > 0) {
        const batchCount = await deleteBatches(items);
        deletedCount += batchCount;
        
        console.log(JSON.stringify({
          message: 'Batch deletion completed',
          deletedInBatch: batchCount,
          totalDeleted: deletedCount,
          scanIteration: scanCount
        }));
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;

    } while (lastEvaluatedKey);

    const duration = Date.now() - startTime;
    const completionTimestamp = new Date().toISOString();

    // Log successful completion
    console.log(JSON.stringify({
      message: 'Demo reset completed successfully',
      timestamp: completionTimestamp,
      userId,
      userEmail,
      deletedCount,
      durationMs: duration,
      scanIterations: scanCount
    }));

    // Return success response
    return {
      success: true,
      message: `Successfully deleted ${deletedCount} pricing session(s)`,
      deletedCount,
      timestamp: completionTimestamp
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log error with full context
    console.error(JSON.stringify({
      message: 'Demo reset failed',
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      error: error.message,
      errorStack: error.stack,
      durationMs: duration
    }));

    // Return error response
    return {
      success: false,
      message: `Demo reset failed: ${error.message}`,
      deletedCount: 0,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Deletes items in batches of 25 (DynamoDB batch write limit).
 * 
 * Handles batch write operations with retry logic for unprocessed items.
 * DynamoDB BatchWriteItem can process up to 25 items per request.
 * 
 * @param {Array<Object>} items - Items to delete (must have PK and SK)
 * @returns {Promise<number>} Number of items successfully deleted
 */
async function deleteBatches(items) {
  let totalDeleted = 0;
  
  // Split items into batches of 25
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    // Build delete requests
    const deleteRequests = batch.map(item => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK
        }
      }
    }));

    // Execute batch delete with retry logic
    let unprocessedItems = deleteRequests;
    let retryCount = 0;
    const maxRetries = 3;

    while (unprocessedItems.length > 0 && retryCount < maxRetries) {
      try {
        const batchWriteParams = {
          RequestItems: {
            [process.env.PRODUCT_TABLE_NAME]: unprocessedItems
          }
        };

        const batchWriteCommand = new BatchWriteCommand(batchWriteParams);
        const batchResult = await dynamodb.send(batchWriteCommand);

        // Calculate successfully processed items
        const processedCount = unprocessedItems.length - 
          (batchResult.UnprocessedItems?.[process.env.PRODUCT_TABLE_NAME]?.length || 0);
        totalDeleted += processedCount;

        // Check for unprocessed items
        if (batchResult.UnprocessedItems && 
            batchResult.UnprocessedItems[process.env.PRODUCT_TABLE_NAME]) {
          unprocessedItems = batchResult.UnprocessedItems[process.env.PRODUCT_TABLE_NAME];
          retryCount++;
          
          console.log(JSON.stringify({
            message: 'Retrying unprocessed items',
            unprocessedCount: unprocessedItems.length,
            retryAttempt: retryCount
          }));

          // Exponential backoff before retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
        } else {
          unprocessedItems = [];
        }

      } catch (error) {
        console.error(JSON.stringify({
          message: 'Batch delete error',
          error: error.message,
          retryAttempt: retryCount,
          batchSize: unprocessedItems.length
        }));
        
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to delete batch after ${maxRetries} retries: ${error.message}`);
        }
        
        // Exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
      }
    }

    if (unprocessedItems.length > 0) {
      console.warn(JSON.stringify({
        message: 'Some items could not be deleted after retries',
        unprocessedCount: unprocessedItems.length
      }));
    }
  }

  return totalDeleted;
}

module.exports = { handler };
