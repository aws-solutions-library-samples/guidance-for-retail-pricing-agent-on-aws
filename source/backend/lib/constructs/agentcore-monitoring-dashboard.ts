/**
 * @fileoverview CloudWatch monitoring dashboard for AgentCore Runtime agents.
 * 
 * Creates a comprehensive dashboard for monitoring agent execution metrics,
 * success/failure rates, performance, and cost tracking.
 * 
 * Requirements: NFR-5 (Observability)
 */

import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import {
  Dashboard,
  GraphWidget,
  SingleValueWidget,
  Metric,
  Unit,
  Color,
  Statistic,
  TextWidget,
  Row,
  Column,
  AlarmWidget,
  LogQueryWidget,
  LogQueryVisualizationType
} from 'aws-cdk-lib/aws-cloudwatch';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';

export interface AgentCoreMonitoringDashboardProps {
  /**
   * Lambda functions for orchestrator handlers
   */
  demandForecastHandler: LambdaFunction;
  competitiveAnalysisHandler: LambdaFunction;
  marginAnalysisHandler: LambdaFunction;

  /**
   * AgentCore agent IDs for resource-specific metrics
   */
  demandForecastAgentId: string;
  competitiveAnalysisAgentId: string;
  marginAnalysisAgentId: string;

  /**
   * Environment name (dev, prod)
   */
  environment: string;
}

/**
 * CDK construct for AgentCore Runtime monitoring dashboard.
 * 
 * Creates a CloudWatch dashboard with widgets for:
 * - Agent execution duration
 * - Agent success/failure rates
 * - Cost tracking (estimated based on active processing time)
 * - Error rates and types
 * - Performance metrics
 */
export class AgentCoreMonitoringDashboardConstruct extends Construct {
  public readonly dashboard: Dashboard;

  constructor(scope: Construct, id: string, props: AgentCoreMonitoringDashboardProps) {
    super(scope, id);

    // Create dashboard
    this.dashboard = new Dashboard(this, 'AgentCoreDashboard', {
      dashboardName: `AgentCore-Pricing-Analysis-${props.environment}`,
      defaultInterval: Duration.hours(1)
    });

    // Add title widget
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: `# AgentCore Runtime Monitoring Dashboard\n\n**Environment**: ${props.environment}\n\n**Purpose**: Monitor agent execution, performance, and costs for pricing analysis workflow`,
        width: 24,
        height: 2
      })
    );

    // Add agent execution duration metrics
    this.addExecutionDurationWidgets(props);

    // Add success/failure rate metrics
    this.addSuccessFailureWidgets(props);

    // Add cost tracking widgets
    this.addCostTrackingWidgets(props);

    // Add error analysis widgets
    this.addErrorAnalysisWidgets(props);

    // Add performance metrics
    this.addPerformanceWidgets(props);

    // Add Lambda function metrics
    this.addLambdaMetricsWidgets(props);
  }

  /**
   * Adds agent execution duration widgets to the dashboard.
   * 
   * Tracks how long each agent takes to execute, with target of < 30 seconds.
   */
  private addExecutionDurationWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Agent Execution Duration\n\nTarget: < 30 seconds per agent, < 90 seconds total workflow',
        width: 24,
        height: 1
      })
    );

    // Create metrics for each agent
    const demandForecastDuration = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionDuration',
      dimensionsMap: {
        AgentName: 'DemandForecastAgent',
        Environment: props.environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Demand Forecast Agent',
      color: Color.BLUE
    });

    const competitiveAnalysisDuration = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionDuration',
      dimensionsMap: {
        AgentName: 'CompetitiveAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Competitive Analysis Agent',
      color: Color.GREEN
    });

    const marginAnalysisDuration = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionDuration',
      dimensionsMap: {
        AgentName: 'MarginAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Margin Analysis Agent',
      color: Color.ORANGE
    });

    // Agent execution duration graph
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Agent Execution Duration (Average)',
        width: 12,
        height: 6,
        left: [demandForecastDuration, competitiveAnalysisDuration, marginAnalysisDuration],
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false
        },
        leftAnnotations: [
          {
            value: 30000,
            label: 'Target (30s)',
            color: Color.RED
          }
        ]
      }),
      new GraphWidget({
        title: 'Agent Execution Duration (p99)',
        width: 12,
        height: 6,
        left: [
          demandForecastDuration.with({ statistic: 'p99' }),
          competitiveAnalysisDuration.with({ statistic: 'p99' }),
          marginAnalysisDuration.with({ statistic: 'p99' })
        ],
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false
        },
        leftAnnotations: [
          {
            value: 30000,
            label: 'Target (30s)',
            color: Color.RED
          }
        ]
      })
    );

    // Total workflow duration
    const totalWorkflowDuration = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'TotalWorkflowDuration',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Total Workflow Duration',
      color: Color.PURPLE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Total Workflow Duration',
        width: 12,
        height: 6,
        left: [totalWorkflowDuration],
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false
        },
        leftAnnotations: [
          {
            value: 90000,
            label: 'Target (90s)',
            color: Color.RED
          }
        ]
      }),
      new SingleValueWidget({
        title: 'Average Workflow Duration',
        width: 6,
        height: 6,
        metrics: [totalWorkflowDuration],
        setPeriodToTimeRange: true
      }),
      new SingleValueWidget({
        title: 'p99 Workflow Duration',
        width: 6,
        height: 6,
        metrics: [totalWorkflowDuration.with({ statistic: 'p99' })],
        setPeriodToTimeRange: true
      })
    );
  }

  /**
   * Adds success/failure rate widgets to the dashboard.
   * 
   * Tracks agent execution success and failure counts and rates.
   */
  private addSuccessFailureWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Agent Success/Failure Rates\n\nMonitor agent reliability and error rates',
        width: 24,
        height: 1
      })
    );

    // Success metrics
    const demandForecastSuccess = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionSuccess',
      dimensionsMap: {
        AgentName: 'DemandForecastAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Demand Forecast Success',
      color: Color.GREEN
    });

    const competitiveAnalysisSuccess = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionSuccess',
      dimensionsMap: {
        AgentName: 'CompetitiveAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Competitive Analysis Success',
      color: Color.GREEN
    });

    const marginAnalysisSuccess = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionSuccess',
      dimensionsMap: {
        AgentName: 'MarginAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Margin Analysis Success',
      color: Color.GREEN
    });

    // Failure metrics
    const demandForecastFailure = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionFailure',
      dimensionsMap: {
        AgentName: 'DemandForecastAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Demand Forecast Failure',
      color: Color.RED
    });

    const competitiveAnalysisFailure = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionFailure',
      dimensionsMap: {
        AgentName: 'CompetitiveAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Competitive Analysis Failure',
      color: Color.RED
    });

    const marginAnalysisFailure = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionFailure',
      dimensionsMap: {
        AgentName: 'MarginAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Margin Analysis Failure',
      color: Color.RED
    });

    // Success/failure graph
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Agent Execution Success Count',
        width: 12,
        height: 6,
        left: [demandForecastSuccess, competitiveAnalysisSuccess, marginAnalysisSuccess],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Agent Execution Failure Count',
        width: 12,
        height: 6,
        left: [demandForecastFailure, competitiveAnalysisFailure, marginAnalysisFailure],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      })
    );

    // Success rate calculation (success / (success + failure))
    const totalSuccess = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionSuccess',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Total Success',
      color: Color.GREEN
    });

    const totalFailure = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionFailure',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Total Failure',
      color: Color.RED
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Overall Success vs Failure',
        width: 12,
        height: 6,
        left: [totalSuccess, totalFailure],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new SingleValueWidget({
        title: 'Total Executions (24h)',
        width: 6,
        height: 3,
        metrics: [totalSuccess, totalFailure],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      }),
      new SingleValueWidget({
        title: 'Success Rate (24h)',
        width: 6,
        height: 3,
        metrics: [
          new Metric({
            namespace: 'RetailPricing/AgentCore',
            metricName: 'AgentSuccessRate',
            dimensionsMap: {
              Environment: props.environment
            },
            statistic: Statistic.AVERAGE,
            unit: Unit.PERCENT,
            label: 'Success Rate'
          })
        ],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Adds cost tracking widgets to the dashboard.
   * 
   * Estimates AgentCore Runtime costs based on active processing time.
   * Note: AgentCore charges only for active CPU time, not I/O wait periods.
   */
  private addCostTrackingWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Cost Tracking\n\nEstimated AgentCore Runtime costs (consumption-based pricing)\n\n**Note**: Charges apply only for active CPU processing time, not I/O wait periods',
        width: 24,
        height: 2
      })
    );

    // Active processing time metric
    const activeProcessingTime = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'ActiveProcessingTime',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.MILLISECONDS,
      label: 'Active Processing Time',
      color: Color.BLUE
    });

    // Estimated cost metric (calculated based on processing time)
    const estimatedCost = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'EstimatedCost',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.NONE,
      label: 'Estimated Cost (USD)',
      color: Color.ORANGE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Active Processing Time (Billable)',
        width: 12,
        height: 6,
        left: [activeProcessingTime],
        leftYAxis: {
          label: 'Time (ms)',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Estimated Daily Cost',
        width: 12,
        height: 6,
        left: [estimatedCost],
        leftYAxis: {
          label: 'Cost (USD)',
          showUnits: false
        }
      })
    );

    // Cost breakdown by agent
    const demandForecastCost = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'EstimatedCost',
      dimensionsMap: {
        AgentName: 'DemandForecastAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.NONE,
      label: 'Demand Forecast',
      color: Color.BLUE
    });

    const competitiveAnalysisCost = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'EstimatedCost',
      dimensionsMap: {
        AgentName: 'CompetitiveAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.NONE,
      label: 'Competitive Analysis',
      color: Color.GREEN
    });

    const marginAnalysisCost = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'EstimatedCost',
      dimensionsMap: {
        AgentName: 'MarginAnalysisAgent',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.NONE,
      label: 'Margin Analysis',
      color: Color.ORANGE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Cost Breakdown by Agent',
        width: 12,
        height: 6,
        left: [demandForecastCost, competitiveAnalysisCost, marginAnalysisCost],
        leftYAxis: {
          label: 'Cost (USD)',
          showUnits: false
        },
        stacked: true
      }),
      new SingleValueWidget({
        title: 'Total Cost (24h)',
        width: 6,
        height: 3,
        metrics: [estimatedCost],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      }),
      new SingleValueWidget({
        title: 'Avg Cost per Execution',
        width: 6,
        height: 3,
        metrics: [
          new Metric({
            namespace: 'RetailPricing/AgentCore',
            metricName: 'CostPerExecution',
            dimensionsMap: {
              Environment: props.environment
            },
            statistic: Statistic.AVERAGE,
            unit: Unit.NONE,
            label: 'Cost per Execution'
          })
        ],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Adds error analysis widgets to the dashboard.
   * 
   * Tracks error types, error rates, and error patterns.
   */
  private addErrorAnalysisWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Error Analysis\n\nMonitor error types and patterns for troubleshooting',
        width: 24,
        height: 1
      })
    );

    // Error rate by type
    const timeoutErrors = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionError',
      dimensionsMap: {
        ErrorType: 'TIMEOUT',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Timeout Errors',
      color: Color.RED
    });

    const runtimeErrors = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionError',
      dimensionsMap: {
        ErrorType: 'RUNTIME_ERROR',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Runtime Errors',
      color: Color.ORANGE
    });

    const validationErrors = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'AgentExecutionError',
      dimensionsMap: {
        ErrorType: 'VALIDATION_ERROR',
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Validation Errors',
      color: Color.PURPLE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Error Count by Type',
        width: 12,
        height: 6,
        left: [timeoutErrors, runtimeErrors, validationErrors],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        },
        stacked: true
      }),
      new GraphWidget({
        title: 'Error Rate (%)',
        width: 12,
        height: 6,
        left: [
          new Metric({
            namespace: 'RetailPricing/AgentCore',
            metricName: 'ErrorRate',
            dimensionsMap: {
              Environment: props.environment
            },
            statistic: Statistic.AVERAGE,
            unit: Unit.PERCENT,
            label: 'Error Rate',
            color: Color.RED
          })
        ],
        leftYAxis: {
          label: 'Error Rate (%)',
          showUnits: false,
          min: 0,
          max: 100
        },
        leftAnnotations: [
          {
            value: 5,
            label: 'Warning Threshold (5%)',
            color: Color.ORANGE
          },
          {
            value: 10,
            label: 'Critical Threshold (10%)',
            color: Color.RED
          }
        ]
      })
    );
  }

  /**
   * Adds performance metrics widgets to the dashboard.
   * 
   * Tracks cold starts, memory usage, and other performance indicators.
   */
  private addPerformanceWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Performance Metrics\n\nMonitor cold starts, memory usage, and performance indicators',
        width: 24,
        height: 1
      })
    );

    // Cold start metrics
    const coldStarts = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'ColdStart',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Cold Starts',
      color: Color.BLUE
    });

    const coldStartDuration = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'ColdStartDuration',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Cold Start Duration',
      color: Color.ORANGE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Cold Start Count',
        width: 12,
        height: 6,
        left: [coldStarts],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Cold Start Duration',
        width: 12,
        height: 6,
        left: [coldStartDuration],
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false
        }
      })
    );

    // Concurrent executions
    const concurrentExecutions = new Metric({
      namespace: 'RetailPricing/AgentCore',
      metricName: 'ConcurrentExecutions',
      dimensionsMap: {
        Environment: props.environment
      },
      statistic: Statistic.MAXIMUM,
      unit: Unit.COUNT,
      label: 'Concurrent Executions',
      color: Color.PURPLE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Concurrent Agent Executions',
        width: 12,
        height: 6,
        left: [concurrentExecutions],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new SingleValueWidget({
        title: 'Peak Concurrent Executions',
        width: 12,
        height: 6,
        metrics: [concurrentExecutions],
        setPeriodToTimeRange: true
      })
    );
  }

  /**
   * Adds Lambda function metrics widgets to the dashboard.
   * 
   * Tracks orchestrator handler Lambda function performance.
   */
  private addLambdaMetricsWidgets(props: AgentCoreMonitoringDashboardProps): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Orchestrator Handler Metrics\n\nMonitor Lambda functions that invoke AgentCore agents',
        width: 24,
        height: 1
      })
    );

    // Lambda invocation metrics
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Lambda Invocations',
        width: 12,
        height: 6,
        left: [
          props.demandForecastHandler.metricInvocations({ label: 'Demand Forecast Handler' }),
          props.competitiveAnalysisHandler.metricInvocations({ label: 'Competitive Analysis Handler' }),
          props.marginAnalysisHandler.metricInvocations({ label: 'Margin Analysis Handler' })
        ],
        leftYAxis: {
          label: 'Invocations',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Lambda Errors',
        width: 12,
        height: 6,
        left: [
          props.demandForecastHandler.metricErrors({ label: 'Demand Forecast Errors', color: Color.RED }),
          props.competitiveAnalysisHandler.metricErrors({ label: 'Competitive Analysis Errors', color: Color.ORANGE }),
          props.marginAnalysisHandler.metricErrors({ label: 'Margin Analysis Errors', color: Color.PURPLE })
        ],
        leftYAxis: {
          label: 'Errors',
          showUnits: false
        }
      })
    );

    // Lambda duration metrics
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Lambda Duration (Average)',
        width: 12,
        height: 6,
        left: [
          props.demandForecastHandler.metricDuration({ label: 'Demand Forecast Handler' }),
          props.competitiveAnalysisHandler.metricDuration({ label: 'Competitive Analysis Handler' }),
          props.marginAnalysisHandler.metricDuration({ label: 'Margin Analysis Handler' })
        ],
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false
        },
        leftAnnotations: [
          {
            value: 35000,
            label: 'Timeout (35s)',
            color: Color.RED
          }
        ]
      }),
      new GraphWidget({
        title: 'Lambda Throttles',
        width: 12,
        height: 6,
        left: [
          props.demandForecastHandler.metricThrottles({ label: 'Demand Forecast Throttles' }),
          props.competitiveAnalysisHandler.metricThrottles({ label: 'Competitive Analysis Throttles' }),
          props.marginAnalysisHandler.metricThrottles({ label: 'Margin Analysis Throttles' })
        ],
        leftYAxis: {
          label: 'Throttles',
          showUnits: false
        }
      })
    );
  }
}
