/**
 * @fileoverview Amplify Frontend Hosting Construct.
 * 
 * Creates and configures AWS Amplify hosting for the React frontend application.
 * Supports multiple environments (local, dev, prod) with automatic environment
 * variable injection from CDK stack outputs.
 */

import { Construct } from 'constructs';
import { CfnApp, CfnBranch } from 'aws-cdk-lib/aws-amplify';
import { CfnOutput, SecretValue, RemovalPolicy } from 'aws-cdk-lib';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';
import { Bucket, BucketEncryption, BlockPublicAccess, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { ServicePrincipal, PolicyStatement, Effect, AnyPrincipal } from 'aws-cdk-lib/aws-iam';

/**
 * Properties for the Amplify Frontend Construct.
 */
export interface AmplifyFrontendConstructProps {
  /** Environment name (local, dev, prod) */
  environment: string;
  
  /** AWS Account ID */
  accountId: string;
  
  /** Cognito User Pool for authentication */
  userPool: IUserPool;
  
  /** Cognito User Pool Client */
  userPoolClient: IUserPoolClient;
  
  /** AppSync GraphQL API */
  graphqlApi: GraphqlApi;
  
  /** AWS Region */
  region: string;
  
  /** Optional OAuth token for Git repository access (not used for manual deployment) */
  oauthToken?: SecretValue;
}

/**
 * CDK Construct for AWS Amplify frontend hosting.
 * 
 * Creates an Amplify app with environment-specific configuration and
 * automatically injects backend configuration as environment variables.
 * Supports manual deployment via `amplify publish` command.
 */
export class AmplifyFrontendConstruct extends Construct {
  /** The Amplify App */
  public readonly amplifyApp: CfnApp;
  
  /** The Amplify Branch for this environment */
  public readonly amplifyBranch: CfnBranch;
  
  /** The default domain for this Amplify app */
  public readonly defaultDomain: string;
  
  /** The S3 deployment bucket for Amplify CLI */
  public readonly deploymentBucket: Bucket;

  constructor(scope: Construct, id: string, props: AmplifyFrontendConstructProps) {
    super(scope, id);

    const { environment, accountId, userPool, userPoolClient, graphqlApi, region } = props;

    // Create S3 deployment bucket for Amplify manual deployment
    // This bucket is used to stage deployment artifacts for Amplify hosting
    // CRITICAL: ACLs must be enabled for Amplify manual deployments (AWS requirement)
    this.deploymentBucket = new Bucket(this, 'DeploymentBucket', {
      bucketName: `retail-pricing-amplify-deployment-${environment}-${accountId}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      objectOwnership: ObjectOwnership.OBJECT_WRITER, // ✅ ACLs enabled (required by AWS)
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod'
    });

    // Create Amplify App
    this.amplifyApp = new CfnApp(this, 'AmplifyApp', {
      name: 'RetailPricingUI',
      description: `Retail Pricing Agent Orchestrator UI - ${environment} environment`,
      
      // Platform configuration for manual deployment
      platform: 'WEB',
      
      // Build settings
      buildSpec: this.generateBuildSpec(),
      
      // Environment variables injected from CDK outputs
      environmentVariables: [
        {
          name: 'VITE_GRAPHQL_ENDPOINT',
          value: graphqlApi.graphqlUrl
        },
        {
          name: 'VITE_GRAPHQL_WS_ENDPOINT',
          value: this.getWebSocketEndpoint(graphqlApi.graphqlUrl)
        },
        {
          name: 'VITE_APPSYNC_API_KEY',
          value: graphqlApi.apiKey || ''
        },
        {
          name: 'VITE_AWS_REGION',
          value: region
        },
        {
          name: 'VITE_AWS_USER_POOL_ID',
          value: userPool.userPoolId
        },
        {
          name: 'VITE_AWS_USER_POOL_CLIENT_ID',
          value: userPoolClient.userPoolClientId
        },
        {
          name: 'VITE_NODE_ENV',
          value: environment === 'prod' ? 'production' : 'development'
        },
        {
          name: 'VITE_LOG_LEVEL',
          value: environment === 'prod' ? 'info' : 'debug'
        },
        {
          name: 'VITE_MIDWAY_OIDC_ENABLED',
          value: 'false'
        }
      ],
      
      // IAM service role for Amplify
      iamServiceRole: undefined, // Amplify will create default role
      
      // Custom rules for SPA routing
      // IMPORTANT: Order matters! More specific rules must come first.
      // The catch-all rule for SPA must be LAST and should NOT match static assets.
      customRules: [
        // Rule 1: Serve static assets directly (CSS, JS, images, fonts, etc.)
        // This rule MUST come before the SPA catch-all
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200'
        }
      ]
    });

    // Create branch for this environment
    this.amplifyBranch = new CfnBranch(this, 'AmplifyBranch', {
      appId: this.amplifyApp.attrAppId,
      branchName: environment,
      description: `${environment} environment branch`,
      enableAutoBuild: false, // Manual deployment via amplify publish
      enablePullRequestPreview: false,
      stage: environment === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT',
      
      // Environment variables can be overridden at branch level if needed
      environmentVariables: []
    });

    // Add explicit bucket policy for Amplify service access
    // CRITICAL: Required when deploying from S3 using SDK/CLI (AWS requirement)
    // Reference: https://docs.aws.amazon.com/amplify/latest/userguide/deploy-with-sdks.html
    //
    // The policy must include:
    // 1. Service principal: amplify.amazonaws.com
    // 2. Condition with aws:SourceAccount for security
    // 3. Condition with aws:SourceArn to restrict access to specific app/branch
    //
    // Note: The aws:SourceArn uses the Amplify app ID and branch name, which are
    // available after the app and branch are created above.
    const amplifySourceArn = `arn:aws:amplify:${region}:${accountId}:apps/${this.amplifyApp.attrAppId}/branches/${environment}`;
    
    // Policy statement 1: Allow Amplify to list bucket contents at the prefix
    this.deploymentBucket.addToResourcePolicy(new PolicyStatement({
      sid: 'AllowAmplifyToListPrefix',
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('amplify.amazonaws.com')],
      actions: ['s3:ListBucket'],
      resources: [this.deploymentBucket.bucketArn],
      conditions: {
        StringEquals: {
          'aws:SourceAccount': accountId,
          'aws:SourceArn': amplifySourceArn,
          's3:prefix': ['builds/latest/']
        }
      }
    }));

    // Policy statement 2: Allow Amplify to read objects from the prefix
    this.deploymentBucket.addToResourcePolicy(new PolicyStatement({
      sid: 'AllowAmplifyToReadPrefix',
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('amplify.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.deploymentBucket.bucketArn}/builds/latest/*`],
      conditions: {
        StringEquals: {
          'aws:SourceAccount': accountId,
          'aws:SourceArn': amplifySourceArn
        }
      }
    }));

    // Policy statement 3: Deny insecure transport (enforce HTTPS)
    this.deploymentBucket.addToResourcePolicy(new PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: Effect.DENY,
      principals: [new AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.deploymentBucket.bucketArn,
        `${this.deploymentBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // Keep the legacy grantRead for backward compatibility
    // Note: This is now redundant with the explicit policies above, but kept
    // to ensure no breaking changes if other code depends on it
    this.deploymentBucket.grantRead(new ServicePrincipal('amplify.amazonaws.com'));

    // Construct the default domain (will be available after deployment)
    // Note: The actual domain is only available after Amplify app is fully provisioned
    this.defaultDomain = `https://${environment}.${this.amplifyApp.attrDefaultDomain}`;

    // Output Amplify configuration
    new CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyApp.attrAppId,
      description: 'Amplify App ID',
      exportName: `RetailPricing-${environment}-AmplifyAppId`
    });

    // Note: DefaultDomain output is commented out because it causes deployment failures
    // The domain is not immediately available when the Amplify app is first created
    // You can retrieve it after deployment using: aws amplify get-app --app-id <APP_ID>
    // new CfnOutput(this, 'AmplifyDefaultDomain', {
    //   value: this.amplifyApp.attrDefaultDomain,
    //   description: 'Amplify Default Domain',
    //   exportName: `RetailPricing-${environment}-AmplifyDefaultDomain`
    // });

    new CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${environment}.${this.amplifyApp.attrAppId}.amplifyapp.com`,
      description: 'Amplify App URL (constructed from App ID)',
      exportName: `RetailPricing-${environment}-AmplifyAppUrl`
    });

    new CfnOutput(this, 'AmplifyEnvironment', {
      value: environment,
      description: 'Amplify Environment Name',
      exportName: `RetailPricing-${environment}-AmplifyEnvironment`
    });

    new CfnOutput(this, 'AmplifyDeploymentBucket', {
      value: this.deploymentBucket.bucketName,
      description: 'S3 Deployment Bucket for Amplify',
      exportName: `RetailPricing-${environment}-AmplifyDeploymentBucket`
    });

    new CfnOutput(this, 'AmplifyBranchName', {
      value: this.amplifyBranch.branchName,
      description: 'Amplify branch name for deployment',
      exportName: `RetailPricing-${environment}-AmplifyBranchName`
    });
  }

  /**
   * Generates the build specification for Amplify.
   * 
   * @returns Build spec YAML as string
   */
  private generateBuildSpec(): string {
    return `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
`;
  }

  /**
   * Converts GraphQL HTTP endpoint to WebSocket endpoint.
   * 
   * @param graphqlUrl - HTTP GraphQL endpoint
   * @returns WebSocket endpoint URL
   */
  private getWebSocketEndpoint(graphqlUrl: string): string {
    return graphqlUrl
      .replace('https://', 'wss://')
      .replace('.appsync-api.', '.appsync-realtime-api.');
  }

  /**
   * Gets the Amplify app ID.
   * 
   * @returns Amplify app ID
   */
  public getAppId(): string {
    return this.amplifyApp.attrAppId;
  }

  /**
   * Gets the Amplify default domain.
   * 
   * @returns Amplify default domain
   */
  public getDefaultDomain(): string {
    return this.amplifyApp.attrDefaultDomain;
  }

  /**
   * Gets the full app URL for this environment.
   * 
   * @returns Full Amplify app URL
   */
  public getAppUrl(): string {
    return this.defaultDomain;
  }
}
