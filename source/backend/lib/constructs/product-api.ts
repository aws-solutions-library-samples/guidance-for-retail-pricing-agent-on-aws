/**
 * @fileoverview AppSync GraphQL API construct for product catalog.
 * 
 * Creates a fully managed GraphQL API with Lambda resolvers for
 * scalable product catalog operations with real-time subscriptions.
 * Includes Cognito authentication, X-Ray tracing, CloudWatch logging,
 * and CORS configuration for secure, observable API operations.
 */

import { Construct } from 'constructs';
import { 
  GraphqlApi, 
  SchemaFile, 
  AuthorizationType, 
  FieldLogLevel,
  MappingTemplate,
  UserPoolDefaultAction
} from 'aws-cdk-lib/aws-appsync';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Runtime, Code, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration, CfnOutput } from 'aws-cdk-lib';
import { Role, ServicePrincipal, PolicyStatement, ManagedPolicy, Effect } from 'aws-cdk-lib/aws-iam';
import { Expiration } from 'aws-cdk-lib';

export interface ProductApiProps {
  userPool: UserPool;
  productTable: Table;
  orchestrationTable?: Table;
  sessionChatTable?: Table;
  eventBus?: import('aws-cdk-lib/aws-events').EventBus;
  stateMachineArn?: string;
}

export class ProductApiConstruct extends Construct {
  public readonly api: GraphqlApi;
  public readonly productResolverFunction: Function;

  constructor(scope: Construct, id: string, props: ProductApiProps) {
    super(scope, id);

    const { userPool, productTable, orchestrationTable, sessionChatTable, eventBus, stateMachineArn } = props;

    // Create GraphQL API with comprehensive configuration
    this.api = new GraphqlApi(this, 'ProductCatalogApi', {
      name: 'ProductCatalogGraphQLAPI',
      schema: SchemaFile.fromAsset('lib/graphql/schema.graphql'),
      
      // Cognito authentication configuration
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            defaultAction: UserPoolDefaultAction.ALLOW
          }
        },
        // Additional authorization modes for different use cases
        additionalAuthorizationModes: [
          {
            // API Key for development/testing
            authorizationType: AuthorizationType.API_KEY,
            apiKeyConfig: {
              expires: Expiration.after(Duration.days(365))
            }
          },
          {
            // IAM for AgentCore agents and Lambda functions
            // Agents use IAM roles to invoke mutations for real-time updates
            authorizationType: AuthorizationType.IAM
          }
        ]
      },
      
      // CloudWatch logging configuration
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL,
        excludeVerboseContent: false
      },
      
      // Enable X-Ray tracing
      xrayEnabled: true
    });

    // Create IAM role for Lambda function with proper permissions
    const lambdaRole = new Role(this, 'ProductResolverRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
      ]
    });

    // Add DynamoDB permissions to the role for product table
    lambdaRole.addToPolicy(new PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:GetItem',
        'dynamodb:BatchGetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        productTable.tableArn,
        `${productTable.tableArn}/index/*`
      ]
    }));

    // Add DynamoDB permissions to the role for orchestration table if provided
    if (orchestrationTable) {
      lambdaRole.addToPolicy(new PolicyStatement({
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:BatchGetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem'
        ],
        resources: [
          orchestrationTable.tableArn,
          `${orchestrationTable.tableArn}/index/*`
        ]
      }));
    }

    // Add EventBridge permissions if eventBus is provided
    if (eventBus) {
      lambdaRole.addToPolicy(new PolicyStatement({
        actions: [
          'events:PutEvents'
        ],
        resources: [
          eventBus.eventBusArn
        ]
      }));
    }

    // Add Step Functions permissions if stateMachineArn is provided
    if (stateMachineArn) {
      lambdaRole.addToPolicy(new PolicyStatement({
        actions: [
          'states:StartExecution',
          'states:DescribeExecution',
          'states:StopExecution'
        ],
        resources: [
          stateMachineArn
        ]
      }));
    }

    // Unified Lambda function for all product resolvers
    this.productResolverFunction = new NodejsFunction(this, 'ProductResolverFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambdas/product-resolvers/index.js',
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: lambdaRole,
      
      // Enable X-Ray tracing
      tracing: Tracing.ACTIVE,
      
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
        PRODUCT_TABLE_NAME: productTable.tableName,
        ...(orchestrationTable && { ORCHESTRATION_TABLE_NAME: orchestrationTable.tableName }),
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        ...(eventBus && { EVENT_BUS_NAME: eventBus.eventBusName }),
        ...(stateMachineArn && { STATE_MACHINE_ARN: stateMachineArn })
      }
    });

    // Grant DynamoDB permissions (additional to IAM role)
    productTable.grantReadWriteData(this.productResolverFunction);
    if (orchestrationTable) {
      orchestrationTable.grantReadWriteData(this.productResolverFunction);
    }

    // Create Lambda data source
    const productResolverDataSource = this.api.addLambdaDataSource(
      'ProductResolverDataSource',
      this.productResolverFunction,
      {
        description: 'Lambda data source for product catalog operations'
      }
    );

    // Create direct DynamoDB data source for simple queries
    const productTableDataSource = this.api.addDynamoDbDataSource(
      'ProductTableDataSource',
      productTable,
      {
        description: 'Direct DynamoDB data source for simple product queries'
      }
    );

    // Create SessionChat table data source for agent messages (Requirement 5.1, 5.2)
    let sessionChatDataSource;
    if (sessionChatTable) {
      // Create data source - CDK automatically creates a service role
      sessionChatDataSource = this.api.addDynamoDbDataSource(
        'SessionChatDataSource',
        sessionChatTable,
        {
          description: 'DynamoDB data source for agent chat messages'
        }
      );

      // Grant comprehensive read/write permissions to the data source
      // This ensures AppSync can query and mutate chat messages
      sessionChatTable.grantReadWriteData(sessionChatDataSource);

      // Add explicit permissions for GSI queries
      // The auto-created service role needs explicit GSI permissions
      if ((sessionChatDataSource as any).serviceRole) {
        const dataSourceRole = (sessionChatDataSource as any).serviceRole as Role;
        dataSourceRole.addToPolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'dynamodb:Query',
            'dynamodb:Scan'
          ],
          resources: [
            `${sessionChatTable.tableArn}/index/*` // Explicit GSI permissions
          ]
        }));
      }
    }

    // Create PricingOrchestration table data source for PRICING# records
    // This enables VTL resolvers for updatePricingAnalysis and getPricingAnalysis
    let orchestrationDataSource;
    if (orchestrationTable) {
      orchestrationDataSource = this.api.addDynamoDbDataSource(
        'OrchestrationTableDataSource',
        orchestrationTable,
        {
          description: 'DynamoDB data source for PRICING# records (analysis results)'
        }
      );
    }

    // Create Lambda resolvers for complex operations
    productResolverDataSource.createResolver('ListProductsResolver', {
      typeName: 'Query',
      fieldName: 'listProducts'
    });

    productResolverDataSource.createResolver('SearchProductsResolver', {
      typeName: 'Query', 
      fieldName: 'searchProducts'
    });

    productResolverDataSource.createResolver('GetCategoryStatsResolver', {
      typeName: 'Query',
      fieldName: 'getCategoryStats'
    });

    productResolverDataSource.createResolver('GetCategoryFiltersResolver', {
      typeName: 'Query',
      fieldName: 'getCategoryFilters'
    });

    // Lambda resolver for getProduct (could be optimized with direct DynamoDB later)
    productResolverDataSource.createResolver('GetProductResolver', {
      typeName: 'Query',
      fieldName: 'getProduct'
    });

    // Create resolvers for the new product management mutations
    productResolverDataSource.createResolver('CreateProductResolver', {
      typeName: 'Mutation',
      fieldName: 'createProduct'
    });

    productResolverDataSource.createResolver('UpdateProductResolver', {
      typeName: 'Mutation',
      fieldName: 'updateProduct'
    });

    productResolverDataSource.createResolver('DeleteProductResolver', {
      typeName: 'Mutation',
      fieldName: 'deleteProduct'
    });

    // Create resolvers for pricing operations
    productResolverDataSource.createResolver('CreatePricingResolver', {
      typeName: 'Mutation',
      fieldName: 'createPricing'
    });

    productResolverDataSource.createResolver('UpdatePricingSessionResolver', {
      typeName: 'Mutation',
      fieldName: 'updatePricingSession'
    });

    productResolverDataSource.createResolver('AppsyncResolverResolver', {
      typeName: 'Mutation',
      fieldName: 'appsyncResolver'
    });

    productResolverDataSource.createResolver('PricingByUserIdResolver', {
      typeName: 'Query',
      fieldName: 'pricingByUserId'
    });

    // Create resolver for demo reset mutation
    productResolverDataSource.createResolver('ResetDemoResolver', {
      typeName: 'Mutation',
      fieldName: 'resetDemo'
    });

    // Create resolvers for chat messages (Requirements 5.3, 5.4, 8.1, 8.2, 8.3, 8.4)
    if (sessionChatDataSource) {
      // Mutation resolver for creating chat messages (triggers subscription)
      const createChatMessageResolver = sessionChatDataSource.createResolver('CreateChatMessageResolver', {
        typeName: 'Mutation',
        fieldName: 'createChatMessage',
        requestMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/createChatMessage.request.vtl'
        ),
        responseMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/createChatMessage.response.vtl'
        )
      });

      // Query resolver for listing chat messages by session (with optional agent filter)
      const listChatMessagesResolver = sessionChatDataSource.createResolver('ListChatMessagesResolver', {
        typeName: 'Query',
        fieldName: 'listChatMessages',
        requestMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/listChatMessages.request.vtl'
        ),
        responseMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/listChatMessages.response.vtl'
        )
      });

      // Query resolver for listing chat messages by agent across sessions (GSI query)
      const listChatMessagesByAgentResolver = sessionChatDataSource.createResolver('ListChatMessagesByAgentResolver', {
        typeName: 'Query',
        fieldName: 'listChatMessagesByAgent',
        requestMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/listChatMessagesByAgent.request.vtl'
        ),
        responseMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/listChatMessagesByAgent.response.vtl'
        )
      });
    }

    // Create Lambda resolver for updating pricing analysis (PRICING# records)
    // Changed from VTL to Lambda for better error handling and consistency
    // Triggers onPricingAnalysisById subscription for real-time updates
    productResolverDataSource.createResolver('UpdatePricingAnalysisResolver', {
      typeName: 'Mutation',
      fieldName: 'updatePricingAnalysis'
    });

    // Create VTL resolver for getting pricing analysis by session ID
    // This remains VTL as it's a simple read operation
    if (orchestrationDataSource) {
      orchestrationDataSource.createResolver('GetPricingAnalysisResolver', {
        typeName: 'Query',
        fieldName: 'getPricingAnalysis',
        requestMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/getPricingAnalysis.request.vtl'
        ),
        responseMappingTemplate: MappingTemplate.fromFile(
          'lib/graphql/resolvers/getPricingAnalysis.response.vtl'
        )
      });
    }

    // Output important values
    new CfnOutput(this, 'GraphQLApiUrl', {
      value: this.api.graphqlUrl,
      description: 'GraphQL API URL'
    });

    new CfnOutput(this, 'GraphQLApiId', {
      value: this.api.apiId,
      description: 'GraphQL API ID'
    });

    new CfnOutput(this, 'GraphQLApiKey', {
      value: this.api.apiKey || 'Not configured',
      description: 'GraphQL API Key (for development)'
    });

    // WebSocket endpoint for real-time subscriptions
    // Derived from graphqlUrl by replacing appsync-api with appsync-realtime-api
    // and changing protocol from https to wss
    const wssEndpoint = this.api.graphqlUrl
      .replace('https://', 'wss://')
      .replace('.appsync-api.', '.appsync-realtime-api.');
    
    new CfnOutput(this, 'GraphQLWssEndpoint', {
      value: wssEndpoint,
      description: 'GraphQL WebSocket endpoint for real-time subscriptions'
    });
  }
}