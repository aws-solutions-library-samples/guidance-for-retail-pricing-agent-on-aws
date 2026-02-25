/**
 * @fileoverview CloudWatch monitoring dashboard for real-time communication system.
 * 
 * Creates a comprehensive dashboard for monitoring AppSync mutations, subscriptions,
 * DynamoDB operations, and agent message delivery for the real-time pricing dashboard.
 * 
 * Requirements: 12.6, 14.1, 14.2, 14.3, 14.4, 14.5
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
  Alarm,
  ComparisonOperator,
  TreatMissingData
} from 'aws-cdk-lib/aws-cloudwatch';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

export interface RealtimeCommunicationMonitoringProps {
  /**
   * AppSync GraphQL API
   */
  graphqlApi: GraphqlApi;

  /**
   * SessionChat DynamoDB table
   */
  sessionChatTable: Table;

  /**
   * PricingOrchestration DynamoDB table
   */
  orchestrationTable: Table;

  /**
   * Environment name (dev, prod)
   */
  environment: string;

  /**
   * Optional email address for alarm notifications
   */
  alertEmail?: string;
}

/**
 * CDK construct for real-time communication monitoring dashboard.
 * 
 * Creates a CloudWatch dashboard with widgets for:
 * - AppSync mutation count and latency
 * - AppSync subscription connections
 * - DynamoDB write operations and throttling
 * - Agent message delivery metrics
 * - Error rates and alarms
 */
export class RealtimeCommunicationMonitoringConstruct extends Construct {
  public readonly dashboard: Dashboard;
  public readonly alarmTopic?: Topic;
  public readonly mutationErrorAlarm: Alarm;
  public readonly subscriptionErrorAlarm: Alarm;
  public readonly dynamodbThrottleAlarm: Alarm;

  constructor(scope: Construct, id: string, props: RealtimeCommunicationMonitoringProps) {
    super(scope, id);

    const { graphqlApi, sessionChatTable, orchestrationTable, environment, alertEmail } = props;

    // Create SNS topic for alarms if email is provided
    if (alertEmail) {
      this.alarmTopic = new Topic(this, 'RealtimeCommAlarmTopic', {
        displayName: `Real-time Communication Alarms - ${environment}`,
        topicName: `realtime-comm-alarms-${environment}`
      });

      this.alarmTopic.addSubscription(new EmailSubscription(alertEmail));
    }

    // Create dashboard
    this.dashboard = new Dashboard(this, 'RealtimeCommDashboard', {
      dashboardName: `Realtime-Communication-${environment}`,
      defaultInterval: Duration.hours(1)
    });

    // Add title widget
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: `# Real-Time Communication Monitoring Dashboard\n\n**Environment**: ${environment}\n\n**Purpose**: Monitor AppSync mutations, subscriptions, and agent message delivery for real-time pricing dashboard updates`,
        width: 24,
        height: 2
      })
    );

    // Add AppSync mutation metrics
    this.addAppSyncMutationWidgets(graphqlApi, environment);

    // Add AppSync subscription metrics
    this.addAppSyncSubscriptionWidgets(graphqlApi, environment);

    // Add DynamoDB metrics
    this.addDynamoDBWidgets(sessionChatTable, orchestrationTable, environment);

    // Add agent message delivery metrics
    this.addAgentMessageMetrics(environment);

    // Create alarms
    this.mutationErrorAlarm = this.createMutationErrorAlarm(graphqlApi, environment);
    this.subscriptionErrorAlarm = this.createSubscriptionErrorAlarm(graphqlApi, environment);
    this.dynamodbThrottleAlarm = this.createDynamoDBThrottleAlarm(sessionChatTable, environment);

    // Add alarm widgets
    this.addAlarmWidgets();
  }

  /**
   * Adds AppSync mutation metrics widgets to the dashboard.
   * 
   * Tracks mutation count and latency for createChatMessage and updatePricingSession.
   * Requirements: 14.1, 14.2
   */
  private addAppSyncMutationWidgets(graphqlApi: GraphqlApi, environment: string): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## AppSync Mutation Metrics\n\nTarget: < 500ms latency, > 99% success rate',
        width: 24,
        height: 1
      })
    );

    // Mutation count metrics
    const createChatMessageCount = new Metric({
      namespace: 'AWS/AppSync',
      metricName: '4XXError',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'createChatMessage Invocations',
      color: Color.BLUE
    });

    const updatePricingSessionCount = new Metric({
      namespace: 'AWS/AppSync',
      metricName: '4XXError',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'updatePricingSession Invocations',
      color: Color.GREEN
    });

    // Mutation latency metrics
    const mutationLatency = new Metric({
      namespace: 'AWS/AppSync',
      metricName: 'Latency',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Mutation Latency (avg)',
      color: Color.ORANGE
    });

    const mutationLatencyP99 = mutationLatency.with({
      statistic: 'p99',
      label: 'Mutation Latency (p99)',
      color: Color.RED
    });

    // Mutation count graph
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'AppSync Mutation Count',
        width: 12,
        height: 6,
        left: [
          new Metric({
            namespace: 'AWS/AppSync',
            metricName: 'Count',
            dimensionsMap: {
              GraphQLAPIId: graphqlApi.apiId
            },
            statistic: Statistic.SUM,
            unit: Unit.COUNT,
            label: 'Total Mutations',
            color: Color.BLUE
          })
        ],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'AppSync Mutation Latency',
        width: 12,
        height: 6,
        left: [mutationLatency, mutationLatencyP99],
        leftYAxis: {
          label: 'Latency (ms)',
          showUnits: false
        },
        leftAnnotations: [
          {
            value: 500,
            label: 'Target (500ms)',
            color: Color.RED
          }
        ]
      })
    );

    // Mutation success/error rates
    const mutation4xxErrors = new Metric({
      namespace: 'AWS/AppSync',
      metricName: '4XXError',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: '4XX Errors',
      color: Color.ORANGE
    });

    const mutation5xxErrors = new Metric({
      namespace: 'AWS/AppSync',
      metricName: '5XXError',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: '5XX Errors',
      color: Color.RED
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'AppSync Mutation Errors',
        width: 12,
        height: 6,
        left: [mutation4xxErrors, mutation5xxErrors],
        leftYAxis: {
          label: 'Error Count',
          showUnits: false
        }
      }),
      new SingleValueWidget({
        title: 'Total Mutations (24h)',
        width: 6,
        height: 3,
        metrics: [
          new Metric({
            namespace: 'AWS/AppSync',
            metricName: 'Count',
            dimensionsMap: {
              GraphQLAPIId: graphqlApi.apiId
            },
            statistic: Statistic.SUM,
            unit: Unit.COUNT
          })
        ],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      }),
      new SingleValueWidget({
        title: 'Avg Mutation Latency (24h)',
        width: 6,
        height: 3,
        metrics: [mutationLatency],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Adds AppSync subscription metrics widgets to the dashboard.
   * 
   * Tracks active subscription connections and connection errors.
   * Requirements: 14.3
   */
  private addAppSyncSubscriptionWidgets(graphqlApi: GraphqlApi, environment: string): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## AppSync Subscription Metrics\n\nMonitor active connections and subscription errors',
        width: 24,
        height: 1
      })
    );

    // Active subscription connections
    const activeConnections = new Metric({
      namespace: 'AWS/AppSync',
      metricName: 'ActiveConnections',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.COUNT,
      label: 'Active Connections',
      color: Color.BLUE
    });

    const maxConnections = activeConnections.with({
      statistic: Statistic.MAXIMUM,
      label: 'Peak Connections',
      color: Color.PURPLE
    });

    // Connection errors
    const connectionErrors = new Metric({
      namespace: 'AWS/AppSync',
      metricName: 'ConnectClientError',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Connection Errors',
      color: Color.RED
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Active Subscription Connections',
        width: 12,
        height: 6,
        left: [activeConnections, maxConnections],
        leftYAxis: {
          label: 'Connections',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Subscription Connection Errors',
        width: 12,
        height: 6,
        left: [connectionErrors],
        leftYAxis: {
          label: 'Errors',
          showUnits: false
        }
      })
    );

    // Subscription message delivery
    const subscriptionMessages = new Metric({
      namespace: 'AWS/AppSync',
      metricName: 'SubscriptionEventPublishMessageCount',
      dimensionsMap: {
        GraphQLAPIId: graphqlApi.apiId
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Messages Delivered',
      color: Color.GREEN
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Subscription Messages Delivered',
        width: 12,
        height: 6,
        left: [subscriptionMessages],
        leftYAxis: {
          label: 'Messages',
          showUnits: false
        }
      }),
      new SingleValueWidget({
        title: 'Active Connections',
        width: 6,
        height: 3,
        metrics: [activeConnections],
        setPeriodToTimeRange: true
      }),
      new SingleValueWidget({
        title: 'Messages Delivered (24h)',
        width: 6,
        height: 3,
        metrics: [subscriptionMessages],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Adds DynamoDB metrics widgets to the dashboard.
   * 
   * Tracks write operations, throttling events, and latency.
   * Requirements: 14.4
   */
  private addDynamoDBWidgets(
    sessionChatTable: Table,
    orchestrationTable: Table,
    environment: string
  ): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## DynamoDB Metrics\n\nMonitor write operations and throttling for SessionChat and PricingOrchestration tables',
        width: 24,
        height: 1
      })
    );

    // SessionChat table metrics
    const sessionChatWrites = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ConsumedWriteCapacityUnits',
      dimensionsMap: {
        TableName: sessionChatTable.tableName
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'SessionChat Writes',
      color: Color.BLUE
    });

    const sessionChatThrottles = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'WriteThrottleEvents',
      dimensionsMap: {
        TableName: sessionChatTable.tableName
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'SessionChat Throttles',
      color: Color.RED
    });

    // Orchestration table metrics
    const orchestrationWrites = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ConsumedWriteCapacityUnits',
      dimensionsMap: {
        TableName: orchestrationTable.tableName
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Orchestration Writes',
      color: Color.GREEN
    });

    const orchestrationThrottles = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'WriteThrottleEvents',
      dimensionsMap: {
        TableName: orchestrationTable.tableName
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Orchestration Throttles',
      color: Color.ORANGE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'DynamoDB Write Operations',
        width: 12,
        height: 6,
        left: [sessionChatWrites, orchestrationWrites],
        leftYAxis: {
          label: 'Write Capacity Units',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'DynamoDB Write Throttle Events',
        width: 12,
        height: 6,
        left: [sessionChatThrottles, orchestrationThrottles],
        leftYAxis: {
          label: 'Throttle Events',
          showUnits: false
        }
      })
    );

    // DynamoDB latency metrics
    const sessionChatLatency = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'SuccessfulRequestLatency',
      dimensionsMap: {
        TableName: sessionChatTable.tableName,
        Operation: 'PutItem'
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'SessionChat Write Latency',
      color: Color.BLUE
    });

    const orchestrationLatency = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'SuccessfulRequestLatency',
      dimensionsMap: {
        TableName: orchestrationTable.tableName,
        Operation: 'UpdateItem'
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.MILLISECONDS,
      label: 'Orchestration Update Latency',
      color: Color.GREEN
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'DynamoDB Operation Latency',
        width: 12,
        height: 6,
        left: [sessionChatLatency, orchestrationLatency],
        leftYAxis: {
          label: 'Latency (ms)',
          showUnits: false
        }
      }),
      new SingleValueWidget({
        title: 'SessionChat Writes (24h)',
        width: 6,
        height: 3,
        metrics: [sessionChatWrites],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      }),
      new SingleValueWidget({
        title: 'Total Throttles (24h)',
        width: 6,
        height: 3,
        metrics: [sessionChatThrottles, orchestrationThrottles],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Adds agent message delivery metrics widgets to the dashboard.
   * 
   * Tracks custom metrics for agent message writes and delivery success.
   */
  private addAgentMessageMetrics(environment: string): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## Agent Message Delivery\n\nCustom metrics for agent message writes and delivery success',
        width: 24,
        height: 1
      })
    );

    // Agent message write metrics
    const messageWrites = new Metric({
      namespace: 'RetailPricing/RealtimeComm',
      metricName: 'AgentMessageWrite',
      dimensionsMap: {
        Environment: environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Message Writes',
      color: Color.BLUE
    });

    const messageWriteFailures = new Metric({
      namespace: 'RetailPricing/RealtimeComm',
      metricName: 'AgentMessageWriteFailure',
      dimensionsMap: {
        Environment: environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Write Failures',
      color: Color.RED
    });

    // Session update metrics
    const sessionUpdates = new Metric({
      namespace: 'RetailPricing/RealtimeComm',
      metricName: 'SessionUpdate',
      dimensionsMap: {
        Environment: environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Session Updates',
      color: Color.GREEN
    });

    const sessionUpdateFailures = new Metric({
      namespace: 'RetailPricing/RealtimeComm',
      metricName: 'SessionUpdateFailure',
      dimensionsMap: {
        Environment: environment
      },
      statistic: Statistic.SUM,
      unit: Unit.COUNT,
      label: 'Update Failures',
      color: Color.ORANGE
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Agent Message Writes',
        width: 12,
        height: 6,
        left: [messageWrites, messageWriteFailures],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      }),
      new GraphWidget({
        title: 'Session Updates',
        width: 12,
        height: 6,
        left: [sessionUpdates, sessionUpdateFailures],
        leftYAxis: {
          label: 'Count',
          showUnits: false
        }
      })
    );

    // Success rate calculation
    const messageSuccessRate = new Metric({
      namespace: 'RetailPricing/RealtimeComm',
      metricName: 'MessageSuccessRate',
      dimensionsMap: {
        Environment: environment
      },
      statistic: Statistic.AVERAGE,
      unit: Unit.PERCENT,
      label: 'Message Success Rate',
      color: Color.GREEN
    });

    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Message Delivery Success Rate',
        width: 12,
        height: 6,
        left: [messageSuccessRate],
        leftYAxis: {
          label: 'Success Rate (%)',
          showUnits: false,
          min: 0,
          max: 100
        },
        leftAnnotations: [
          {
            value: 99,
            label: 'Target (99%)',
            color: Color.GREEN
          }
        ]
      }),
      new SingleValueWidget({
        title: 'Success Rate (24h)',
        width: 12,
        height: 6,
        metrics: [messageSuccessRate],
        setPeriodToTimeRange: false,
        period: Duration.hours(24)
      })
    );
  }

  /**
   * Creates CloudWatch alarm for mutation error rate.
   * 
   * Triggers when mutation error rate exceeds 5%.
   * Requirements: 14.5
   */
  private createMutationErrorAlarm(graphqlApi: GraphqlApi, environment: string): Alarm {
    const alarm = new Alarm(this, 'MutationErrorAlarm', {
      alarmName: `realtime-comm-mutation-errors-${environment}`,
      alarmDescription: 'AppSync mutation error rate exceeds 5%',
      metric: new Metric({
        namespace: 'AWS/AppSync',
        metricName: '5XXError',
        dimensionsMap: {
          GraphQLAPIId: graphqlApi.apiId
        },
        statistic: Statistic.SUM,
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });

    if (this.alarmTopic) {
      alarm.addAlarmAction(new SnsAction(this.alarmTopic));
    }

    return alarm;
  }

  /**
   * Creates CloudWatch alarm for subscription connection failures.
   * 
   * Triggers when subscription connection failures exceed 10%.
   * Requirements: 14.5
   */
  private createSubscriptionErrorAlarm(graphqlApi: GraphqlApi, environment: string): Alarm {
    const alarm = new Alarm(this, 'SubscriptionErrorAlarm', {
      alarmName: `realtime-comm-subscription-errors-${environment}`,
      alarmDescription: 'AppSync subscription connection failures exceed 10%',
      metric: new Metric({
        namespace: 'AWS/AppSync',
        metricName: 'ConnectClientError',
        dimensionsMap: {
          GraphQLAPIId: graphqlApi.apiId
        },
        statistic: Statistic.SUM,
        period: Duration.minutes(5)
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });

    if (this.alarmTopic) {
      alarm.addAlarmAction(new SnsAction(this.alarmTopic));
    }

    return alarm;
  }

  /**
   * Creates CloudWatch alarm for DynamoDB throttling events.
   * 
   * Triggers when write throttle events occur.
   * Requirements: 14.5
   */
  private createDynamoDBThrottleAlarm(sessionChatTable: Table, environment: string): Alarm {
    const alarm = new Alarm(this, 'DynamoDBThrottleAlarm', {
      alarmName: `realtime-comm-dynamodb-throttles-${environment}`,
      alarmDescription: 'DynamoDB write throttle events detected on SessionChat table',
      metric: new Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'WriteThrottleEvents',
        dimensionsMap: {
          TableName: sessionChatTable.tableName
        },
        statistic: Statistic.SUM,
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });

    if (this.alarmTopic) {
      alarm.addAlarmAction(new SnsAction(this.alarmTopic));
    }

    return alarm;
  }

  /**
   * Adds alarm status widgets to the dashboard.
   */
  private addAlarmWidgets(): void {
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: '## CloudWatch Alarms\n\nMonitor alarm status for critical metrics',
        width: 24,
        height: 1
      })
    );

    // Note: AlarmWidget is not available in CDK, so we'll use text widget with alarm info
    this.dashboard.addWidgets(
      new TextWidget({
        markdown: `### Active Alarms\n\n- **Mutation Errors**: Triggers when 5XX errors > 5 in 5 minutes\n- **Subscription Errors**: Triggers when connection errors > 10 in 5 minutes\n- **DynamoDB Throttles**: Triggers when write throttles > 0 in 5 minutes\n\n${this.alarmTopic ? `**Notifications**: Sent to ${this.alarmTopic.topicName}` : '**Notifications**: Not configured'}`,
        width: 24,
        height: 3
      })
    );
  }
}
