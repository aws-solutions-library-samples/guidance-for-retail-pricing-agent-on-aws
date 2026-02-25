/**
 * @fileoverview Step Functions state machine construct for multi-agent orchestration.
 * 
 * Creates a serverless workflow orchestrator that manages the execution of
 * Demand Forecast, Competitive Analysis, and Margin Analysis agents with
 * parallel and sequential execution patterns. Includes error handling, retry logic,
 * timeout enforcement, CloudWatch logging, and X-Ray tracing.
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 9.1, 9.5
 */

import { Construct } from 'constructs';
import { 
  StateMachine, 
  Chain, 
  Parallel, 
  Choice, 
  Condition,
  Pass,
  Fail,
  Succeed,
  TaskInput,
  JsonPath,
  LogLevel,
  StateMachineType
} from 'aws-cdk-lib/aws-stepfunctions';
import { 
  LambdaInvoke,
  LambdaInvokeProps
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration, CfnOutput } from 'aws-cdk-lib';

export interface StepFunctionsOrchestratorProps {
  /**
   * Lambda function for workflow initialization.
   */
  initializeWorkflowFunction: Function;

  /**
   * Lambda function for Demand Forecast Agent invocation.
   */
  demandForecastHandlerFunction: Function;

  /**
   * Lambda function for Competitive Analysis Agent invocation.
   */
  competitiveAnalysisHandlerFunction: Function;

  /**
   * Lambda function for checking Supervisor results.
   */
  checkSupervisorResultsFunction: Function;

  /**
   * Lambda function for Margin Analysis Agent invocation.
   */
  marginAnalysisHandlerFunction: Function;

  /**
   * Lambda function for updating session status.
   */
  updateSessionStatusFunction: Function;
}

export class StepFunctionsOrchestratorConstruct extends Construct {
  public readonly stateMachine: StateMachine;
  public readonly stateMachineArn: string;
  public readonly stateMachineRole: Role;

  constructor(scope: Construct, id: string, props: StepFunctionsOrchestratorProps) {
    super(scope, id);

    const {
      initializeWorkflowFunction,
      demandForecastHandlerFunction,
      competitiveAnalysisHandlerFunction,
      checkSupervisorResultsFunction,
      marginAnalysisHandlerFunction,
      updateSessionStatusFunction
    } = props;

    /**
     * Create IAM role for Step Functions state machine.
     * 
     * Grants permissions to:
     * - Invoke all Lambda functions
     * - Write logs to CloudWatch
     * - Send traces to X-Ray
     */
    this.stateMachineRole = new Role(this, 'StateMachineRole', {
      assumedBy: new ServicePrincipal('states.amazonaws.com'),
      description: 'Role for multi-agent orchestration state machine'
    });

    // Grant Lambda invoke permissions for all handler functions
    initializeWorkflowFunction.grantInvoke(this.stateMachineRole);
    demandForecastHandlerFunction.grantInvoke(this.stateMachineRole);
    competitiveAnalysisHandlerFunction.grantInvoke(this.stateMachineRole);
    checkSupervisorResultsFunction.grantInvoke(this.stateMachineRole);
    marginAnalysisHandlerFunction.grantInvoke(this.stateMachineRole);
    updateSessionStatusFunction.grantInvoke(this.stateMachineRole);

    // Grant CloudWatch Logs permissions
    this.stateMachineRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'logs:CreateLogDelivery',
        'logs:GetLogDelivery',
        'logs:UpdateLogDelivery',
        'logs:DeleteLogDelivery',
        'logs:ListLogDeliveries',
        'logs:PutResourcePolicy',
        'logs:DescribeResourcePolicies',
        'logs:DescribeLogGroups'
      ],
      resources: ['*']
    }));

    // Grant X-Ray write permissions
    this.stateMachineRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords'
      ],
      resources: ['*']
    }));

    /**
     * Create CloudWatch Log Group for state machine execution history.
     * 
     * Stores complete execution logs for debugging and monitoring.
     * Retention: 30 days for cost optimization.
     */
    const logGroup = new LogGroup(this, 'StateMachineLogGroup', {
      logGroupName: '/aws/stepfunctions/pricing-orchestration',
      retention: RetentionDays.ONE_MONTH
    });

    /**
     * Build the state machine definition using CDK constructs.
     * 
     * Workflow structure:
     * 1. InitializeWorkflow - Set up session and validate input
     * 2. SupervisorParallelState - Execute Demand Forecast and Competitive Analysis in parallel
     * 3. CheckSupervisorResults - Evaluate parallel results
     * 4. EvaluateSupervisorSuccess - Decide whether to proceed to Margin Analysis
     * 5. InvokeMarginAnalysisAgent - Execute Margin Analysis sequentially
     * 6. Handle success, partial success, and failure states
     * 
     * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 9.1, 9.5
     */

    // Initialize workflow state
    const initializeWorkflow = new LambdaInvoke(this, 'InitializeWorkflow', {
      lambdaFunction: initializeWorkflowFunction,
      outputPath: '$',
      payloadResponseOnly: true,
      retryOnServiceExceptions: true
    });

    // Demand Forecast Agent invocation (parallel branch 1)
    const invokeDemandForecast = new LambdaInvoke(this, 'InvokeDemandForecastAgent', {
      lambdaFunction: demandForecastHandlerFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        userId: JsonPath.stringAt('$.userId'),
        product: JsonPath.objectAt('$.product')
      }),
      outputPath: '$',
      timeout: Duration.seconds(120), // 2 minutes for agent execution
      retryOnServiceExceptions: true
    }).addRetry({
      errors: ['States.TaskFailed', 'RuntimeClientError', 'States.Timeout'],
      interval: Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0
    });
    // Handle Demand Forecast failure
    const demandForecastFailed = new Pass(this, 'DemandForecastFailed', {
      result: TaskInput.fromObject({
        status: 'failed',
        agentName: 'Demand Forecast Agent',
        result: null
      }),
      resultPath: '$'
    });

    invokeDemandForecast.addCatch(demandForecastFailed);

    // Competitive Analysis Agent invocation (parallel branch 2)
    const invokeCompetitiveAnalysis = new LambdaInvoke(this, 'InvokeCompetitiveAnalysisAgent', {
      lambdaFunction: competitiveAnalysisHandlerFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        userId: JsonPath.stringAt('$.userId'),
        product: JsonPath.objectAt('$.product')
      }),
      outputPath: '$',
      timeout: Duration.seconds(120), // 2 minutes for agent execution
      retryOnServiceExceptions: true
    }).addRetry({
      errors: ['States.TaskFailed', 'RuntimeClientError', 'States.Timeout'],
      interval: Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0
    });

    // Handle Competitive Analysis failure
    const competitiveAnalysisFailed = new Pass(this, 'CompetitiveAnalysisFailed', {
      result: TaskInput.fromObject({
        status: 'failed',
        agentName: 'Competitive Analysis Agent',
        result: null
      }),
      resultPath: '$'
    });

    invokeCompetitiveAnalysis.addCatch(competitiveAnalysisFailed);

    // Parallel state for Supervisor Agent execution
    const supervisorParallelState = new Parallel(this, 'SupervisorParallelState', {
      comment: 'Execute Demand Forecast and Competitive Analysis agents in parallel',
      resultPath: '$.supervisorResults'
    });

    supervisorParallelState.branch(invokeDemandForecast);
    supervisorParallelState.branch(invokeCompetitiveAnalysis);

    // Check Supervisor results
    const checkSupervisorResults = new LambdaInvoke(this, 'CheckSupervisorResults', {
      lambdaFunction: checkSupervisorResultsFunction,
      outputPath: '$',
      payloadResponseOnly: true,
      resultPath: '$.supervisorCheck'
    });

    // Evaluate if we can proceed to Margin Analysis
    const evaluateSupervisorSuccess = new Choice(this, 'EvaluateSupervisorSuccess', {
      comment: 'Evaluate if we can proceed to Margin Analysis'
    });

    // Both parallel agents failed - terminate workflow
    const bothAgentsFailed = new LambdaInvoke(this, 'BothAgentsFailed', {
      lambdaFunction: updateSessionStatusFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        status: 'error',
        error: {
          message: 'Both Supervisor agents failed',
          code: 'SUPERVISOR_AGENTS_FAILED',
          details: JsonPath.objectAt('$.supervisorResults')
        },
        workflowStartTime: JsonPath.numberAt('$.workflowStartTimeMs')
      }),
      outputPath: '$',
      payloadResponseOnly: false,
      resultPath: '$.updateResult'
    });

    // Invoke Margin Analysis Agent
    const invokeMarginAnalysis = new LambdaInvoke(this, 'InvokeMarginAnalysisAgent', {
      lambdaFunction: marginAnalysisHandlerFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        userId: JsonPath.stringAt('$.userId'),
        product: JsonPath.objectAt('$.product')
      }),
      outputPath: '$',
      timeout: Duration.seconds(120), // 2 minutes for agent execution
      resultPath: '$.marginResult'
    }).addRetry({
      errors: ['States.TaskFailed', 'RuntimeClientError', 'States.Timeout'],
      interval: Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0
    });

    // Margin Analysis failed - return partial results
    const marginAnalysisFailed = new LambdaInvoke(this, 'MarginAnalysisFailed', {
      lambdaFunction: updateSessionStatusFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        status: 'partial_success',
        results: {
          supervisorResults: JsonPath.objectAt('$.supervisorCheck.aggregatedResults')
        },
        error: {
          message: 'Margin Analysis failed but Supervisor agents succeeded',
          code: 'MARGIN_ANALYSIS_FAILED'
        },
        workflowStartTime: JsonPath.numberAt('$.workflowStartTimeMs')
      }),
      outputPath: '$',
      payloadResponseOnly: false,
      resultPath: '$.updateResult'
    });

    invokeMarginAnalysis.addCatch(marginAnalysisFailed);

    // Workflow succeeded
    const workflowSucceeded = new LambdaInvoke(this, 'WorkflowSucceeded', {
      lambdaFunction: updateSessionStatusFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        status: 'success',
        results: {
          supervisorResults: JsonPath.objectAt('$.supervisorCheck.aggregatedResults'),
          marginResult: JsonPath.objectAt('$.marginResult.Payload')
        },
        workflowStartTime: JsonPath.numberAt('$.workflowStartTimeMs')
      }),
      outputPath: '$',
      payloadResponseOnly: false,
      resultPath: '$.updateResult'
    });

    // Workflow completed with partial success
    const workflowPartialSuccess = new Succeed(this, 'WorkflowPartialSuccess', {
      comment: 'Workflow completed with partial success'
    });

    // Workflow failed
    const workflowFailed = new Fail(this, 'WorkflowFailed', {
      error: 'WorkflowExecutionError',
      cause: 'Workflow execution failed'
    });

    // Handle workflow-level errors
    const handleWorkflowError = new LambdaInvoke(this, 'HandleWorkflowError', {
      lambdaFunction: updateSessionStatusFunction,
      payload: TaskInput.fromObject({
        sessionId: JsonPath.stringAt('$.sessionId'),
        status: 'error',
        error: {
          message: JsonPath.stringAt('$.errorInfo.Error'),
          code: 'WORKFLOW_ERROR',
          details: JsonPath.stringAt('$.errorInfo.Cause')
        },
        workflowStartTime: JsonPath.numberAt('$.workflowStartTimeMs')
      }),
      outputPath: '$',
      payloadResponseOnly: false,
      resultPath: '$.updateResult'
    });

    handleWorkflowError.next(workflowFailed);

    // Build the state machine chain
    const definition = Chain.start(initializeWorkflow)
      .next(supervisorParallelState)
      .next(checkSupervisorResults)
      .next(evaluateSupervisorSuccess
        .when(
          Condition.booleanEquals('$.supervisorCheck.canProceed', true),
          invokeMarginAnalysis
            .next(workflowSucceeded)
        )
        .otherwise(bothAgentsFailed.next(workflowFailed))
      );

    // Add catch handler for workflow-level errors
    // Use resultPath to preserve original state and add error info
    supervisorParallelState.addCatch(handleWorkflowError, {
      resultPath: '$.errorInfo'
    });
    checkSupervisorResults.addCatch(handleWorkflowError, {
      resultPath: '$.errorInfo'
    });

    // Handle Margin Analysis failure path
    marginAnalysisFailed.next(workflowPartialSuccess);

    /**
     * Create the Step Functions state machine.
     * 
     * Configuration:
     * - Type: EXPRESS (for real-time execution with CloudWatch logging)
     * - Timeout: 90 seconds (Requirement 9.1, 9.5)
     * - Logging: CloudWatch Logs with ALL events
     * - Tracing: X-Ray enabled for distributed tracing
     * - Role: Custom role with Lambda invoke permissions
     */
    this.stateMachine = new StateMachine(this, 'PricingOrchestrationStateMachine', {
      definition,
      stateMachineType: StateMachineType.EXPRESS,
      timeout: Duration.seconds(90), // Requirement 9.1, 9.5
      tracingEnabled: true, // Enable X-Ray tracing
      logs: {
        destination: logGroup,
        level: LogLevel.ALL,
        includeExecutionData: true
      },
      role: this.stateMachineRole,
      comment: 'Pricing Chain Orchestration with Parallel Supervisor and Sequential Margin Analysis'
    });

    this.stateMachineArn = this.stateMachine.stateMachineArn;

    // Output the state machine ARN for use in Lambda resolver
    new CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachineArn,
      description: 'ARN of the pricing orchestration state machine',
      exportName: 'PricingOrchestrationStateMachineArn'
    });

    new CfnOutput(this, 'StateMachineName', {
      value: this.stateMachine.stateMachineName,
      description: 'Name of the pricing orchestration state machine',
      exportName: 'PricingOrchestrationStateMachineName'
    });
  }
}

/**
 * State machine execution input structure.
 * 
 * Expected input from Lambda resolver:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",  // OK: Example UUID for documentation
 *   "userId": "user123",
 *   "product": {
 *     "product_id": "CMAN-SAW-PRO725",
 *     "category": "powertools",
 *     "cost": 89.99,
 *     "MSRP": 179.99,
 *     "MAP": 149.99
 *   }
 * }
 */
export interface StateMachineExecutionInput {
  sessionId: string;
  userId: string;
  product: {
    product_id: string;
    category: string;
    cost: number;
    MSRP: number;
    MAP: number;
    [key: string]: any;
  };
}

/**
 * State machine execution output structure.
 * 
 * Final output after successful workflow completion:
 * {
 *   "status": "success",
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",  // OK: Example UUID for documentation
 *   "results": {
 *     "supervisorResults": {
 *       "demandForecast": {...},
 *       "competitiveAnalysis": {...}
 *     },
 *     "marginResult": {...}
 *   }
 * }
 */
export interface StateMachineExecutionOutput {
  status: 'success' | 'partial_success' | 'error';
  sessionId: string;
  results?: {
    supervisorResults?: any;
    marginResult?: any;
  };
  error?: {
    message: string;
    code: string;
  };
}
