/**
 * @fileoverview CDK construct for deploying agents to Amazon Bedrock AgentCore Runtime.
 * 
 * This construct packages and deploys existing custom agent implementations to AgentCore Runtime,
 * providing enterprise-grade infrastructure with session isolation, extended execution time,
 * and enhanced payload support.
 * 
 * Requirements: FR-1, FR-1.1, NFR-6
 */

import { Construct } from 'constructs';
import { Duration, Stack, CustomResource } from 'aws-cdk-lib';
import { Function, Runtime, Code, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal, PolicyStatement, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { AgentCoreDeploymentBucketConstruct } from './agentcore-deployment-bucket';

/**
 * Properties for AgentCore Runtime Agents construct.
 */
export interface AgentCoreRuntimeAgentsProps {
  /**
   * DynamoDB table for orchestration session management.
   */
  orchestrationTable: Table;
  
  /**
   * DynamoDB table for product data.
   */
  productTable: Table;
  
  /**
   * SageMaker Canvas endpoint name for ML analysis (optional).
   */
  sageMakerEndpoint?: string;
  
  /**
   * Deployment environment (dev, prod).
   */
  environment: string;
  
  /**
   * S3 bucket for agent code packages (optional).
   * If not provided, a new bucket will be created.
   */
  codeBucket?: Bucket;
  
  /**
   * AWS region for AgentCore Runtime deployment.
   * Required - no default value to ensure explicit configuration.
   */
  agentCoreRegion: string;
}

/**
 * CDK construct for deploying agents to AgentCore Runtime.
 * 
 * This construct:
 * 1. Creates S3 bucket for agent code packages
 * 2. Creates IAM roles with appropriate permissions for AgentCore agents
 * 3. Creates custom resource provider for AgentCore deployment
 * 4. Deploys agents to AgentCore Runtime using AWS SDK
 * 5. Exports agent IDs for use in orchestrator handlers
 * 
 * Requirements: FR-1, FR-1.1, NFR-6
 */
export class AgentCoreRuntimeAgentsConstruct extends Construct {
  /**
   * AgentCore Runtime agent ID for Demand Forecast Agent.
   */
  public readonly demandForecastAgentId: string;
  
  /**
   * AgentCore Runtime agent ID for Competitive Analysis Agent.
   */
  public readonly competitiveAnalysisAgentId: string;
  
  /**
   * AgentCore Runtime agent ID for Margin Analysis Agent.
   */
  public readonly marginAnalysisAgentId: string;
  
  /**
   * IAM role for AgentCore Runtime agents.
   */
  public readonly agentRole: Role;
  
  /**
   * S3 bucket for agent code packages.
   */
  public readonly codeBucket: Bucket;
  
  /**
   * Custom resource provider for AgentCore deployment.
   */
  private readonly deploymentProvider: Provider;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeAgentsProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const region = props.agentCoreRegion;
    const account = stack.account;

    // Validate required configuration
    if (!region) {
      throw new Error('agentCoreRegion is required in props. Please provide the AWS region for AgentCore Runtime deployment.');
    }

    // Create or use existing S3 bucket for agent code packages (Requirement FR-1.1)
    if (props.codeBucket) {
      this.codeBucket = props.codeBucket;
    } else {
      const bucketConstruct = new AgentCoreDeploymentBucketConstruct(this, 'CodeBucket', {
        environment: props.environment
      });
      this.codeBucket = bucketConstruct.bucket;
    }

    // Create IAM role for AgentCore Runtime agents (Requirement NFR-6)
    this.agentRole = this.createAgentRole(props);

    // Create custom resource provider for AgentCore deployment (Requirement FR-1.1)
    this.deploymentProvider = this.createDeploymentProvider(props);

    // Deploy Demand Forecast Agent to AgentCore Runtime
    this.demandForecastAgentId = this.deployAgent('demand-forecast', {
      agentName: 'DemandForecastAgent',
      description: 'Demand Forecast Agent for pricing analysis - deployed to AgentCore Runtime',
      packageKey: 'agents/demand-forecast-agent.zip',
      runtime: 'PYTHON_3_13',
      entryPoint: ['main.py', 'handler'],
      role: this.agentRole,
      environment: props.environment,
      region: region,
      orchestrationTable: props.orchestrationTable,
      productTable: props.productTable,
      sageMakerEndpoint: props.sageMakerEndpoint
    });

    // Deploy Competitive Analysis Agent to AgentCore Runtime
    this.competitiveAnalysisAgentId = this.deployAgent('competitive-analysis', {
      agentName: 'CompetitiveAnalysisAgent',
      description: 'Competitive Analysis Agent for market positioning - deployed to AgentCore Runtime',
      packageKey: 'agents/competitive-analysis-agent.zip',
      runtime: 'PYTHON_3_13',
      entryPoint: ['main.py', 'handler'],
      role: this.agentRole,
      environment: props.environment,
      region: region,
      orchestrationTable: props.orchestrationTable,
      productTable: props.productTable,
      sageMakerEndpoint: props.sageMakerEndpoint
    });

    // Deploy Margin Analysis Agent to AgentCore Runtime
    this.marginAnalysisAgentId = this.deployAgent('margin-analysis', {
      agentName: 'MarginAnalysisAgent',
      description: 'Margin Analysis Agent for pricing synthesis - deployed to AgentCore Runtime',
      packageKey: 'agents/margin-analysis-agent.zip',
      runtime: 'PYTHON_3_13',
      entryPoint: ['main.py', 'handler'],
      role: this.agentRole,
      environment: props.environment,
      region: region,
      orchestrationTable: props.orchestrationTable,
      productTable: props.productTable,
      sageMakerEndpoint: props.sageMakerEndpoint
    });
  }

  /**
   * Creates IAM role for AgentCore Runtime agents with required permissions.
   * 
   * Grants permissions for:
   * - DynamoDB read/write for session management
   * - SageMaker Canvas invocation for ML analysis
   * - S3 read/write for data access
   * - CloudWatch logging
   * - Bedrock model invocation (for agent reasoning)
   * 
   * All permissions follow the principle of least privilege, granting only
   * the minimum permissions required for agent operation.
   * 
   * Requirements: NFR-6 (Security - IAM roles with least privilege)
   * 
   * @param props - Construct properties
   * @returns IAM role for agents
   */
  private createAgentRole(props: AgentCoreRuntimeAgentsProps): Role {
    const stack = Stack.of(this);
    
    // Create IAM role with AgentCore Runtime service principal
    // Note: AgentCore Runtime agents run as Lambda functions, so we use lambda.amazonaws.com
    const role = new Role(this, 'AgentCoreRuntimeAgentRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for AgentCore Runtime agents with least privilege permissions',
      managedPolicies: [
        // Basic Lambda execution permissions (CloudWatch Logs)
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        // X-Ray tracing for observability
        ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
      ]
    });

    // ========================================================================
    // Lambda Invocation Permissions for Shared Services
    // ========================================================================
    // Grant permission to invoke get-product-data Lambda (shared service)
    // This Lambda is used by all agents to retrieve product information
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'LambdaInvocationAccess',
      actions: [
        'lambda:InvokeFunction'                 // Invoke shared Lambda functions
      ],
      resources: [
        `arn:aws:lambda:${stack.region}:${stack.account}:function:retail-pricing-${props.environment}-get-product-data`
      ]
    }));

    // ========================================================================
    // DynamoDB Permissions for Session Management and Pricing Updates
    // ========================================================================
    // Grant read/write access to orchestration/pricing table for:
    // - Reading session data and pricing records
    // - Updating agent-specific analysis fields:
    //   * Demand Forecast Agent: updates 'demandForecast' field
    //   * Competitive Analysis Agent: updates 'competitiveAnalysis' field
    //   * Margin Analysis Agent: updates 'marginAnalysis' field
    // - Updating session status (e.g., 'demand_analysis_complete')
    // - Updating timestamps ('updatedAt')
    // 
    // Each agent performs UpdateItem operations on the pricing table using session_id as key.
    // Permissions are scoped to the specific table ARN automatically by grantReadWriteData.
    props.orchestrationTable.grantReadWriteData(role);
    
    // Grant read-only access to product table for product data retrieval
    // Used for querying product information and SageMaker Canvas model availability
    props.productTable.grantReadData(role);

    // ========================================================================
    // SageMaker Canvas Permissions for ML Analysis
    // ========================================================================
    // Grant permission to invoke SageMaker Canvas endpoints for demand forecasting
    // Only added if endpoint is configured (optional - agent falls back to historical data)
    // 
    // The demand forecast agent uses SageMaker Canvas for ML-based forecasting when available.
    // If no endpoint is configured or the model is unavailable, the agent automatically
    // falls back to historical demand data from S3.
    if (props.sageMakerEndpoint) {
      role.addToPrincipalPolicy(new PolicyStatement({
        sid: 'SageMakerCanvasAccess',
        actions: [
          'sagemaker:InvokeEndpoint',           // Invoke ML model for predictions
          'sagemaker:DescribeEndpoint'          // Check endpoint status and availability
        ],
        resources: [
          // Specific endpoint ARN
          `arn:aws:sagemaker:${stack.region}:${stack.account}:endpoint/${props.sageMakerEndpoint}`,
          // Wildcard for endpoint variants (e.g., A/B testing)
          `arn:aws:sagemaker:${stack.region}:${stack.account}:endpoint/${props.sageMakerEndpoint}*`
        ]
      }));
    }

    // ========================================================================
    // S3 Permissions for Data Access
    // ========================================================================
    // Grant read access to training data bucket for:
    // - Reading historical demand data (demand forecast agent)
    // - Reading competitive data (competitive analysis agent)
    // - Reading margin rules (margin analysis agent)
    // - Accessing product metadata
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'S3DataAccess',
      actions: [
        's3:GetObject',                         // Read data files
        's3:ListBucket',                        // List bucket contents
        's3:GetObjectVersion'                   // Read versioned objects
      ],
      resources: [
        // Training data bucket (contains historical demand, competitive data, margin rules)
        `arn:aws:s3:::retail-pricing-${props.environment}-data`,
        `arn:aws:s3:::retail-pricing-${props.environment}-data/*`,
        // Shared data bucket for cross-environment data
        `arn:aws:s3:::retail-pricing-shared-data`,
        `arn:aws:s3:::retail-pricing-shared-data/*`
      ]
    }));

    // ========================================================================
    // CloudWatch Permissions for Logging and Monitoring
    // ========================================================================
    // Grant permissions for structured logging and custom metrics
    // Note: Basic logging is covered by AWSLambdaBasicExecutionRole,
    // but we add explicit permissions for custom log groups
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'CloudWatchLogging',
      actions: [
        'logs:CreateLogGroup',                  // Create log groups
        'logs:CreateLogStream',                 // Create log streams
        'logs:PutLogEvents',                    // Write log events
        'logs:DescribeLogStreams'               // Query log streams
      ],
      resources: [
        `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/agentcore-*`,
        `arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/agentcore-*:*`
      ]
    }));

    // Grant permissions for custom CloudWatch metrics
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'CloudWatchMetrics',
      actions: [
        'cloudwatch:PutMetricData'              // Publish custom metrics
      ],
      resources: ['*'],                         // CloudWatch metrics don't support resource-level permissions
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': [
            'AgentCore/Pricing',                // Custom namespace for pricing metrics
            'AWS/Lambda'                        // Standard Lambda metrics
          ]
        }
      }
    }));

    // ========================================================================
    // Bedrock Model Invocation Permissions
    // ========================================================================
    // Grant permissions to invoke Bedrock foundation models for agent reasoning
    // Agents use Claude models for:
    // - Natural language understanding
    // - Decision making and reasoning
    // - Response generation
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'BedrockModelAccess',
      actions: [
        'bedrock:InvokeModel',                  // Invoke foundation models
        'bedrock:InvokeModelWithResponseStream' // Invoke with streaming responses
      ],
      resources: [
        // Claude 3.5 Haiku for classification and simple tasks
        `arn:aws:bedrock:${stack.region}::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0`,
        // Claude Sonnet 4 for specialized analysis
        `arn:aws:bedrock:${stack.region}::foundation-model/us.anthropic.claude-sonnet-4-20250514-v1:0`,
        // Claude Sonnet 4.5 for supervisor agents
        `arn:aws:bedrock:${stack.region}::foundation-model/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
        // Allow any Anthropic Claude model for flexibility
        `arn:aws:bedrock:${stack.region}::foundation-model/anthropic.claude*`
      ]
    }));

    // Grant permissions to retrieve model information
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'BedrockModelInfo',
      actions: [
        'bedrock:GetFoundationModel',           // Get model details
        'bedrock:ListFoundationModels'          // List available models
      ],
      resources: ['*']                          // These actions don't support resource-level permissions
    }));

    // ========================================================================
    // AppSync Permissions for Real-Time Communication
    // ========================================================================
    // Grant permissions to invoke AppSync mutations for real-time updates
    // Agents use AppSync mutations to:
    // - Write chat messages (createChatMessage) for progress updates
    // - Update session state (updatePricingSession) with results and status
    // 
    // This enables real-time communication with the frontend dashboard via
    // GraphQL subscriptions without requiring custom DynamoDB stream processing.
    // 
    // Requirements: 10.5, 10.6 (Agent Integration Pattern)
    role.addToPrincipalPolicy(new PolicyStatement({
      sid: 'AppSyncMutationAccess',
      actions: [
        'appsync:GraphQL'                       // Invoke GraphQL mutations
      ],
      resources: [
        // Allow agents to invoke createChatMessage mutation for progress updates
        `arn:aws:appsync:${stack.region}:${stack.account}:apis/*/types/Mutation/fields/createChatMessage`,
        // Allow agents to invoke updatePricingSession mutation for state updates
        `arn:aws:appsync:${stack.region}:${stack.account}:apis/*/types/Mutation/fields/updatePricingSession`
      ]
    }));

    return role;
  }

  /**
   * Creates custom resource provider for AgentCore Runtime deployment.
   * 
   * This provider handles the lifecycle of AgentCore Runtime agents:
   * - CREATE: Deploys agent to AgentCore Runtime
   * - UPDATE: Updates agent configuration
   * - DELETE: Removes agent from AgentCore Runtime
   * 
   * Requirements: FR-1.1
   * 
   * @param props - Construct properties
   * @returns Custom resource provider
   */
  private createDeploymentProvider(props: AgentCoreRuntimeAgentsProps): Provider {
    const stack = Stack.of(this);
    
    // Create Lambda function for custom resource provider
    const providerFunction = new Function(this, 'DeploymentProviderFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: Code.fromAsset('lib/lambdas/agentcore-deployment-provider'),
      timeout: Duration.minutes(15),
      memorySize: 512,
      description: 'Custom resource provider for AgentCore Runtime agent deployment',
      environment: {
        CODE_BUCKET: this.codeBucket.bucketName
      }
    });

    // Grant permissions to deployment provider
    this.codeBucket.grantRead(providerFunction);
    
    providerFunction.addToRolePolicy(new PolicyStatement({
      sid: 'AgentCoreRuntimeDeployment',
      actions: [
        'bedrock-agentcore:CreateAgentRuntime',
        'bedrock-agentcore:UpdateAgentRuntime',
        'bedrock-agentcore:DeleteAgentRuntime',
        'bedrock-agentcore:GetAgentRuntime',
        'bedrock-agentcore:ListAgentRuntimes',
        'bedrock-agentcore:TagResource',
        'bedrock-agentcore:UntagResource'
      ],
      resources: ['*']
    }));
    
    providerFunction.addToRolePolicy(new PolicyStatement({
      sid: 'IAMPassRole',
      actions: ['iam:PassRole'],
      resources: [this.agentRole.roleArn],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'bedrock-agentcore.amazonaws.com'
        }
      }
    }));

    // Create provider
    return new Provider(this, 'DeploymentProvider', {
      onEventHandler: providerFunction
    });
  }

  /**
   * Deploys an agent to AgentCore Runtime using custom resource.
   * 
   * This method creates a custom resource that invokes the AgentCore Runtime API
   * to deploy the agent. The custom resource handles:
   * - Agent registration with AgentCore service
   * - Configuration of runtime settings
   * - Environment variable injection
   * - Error handling and validation
   * 
   * Requirements: FR-1, FR-1.1
   * 
   * @param agentId - Unique agent identifier
   * @param config - Agent configuration
   * @returns AgentCore Runtime agent ID
   */
  private deployAgent(agentId: string, config: any): string {
    const stack = Stack.of(this);
    
    // Create custom resource for agent deployment (Requirement FR-1.1)
    const agentDeployment = new CustomResource(this, `${config.agentName}Deployment`, {
      serviceToken: this.deploymentProvider.serviceToken,
      properties: {
        AgentRuntimeName: `${config.environment}-${agentId}`,
        Description: config.description,
        CodeBucket: this.codeBucket.bucketName,
        CodeKey: config.packageKey,
        Runtime: config.runtime,
        EntryPoint: config.entryPoint,
        RoleArn: config.role.roleArn,
        Region: config.region,
        NetworkMode: 'PUBLIC',
        Timeout: 60,                      // 60 seconds initialization timeout (increased from default 30s)
        MemorySize: 512,                  // 512 MB memory allocation
        LifecycleConfiguration: {
          IdleRuntimeSessionTimeout: 600,  // 10 minutes (increased for better connection reuse)
          MaxLifetime: 28800                // 8 hours
        },
        EnvironmentVariables: {
          PRICING_TABLE_NAME: config.orchestrationTable.tableName,
          PRODUCT_TABLE_NAME: config.productTable.tableName,
          TRAINING_DATA_BUCKET: `retail-pricing-${config.environment}-data`,
          GET_PRODUCT_DATA_LAMBDA: `retail-pricing-${config.environment}-get-product-data`,
          SAGEMAKER_ENDPOINT: config.sageMakerEndpoint || '',
          ENVIRONMENT: config.environment,
          AWS_REGION: stack.region,
          LOG_LEVEL: 'INFO'
        },
        Tags: {
          Environment: config.environment,
          AgentType: agentId,
          ManagedBy: 'CDK'
        }
      }
    });

    // Return agent runtime ID from custom resource
    const agentRuntimeId = agentDeployment.getAttString('AgentRuntimeId');
    
    return agentRuntimeId;
  }
}

/**
 * Example usage of AgentCoreRuntimeAgentsConstruct:
 * 
 * ```typescript
 * import { AgentCoreRuntimeAgentsConstruct } from './constructs/agentcore-runtime-agents';
 * 
 * // In your stack
 * const agentCoreAgents = new AgentCoreRuntimeAgentsConstruct(this, 'AgentCoreAgents', {
 *   orchestrationTable: orchestrationTable,
 *   productTable: productTable,
 *   sageMakerEndpoint: 'pricing-canvas-endpoint',
 *   environment: 'dev'
 * });
 * 
 * // Use agent IDs in orchestrator handlers
 * const demandForecastHandler = new Function(this, 'DemandForecastHandler', {
 *   environment: {
 *     DEMAND_FORECAST_AGENTCORE_ID: agentCoreAgents.demandForecastAgentId
 *   }
 * });
 * ```
 */
