import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Role, ServicePrincipal, PolicyStatement, Effect, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketEncryption, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { CfnDomain, CfnUserProfile } from 'aws-cdk-lib/aws-sagemaker';
import { Function, Runtime, Code, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { CfnOutput } from 'aws-cdk-lib';
import { StorageClass } from 'aws-cdk-lib/aws-s3';
import { Vpc, SubnetType, SecurityGroup, Port } from 'aws-cdk-lib/aws-ec2';

/**
 * Configuration interface for SageMaker Canvas construct.
 * 
 * **IMPORTANT: SageMaker Canvas is Mandatory Infrastructure**
 * 
 * SageMaker Canvas infrastructure is always deployed as it is a core component
 * of the pricing system's demand forecasting capabilities. The infrastructure
 * includes:
 * - SageMaker Canvas domain and user profiles
 * - Two S3 buckets (training data and model outputs) following AWS best practices
 * - IAM roles for Canvas and Autopilot execution
 * - Lambda functions for model management
 * - VPC configuration (optional but recommended)
 * 
 * The two-bucket structure (training data and model outputs) is maintained for:
 * - AWS best practices for ML workflows
 * - Better lifecycle management (different retention policies)
 * - Superior security granularity (separate access controls)
 * - Compliance and audit trail separation
 * 
 * @remarks
 * The `enabled` field has been removed as SageMaker Canvas is now mandatory.
 * Deployment script flags (`--skip-sagemaker`, `--sagemaker-only`) control
 * data loading operations only, not infrastructure deployment.
 */
export interface SageMakerCanvasConfig {
  /** Environment name (dev, prod) */
  environment?: string;
  /** DynamoDB table for storing model metadata */
  productTable?: Table;
  /** Enable VPC configuration for Canvas domain */
  enableVpc?: boolean;
  /** Custom domain name prefix */
  domainNamePrefix?: string;
  /** Existing VPC to use (optional - if not provided, a new VPC will be created) */
  existingVpc?: Vpc;
  /** VPC CIDR block for new VPC creation */
  vpcCidr?: string;
}

/**
 * Interface for SageMaker Canvas model metadata.
 */
export interface CanvasModelMetadata {
  /** Model name identifier */
  modelName: string;
  /** Product category this model serves */
  category: string;
  /** Model training status */
  status: 'TRAINING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  /** Model accuracy score (0-1) */
  accuracy?: number;
  /** Model creation timestamp */
  createdAt: string;
  /** Model last updated timestamp */
  updatedAt: string;
  /** S3 URI for training data */
  trainingDataUri: string;
  /** Model performance metrics */
  performanceMetrics?: {
    mape?: number; // Mean Absolute Percentage Error
    rmse?: number; // Root Mean Square Error
    mae?: number;  // Mean Absolute Error
  };
}

/**
 * Interface for Canvas forecast request.
 */
export interface CanvasForecastRequest {
  /** Product identifier */
  productId: string;
  /** Product category for model selection */
  category: string;
  /** Forecast horizon in months */
  forecastHorizon: number;
  /** Confidence levels to calculate (P10, P50, P90) */
  confidenceLevels: number[];
}

/**
 * Interface for Canvas forecast response.
 */
export interface CanvasForecastResponse {
  /** Request status */
  status: 'SUCCESS' | 'ERROR' | 'MODEL_NOT_READY';
  /** Model used for forecasting */
  modelName?: string;
  /** Model accuracy score */
  modelAccuracy?: number;
  /** Forecast values by month */
  forecastValues?: Array<{
    month: string;
    p10: number;
    p50: number;
    p90: number;
  }>;
  /** Historical performance data */
  historicalPerformance?: {
    ytdSales: number;
    yearTarget: number;
    trend: 'growing' | 'stable' | 'declining';
    seasonalityDetected: boolean;
    volatilityIndex: number;
  };
  /** Error message if status is ERROR */
  errorMessage?: string;
}

/**
 * SageMaker Canvas construct for demand forecasting infrastructure.
 * 
 * **Mandatory Infrastructure Component**
 * 
 * This construct creates all required SageMaker Canvas infrastructure for the
 * pricing system's demand forecasting capabilities. It is always deployed as
 * part of the CDK stack, regardless of configuration settings.
 * 
 * **Two-Bucket Architecture**
 * 
 * The construct implements a two-bucket structure following AWS best practices:
 * 
 * 1. **Training Data Bucket** (`trainingDataBucket`):
 *    - Stores raw and processed training data for ML models
 *    - Organized by product category with subfolders for data quality
 *    - Long-term retention for model retraining
 *    - Read-heavy access pattern
 * 
 * 2. **Model Output Bucket** (`modelOutputBucket`):
 *    - Stores trained model artifacts and predictions
 *    - Organized by category with model artifacts and forecasts
 *    - Shorter retention with automatic archival to Glacier
 *    - Write-heavy access pattern
 * 
 * **Rationale for Two Buckets:**
 * - AWS best practices for ML workflows (separation of input/output)
 * - Different lifecycle policies (training data retained longer)
 * - Better security granularity (separate IAM policies)
 * - Compliance and audit trail separation
 * - Cost optimization through targeted lifecycle rules
 * 
 * **VPC Configuration:**
 * 
 * VPC configuration is optional but recommended for production environments.
 * When enabled, the construct creates or uses an existing VPC with:
 * - Private subnets for SageMaker Canvas domain
 * - Security groups for controlled access
 * - NAT gateways for internet access
 * 
 * @example
 * ```typescript
 * const sageMakerCanvas = new SageMakerCanvasConstruct(this, 'SageMakerCanvas', {
 *   environment: 'prod',
 *   productTable: productTable,
 *   enableVpc: true,
 *   domainNamePrefix: 'pricing-canvas',
 *   vpcCidr: '10.0.0.0/16'
 * });
 * ```
 * 
 * @remarks
 * This construct is always instantiated. Deployment script flags only control
 * data loading operations, not infrastructure creation.
 */
export class SageMakerCanvasConstruct extends Construct {
  /** SageMaker Canvas domain */
  public readonly domain: CfnDomain;
  
  /** Canvas user profile for pricing analysis */
  public readonly userProfile: CfnUserProfile;
  
  /** S3 bucket for training data and model artifacts */
  public readonly trainingDataBucket: Bucket;
  
  /** S3 bucket for model outputs and forecasts */
  public readonly modelOutputBucket: Bucket;
  
  /** IAM role for SageMaker Canvas execution */
  public readonly canvasExecutionRole: Role;
  
  /** IAM role for SageMaker Autopilot execution */
  public readonly autopilotExecutionRole: Role;
  
  /** Lambda function for model management */
  public readonly modelManagerFunction: Function;
  
  /** VPC for SageMaker Canvas domain (created or provided) */
  public readonly vpc?: Vpc;
  
  /** Security group for SageMaker Canvas domain */
  public readonly securityGroup?: SecurityGroup;

  /**
   * Creates a new SageMaker Canvas construct with all required infrastructure.
   * 
   * **Mandatory Deployment:**
   * This constructor always creates all SageMaker Canvas infrastructure components.
   * There is no conditional logic based on an "enabled" flag - all resources are
   * created unconditionally.
   * 
   * **Default Values:**
   * The constructor provides sensible defaults for all optional configuration:
   * - `domainNamePrefix`: 'pricing-canvas'
   * - `enableVpc`: true (VPC enabled by default)
   * - `vpcCidr`: '10.0.0.0/16' (if creating new VPC)
   * 
   * **Two-Bucket Structure:**
   * Both buckets are always created with the following naming pattern:
   * - Training Data: `{domainNamePrefix}-training-data-{environment}-{account}`
   * - Model Outputs: `{domainNamePrefix}-model-outputs-{environment}-{account}`
   * 
   * @param scope - CDK construct scope
   * @param id - Construct identifier
   * @param config - Configuration object with environment and productTable required
   * 
   * @remarks
   * The `environment` and `productTable` parameters are required and must be
   * provided in the config object. All other parameters have sensible defaults.
   */
  constructor(scope: Construct, id: string, config: SageMakerCanvasConfig & { environment: string; productTable: Table }) {
    super(scope, id);

    const { 
      environment, 
      productTable, 
      domainNamePrefix = 'pricing-canvas',
      enableVpc = true,
      existingVpc,
      vpcCidr = '10.0.0.0/16'
    } = config;

    // Get AWS account ID from stack for bucket naming
    const account = cdk.Stack.of(this).account;

    // Create or use existing VPC for SageMaker Canvas domain
    if (enableVpc) {
      if (existingVpc) {
        this.vpc = existingVpc;
      } else {
        // Create a new VPC for SageMaker Canvas
        this.vpc = new Vpc(this, 'CanvasVpc', {
          vpcName: `${domainNamePrefix}-vpc-${environment}`,
          cidr: vpcCidr,
          maxAzs: 2, // Use 2 AZs for high availability
          subnetConfiguration: [
            {
              cidrMask: 24,
              name: 'Private',
              subnetType: SubnetType.PRIVATE_WITH_EGRESS
            },
            {
              cidrMask: 24,
              name: 'Public',
              subnetType: SubnetType.PUBLIC
            }
          ],
          enableDnsHostnames: true,
          enableDnsSupport: true
        });
      }

      // Create security group for SageMaker Canvas
      this.securityGroup = new SecurityGroup(this, 'CanvasSecurityGroup', {
        vpc: this.vpc,
        securityGroupName: `${domainNamePrefix}-sg-${environment}`,
        description: 'Security group for SageMaker Canvas domain',
        allowAllOutbound: true
      });

      // Add inbound rules for SageMaker Canvas
      this.securityGroup.addIngressRule(
        this.securityGroup,
        Port.allTraffic(),
        'Allow all traffic within security group'
      );

      // Add HTTPS access for SageMaker Canvas Studio
      this.securityGroup.addIngressRule(
        this.securityGroup,
        Port.tcp(443),
        'HTTPS access for SageMaker Canvas Studio'
      );
    }

    // Create S3 bucket for training data
    // 
    // TWO-BUCKET ARCHITECTURE RATIONALE:
    // We use separate buckets for training data and model outputs following AWS best practices:
    // 
    // 1. LIFECYCLE MANAGEMENT: Training data needs long-term retention for retraining,
    //    while model outputs can be archived more aggressively (30 days to Glacier)
    // 
    // 2. SECURITY: Separate buckets allow different IAM policies:
    //    - Training data: Read-heavy, accessed by data scientists and training jobs
    //    - Model outputs: Write-heavy, accessed by inference endpoints and applications
    // 
    // 3. COMPLIANCE: Separate audit trails for data governance and regulatory requirements
    // 
    // 4. COST OPTIMIZATION: Different lifecycle rules optimize storage costs based on
    //    access patterns (training data retained, outputs archived)
    // 
    // 5. AWS BEST PRACTICES: Recommended pattern for ML workflows to separate input/output
    // 
    // Note: Bucket names include account suffix for uniqueness (same pattern as other buckets)
    this.trainingDataBucket = new Bucket(this, 'TrainingDataBucket', {
      bucketName: `${domainNamePrefix}-training-data-${environment}-${account}`,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90)
        }
      ]
    });

    // Create S3 bucket for model outputs
    // 
    // MODEL OUTPUT BUCKET:
    // This bucket stores trained model artifacts, predictions, and forecasts.
    // It has different lifecycle rules than the training data bucket:
    // - Automatic archival to Glacier after 30 days (vs 90 days for training data)
    // - Write-heavy access pattern (vs read-heavy for training data)
    // - Shorter retention requirements (models can be retrained if needed)
    // 
    // Note: Bucket names include account suffix for uniqueness (same pattern as other buckets)
    this.modelOutputBucket = new Bucket(this, 'ModelOutputBucket', {
      bucketName: `${domainNamePrefix}-model-outputs-${environment}-${account}`,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ArchiveOldOutputs',
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: Duration.days(30)
            }
          ]
        }
      ]
    });

    // Create IAM role for SageMaker Canvas
    this.canvasExecutionRole = new Role(this, 'CanvasExecutionRole', {
      roleName: `SageMakerCanvas-ExecutionRole-${environment}`,
      assumedBy: new ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerCanvasFullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess')
      ]
    });

    // Add custom permissions for S3 buckets
    this.canvasExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        this.trainingDataBucket.bucketArn,
        `${this.trainingDataBucket.bucketArn}/*`,
        this.modelOutputBucket.bucketArn,
        `${this.modelOutputBucket.bucketArn}/*`
      ]
    }));

    // Add DynamoDB permissions for model metadata
    this.canvasExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        productTable.tableArn,
        `${productTable.tableArn}/index/*`
      ]
    }));

    // Create IAM role for SageMaker Autopilot (programmatic training)
    this.autopilotExecutionRole = new Role(this, 'AutopilotExecutionRole', {
      roleName: `AmazonSageMaker-ExecutionRole-${environment}`,
      description: 'Execution role for SageMaker Autopilot jobs for demand forecasting',
      assumedBy: new ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess')
      ]
    });

    // Add S3 permissions for Autopilot training data and model outputs
    this.autopilotExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:GetBucketCors',
        's3:PutBucketCors'
      ],
      resources: [
        this.trainingDataBucket.bucketArn,
        `${this.trainingDataBucket.bucketArn}/*`,
        this.modelOutputBucket.bucketArn,
        `${this.modelOutputBucket.bucketArn}/*`
      ]
    }));

    // Add DynamoDB permissions for model metadata storage
    this.autopilotExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        productTable.tableArn,
        `${productTable.tableArn}/index/*`
      ]
    }));

    // Add CloudWatch Logs permissions for Autopilot job logging
    this.autopilotExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams'
      ],
      resources: ['arn:aws:logs:*:*:log-group:/aws/sagemaker/*']
    }));

    // Add ECR permissions for Autopilot container images
    this.autopilotExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: ['*']
    }));

    // Add CloudWatch Metrics permissions for Autopilot monitoring
    this.autopilotExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'AWS/SageMaker'
        }
      }
    }));

    // Create SageMaker Canvas domain with VPC configuration
    const domainConfig: any = {
      domainName: `${domainNamePrefix}-domain-${environment}`,
      authMode: 'IAM',
      defaultUserSettings: {
        executionRole: this.canvasExecutionRole.roleArn
      }
    };

    // Add VPC configuration if VPC is enabled
    if (this.vpc && this.securityGroup) {
      domainConfig.vpcId = this.vpc.vpcId;
      domainConfig.subnetIds = this.vpc.privateSubnets.map(subnet => subnet.subnetId);
      domainConfig.defaultUserSettings.securityGroups = [this.securityGroup.securityGroupId];
    }

    this.domain = new CfnDomain(this, 'CanvasDomain', domainConfig);

    // Create user profile for pricing analysis
    this.userProfile = new CfnUserProfile(this, 'PricingAnalystProfile', {
      domainId: this.domain.attrDomainId,
      userProfileName: `pricing-analyst-${environment}`,
      userSettings: {
        executionRole: this.canvasExecutionRole.roleArn
      }
    });

    // Create Lambda function for model management
    this.modelManagerFunction = new NodejsFunction(this, 'ModelManagerFunction', {
      functionName: `sagemaker-canvas-model-manager-${environment}`,
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/sagemaker-canvas-manager/index.js',
      timeout: Duration.minutes(5),
      
      // Bundle configuration
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/metrics',
          '@aws-lambda-powertools/tracer',
          '@aws-sdk/client-bedrock-agent-runtime',
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
        CANVAS_DOMAIN_ID: this.domain.attrDomainId,
        CANVAS_USER_PROFILE: this.userProfile.userProfileName,
        TRAINING_DATA_BUCKET: this.trainingDataBucket.bucketName,
        MODEL_OUTPUT_BUCKET: this.modelOutputBucket.bucketName,
        PRODUCT_TABLE_NAME: productTable.tableName,
        ENVIRONMENT: environment,
        CANVAS_EXECUTION_ROLE: this.canvasExecutionRole.roleArn,
        AUTOPILOT_EXECUTION_ROLE: this.autopilotExecutionRole.roleArn
      }
    });

    // Grant permissions to model manager function
    this.trainingDataBucket.grantReadWrite(this.modelManagerFunction);
    this.modelOutputBucket.grantReadWrite(this.modelManagerFunction);
    productTable.grantReadWriteData(this.modelManagerFunction);

    // Add SageMaker permissions to model manager
    this.modelManagerFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sagemaker:CreateModel',
        'sagemaker:DescribeModel',
        'sagemaker:DeleteModel',
        'sagemaker:ListModels',
        'sagemaker:CreateTrainingJob',
        'sagemaker:DescribeTrainingJob',
        'sagemaker:StopTrainingJob',
        'sagemaker:CreateTransformJob',
        'sagemaker:DescribeTransformJob',
        'sagemaker:CreateAutoMLJob',
        'sagemaker:DescribeAutoMLJob',
        'sagemaker:StopAutoMLJob',
        'sagemaker:ListCandidatesForAutoMLJob',
        'sagemaker-canvas:*'
      ],
      resources: ['*']
    }));

    // Allow model manager to pass the Autopilot execution role
    this.modelManagerFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [this.autopilotExecutionRole.roleArn],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'sagemaker.amazonaws.com'
        }
      }
    }));
  }

  /**
   * Gets the Canvas domain ARN.
   * 
   * @returns The Amazon Resource Name (ARN) of the SageMaker Canvas domain
   */
  public getDomainArn(): string {
    return this.domain.attrDomainArn;
  }

  /**
   * Gets the Canvas domain ID.
   * 
   * @returns The unique identifier of the SageMaker Canvas domain
   */
  public getDomainId(): string {
    return this.domain.attrDomainId;
  }

  /**
   * Gets the user profile ARN.
   * 
   * @returns The Amazon Resource Name (ARN) of the Canvas user profile
   */
  public getUserProfileArn(): string {
    return this.userProfile.attrUserProfileArn;
  }

  /**
   * Gets the Autopilot execution role ARN.
   * 
   * @returns The Amazon Resource Name (ARN) of the Autopilot execution role
   */
  public getAutopilotExecutionRoleArn(): string {
    return this.autopilotExecutionRole.roleArn;
  }

  /**
   * Gets environment variables for Lambda functions that need Canvas integration.
   * 
   * This method returns a complete set of environment variables that Lambda
   * functions can use to interact with SageMaker Canvas infrastructure,
   * including domain IDs, execution roles, and bucket names.
   * 
   * @returns Record of environment variable names and values for Canvas integration
   * 
   * @example
   * ```typescript
   * const canvasEnvVars = sageMakerCanvas.getEnvironmentVariables();
   * 
   * const myFunction = new Function(this, 'MyFunction', {
   *   // ... other config
   *   environment: {
   *     ...canvasEnvVars,
   *     // ... other environment variables
   *   }
   * });
   * ```
   */
  public getEnvironmentVariables(): Record<string, string> {
    return {
      SAGEMAKER_CANVAS_DOMAIN_ID: this.domain.attrDomainId,
      SAGEMAKER_CANVAS_USER_PROFILE: this.userProfile.userProfileName,
      SAGEMAKER_CANVAS_EXECUTION_ROLE: this.canvasExecutionRole.roleArn,
      SAGEMAKER_AUTOPILOT_EXECUTION_ROLE: this.autopilotExecutionRole.roleArn,
      CANVAS_TRAINING_DATA_BUCKET: this.trainingDataBucket.bucketName,
      CANVAS_MODEL_OUTPUT_BUCKET: this.modelOutputBucket.bucketName
    };
  }
}