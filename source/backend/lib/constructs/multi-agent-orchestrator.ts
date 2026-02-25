/**
 * @fileoverview Multi-Agent Orchestration CDK Construct.
 * 
 * Creates a complete serverless orchestration system that coordinates the execution
 * of Demand Forecast, Competitive Analysis, and Margin Analysis agents. Implements
 * parallel and sequential execution patterns with error handling, real-time updates,
 * and comprehensive monitoring.
 * 
 * Requirements: 1.1, 2.1, 5.1, 6.1, 7.1, 10.1
 */

import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { 
  Function, 
  Runtime, 
  Code, 
  Tracing,
  LayerVersion,
  Architecture,
  StartingPosition
} from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal, PolicyStatement, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Duration, CfnOutput } from 'aws-cdk-lib';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StepFunctionsOrchestratorConstruct } from './step-functions-orchestrator';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';

export interface MultiAgentOrchestratorProps {
  /**
   * DynamoDB table for session management and state storage.
   */
  orchestrationTable: Table;

  /**
   * DynamoDB table for product data.
   */
  productTable: Table;

  /**
   * AppSync GraphQL API for subscription updates.
   */
  graphqlApi: GraphqlApi;

  /**
   * Environment name (dev, prod, etc.)
   */
  environment: string;

  /**
   * AgentCore Runtime agent IDs from configuration.
   * These IDs are generated during AgentCore deployment and stored in config files.
   */
  agentCoreIds: {
    demandForecast: string;
    competitiveAnalysis: string;
    marginAnalysis: string;
  };
}

export class MultiAgentOrchestratorConstruct extends Construct {
  // Lambda functions
  public readonly resolverFunction: Function;
  public readonly initializeWorkflowFunction: Function;
  public readonly demandForecastHandlerFunction: Function;
  public readonly competitiveAnalysisHandlerFunction: Function;
  public readonly marginAnalysisHandlerFunction: Function;
  public readonly checkSupervisorResultsFunction: Function;
  public readonly updateSessionStatusFunction: Function;
  public readonly streamHandlerFunction: Function;

  // Step Functions state machine
  public readonly stepFunctionsOrchestrator: StepFunctionsOrchestratorConstruct;
  public readonly stateMachineArn: string;

  constructor(scope: Construct, id: string, props: MultiAgentOrchestratorProps) {
    super(scope, id);

    const {
      orchestrationTable,
      productTable,
      graphqlApi,
      environment,
      agentCoreIds
    } = props;

    // Get stack context for region and account
    const stack = cdk.Stack.of(this);
    const region = stack.region;
    const account = stack.account;

    // Common environment variables for all Lambda functions
    // Note: AWS_REGION is automatically provided by Lambda runtime, don't set it manually
    const commonEnvironment = {
      AWS_ACCOUNT_ID: account,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
    };

    /**
     * Create IAM role for Lambda functions with necessary permissions.
     * 
     * Grants permissions for:
     * - DynamoDB read/write operations
     * - Bedrock agent invocation
     * - AppSync mutations for subscriptions
     * - CloudWatch logging and X-Ray tracing
     */
    const lambdaRole = new Role(this, 'OrchestratorLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
      ],
      description: 'Role for multi-agent orchestration Lambda functions'
    });

    // Grant DynamoDB permissions
    orchestrationTable.grantReadWriteData(lambdaRole);
    productTable.grantReadData(lambdaRole);

    // Permission Chain:
    // 1. Step Functions → Lambda Wrappers (needs lambda:InvokeFunction)
    // 2. Lambda Wrappers → AgentCore Agents (needs bedrock-agentcore:InvokeAgentRuntime)
    
    // Grant Lambda invocation permissions for Step Functions to invoke wrapper functions
    // Step Functions needs to invoke the Lambda wrapper handlers which then invoke AgentCore agents
    lambdaRole.addToPrincipalPolicy(new PolicyStatement({
      sid: 'StepFunctionsToLambdaWrappers',
      actions: [
        'lambda:InvokeFunction'  // Required for Step Functions to invoke Lambda wrappers
      ],
      resources: [
        // Grant permission to invoke the Lambda wrapper handler functions
        // These are the handlers in multi-agent-orchestrator/ that wrap AgentCore invocations
        `arn:aws:lambda:${region}:${account}:function:*DemandForecastHandler*`,
        `arn:aws:lambda:${region}:${account}:function:*CompetitiveAnalysisHandler*`,
        `arn:aws:lambda:${region}:${account}:function:*MarginAnalysisHandler*`
      ]
    }));

    // Grant AgentCore invocation permissions for Lambda wrappers to invoke AgentCore agents
    // Lambda wrapper handlers need to invoke AgentCore agents using BedrockAgentCoreClient
    lambdaRole.addToPrincipalPolicy(new PolicyStatement({
      sid: 'LambdaWrappersToAgentCore',
      actions: [
        'bedrock-agentcore:InvokeAgentRuntime',  // Required to invoke AgentCore agents
        'bedrock-agentcore:GetAgentRuntime'      // Required to get agent runtime info
      ],
      resources: [
        // Grant permission to invoke any AgentCore agent runtime in this account/region
        // AgentCore agent IDs are configured in config files and passed as environment variables
        // Correct ARN format: arn:aws:bedrock-agentcore:{region}:{account}:runtime/{id}/runtime-endpoint/*
        `arn:aws:bedrock-agentcore:${region}:${account}:runtime/*/runtime-endpoint/*`,
        `arn:aws:bedrock-agentcore:${region}:${account}:runtime/*`
      ]
    }));

    // Grant AppSync mutation permissions for subscriptions
    lambdaRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'appsync:GraphQL'
      ],
      resources: [
        `arn:aws:appsync:${region}:${account}:apis/${graphqlApi.apiId}/*`
      ]
    }));

    // Grant Step Functions permissions
    lambdaRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'states:StartExecution',
        'states:DescribeExecution',
        'states:GetExecutionHistory'
      ],
      resources: ['*']
    }));

    /**
     * Create Lambda function for workflow initialization.
     * 
     * Initializes the workflow by updating session status to "in-progress"
     * and setting up initial workflow state.
     * 
     * Requirements: 5.2, 5.3
     */
    this.initializeWorkflowFunction = new NodejsFunction(this, 'InitializeWorkflowFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/initialize-workflow.js',
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName
      }
    });

    /**
     * Create Lambda function for Demand Forecast Agent invocation.
     * 
     * Invokes Bedrock Demand Forecast Agent, polls for completion,
     * collects messages, and stores results in DynamoDB.
     * 
     * Requirements: 2.1, 2.2, 4.1, 4.2, 7.1, 7.2, 9.2
     */
    this.demandForecastHandlerFunction = new NodejsFunction(this, 'DemandForecastHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/demand-forecast-handler.js',
      timeout: Duration.seconds(120), // 2 minutes for agent execution + buffer
      memorySize: 512,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName,
        PRODUCT_TABLE: productTable.tableName,
        DEMAND_FORECAST_AGENTCORE_ID: agentCoreIds.demandForecast
      }
    });

    /**
     * Create Lambda function for Competitive Analysis Agent invocation.
     * 
     * Invokes Bedrock Competitive Analysis Agent, polls for completion,
     * collects messages, and stores results in DynamoDB.
     * 
     * Requirements: 2.1, 2.2, 4.1, 4.2, 7.1, 7.2, 9.2
     */
    this.competitiveAnalysisHandlerFunction = new NodejsFunction(this, 'CompetitiveAnalysisHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/competitive-analysis-handler.js',
      timeout: Duration.seconds(120), // 2 minutes for agent execution + buffer
      memorySize: 512,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName,
        PRODUCT_TABLE: productTable.tableName,
        COMPETITIVE_ANALYSIS_AGENTCORE_ID: agentCoreIds.competitiveAnalysis
      }
    });

    /**
     * Create Lambda function for Margin Analysis Agent invocation.
     * 
     * Invokes Bedrock Margin Analysis Agent with Supervisor results,
     * polls for completion, collects messages, and returns final recommendations.
     * 
     * Requirements: 1.3, 4.1, 4.2, 7.1, 7.2, 8.5, 9.3
     */
    this.marginAnalysisHandlerFunction = new NodejsFunction(this, 'MarginAnalysisHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/margin-analysis-handler.js',
      timeout: Duration.seconds(120), // 2 minutes for agent execution + buffer
      memorySize: 512,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName,
        PRODUCT_TABLE: productTable.tableName,
        MARGIN_ANALYSIS_AGENTCORE_ID: agentCoreIds.marginAnalysis
      }
    });

    /**
     * Create Lambda function for checking Supervisor results.
     * 
     * Evaluates parallel agent results and determines if workflow can proceed
     * to Margin Analysis. Handles partial failures gracefully.
     * 
     * Requirements: 2.3, 2.4, 8.2, 8.3, 8.4
     */
    this.checkSupervisorResultsFunction = new NodejsFunction(this, 'CheckSupervisorResultsFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/check-supervisor-results.js',
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName
      }
    });

    /**
     * Create Lambda function for updating session status.
     * 
     * Updates session status in DynamoDB during workflow execution.
     * Triggered by Step Functions at various workflow stages.
     * 
     * Requirements: 5.4, 5.5, 8.6
     */
    this.updateSessionStatusFunction = new NodejsFunction(this, 'UpdateSessionStatusFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/update-session-status.js',
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName
      }
    });

    /**
     * Create Step Functions state machine orchestrator.
     * 
     * Manages the complete workflow with parallel and sequential execution,
     * error handling, retry logic, and timeout enforcement.
     * 
     * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 9.1, 9.5
     */
    this.stepFunctionsOrchestrator = new StepFunctionsOrchestratorConstruct(this, 'StepFunctionsOrchestrator', {
      initializeWorkflowFunction: this.initializeWorkflowFunction,
      demandForecastHandlerFunction: this.demandForecastHandlerFunction,
      competitiveAnalysisHandlerFunction: this.competitiveAnalysisHandlerFunction,
      checkSupervisorResultsFunction: this.checkSupervisorResultsFunction,
      marginAnalysisHandlerFunction: this.marginAnalysisHandlerFunction,
      updateSessionStatusFunction: this.updateSessionStatusFunction
    });

    this.stateMachineArn = this.stepFunctionsOrchestrator.stateMachineArn;

    /**
     * Create Lambda function for GraphQL resolver.
     * 
     * Entry point for pricing analysis requests from the UI.
     * Validates input, creates session, and starts Step Functions execution.
     * 
     * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
     */
    this.resolverFunction = new NodejsFunction(this, 'ResolverFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/resolver-handler.js',
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        PRICING_TABLE: orchestrationTable.tableName,
        STATE_MACHINE_ARN: this.stateMachineArn
      }
    });

    /**
     * Create Lambda function for DynamoDB Stream processing.
     * 
     * Processes DynamoDB Stream events and triggers AppSync subscriptions
     * to push real-time updates to connected clients.
     * 
     * Requirements: 6.1, 6.2, 6.3, 6.4
     */
    this.streamHandlerFunction = new NodejsFunction(this, 'StreamHandlerFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/multi-agent-orchestrator/stream-handler.js',
      timeout: Duration.seconds(60),
      memorySize: 256,
      role: lambdaRole,
      tracing: Tracing.ACTIVE,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agentcore',
          '@aws-sdk/client-bedrock-runtime',
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-sagemaker',
          '@aws-sdk/client-eventbridge',
          '@aws-sdk/client-cloudwatch',
          '@aws-sdk/client-sfn'
        ]
      },
      environment: {
        ...commonEnvironment,
        GRAPHQL_API_URL: graphqlApi.graphqlUrl
      }
    });

    /**
     * Wire DynamoDB Stream to stream handler Lambda.
     * 
     * Processes NEW_AND_OLD_IMAGES from orchestration table updates
     * and triggers AppSync subscriptions for real-time UI updates.
     * 
     * Requirements: 6.1, 6.2, 6.3, 6.4
     */
    this.streamHandlerFunction.addEventSource(new DynamoEventSource(orchestrationTable, {
      startingPosition: StartingPosition.LATEST,
      batchSize: 10,
      retryAttempts: 3,
      bisectBatchOnError: true,
      parallelizationFactor: 2
    }));

    /**
     * Grant Step Functions permission to invoke Lambda functions.
     * 
     * Allows the state machine to invoke all agent handlers and helper functions.
     */
    this.initializeWorkflowFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);
    this.demandForecastHandlerFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);
    this.competitiveAnalysisHandlerFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);
    this.checkSupervisorResultsFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);
    this.marginAnalysisHandlerFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);
    this.updateSessionStatusFunction.grantInvoke(this.stepFunctionsOrchestrator.stateMachineRole);

    /**
     * Output important values for integration with other constructs.
     */
    new CfnOutput(this, 'ResolverFunctionArn', {
      value: this.resolverFunction.functionArn,
      description: 'ARN of the Lambda resolver function',
      exportName: `${id}-ResolverFunctionArn`
    });

    new CfnOutput(this, 'ResolverFunctionName', {
      value: this.resolverFunction.functionName,
      description: 'Name of the Lambda resolver function',
      exportName: `${id}-ResolverFunctionName`
    });

    new CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachineArn,
      description: 'ARN of the Step Functions state machine',
      exportName: `${id}-StateMachineArn`
    });

    new CfnOutput(this, 'StateMachineName', {
      value: this.stepFunctionsOrchestrator.stateMachine.stateMachineName,
      description: 'Name of the Step Functions state machine',
      exportName: `${id}-StateMachineName`
    });

    new CfnOutput(this, 'StreamHandlerFunctionArn', {
      value: this.streamHandlerFunction.functionArn,
      description: 'ARN of the DynamoDB Stream handler function',
      exportName: `${id}-StreamHandlerFunctionArn`
    });

    new CfnOutput(this, 'StreamHandlerFunctionName', {
      value: this.streamHandlerFunction.functionName,
      description: 'Name of the DynamoDB Stream handler function',
      exportName: `${id}-StreamHandlerFunctionName`
    });
  }

  /**
   * Gets the resolver Lambda function for AppSync integration.
   * 
   * @returns The Lambda function to use as AppSync resolver
   */
  public getResolverFunction(): Function {
    return this.resolverFunction;
  }

  /**
   * Gets the state machine ARN for environment variable configuration.
   * 
   * @returns The Step Functions state machine ARN
   */
  public getStateMachineArn(): string {
    return this.stateMachineArn;
  }

  /**
   * Gets the orchestration table for direct access if needed.
   * 
   * @returns The DynamoDB orchestration table
   */
  public getOrchestrationTable(): Table {
    return this.stepFunctionsOrchestrator.stateMachine.node.tryFindChild('OrchestrationTable') as Table;
  }

}
