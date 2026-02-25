/**
 * @fileoverview S3 bucket construct for storing AgentCore Runtime agent code packages.
 * 
 * This construct creates an S3 bucket with appropriate security settings for storing
 * agent deployment packages that will be deployed to Amazon Bedrock AgentCore Runtime.
 * 
 * Requirements: FR-1, FR-1.1, NFR-6
 */

import { Construct } from 'constructs';
import { RemovalPolicy, Stack, Duration } from 'aws-cdk-lib';
import { Bucket, BucketEncryption, BlockPublicAccess, BucketAccessControl } from 'aws-cdk-lib/aws-s3';
import { Role } from 'aws-cdk-lib/aws-iam';

/**
 * Properties for AgentCore deployment bucket construct.
 */
export interface AgentCoreDeploymentBucketProps {
  /**
   * Deployment environment (dev, prod).
   */
  environment: string;
  
  /**
   * Whether to enable versioning for agent code packages.
   * @default true
   */
  versioned?: boolean;
}

/**
 * CDK construct for S3 bucket to store AgentCore Runtime agent code packages.
 * 
 * Creates a secure S3 bucket with:
 * - Server-side encryption (AES-256)
 * - Versioning enabled for rollback capability
 * - Block public access
 * - Lifecycle policies for old versions
 * 
 * Requirements: FR-1, NFR-6
 */
export class AgentCoreDeploymentBucketConstruct extends Construct {
  /**
   * The S3 bucket for agent code packages.
   */
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: AgentCoreDeploymentBucketProps) {
    super(scope, id);

    const stack = Stack.of(this);

    // Create S3 bucket for agent code packages (Requirement NFR-6: Security)
    this.bucket = new Bucket(this, 'AgentCodeBucket', {
      bucketName: `agentcore-code-${props.environment}-${stack.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      versioned: props.versioned !== false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      accessControl: BucketAccessControl.PRIVATE,
      enforceSSL: true,
      removalPolicy: props.environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      
      // Lifecycle rules for managing old versions
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7)
        }
      ]
    });
  }

  /**
   * Grants read permissions to a role for accessing agent code packages.
   * 
   * @param role - IAM role to grant permissions to
   */
  public grantRead(role: Role): void {
    this.bucket.grantRead(role);
  }

  /**
   * Grants write permissions to a role for uploading agent code packages.
   * 
   * @param role - IAM role to grant permissions to
   */
  public grantWrite(role: Role): void {
    this.bucket.grantWrite(role);
  }

  /**
   * Grants read/write permissions to a role for managing agent code packages.
   * 
   * @param role - IAM role to grant permissions to
   */
  public grantReadWrite(role: Role): void {
    this.bucket.grantReadWrite(role);
  }
}
