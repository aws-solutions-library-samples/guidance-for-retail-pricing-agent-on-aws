/**
 * @fileoverview CDK construct for Midway OIDC integration.
 * 
 * Creates AWS Secrets Manager secrets for Midway OIDC credentials
 * and configures Cognito User Pool with OIDC identity provider.
 */

import { Construct } from 'constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { UserPool, UserPoolIdentityProviderOidc, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Table } from 'aws-cdk-lib/aws-dynamodb';

/**
 * Configuration interface for Midway OIDC integration.
 */
export interface MidwayOIDCConfig {
  /** Whether Midway OIDC integration is enabled */
  enabled: boolean;
  /** Cognito domain for OIDC */
  domain: string;
  /** Secret name for Midway client ID */
  clientIdSecretName: string;
  /** Secret name for Midway client secret */
  clientSecretSecretName: string;
  /** OAuth scopes to request */
  scopes: string[];
  /** Callback URLs for OAuth flow */
  callbackUrls: string[];
  /** Logout URLs for OAuth flow */
  logoutUrls: string[];
}

/**
 * Properties for MidwayOIDCConstruct.
 */
export interface MidwayOIDCConstructProps {
  /** Cognito User Pool to configure */
  userPool: UserPool;
  /** User Pool Client to update */
  userPoolClient: UserPoolClient;
  /** Midway OIDC configuration */
  config: MidwayOIDCConfig;
  /** Environment name for resource naming */
  environment: string;
  /** Optional DynamoDB table for user data storage */
  userTable?: Table;
}

/**
 * CDK construct for Midway OIDC integration.
 * 
 * This construct:
 * - Creates AWS Secrets Manager secrets for Midway credentials
 * - Configures Cognito User Pool with OIDC identity provider
 * - Updates User Pool Client with OAuth settings
 * - Handles error cases and provides proper cleanup
 */
export class MidwayOIDCConstruct extends Construct {
  public readonly clientIdSecret?: Secret;
  public readonly clientSecretSecret?: Secret;
  public readonly identityProvider?: UserPoolIdentityProviderOidc;
  public readonly authHandler?: Function;

  constructor(scope: Construct, id: string, props: MidwayOIDCConstructProps) {
    super(scope, id);

    const { userPool, userPoolClient, config, environment, userTable } = props;

    // Only create resources if Midway OIDC is enabled
    if (!config.enabled) {
      console.log('Midway OIDC integration is disabled');
      return;
    }

    console.log('Creating Midway OIDC integration resources...');

    // Create secret for Midway client ID
    this.clientIdSecret = new Secret(this, 'MidwayClientIdSecret', {
      secretName: config.clientIdSecretName,
      description: `Midway OIDC Client ID for ${environment} environment`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientId: '' }),
        generateStringKey: 'clientId',
        excludeCharacters: '"@/\\'
      },
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    // Create secret for Midway client secret
    this.clientSecretSecret = new Secret(this, 'MidwayClientSecretSecret', {
      secretName: config.clientSecretSecretName,
      description: `Midway OIDC Client Secret for ${environment} environment`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientSecret: '' }),
        generateStringKey: 'clientSecret',
        excludeCharacters: '"@/\\'
      },
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    // Create OIDC Identity Provider
    this.identityProvider = new UserPoolIdentityProviderOidc(this, 'MidwayOIDCProvider', {
      userPool,
      name: 'Midway',
      clientId: this.clientIdSecret.secretValueFromJson('clientId').unsafeUnwrap(),
      clientSecret: this.clientSecretSecret.secretValueFromJson('clientSecret').unsafeUnwrap(),
      issuerUrl: `https://${config.domain}`,
      scopes: config.scopes,
      attributeMapping: {
        email: { attributeName: 'email' },
        givenName: { attributeName: 'given_name' },
        familyName: { attributeName: 'family_name' },
        preferredUsername: { attributeName: 'preferred_username' }
      }
    });

    // Update User Pool Client to support OAuth flows
    const cfnUserPoolClient = userPoolClient.node.defaultChild as any;
    cfnUserPoolClient.addPropertyOverride('SupportedIdentityProviders', [
      'COGNITO',
      this.identityProvider.providerName
    ]);
    cfnUserPoolClient.addPropertyOverride('CallbackURLs', config.callbackUrls);
    cfnUserPoolClient.addPropertyOverride('LogoutURLs', config.logoutUrls);
    cfnUserPoolClient.addPropertyOverride('AllowedOAuthFlows', [
      'code',
      'implicit'
    ]);
    cfnUserPoolClient.addPropertyOverride('AllowedOAuthScopes', config.scopes);
    cfnUserPoolClient.addPropertyOverride('AllowedOAuthFlowsUserPoolClient', true);

    // Create Lambda function for authentication event handling
    this.authHandler = new NodejsFunction(this, 'MidwayAuthHandler', {
      functionName: `midway-auth-handler-${environment}`,
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/midway-auth-handler/index.js',
      timeout: Duration.seconds(30),
      
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
        USER_SESSIONS_TABLE: userTable?.tableName || '',
        USER_PROFILES_TABLE: userTable?.tableName || '',
        ENVIRONMENT: environment
      }
    });

    // Grant permissions to Lambda function
    this.authHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    this.authHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*']
    }));

    // Grant DynamoDB permissions if table is provided
    if (userTable) {
      userTable.grantReadWriteData(this.authHandler);
    }

    // Add Lambda triggers to User Pool
    const cfnUserPool = userPool.node.defaultChild as any;
    cfnUserPool.addPropertyOverride('LambdaConfig', {
      PreAuthentication: this.authHandler.functionArn,
      PostAuthentication: this.authHandler.functionArn,
      PreSignUp: this.authHandler.functionArn,
      PostConfirmation: this.authHandler.functionArn
    });

    // Grant Cognito permission to invoke Lambda
    this.authHandler.addPermission('CognitoPreAuthInvoke', {
      principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('cognito-idp.amazonaws.com'),
      sourceArn: userPool.userPoolArn
    });

    this.authHandler.addPermission('CognitoPostAuthInvoke', {
      principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('cognito-idp.amazonaws.com'),
      sourceArn: userPool.userPoolArn
    });

    this.authHandler.addPermission('CognitoPreSignUpInvoke', {
      principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('cognito-idp.amazonaws.com'),
      sourceArn: userPool.userPoolArn
    });

    this.authHandler.addPermission('CognitoPostConfirmationInvoke', {
      principal: new (require('aws-cdk-lib/aws-iam').ServicePrincipal)('cognito-idp.amazonaws.com'),
      sourceArn: userPool.userPoolArn
    });

    // Add dependency to ensure identity provider is created before client
    userPoolClient.node.addDependency(this.identityProvider);

    console.log('Midway OIDC integration resources created successfully');
  }

  /**
   * Get the ARN of the client ID secret.
   * 
   * @returns Secret ARN or undefined if not created
   */
  public getClientIdSecretArn(): string | undefined {
    return this.clientIdSecret?.secretArn;
  }

  /**
   * Get the ARN of the client secret secret.
   * 
   * @returns Secret ARN or undefined if not created
   */
  public getClientSecretSecretArn(): string | undefined {
    return this.clientSecretSecret?.secretArn;
  }

  /**
   * Get the name of the OIDC identity provider.
   * 
   * @returns Provider name or undefined if not created
   */
  public getProviderName(): string | undefined {
    return this.identityProvider?.providerName;
  }
}