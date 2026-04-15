/**
 * @fileoverview Performance monitoring utility for multi-agent orchestration.
 * 
 * Provides centralized performance tracking, CloudWatch metrics publishing,
 * and performance warning/alarm logging for agent execution times.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { logWarning, logInfo } = require('./error-logger');

const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });

/**
 * Performance thresholds in milliseconds.
 * 
 * Requirement 9.4: IF analysis execution time exceeds 75 seconds, THEN THE Orchestration System SHALL log a performance warning to CloudWatch
 * Requirement 9.5: IF analysis execution time exceeds 90 seconds, THEN THE Orchestration System SHALL terminate the workflow and return a timeout error with status code 504
 */
const PERFORMANCE_THRESHOLDS = {
  AGENT_TIMEOUT: 30000,        // 30 seconds per agent (Requirement 9.2, 9.3)
  WORKFLOW_WARNING: 75000,     // 75 seconds - log warning (Requirement 9.4)
  WORKFLOW_TIMEOUT: 90000      // 90 seconds - terminate workflow (Requirement 9.1, 9.5)
};

/**
 * Performance tracker class for monitoring agent and workflow execution times.
 * 
 * Tracks execution duration, publishes CloudWatch metrics, and logs performance
 * warnings when thresholds are exceeded.
 */
class PerformanceMonitor {
  /**
   * Creates a new performance monitor instance.
   * 
   * @param {string} sessionId - Session identifier for tracking
   * @param {string} component - Component name (e.g., 'DemandForecastAgent')
   */
  constructor(sessionId, component) {
    this.sessionId = sessionId;
    this.component = component;
    this.startTime = Date.now();
    this.metrics = [];
  }

  /**
   * Records the start of an operation.
   * 
   * @param {string} operationName - Name of the operation being tracked
   * @returns {Object} Operation tracker with stop method
   */
  startOperation(operationName) {
    const operationStartTime = Date.now();
    
    return {
      stop: () => {
        const duration = Date.now() - operationStartTime;
        this.recordMetric(operationName, duration);
        return duration;
      }
    };
  }

  /**
   * Records a metric for an operation.
   * 
   * @param {string} operationName - Name of the operation
   * @param {number} duration - Duration in milliseconds
   * @returns {void}
   */
  recordMetric(operationName, duration) {
    this.metrics.push({
      operationName,
      duration,
      timestamp: new Date().toISOString()
    });

    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      component: this.component,
      message: `Operation completed: ${operationName}`,
      duration,
      unit: 'milliseconds'
    }));
  }

  /**
   * Gets the total elapsed time since monitor creation.
   * 
   * @returns {number} Elapsed time in milliseconds
   */
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  /**
   * Checks if execution time exceeds warning threshold.
   * 
   * Requirement 9.4: IF analysis execution time exceeds 75 seconds, THEN THE Orchestration System SHALL log a performance warning to CloudWatch
   * 
   * @returns {boolean} True if elapsed time exceeds warning threshold
   */
  isWarningThreshold() {
    return this.getElapsedTime() > PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING;
  }

  /**
   * Checks if execution time exceeds timeout threshold.
   * 
   * Requirement 9.5: IF analysis execution time exceeds 90 seconds, THEN THE Orchestration System SHALL terminate the workflow and return a timeout error with status code 504
   * 
   * @returns {boolean} True if elapsed time exceeds timeout threshold
   */
  isTimeoutThreshold() {
    return this.getElapsedTime() > PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT;
  }

  /**
   * Logs a performance warning if threshold is exceeded.
   * 
   * Requirement 9.4: Log performance warning to CloudWatch when exceeding 75 seconds
   * 
   * @returns {void}
   */
  logPerformanceWarning() {
    const elapsedTime = this.getElapsedTime();
    
    if (elapsedTime > PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING) {
      logWarning(this.sessionId, this.component, 
        `Workflow execution time exceeds warning threshold (${elapsedTime}ms > ${PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING}ms)`,
        {
          elapsedTime,
          threshold: PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING,
          percentOfTimeout: Math.round((elapsedTime / PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT) * 100)
        }
      );
    }
  }

  /**
   * Publishes performance metrics to CloudWatch.
   * 
   * Requirement 9.1, 9.2, 9.3: Publish custom CloudWatch metrics for agent durations
   * 
   * @param {string} metricName - Name of the metric
   * @param {number} duration - Duration in milliseconds
   * @param {string} [unit='Milliseconds'] - CloudWatch metric unit
   * @returns {Promise<void>}
   */
  async publishMetric(metricName, duration, unit = 'Milliseconds') {
    try {
      await cloudwatchClient.send(new PutMetricDataCommand({
        Namespace: 'PricingOrchestration',
        MetricData: [
          {
            MetricName: metricName,
            Value: duration,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: [
              {
                Name: 'Component',
                Value: this.component
              },
              {
                Name: 'SessionId',
                Value: this.sessionId
              }
            ]
          }
        ]
      }));

      console.log(JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        component: this.component,
        message: `Published CloudWatch metric: ${metricName}`,
        duration,
        unit
      }));
    } catch (error) {
      console.error(JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        component: this.component,
        message: 'Failed to publish CloudWatch metric',
        metricName,
        error: error.message
      }));
      // Don't throw - metric publishing failure shouldn't block workflow
    }
  }

  /**
   * Publishes all recorded metrics to CloudWatch.
   * 
   * @returns {Promise<void>}
   */
  async publishAllMetrics() {
    for (const metric of this.metrics) {
      await this.publishMetric(
        `${this.component}-${metric.operationName}`,
        metric.duration
      );
    }
  }

  /**
   * Gets a summary of all recorded metrics.
   * 
   * @returns {Object} Summary with total time and individual operation times
   */
  getSummary() {
    const totalTime = this.getElapsedTime();
    const operationTimes = {};

    for (const metric of this.metrics) {
      operationTimes[metric.operationName] = metric.duration;
    }

    return {
      component: this.component,
      sessionId: this.sessionId,
      totalTime,
      operationTimes,
      metricsCount: this.metrics.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Logs performance summary to CloudWatch.
   * 
   * Requirement 9.1, 9.2, 9.3: Log agent execution times to CloudWatch
   * 
   * @returns {void}
   */
  logSummary() {
    const summary = this.getSummary();
    
    logInfo(this.sessionId, this.component, 
      `Performance summary for ${this.component}`,
      summary
    );
  }
}

/**
 * Creates a performance monitor for tracking workflow execution.
 * 
 * @param {string} sessionId - Session identifier
 * @param {string} component - Component name
 * @returns {PerformanceMonitor} Performance monitor instance
 */
function createPerformanceMonitor(sessionId, component) {
  return new PerformanceMonitor(sessionId, component);
}

/**
 * Validates if an agent execution time is within acceptable limits.
 * 
 * Requirement 9.2, 9.3: Agents must complete within 30 seconds
 * 
 * @param {number} duration - Duration in milliseconds
 * @param {string} agentName - Name of the agent
 * @returns {Object} Validation result with isValid flag and message
 */
function validateAgentExecutionTime(duration, agentName) {
  const isValid = duration <= PERFORMANCE_THRESHOLDS.AGENT_TIMEOUT;
  
  return {
    isValid,
    duration,
    threshold: PERFORMANCE_THRESHOLDS.AGENT_TIMEOUT,
    agentName,
    message: isValid 
      ? `${agentName} completed within acceptable time (${duration}ms)`
      : `${agentName} exceeded timeout threshold (${duration}ms > ${PERFORMANCE_THRESHOLDS.AGENT_TIMEOUT}ms)`
  };
}

/**
 * Validates if workflow execution time is within acceptable limits.
 * 
 * Requirement 9.1: Workflow must complete within 90 seconds
 * 
 * @param {number} duration - Duration in milliseconds
 * @returns {Object} Validation result with isValid flag and message
 */
function validateWorkflowExecutionTime(duration) {
  const isValid = duration <= PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT;
  
  return {
    isValid,
    duration,
    threshold: PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT,
    message: isValid
      ? `Workflow completed within acceptable time (${duration}ms)`
      : `Workflow exceeded timeout threshold (${duration}ms > ${PERFORMANCE_THRESHOLDS.WORKFLOW_TIMEOUT}ms)`,
    warningThreshold: PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING,
    isWarning: duration > PERFORMANCE_THRESHOLDS.WORKFLOW_WARNING && isValid
  };
}

module.exports = {
  PerformanceMonitor,
  createPerformanceMonitor,
  validateAgentExecutionTime,
  validateWorkflowExecutionTime,
  PERFORMANCE_THRESHOLDS
};
