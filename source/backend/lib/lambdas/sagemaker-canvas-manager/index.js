/**
 * @fileoverview SageMaker Canvas Model Manager for demand forecasting.
 * 
 * Manages the complete lifecycle of SageMaker Canvas models including
 * training, validation, inference, and performance monitoring.
 */

const { SageMakerClient } = require('@aws-sdk/client-sagemaker');
const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');
const { CloudWatchClient } = require('@aws-sdk/client-cloudwatch');

// Initialize AWS clients
const sagemaker = new SageMakerClient({});
const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const eventbridge = new EventBridgeClient({});
const cloudwatch = new CloudWatchClient({});

/**
 * SageMaker Canvas Model Manager class.
 * Handles model lifecycle operations for demand forecasting.
 */
class SageMakerCanvasModelManager {
  constructor() {
    this.canvasDomainId = process.env.CANVAS_DOMAIN_ID;
    this.canvasUserProfile = process.env.CANVAS_USER_PROFILE;
    this.trainingDataBucket = process.env.TRAINING_DATA_BUCKET;
    this.productTableName = process.env.PRODUCT_TABLE_NAME;
    this.canvasExecutionRole = process.env.CANVAS_EXECUTION_ROLE;
    
    // Performance thresholds
    this.minAccuracyThreshold = 0.70;
    this.maxModelAge = 90; // days
    this.maxTrainingTime = 7200; // 2 hours
  }

  /**
   * Triggers model training for a product category.
   * 
   * @param {string} category - Product category
   * @returns {Promise<string>} Model ARN
   */
  async triggerModelTraining(category) {
    console.log(`Starting model training for category: ${category}`);
    
    try {
      // Validate training data availability
      await this.validateTrainingData(category);
      
      const modelName = `demand-forecast-${category}-v${Date.now()}`;
      const trainingDataUri = `s3://${this.trainingDataBucket}/training_data/${category}/`;
      
      // Create SageMaker Canvas model
      const createModelParams = {
        ModelName: modelName,
        ModelType: 'TABULAR',
        ProblemType: 'FORECASTING',
        DataSource: {
          S3DataSource: {
            S3Uri: trainingDataUri,
            S3DataType: 'S3Prefix'
          }
        },
        TargetColumn: 'demand_units',
        TimeSeriesConfig: {
          TimeColumn: 'date',
          ItemIdColumn: 'product_id',
          ForecastHorizon: 12,
          ForecastFrequency: 'M'
        },
        Tags: [
          { Key: 'Category', Value: category },
          { Key: 'Purpose', Value: 'DemandForecasting' },
          { Key: 'CreatedBy', Value: 'DemandForecastAgent' },
          { Key: 'Environment', Value: process.env.ENVIRONMENT || 'development' }
        ]
      };
      
      const response = await sagemaker.createModel(createModelParams).promise();
      
      console.log(`Model training started: ${response.ModelArn}`);
      
      // Store model metadata in DynamoDB
      await this.storeModelMetadata(modelName, category, 'TRAINING');
      
      // Publish training started event
      await this.publishEvent('Model Training Started', {
        modelName,
        category,
        modelArn: response.ModelArn
      });
      
      return response.ModelArn;
      
    } catch (error) {
      console.error(`Error starting model training for ${category}:`, error);
      
      // Publish training failed event
      await this.publishEvent('Model Training Failed', {
        category,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Waits for model training completion with timeout.
   * 
   * @param {string} modelName - Model name
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Final model status
   */
  async waitForTrainingCompletion(modelName, timeout = 7200000) {
    console.log(`Waiting for model training completion: ${modelName}`);
    
    const startTime = Date.now();
    const pollInterval = 30000; // 30 seconds
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await sagemaker.describeModel({ ModelName: modelName }).promise();
        
        console.log(`Model ${modelName} status: ${response.ModelStatus}`);
        
        if (response.ModelStatus === 'Completed') {
          // Update model metadata
          await this.storeModelMetadata(modelName, null, 'COMPLETED', response.ModelMetrics);
          
          // Publish completion event
          await this.publishEvent('Model Training Completed', {
            modelName,
            metrics: response.ModelMetrics
          });
          
          return response;
        }
        
        if (response.ModelStatus === 'Failed') {
          throw new Error(`Model training failed: ${response.FailureReason}`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        if (error.code === 'ValidationException') {
          throw new Error(`Model ${modelName} not found`);
        }
        throw error;
      }
    }
    
    throw new Error(`Model training timeout after ${timeout}ms`);
  }

  /**
   * Validates model performance meets minimum thresholds.
   * 
   * @param {string} modelName - Model name
   * @returns {Promise<boolean>} True if model meets thresholds
   */
  async validateModelPerformance(modelName) {
    try {
      const response = await sagemaker.describeModel({ ModelName: modelName }).promise();
      
      if (response.ModelStatus !== 'Completed') {
        return false;
      }
      
      const metrics = response.ModelMetrics || {};
      const accuracy = metrics.Accuracy || 0;
      
      console.log(`Model ${modelName} accuracy: ${accuracy}`);
      
      return accuracy >= this.minAccuracyThreshold;
      
    } catch (error) {
      console.error(`Error validating model performance: ${error}`);
      return false;
    }
  }

  /**
   * Checks if model retraining is needed and triggers if necessary.
   * 
   * @param {string} category - Product category
   * @returns {Promise<Object>} Retraining result
   */
  async checkAndTriggerRetraining(category) {
    try {
      // Get current model for category
      const currentModel = await this.getCurrentModel(category);
      
      if (!currentModel) {
        console.log(`No model found for category ${category}, triggering initial training`);
        const modelArn = await this.triggerModelTraining(category);
        return {
          retrainingTriggered: true,
          reason: 'No existing model',
          newModelArn: modelArn
        };
      }
      
      // Check model age
      const modelAge = Date.now() - new Date(currentModel.CreationTime).getTime();
      const ageInDays = modelAge / (1000 * 60 * 60 * 24);
      
      if (ageInDays > this.maxModelAge) {
        console.log(`Model ${currentModel.ModelName} is ${ageInDays} days old, triggering retraining`);
        const modelArn = await this.triggerModelTraining(category);
        return {
          retrainingTriggered: true,
          reason: `Model age (${ageInDays} days) exceeds threshold`,
          newModelArn: modelArn
        };
      }
      
      // Check model performance
      const isPerformanceGood = await this.validateModelPerformance(currentModel.ModelName);
      
      if (!isPerformanceGood) {
        console.log(`Model ${currentModel.ModelName} performance degraded, triggering retraining`);
        const modelArn = await this.triggerModelTraining(category);
        return {
          retrainingTriggered: true,
          reason: 'performance degradation',
          newModelArn: modelArn
        };
      }
      
      return {
        retrainingTriggered: false,
        reason: 'Model performance acceptable',
        currentModel: currentModel.ModelName
      };
      
    } catch (error) {
      console.error(`Error checking retraining need for ${category}:`, error);
      throw error;
    }
  }

  /**
   * Generates forecast using SageMaker Canvas model.
   * 
   * @param {string} modelName - Model name
   * @param {string} productId - Product identifier
   * @param {number} forecastHorizon - Forecast horizon in months
   * @returns {Promise<Object>} Forecast result
   */
  async generateForecast(modelName, productId, forecastHorizon = 12) {
    console.log(`Generating forecast using model: ${modelName} for product: ${productId}`);
    
    try {
      // Create forecast job
      const forecastJobName = `forecast-${productId}-${Date.now()}`;
      
      const createForecastParams = {
        ForecastJobName: forecastJobName,
        ModelName: modelName,
        ForecastInput: {
          ProductId: productId,
          ForecastHorizon: forecastHorizon,
          ConfidenceLevels: [0.1, 0.5, 0.9]
        }
      };
      
      // Note: This is a simplified implementation
      // In actual SageMaker Canvas, you would use the Canvas API
      const forecastResponse = await this.simulateCanvasForecast(
        modelName,
        productId,
        forecastHorizon
      );
      
      console.log(`Forecast generated successfully for ${productId}`);
      return forecastResponse;
      
    } catch (error) {
      console.error(`Error generating forecast: ${error}`);
      throw error;
    }
  }

  /**
   * Generates forecast with fallback to historical data.
   * 
   * @param {string} modelName - Model name
   * @param {string} productId - Product identifier
   * @param {number} forecastHorizon - Forecast horizon
   * @returns {Promise<Object>} Forecast result with fallback indication
   */
  async generateForecastWithFallback(modelName, productId, forecastHorizon = 12) {
    try {
      return await this.generateForecast(modelName, productId, forecastHorizon);
    } catch (error) {
      console.warn(`SageMaker forecast failed, using historical fallback: ${error.message}`);
      
      // Fallback to historical data
      const historicalData = await this.getHistoricalFallbackData(productId);
      
      return {
        ...historicalData,
        source: 'historical_fallback',
        confidence_reduced: true,
        fallback_reason: error.message
      };
    }
  }

  /**
   * Validates training data availability and quality.
   * 
   * @param {string} category - Product category
   * @returns {Promise<void>} Throws if validation fails
   */
  async validateTrainingData(category) {
    try {
      const listParams = {
        Bucket: this.trainingDataBucket,
        Prefix: `training_data/${category}/`
      };
      
      const response = await s3.listObjectsV2(listParams).promise();
      
      if (!response.Contents || response.Contents.length === 0) {
        throw new Error(`No training data found for category: ${category}`);
      }
      
      // Check total data size
      const totalSize = response.Contents.reduce((sum, obj) => sum + obj.Size, 0);
      const minSizeRequired = 1024 * 1024; // 1MB minimum
      
      if (totalSize < minSizeRequired) {
        throw new Error(`Insufficient training data for category ${category}: ${totalSize} bytes`);
      }
      
      console.log(`Training data validation passed for ${category}: ${response.Contents.length} files, ${totalSize} bytes`);
      
    } catch (error) {
      console.error(`Training data validation failed for ${category}:`, error);
      throw error;
    }
  }

  /**
   * Validates training data quality by checking for common issues.
   * 
   * @param {string} category - Product category
   * @returns {Promise<Object>} Validation result
   */
  async validateTrainingDataQuality(category) {
    try {
      // Get sample of training data
      const sampleKey = `training_data/${category}/prepared_data.csv`;
      const response = await s3.getObject({
        Bucket: this.trainingDataBucket,
        Key: sampleKey
      }).promise();
      
      const csvData = response.Body.toString('utf-8');
      const lines = csvData.split('\n').slice(0, 1000); // Sample first 1000 lines
      
      const issues = [];
      let validRecords = 0;
      
      for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (!line) continue;
        
        const fields = line.split(',');
        
        // Check for missing values
        if (fields.some(field => !field || field.trim() === '')) {
          if (fields[2] === '' || fields[2] === undefined) {
            issues.push('Missing demand_units values');
          }
          if (fields[3] === '' || fields[3] === undefined) {
            issues.push('Missing price values');
          }
        }
        
        // Check date format
        if (fields[1] && !this.isValidDate(fields[1])) {
          issues.push('Invalid date format');
        }
        
        // Check numeric values
        if (fields[2] && isNaN(parseFloat(fields[2]))) {
          issues.push('Invalid demand_units format');
        }
        
        if (fields[3] && isNaN(parseFloat(fields[3]))) {
          issues.push('Invalid price format');
        }
        
        validRecords++;
      }
      
      const uniqueIssues = [...new Set(issues)];
      
      return {
        isValid: uniqueIssues.length === 0,
        issues: uniqueIssues,
        validRecords,
        totalRecords: lines.length - 1
      };
      
    } catch (error) {
      console.error(`Error validating data quality: ${error}`);
      return {
        isValid: false,
        issues: [`Validation error: ${error.message}`],
        validRecords: 0,
        totalRecords: 0
      };
    }
  }

  /**
   * Prepares training data from DynamoDB and uploads to S3.
   * 
   * @param {string} category - Product category
   * @returns {Promise<Object>} Preparation result
   */
  async prepareTrainingData(category) {
    console.log(`Preparing training data for category: ${category}`);
    
    try {
      // Scan DynamoDB for historical sales data
      const scanParams = {
        TableName: this.productTableName,
        FilterExpression: 'category = :category AND entityType = :entityType',
        ExpressionAttributeValues: {
          ':category': category,
          ':entityType': 'SALES_RECORD'
        }
      };
      
      const salesData = [];
      let lastEvaluatedKey = null;
      
      do {
        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const response = await dynamodb.scan(scanParams).promise();
        salesData.push(...response.Items);
        lastEvaluatedKey = response.LastEvaluatedKey;
        
      } while (lastEvaluatedKey);
      
      console.log(`Retrieved ${salesData.length} sales records for ${category}`);
      
      // Convert to CSV format
      const csvHeader = 'product_id,date,demand_units,price,category\n';
      const csvRows = salesData.map(record => 
        `${record.product_id},${record.sales_date},${record.demand_units},${record.price},${record.category}`
      ).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      // Upload to S3
      const uploadParams = {
        Bucket: this.trainingDataBucket,
        Key: `training_data/${category}/prepared_data.csv`,
        Body: csvContent,
        ContentType: 'text/csv',
        Metadata: {
          'record-count': salesData.length.toString(),
          'prepared-at': new Date().toISOString(),
          'category': category
        }
      };
      
      const uploadResult = await s3.putObject(uploadParams).promise();
      
      console.log(`Training data uploaded successfully: ${uploadResult.ETag}`);
      
      return {
        success: true,
        recordCount: salesData.length,
        s3Location: `s3://${this.trainingDataBucket}/training_data/${category}/prepared_data.csv`,
        etag: uploadResult.ETag
      };
      
    } catch (error) {
      console.error(`Error preparing training data for ${category}:`, error);
      throw error;
    }
  }

  /**
   * Lists models by category.
   * 
   * @param {string} category - Product category
   * @returns {Promise<Array>} List of models
   */
  async listModelsByCategory(category) {
    try {
      const response = await sagemaker.listModels({
        NameContains: `demand-forecast-${category}`,
        StatusEquals: 'Completed'
      }).promise();
      
      return response.Models.filter(model => 
        model.ModelName.includes(`demand-forecast-${category}`)
      );
      
    } catch (error) {
      console.error(`Error listing models for ${category}:`, error);
      throw error;
    }
  }

  /**
   * Cleans up old models when new ones are available.
   * 
   * @param {string} category - Product category
   * @param {string} newModelName - New model to keep
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOldModels(category, newModelName) {
    try {
      const models = await this.listModelsByCategory(category);
      const deletedModels = [];
      
      for (const model of models) {
        if (model.ModelName !== newModelName) {
          try {
            await sagemaker.deleteModel({ ModelName: model.ModelName }).promise();
            deletedModels.push(model.ModelName);
            console.log(`Deleted old model: ${model.ModelName}`);
          } catch (error) {
            console.warn(`Failed to delete model ${model.ModelName}: ${error.message}`);
          }
        }
      }
      
      return {
        deletedModels,
        keptModel: newModelName
      };
      
    } catch (error) {
      console.error(`Error cleaning up old models: ${error}`);
      throw error;
    }
  }

  /**
   * Schedules automatic model retraining.
   * 
   * @param {string} category - Product category
   * @param {string} schedule - Cron schedule expression
   * @returns {Promise<Object>} Schedule result
   */
  async scheduleModelRetraining(category, schedule) {
    try {
      await this.publishEvent('Scheduled Model Retraining', {
        category,
        schedule,
        nextRun: this.getNextRunTime(schedule)
      });
      
      return {
        scheduled: true,
        category,
        schedule
      };
      
    } catch (error) {
      console.error(`Error scheduling retraining: ${error}`);
      throw error;
    }
  }

  /**
   * Publishes model metrics to CloudWatch.
   * 
   * @param {string} modelName - Model name
   * @param {Object} metrics - Model metrics
   * @returns {Promise<void>}
   */
  async publishModelMetrics(modelName, metrics) {
    try {
      const metricData = [
        {
          MetricName: 'ModelAccuracy',
          Value: metrics.Accuracy || 0,
          Unit: 'Percent',
          Dimensions: [
            { Name: 'ModelName', Value: modelName }
          ]
        },
        {
          MetricName: 'RMSE',
          Value: metrics.RMSE || 0,
          Unit: 'None',
          Dimensions: [
            { Name: 'ModelName', Value: modelName }
          ]
        },
        {
          MetricName: 'TrainingTime',
          Value: metrics.TrainingTime || 0,
          Unit: 'Seconds',
          Dimensions: [
            { Name: 'ModelName', Value: modelName }
          ]
        }
      ];
      
      await cloudwatch.putMetricData({
        Namespace: 'SageMaker/Canvas/DemandForecasting',
        MetricData: metricData
      }).promise();
      
      console.log(`Published metrics for model: ${modelName}`);
      
    } catch (error) {
      console.error(`Error publishing metrics: ${error}`);
      throw error;
    }
  }

  /**
   * Checks model performance and triggers alerts if needed.
   * 
   * @param {string} modelName - Model name
   * @param {Object} metrics - Current metrics
   * @returns {Promise<void>}
   */
  async checkModelPerformanceAndAlert(modelName, metrics) {
    try {
      const accuracy = metrics.Accuracy || 0;
      
      if (accuracy < this.minAccuracyThreshold) {
        await this.publishEvent('Model Performance Alert', {
          modelName,
          currentAccuracy: accuracy,
          threshold: this.minAccuracyThreshold,
          severity: 'HIGH',
          message: `Model ${modelName} performance degradation detected`
        });
        
        console.warn(`Performance alert triggered for model: ${modelName}`);
      }
      
    } catch (error) {
      console.error(`Error checking model performance: ${error}`);
      throw error;
    }
  }

  // Helper methods

  /**
   * Stores model metadata in DynamoDB.
   * 
   * @param {string} modelName - Model name
   * @param {string} category - Product category
   * @param {string} status - Model status
   * @param {Object} metrics - Model metrics (optional)
   * @returns {Promise<void>}
   */
  async storeModelMetadata(modelName, category, status, metrics = null) {
    try {
      const item = {
        PK: `CANVAS_MODEL#${modelName}`,
        SK: 'METADATA',
        GSI1PK: 'CANVAS_MODEL',
        GSI1SK: `${category}#${modelName}`,
        modelName,
        category,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (metrics) {
        item.accuracy = metrics.Accuracy;
        item.rmse = metrics.RMSE;
        item.mape = metrics.MAPE;
      }
      
      await dynamodb.put({
        TableName: this.productTableName,
        Item: item
      }).promise();
      
    } catch (error) {
      console.error(`Error storing model metadata: ${error}`);
      // Don't throw - this is not critical
    }
  }

  /**
   * Gets current model for a category.
   * 
   * @param {string} category - Product category
   * @returns {Promise<Object|null>} Current model or null
   */
  async getCurrentModel(category) {
    try {
      const response = await dynamodb.query({
        TableName: this.productTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :category)',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':pk': 'CANVAS_MODEL',
          ':category': `${category}#`,
          ':status': 'COMPLETED'
        },
        ScanIndexForward: false,
        Limit: 1
      }).promise();
      
      return response.Items && response.Items.length > 0 ? response.Items[0] : null;
      
    } catch (error) {
      console.error(`Error getting current model: ${error}`);
      return null;
    }
  }

  /**
   * Simulates SageMaker Canvas forecast (placeholder for actual Canvas API).
   * 
   * @param {string} modelName - Model name
   * @param {string} productId - Product identifier
   * @param {number} forecastHorizon - Forecast horizon
   * @returns {Promise<Object>} Simulated forecast
   */
  async simulateCanvasForecast(modelName, productId, forecastHorizon) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const predictions = [];
    const currentDate = new Date();
    
    for (let i = 1; i <= Math.min(forecastHorizon, 12); i++) {
      const forecastDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const timestamp = forecastDate.toISOString().split('T')[0];
      
      // Generate realistic forecast values
      const baseDemand = 1000 + Math.random() * 1000;
      const seasonalFactor = 1 + 0.2 * Math.sin((i / 12) * 2 * Math.PI);
      
      predictions.push({
        Timestamp: timestamp,
        P10: Math.round(baseDemand * seasonalFactor * 0.8),
        P50: Math.round(baseDemand * seasonalFactor),
        P90: Math.round(baseDemand * seasonalFactor * 1.2)
      });
    }
    
    return {
      ForecastResult: {
        Predictions: predictions,
        ModelAccuracy: 0.87,
        ConfidenceScore: 0.85
      }
    };
  }

  /**
   * Gets historical fallback data.
   * 
   * @param {string} productId - Product identifier
   * @returns {Promise<Object>} Historical data
   */
  async getHistoricalFallbackData(productId) {
    try {
      const response = await s3.getObject({
        Bucket: this.trainingDataBucket,
        Key: `demand_forecasts/${productId}.json`
      }).promise();
      
      return JSON.parse(response.Body.toString('utf-8'));
      
    } catch (error) {
      // Return minimal fallback data
      return {
        product_id: productId,
        historical_performance: {
          ytd_sales: 1000,
          year_target: 1200,
          trend: 'stable',
          seasonality_detected: false,
          volatility_index: 0.3
        }
      };
    }
  }

  /**
   * Publishes event to EventBridge.
   * 
   * @param {string} detailType - Event detail type
   * @param {Object} detail - Event detail
   * @returns {Promise<void>}
   */
  async publishEvent(detailType, detail) {
    try {
      await eventbridge.putEvents({
        Entries: [{
          Source: 'sagemaker.canvas',
          DetailType: detailType,
          Detail: JSON.stringify(detail),
          Time: new Date()
        }]
      }).promise();
      
    } catch (error) {
      console.error(`Error publishing event: ${error}`);
      // Don't throw - events are not critical
    }
  }

  /**
   * Validates date format.
   * 
   * @param {string} dateStr - Date string
   * @returns {boolean} True if valid
   */
  isValidDate(dateStr) {
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date);
  }

  /**
   * Gets next run time for cron schedule (simplified).
   * 
   * @param {string} schedule - Cron schedule
   * @returns {string} Next run time
   */
  getNextRunTime(schedule) {
    // Simplified - in real implementation, use a cron parser
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
}

module.exports = { SageMakerCanvasModelManager };