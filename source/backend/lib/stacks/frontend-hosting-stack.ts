/**
 * @fileoverview Frontend Hosting Stack for Amplify deployment.
 * 
 * Separate stack for frontend hosting infrastructure, depends on backend stack
 * for Cognito, AppSync, and other backend resources. Supports three cloud
 * environments: local, dev, prod.
 * 
 * This stack creates:
 * - AWS Amplify App for hosting
 * - S3 bucket for deployment artifacts (with ACLs enabled)
 * - IAM permissions for Amplify service principal
 * - Environment-specific configuration
 */

import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { GraphqlApi } from 'aws-cdk-lib/aws-appsync';
import { AmplifyFrontendConstruct } from '../constructs/amplify-frontend';

/**
 * Properties for Frontend Hosting Stack.
 */
export interface FrontendHostingStackProps extends StackProps {
  /** Environment name: local, dev, or prod (all are cloud deployments) */
  environment: string;
  
  /** Cognito User Pool from backend stack */
  userPool: IUserPool;
  
  /** Cognito User Pool Client from backend stack */
  userPoolClient: IUserPoolClient;
  
  /** AppSync GraphQL API from backend stack */
  graphqlApi: GraphqlApi;
  
  /** AWS Region */
  region: string;
  
  /** AWS Account ID */
  accountId: string;
}

/**
 * CDK Stack for frontend hosting infrastructure.
 * 
 * Creates Amplify App, deployment bucket, and all necessary resources
 * for hosting the React frontend. Receives backend outputs as props
 * and configures Amplify with proper environment variables.
 * 
 * This stack is deployed separately from the backend stack and has an
 * explicit dependency on it to ensure backend resources are available.
 */
export class FrontendHostingStack extends Stack {
  /** Amplify App ID */
  public readonly amplifyAppId: string;
  
  /** Amplify App URL */
  public readonly amplifyAppUrl: string;
  
  /** S3 Deployment Bucket Name */
  public readonly deploymentBucket: string;
  
  /** Amplify Branch Name */
  public readonly branchName: string;

  constructor(scope: Construct, id: string, props: FrontendHostingStackProps) {
    super(scope, id, props);

    const { environment, userPool, userPoolClient, graphqlApi, region, accountId } = props;

    // Create Amplify frontend hosting construct
    const amplifyFrontend = new AmplifyFrontendConstruct(this, 'AmplifyFrontend', {
      environment,
      accountId,
      userPool,
      userPoolClient,
      graphqlApi,
      region
    });

    // Store public properties
    this.amplifyAppId = amplifyFrontend.getAppId();
    this.amplifyAppUrl = amplifyFrontend.getAppUrl();
    this.deploymentBucket = amplifyFrontend.deploymentBucket.bucketName;
    this.branchName = environment;

    // Output all values needed for deployment
    new CfnOutput(this, 'FrontendStackName', {
      value: this.stackName,
      description: 'Frontend hosting stack name',
      exportName: `${this.stackName}-Name`
    });

    new CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyAppId,
      description: 'Amplify App ID for deployment',
      exportName: `${this.stackName}-AppId`
    });

    new CfnOutput(this, 'AmplifyAppUrl', {
      value: this.amplifyAppUrl,
      description: 'Amplify App URL',
      exportName: `${this.stackName}-AppUrl`
    });

    new CfnOutput(this, 'DeploymentBucket', {
      value: this.deploymentBucket,
      description: 'S3 bucket for deployment artifacts',
      exportName: `${this.stackName}-DeploymentBucket`
    });

    new CfnOutput(this, 'BranchName', {
      value: this.branchName,
      description: 'Amplify branch name',
      exportName: `${this.stackName}-BranchName`
    });

    new CfnOutput(this, 'Environment', {
      value: environment,
      description: 'Deployment environment',
      exportName: `${this.stackName}-Environment`
    });

    new CfnOutput(this, 'Region', {
      value: region,
      description: 'AWS Region',
      exportName: `${this.stackName}-Region`
    });
  }
}
