/**
 * @fileoverview Product Catalog Management Stack.
 * 
 * Creates the complete serverless infrastructure for product catalog
 * management including DynamoDB table, Cognito authentication,
 * and AppSync GraphQL API with Lambda resolvers.
 */

import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { UserPool, UserPoolClient, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { Table, AttributeType, BillingMode, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement, Effect, CanonicalUserPrincipal } from 'aws-cdk-lib/aws-iam';

import { ProductApiConstruct } from '../constructs/product-api';
import { SageMakerCanvasConstruct, type SageMakerCanvasConfig } from '../constructs/sagemaker-canvas';
import { OrchestrationTableConstruct } from '../constructs/orchestration-table';
import { SessionChatTableConstruct } from '../constructs/session-chat-table';
import { MultiAgentOrchestratorConstruct } from '../constructs/multi-agent-orchestrator';
import { RealtimeCommunicationMonitoringConstruct } from '../constructs/realtime-communication-monitoring';
import { Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Distribution, OriginAccessIdentity, ViewerProtocolPolicy, CachePolicy, OriginRequestPolicy, ResponseHeadersPolicy, AllowedMethods, ResponseCustomHeadersBehavior, ResponseHeadersCorsBehavior } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';

/**
 * Properties for the Product Catalog Stack.
 * 
 * @remarks
 * SageMaker Canvas infrastructure is mandatory and always deployed.
 * The sageMakerCanvas configuration property is optional and provides
 * customization options (VPC settings, domain prefix, etc.). If not
 * provided, sensible defaults will be used.
 */
export interface ProductCatalogStackProps extends StackProps {
  /** Environment name (dev, prod, local) */
  environment: string;
  /**
   * Optional SageMaker Canvas configuration for customization.
   * Note: SageMaker Canvas infrastructure is always deployed regardless
   * of whether this configuration is provided. This property only allows
   * customization of VPC settings, domain prefix, and other options.
   */
  sageMakerCanvas?: SageMakerCanvasConfig;
  /** Optional monitoring configuration */
  monitoring?: {
    enabled?: boolean;
    alertEmail?: string;
  };
  /** AgentCore configuration with agent IDs (required) */
  agentCore?: {
    agents: {
      demandForecast: string;
      competitiveAnalysis: string;
      marginAnalysis: string;
    };
  };
}

export class ProductCatalogStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly productTable: Table;
  public readonly productApi: ProductApiConstruct;
  public readonly graphqlApi: GraphqlApi;
  public readonly apiUrl: string;
  /** SageMaker Canvas construct (always present as it's mandatory infrastructure) */
  public readonly sageMakerCanvas: SageMakerCanvasConstruct;
  public readonly assetsBucket: Bucket;
  public readonly assetsDistribution: Distribution;
  public readonly pricingEventBus: EventBus;
  public readonly orchestrationTable: Table;
  public readonly sessionChatTable: Table;
  public readonly multiAgentOrchestrator: MultiAgentOrchestratorConstruct;
  public readonly realtimeCommMonitoring?: RealtimeCommunicationMonitoringConstruct;

  constructor(scope: Construct, id: string, props: ProductCatalogStackProps) {
    super(scope, id, props);

    const { environment, sageMakerCanvas, monitoring, agentCore } = props;

    // Create Cognito User Pool for authentication
    this.userPool = new UserPool(this, 'ProductCatalogUserPool', {
      userPoolName: `product-catalog-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true
      },
      autoVerify: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        },
        givenName: {
          required: true,
          mutable: true
        },
        familyName: {
          required: true,
          mutable: true
        }
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE
      },
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    // Create User Pool Client
    this.userPoolClient = new UserPoolClient(this, 'ProductCatalogUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `product-catalog-client-${environment}`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true
        },
        scopes: [
          cdk.aws_cognito.OAuthScope.EMAIL,
          cdk.aws_cognito.OAuthScope.OPENID,
          cdk.aws_cognito.OAuthScope.PROFILE
        ]
      }
    });

    // Create DynamoDB table for product catalog
    this.productTable = new Table(this, 'ProductTable', {
      tableName: `product-catalog-${environment}`,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    // Add Global Secondary Indexes
    this.productTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING }
    });

    this.productTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: AttributeType.STRING }
    });

    // Create SageMaker Canvas infrastructure (mandatory)
    // SageMaker Canvas is always deployed as it is core infrastructure for demand forecasting
    
    // Check for deprecated 'enabled' field and warn if present
    if (sageMakerCanvas && 'enabled' in sageMakerCanvas) {
      console.warn(
        '⚠️  WARNING: The sageMakerCanvas.enabled field is deprecated and will be ignored.\n' +
        '   SageMaker Canvas is now mandatory infrastructure and is always deployed.\n' +
        '   Please remove the "enabled" field from your configuration file.\n' +
        '   Deployment script flags (--skip-sagemaker, --sagemaker-only) control data loading only.'
      );
    }
    
    this.sageMakerCanvas = new SageMakerCanvasConstruct(this, 'SageMakerCanvas', {
      environment,
      productTable: this.productTable,
      enableVpc: sageMakerCanvas?.enableVpc ?? true,
      domainNamePrefix: sageMakerCanvas?.domainNamePrefix ?? `pricing-canvas-${environment}`,
      vpcCidr: sageMakerCanvas?.vpcCidr ?? '10.0.0.0/16'
    });

    // Create S3 bucket for assets and competitive data with CORS configuration
    this.assetsBucket = new Bucket(this, 'AssetsBucket', {
      bucketName: `product-catalog-assets-${environment}-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [cdk.aws_s3.HttpMethods.GET, cdk.aws_s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // Wide open for development - CloudFront will enforce proper CORS
          exposedHeaders: ['ETag', 'Content-Length', 'Content-Type', 'Last-Modified'],
          maxAge: 3600
        }
      ],
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    // Create Origin Access Identity for CloudFront to access S3
    const originAccessIdentity = new OriginAccessIdentity(this, 'AssetsOAI', {
      comment: `OAI for product catalog assets - ${environment}`
    });

    // Add explicit bucket policy for CloudFront OAI access
    // This ensures CloudFront can access the bucket with proper permissions
    // matching the working bucket policy format from the reference account
    this.assetsBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new CanonicalUserPrincipal(
        originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
      )],
      actions: [
        's3:GetBucket*',
        's3:GetObject*',
        's3:List*'
      ],
      resources: [
        this.assetsBucket.bucketArn,
        `${this.assetsBucket.bucketArn}/*`
      ]
    }));

    // Also add a specific GetObject permission for clarity (matches reference policy)
    this.assetsBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new CanonicalUserPrincipal(
        originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
      )],
      actions: ['s3:GetObject'],
      resources: [`${this.assetsBucket.bucketArn}/*`]
    }));

    // Keep the existing grantRead as well for good measure
    this.assetsBucket.grantRead(originAccessIdentity);

    // Create CloudFront distribution for serving images (CORS policy will be permissive for now)
    // Note: Amplify domain will be added to CORS after Amplify construct is created
    const corsResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'CorsResponseHeadersPolicy', {
      responseHeadersPolicyName: `product-catalog-cors-${environment}`,
      comment: `CORS policy for product catalog assets - ${environment}`,
      corsBehavior: {
        accessControlAllowOrigins: [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://*.amplifyapp.com'  // Allow all Amplify apps
        ],
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
        accessControlAllowCredentials: false,
        accessControlMaxAge: cdk.Duration.seconds(600),
        originOverride: true
      }
    });

    this.assetsDistribution = new Distribution(this, 'AssetsDistribution', {
      comment: `Product catalog assets CDN - ${environment}`,
      defaultBehavior: {
        origin: new S3Origin(this.assetsBucket, {
          originAccessIdentity: originAccessIdentity
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: corsResponseHeadersPolicy
      },
      additionalBehaviors: {
        '/products/images/*': {
          origin: new S3Origin(this.assetsBucket, {
            originAccessIdentity: originAccessIdentity
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS,
          originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
          responseHeadersPolicy: corsResponseHeadersPolicy
        }
      },
      enableIpv6: true,
      priceClass: environment === 'prod' ? undefined : cdk.aws_cloudfront.PriceClass.PRICE_CLASS_100 // Use cheaper price class for dev
    });

    // Create EventBridge custom bus for pricing events
    this.pricingEventBus = new EventBus(this, 'PricingEventBus', {
      eventBusName: `pricing-events-${environment}`,
      description: 'Custom event bus for pricing analysis and agent orchestration'
    });

    // Create DynamoDB table for multi-agent orchestration sessions
    const orchestrationTableConstruct = new OrchestrationTableConstruct(this, 'OrchestrationTable');
    this.orchestrationTable = orchestrationTableConstruct.table;

    // Create DynamoDB table for agent chat messages (Requirement 4.1, 4.2, 4.3, 4.4)
    const sessionChatTableConstruct = new SessionChatTableConstruct(this, 'SessionChatTable');
    this.sessionChatTable = sessionChatTableConstruct.table;

    // Create AppSync GraphQL API with orchestration and session chat table references
    this.productApi = new ProductApiConstruct(this, 'ProductApi', {
      userPool: this.userPool,
      productTable: this.productTable,
      orchestrationTable: this.orchestrationTable,
      sessionChatTable: this.sessionChatTable,
      eventBus: this.pricingEventBus
    });

    // Expose GraphQL API for frontend stack
    this.graphqlApi = this.productApi.api;
    this.apiUrl = this.productApi.api.graphqlUrl;

    // Validate AgentCore configuration
    if (!agentCore?.agents) {
      throw new Error(
        'AgentCore configuration is required. Please ensure config file contains agentCore.agents section with agent IDs.'
      );
    }

    // Create multi-agent orchestration system
    this.multiAgentOrchestrator = new MultiAgentOrchestratorConstruct(this, 'MultiAgentOrchestrator', {
      orchestrationTable: this.orchestrationTable,
      productTable: this.productTable,
      graphqlApi: this.productApi.api,
      environment,
      agentCoreIds: {
        demandForecast: agentCore.agents.demandForecast,
        competitiveAnalysis: agentCore.agents.competitiveAnalysis,
        marginAnalysis: agentCore.agents.marginAnalysis
      }
    });

    // Add STATE_MACHINE_ARN environment variable to the product resolver function
    this.productApi.productResolverFunction.addEnvironment(
      'STATE_MACHINE_ARN',
      this.multiAgentOrchestrator.stateMachineArn
    );

    // Grant Step Functions permissions to the product resolver function
    this.productApi.productResolverFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'states:StartExecution',
        'states:DescribeExecution',
        'states:StopExecution'
      ],
      resources: [
        this.multiAgentOrchestrator.stateMachineArn
      ]
    }));

    // Create real-time communication monitoring dashboard if monitoring is enabled
    if (monitoring?.enabled !== false) {
      this.realtimeCommMonitoring = new RealtimeCommunicationMonitoringConstruct(
        this,
        'RealtimeCommMonitoring',
        {
          graphqlApi: this.productApi.api,
          sessionChatTable: this.sessionChatTable,
          orchestrationTable: this.orchestrationTable,
          environment,
          alertEmail: monitoring?.alertEmail
        }
      );
    }

    // Output important values for frontend configuration
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${id}-UserPoolId`
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${id}-UserPoolClientId`
    });

    new CfnOutput(this, 'GraphQLApiUrl', {
      value: this.productApi.api.graphqlUrl,
      description: 'GraphQL API URL',
      exportName: `${id}-GraphQLApiUrl`
    });

    new CfnOutput(this, 'GraphQLApiId', {
      value: this.productApi.api.apiId,
      description: 'GraphQL API ID',
      exportName: `${id}-GraphQLApiId`
    });

    new CfnOutput(this, 'GraphQLApiKey', {
      value: this.productApi.api.apiKey || 'Not configured',
      description: 'GraphQL API Key',
      exportName: `${id}-GraphQLApiKey`
    });

    // WebSocket endpoint for real-time subscriptions
    const wssEndpoint = this.productApi.api.graphqlUrl
      .replace('https://', 'wss://')
      .replace('.appsync-api.', '.appsync-realtime-api.');
    
    new CfnOutput(this, 'GraphQLWssEndpoint', {
      value: wssEndpoint,
      description: 'GraphQL WebSocket endpoint for real-time subscriptions',
      exportName: `${id}-GraphQLWssEndpoint`
    });

    new CfnOutput(this, 'ProductTableName', {
      value: this.productTable.tableName,
      description: 'Product DynamoDB Table Name',
      exportName: `${id}-ProductTableName`
    });

    new CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      description: 'Assets S3 Bucket Name',
      exportName: `${id}-AssetsBucketName`
    });

    new CfnOutput(this, 'AssetsDistributionDomainName', {
      value: this.assetsDistribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name for Assets',
      exportName: `${id}-AssetsDistributionDomainName`
    });

    new CfnOutput(this, 'AssetsDistributionId', {
      value: this.assetsDistribution.distributionId,
      description: 'CloudFront Distribution ID for Assets',
      exportName: `${id}-AssetsDistributionId`
    });    new CfnOutput(this, 'PricingEventBusName', {
      value: this.pricingEventBus.eventBusName,
      description: 'EventBridge Custom Bus Name for Pricing Events',
      exportName: `${id}-PricingEventBusName`
    });

    new CfnOutput(this, 'PricingEventBusArn', {
      value: this.pricingEventBus.eventBusArn,
      description: 'EventBridge Custom Bus ARN for Pricing Events',
      exportName: `${id}-PricingEventBusArn`
    });

    // Output orchestration configuration
    new CfnOutput(this, 'OrchestrationTableName', {
      value: this.orchestrationTable.tableName,
      description: 'DynamoDB Table Name for Multi-Agent Orchestration',
      exportName: `${id}-OrchestrationTableName`
    });

    new CfnOutput(this, 'OrchestrationTableArn', {
      value: this.orchestrationTable.tableArn,
      description: 'DynamoDB Table ARN for Multi-Agent Orchestration',
      exportName: `${id}-OrchestrationTableArn`
    });

    // Output SessionChat table configuration (Requirement 6.1, 6.2)
    new CfnOutput(this, 'SessionChatTableName', {
      value: this.sessionChatTable.tableName,
      description: 'DynamoDB Table Name for Agent Chat Messages',
      exportName: `${id}-SessionChatTableName`
    });

    new CfnOutput(this, 'SessionChatTableArn', {
      value: this.sessionChatTable.tableArn,
      description: 'DynamoDB Table ARN for Agent Chat Messages',
      exportName: `${id}-SessionChatTableArn`
    });

    new CfnOutput(this, 'ResolverFunctionArn', {
      value: this.multiAgentOrchestrator.resolverFunction.functionArn,
      description: 'ARN of the Lambda resolver function for pricing analysis',
      exportName: `${id}-ResolverFunctionArn`
    });

    new CfnOutput(this, 'ResolverFunctionName', {
      value: this.multiAgentOrchestrator.resolverFunction.functionName,
      description: 'Name of the Lambda resolver function for pricing analysis',
      exportName: `${id}-ResolverFunctionName`
    });

    new CfnOutput(this, 'StateMachineArn', {
      value: this.multiAgentOrchestrator.stateMachineArn,
      description: 'ARN of the Step Functions state machine for orchestration',
      exportName: `${id}-StateMachineArn`
    });

    new CfnOutput(this, 'StateMachineName', {
      value: this.multiAgentOrchestrator.stepFunctionsOrchestrator.stateMachine.stateMachineName,
      description: 'Name of the Step Functions state machine for orchestration',
      exportName: `${id}-StateMachineName`
    });

    new CfnOutput(this, 'StreamHandlerFunctionArn', {
      value: this.multiAgentOrchestrator.streamHandlerFunction.functionArn,
      description: 'ARN of the DynamoDB Stream handler function',
      exportName: `${id}-StreamHandlerFunctionArn`
    });

    new CfnOutput(this, 'StreamHandlerFunctionName', {
      value: this.multiAgentOrchestrator.streamHandlerFunction.functionName,
      description: 'Name of the DynamoDB Stream handler function',
      exportName: `${id}-StreamHandlerFunctionName`
    });

    // Output monitoring dashboard information if enabled
    if (this.realtimeCommMonitoring) {
      new CfnOutput(this, 'RealtimeCommDashboardName', {
        value: this.realtimeCommMonitoring.dashboard.dashboardName,
        description: 'CloudWatch Dashboard Name for Real-time Communication Monitoring',
        exportName: `${id}-RealtimeCommDashboardName`
      });

      if (this.realtimeCommMonitoring.alarmTopic) {
        new CfnOutput(this, 'RealtimeCommAlarmTopicArn', {
          value: this.realtimeCommMonitoring.alarmTopic.topicArn,
          description: 'SNS Topic ARN for Real-time Communication Alarms',
          exportName: `${id}-RealtimeCommAlarmTopicArn`
        });
      }

      new CfnOutput(this, 'MutationErrorAlarmName', {
        value: this.realtimeCommMonitoring.mutationErrorAlarm.alarmName,
        description: 'CloudWatch Alarm Name for Mutation Errors',
        exportName: `${id}-MutationErrorAlarmName`
      });

      new CfnOutput(this, 'SubscriptionErrorAlarmName', {
        value: this.realtimeCommMonitoring.subscriptionErrorAlarm.alarmName,
        description: 'CloudWatch Alarm Name for Subscription Errors',
        exportName: `${id}-SubscriptionErrorAlarmName`
      });

      new CfnOutput(this, 'DynamoDBThrottleAlarmName', {
        value: this.realtimeCommMonitoring.dynamodbThrottleAlarm.alarmName,
        description: 'CloudWatch Alarm Name for DynamoDB Throttles',
        exportName: `${id}-DynamoDBThrottleAlarmName`
      });
    }

    // Output SageMaker Canvas configuration (always present as it's mandatory infrastructure)
    new CfnOutput(this, 'SageMakerCanvasEnabled', {
      value: 'true',
      description: 'SageMaker Canvas Integration Enabled',
      exportName: `${id}-SageMakerCanvasEnabled`
    });

    new CfnOutput(this, 'SageMakerCanvasDomainId', {
      value: this.sageMakerCanvas.getDomainId(),
      description: 'SageMaker Canvas Domain ID',
      exportName: `${id}-SageMakerCanvasDomainId`
    });

    new CfnOutput(this, 'CanvasTrainingDataBucket', {
      value: this.sageMakerCanvas.trainingDataBucket.bucketName,
      description: 'SageMaker Canvas Training Data Bucket',
      exportName: `${id}-CanvasTrainingDataBucket`
    });

    new CfnOutput(this, 'CanvasModelOutputBucket', {
      value: this.sageMakerCanvas.modelOutputBucket.bucketName,
      description: 'SageMaker Canvas Model Output Bucket',
      exportName: `${id}-CanvasModelOutputBucket`
    });

    new CfnOutput(this, 'CanvasModelManagerFunction', {
      value: this.sageMakerCanvas.modelManagerFunction.functionName,
      description: 'SageMaker Canvas Model Manager Function',
      exportName: `${id}-CanvasModelManagerFunction`
    });

    new CfnOutput(this, 'AutopilotExecutionRoleArn', {
      value: this.sageMakerCanvas.getAutopilotExecutionRoleArn(),
      description: 'SageMaker Autopilot Execution Role ARN',
      exportName: `${id}-AutopilotExecutionRoleArn`
    });

    // Output VPC information if VPC is created
    if (this.sageMakerCanvas.vpc) {
      new CfnOutput(this, 'CanvasVpcId', {
        value: this.sageMakerCanvas.vpc.vpcId,
        description: 'SageMaker Canvas VPC ID',
        exportName: `${id}-CanvasVpcId`
      });

      new CfnOutput(this, 'CanvasPrivateSubnetIds', {
        value: this.sageMakerCanvas.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
        description: 'SageMaker Canvas Private Subnet IDs',
        exportName: `${id}-CanvasPrivateSubnetIds`
      });
    }

    if (this.sageMakerCanvas.securityGroup) {
      new CfnOutput(this, 'CanvasSecurityGroupId', {
        value: this.sageMakerCanvas.securityGroup.securityGroupId,
        description: 'SageMaker Canvas Security Group ID',
        exportName: `${id}-CanvasSecurityGroupId`
      });
    }
  }
}