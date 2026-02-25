#!/usr/bin/env python3
"""
Deploy AgentCore agents using AWS SDK directly.

This script bypasses the AgentCore Starter Toolkit and uses boto3 to deploy
agents directly to Amazon Bedrock AgentCore Runtime.

Usage:
    python deploy-agentcore-aws-sdk.py <environment>

Example:
    python deploy-agentcore-aws-sdk.py dev
"""

import boto3
import json
import os
import sys
import zipfile
import tempfile
from pathlib import Path
from typing import Dict, Any

# Colors for output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color


def print_color(message: str, color: str):
    """Print colored message."""
    print(f"{color}{message}{Colors.NC}")


def load_config(environment: str) -> Dict[str, Any]:
    """Load configuration from JSON file."""
    script_dir = Path(__file__).parent
    config_file = script_dir.parent / "config" / f"{environment}.json"
    
    if not config_file.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_file}")
    
    with open(config_file, 'r') as f:
        return json.load(f)


def create_agent_package(agent_dir: Path) -> Path:
    """Create deployment package for agent."""
    print_color(f"  Creating deployment package for {agent_dir.name}...", Colors.BLUE)
    
    # Create temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    temp_zip.close()
    
    with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add all Python files
        for file_path in agent_dir.rglob('*.py'):
            arcname = file_path.relative_to(agent_dir)
            zipf.write(file_path, arcname)
        
        # Add all JavaScript files
        for file_path in agent_dir.rglob('*.js'):
            arcname = file_path.relative_to(agent_dir)
            zipf.write(file_path, arcname)
        
        # Add requirements.txt if exists
        req_file = agent_dir / 'requirements.txt'
        if req_file.exists():
            zipf.write(req_file, 'requirements.txt')
        
        # Add package.json if exists
        pkg_file = agent_dir / 'package.json'
        if pkg_file.exists():
            zipf.write(pkg_file, 'package.json')
    
    print_color(f"  ✓ Package created: {temp_zip.name}", Colors.GREEN)
    return Path(temp_zip.name)


def upload_to_s3(zip_path: Path, bucket: str, key: str, region: str) -> str:
    """Upload agent package to S3."""
    print_color(f"  Uploading to S3: s3://{bucket}/{key}", Colors.BLUE)
    
    s3_client = boto3.client('s3', region_name=region)
    
    try:
        s3_client.upload_file(str(zip_path), bucket, key)
        print_color(f"  ✓ Uploaded successfully", Colors.GREEN)
        return f"s3://{bucket}/{key}"
    except Exception as e:
        print_color(f"  ✗ Upload failed: {e}", Colors.RED)
        raise


def create_execution_role(role_name: str, region: str) -> str:
    """Create IAM execution role for AgentCore."""
    print_color(f"  Creating IAM execution role: {role_name}", Colors.BLUE)
    
    iam_client = boto3.client('iam', region_name=region)
    
    # Trust policy for AgentCore
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {
                "Service": "bedrock-agentcore.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }]
    }
    
    try:
        # Try to get existing role
        response = iam_client.get_role(RoleName=role_name)
        role_arn = response['Role']['Arn']
        print_color(f"  ✓ Using existing role: {role_arn}", Colors.GREEN)
        return role_arn
    except iam_client.exceptions.NoSuchEntityException:
        # Create new role
        response = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Execution role for AgentCore Runtime agents'
        )
        role_arn = response['Role']['Arn']
        
        # Attach basic execution policy
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        )
        
        print_color(f"  ✓ Created role: {role_arn}", Colors.GREEN)
        return role_arn


def deploy_agent(
    agent_name: str,
    agent_dir: Path,
    config: Dict[str, Any],
    s3_bucket: str,
    execution_role_arn: str
) -> str:
    """Deploy agent to AgentCore Runtime using AWS SDK."""
    print_color(f"\nDeploying {agent_name}...", Colors.YELLOW)
    
    region = config['aws']['region']
    account = config['aws']['account']
    
    # Create package
    zip_path = create_agent_package(agent_dir)
    
    # Upload to S3
    s3_key = f"agents/{agent_name}.zip"
    upload_to_s3(zip_path, s3_bucket, s3_key, region)
    
    # Clean up temp file
    os.unlink(zip_path)
    
    # Deploy to AgentCore Runtime
    print_color(f"  Deploying to AgentCore Runtime...", Colors.BLUE)
    
    agentcore_client = boto3.client('bedrock-agentcore-control', region_name=region)
    
    try:
        # Try to create new agent runtime
        response = agentcore_client.create_agent_runtime(
            agentRuntimeName=agent_name,
            agentRuntimeArtifact={
                'codeConfiguration': {
                    'code': {
                        's3': {
                            'bucket': s3_bucket,
                            'key': s3_key
                        }
                    },
                    'runtime': 'PYTHON_3_11',
                    'entryPoint': ['main.py', 'invoke']
                }
            },
            roleArn=execution_role_arn,
            networkConfiguration={
                'networkMode': 'PUBLIC'
            },
            lifecycleConfiguration={
                'idleRuntimeSessionTimeout': 300,
                'maxLifetime': 28800
            },
            tags={
                'Environment': config['environment'],
                'AgentType': agent_name,
                'ManagedBy': 'AWS-SDK'
            }
        )
        
        agent_id = response['agentRuntimeId']
        print_color(f"  ✓ Agent deployed successfully", Colors.GREEN)
        print_color(f"  Agent Runtime ID: {agent_id}", Colors.CYAN)
        return agent_id
        
    except agentcore_client.exceptions.ConflictException:
        # Agent already exists, update it
        print_color(f"  Agent already exists, updating...", Colors.YELLOW)
        
        # List agents to find the ID
        response = agentcore_client.list_agent_runtimes()
        agent_id = None
        for agent in response.get('agentRuntimeSummaries', []):
            if agent['agentRuntimeName'] == agent_name:
                agent_id = agent['agentRuntimeId']
                break
        
        if not agent_id:
            raise Exception(f"Could not find existing agent: {agent_name}")
        
        # Update agent
        agentcore_client.update_agent_runtime(
            agentRuntimeId=agent_id,
            agentRuntimeArtifact={
                'codeConfiguration': {
                    'code': {
                        's3': {
                            'bucket': s3_bucket,
                            'key': s3_key
                        }
                    },
                    'runtime': 'PYTHON_3_11',
                    'entryPoint': ['main.py', 'invoke']
                }
            }
        )
        
        print_color(f"  ✓ Agent updated successfully", Colors.GREEN)
        print_color(f"  Agent Runtime ID: {agent_id}", Colors.CYAN)
        return agent_id


def update_config_file(config_path: Path, agent_ids: Dict[str, str]):
    """Update configuration file with agent IDs."""
    print_color(f"\nUpdating configuration file...", Colors.BLUE)
    
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    # Update agent IDs
    if 'agentCore' not in config:
        config['agentCore'] = {}
    if 'agents' not in config['agentCore']:
        config['agentCore']['agents'] = {}
    
    config['agentCore']['agents']['demandForecast'] = agent_ids.get('demand_forecast', '')
    config['agentCore']['agents']['competitiveAnalysis'] = agent_ids.get('competitive_analysis', '')
    config['agentCore']['agents']['marginAnalysis'] = agent_ids.get('margin_analysis', '')
    
    # Write back
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print_color(f"✓ Configuration updated: {config_path}", Colors.GREEN)


def main():
    """Main deployment function."""
    if len(sys.argv) < 2:
        print_color("Usage: python deploy-agentcore-aws-sdk.py <environment>", Colors.RED)
        sys.exit(1)
    
    environment = sys.argv[1]
    
    print_color("=" * 60, Colors.CYAN)
    print_color("AgentCore Deployment (AWS SDK)", Colors.CYAN)
    print_color("=" * 60, Colors.CYAN)
    print_color(f"\nEnvironment: {environment}\n", Colors.BLUE)
    
    # Load configuration
    config = load_config(environment)
    region = config['aws']['region']
    account = config['aws']['account']
    s3_bucket = config['agentCore']['codeBucket']
    
    print_color(f"Region: {region}", Colors.BLUE)
    print_color(f"Account: {account}", Colors.BLUE)
    print_color(f"S3 Bucket: {s3_bucket}", Colors.BLUE)
    
    # Create execution role
    role_name = f"AgentCoreExecutionRole-{environment}"
    execution_role_arn = create_execution_role(role_name, region)
    
    # Agent directories
    script_dir = Path(__file__).parent
    agents_dir = script_dir.parent / "lib" / "lambdas" / "agentcore-agents"
    
    agents = {
        'demand_forecast': agents_dir / 'demand-forecast',
        'competitive_analysis': agents_dir / 'competitive-analysis',
        'margin_analysis': agents_dir / 'margin-analysis'
    }
    
    # Deploy each agent
    agent_ids = {}
    for agent_name, agent_dir in agents.items():
        if not agent_dir.exists():
            print_color(f"✗ Agent directory not found: {agent_dir}", Colors.RED)
            continue
        
        try:
            agent_id = deploy_agent(agent_name, agent_dir, config, s3_bucket, execution_role_arn)
            agent_ids[agent_name] = agent_id
        except Exception as e:
            print_color(f"✗ Failed to deploy {agent_name}: {e}", Colors.RED)
            import traceback
            traceback.print_exc()
    
    # Update configuration file
    config_path = script_dir.parent / "config" / f"{environment}.json"
    update_config_file(config_path, agent_ids)
    
    # Summary
    print_color("\n" + "=" * 60, Colors.CYAN)
    print_color("Deployment Complete!", Colors.CYAN)
    print_color("=" * 60, Colors.CYAN)
    print_color("\nAgent Runtime IDs:", Colors.GREEN)
    for agent_name, agent_id in agent_ids.items():
        print_color(f"  {agent_name}: {agent_id}", Colors.CYAN)
    
    print_color("\nNext steps:", Colors.BLUE)
    print_color("  1. Deploy CDK stack with agent IDs", Colors.BLUE)
    print_color(f"     cd {script_dir.parent}", Colors.BLUE)
    print_color(f"     cdk deploy --context environment={environment}", Colors.BLUE)


if __name__ == '__main__':
    main()
