"""
DynamoDB utility functions for agent data operations.

Provides helper functions for common DynamoDB operations used across agents:
- Updating pricing records with retry logic
- Querying session data
- Storing agent results
- Error handling and logging

This module implements common DynamoDB patterns to reduce code duplication
across agents and ensure consistent error handling and retry logic.
"""

import json
import time
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

# Import AWS SDK
import boto3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger(__name__)


class DynamoDBClient:
    """
    Client for DynamoDB operations with retry logic and error handling.
    
    This client provides a simple interface for common DynamoDB operations
    used by pricing analysis agents. All operations include:
    - Automatic retry with exponential backoff
    - Comprehensive error logging
    - Performance metrics tracking
    - Consistent error handling
    
    Features:
    - Update pricing records with partial updates
    - Query session data efficiently
    - Store agent results with proper structure
    - Handle throttling and transient errors gracefully
    """
    
    def __init__(self, table_name: str, region: str = 'us-east-1'):
        """
        Initialize DynamoDB client.
        
        Args:
            table_name: DynamoDB table name
            region: AWS region (default: us-east-1)
        """
        self.table_name = table_name
        self.region = region
        
        # Get DynamoDB resource
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        
        logger.info(f"DynamoDBClient initialized for table: {table_name}")
    
    async def update_pricing_record(
        self,
        session_id: str,
        agent_field: str,
        agent_data: Dict[str, Any],
        status: Optional[str] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Update a pricing record with agent analysis results.
        
        This method updates the specified agent field (demandForecast,
        competitiveAnalysis, or marginAnalysis) in the pricing record.
        It includes retry logic for transient errors and validates that
        the record exists before updating.
        
        Args:
            session_id: Pricing session identifier
            agent_field: Field name to update (e.g., 'demandForecast')
            agent_data: Agent analysis data to store
            status: Optional status to set (e.g., 'demand_analysis_complete')
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            Update result with status and execution time
            
        Raises:
            Exception: If update fails after all retries
        """
        base_delay = 1.0  # 1 second
        start_time = time.time()
        
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(
                    f"Attempt {attempt}/{max_retries} to update {agent_field} "
                    f"for session {session_id}"
                )
                
                # First, check if the record exists
                try:
                    check_response = self.table.get_item(
                        Key={
                            'PK': f'PRICING#{session_id}',
                            'SK': 'METADATA'
                        }
                    )
                    if 'Item' not in check_response:
                        error_msg = f"Pricing record does not exist for session {session_id}"
                        logger.error(error_msg)
                        raise Exception(error_msg)
                    
                    logger.debug("Record exists, proceeding with update")
                    
                except ClientError as check_error:
                    logger.error(f"Error checking if record exists: {check_error}")
                    # Continue anyway - the update will fail if it doesn't exist
                
                # Build update expression
                update_expr = f'SET {agent_field} = :data, updatedAt = :updatedAt'
                expr_values = {
                    ':data': json.dumps(agent_data),
                    ':updatedAt': datetime.now().isoformat()
                }
                expr_names = {}
                
                # Add status update if provided
                if status:
                    update_expr += ', #status = :status'
                    expr_names['#status'] = 'status'
                    expr_values[':status'] = status
                
                # Perform the update
                update_kwargs = {
                    'Key': {
                        'PK': f'PRICING#{session_id}',
                        'SK': 'METADATA'
                    },
                    'UpdateExpression': update_expr,
                    'ExpressionAttributeValues': expr_values,
                    'ReturnValues': 'UPDATED_NEW'
                }
                
                if expr_names:
                    update_kwargs['ExpressionAttributeNames'] = expr_names
                
                response = self.table.update_item(**update_kwargs)
                
                # Calculate execution time
                execution_time = (time.time() - start_time) * 1000  # milliseconds
                
                logger.info(
                    f"Successfully updated {agent_field} for session {session_id} "
                    f"in {execution_time:.0f}ms"
                )
                
                return {
                    'status': 'success',
                    'message': f'{agent_field} updated successfully',
                    'session_id': session_id,
                    'execution_time_ms': execution_time,
                    'updated_attributes': response.get('Attributes', {})
                }
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_message = e.response.get('Error', {}).get('Message', str(e))
                
                logger.error(f"Attempt {attempt} failed: {error_code} - {error_message}")
                
                # Check if this is a retryable error
                retryable_errors = [
                    'ProvisionedThroughputExceededException',
                    'ThrottlingException',
                    'ServiceUnavailable',
                    'InternalServerError',
                    'RequestLimitExceeded'
                ]
                
                is_retryable = error_code in retryable_errors
                
                if attempt == max_retries or not is_retryable:
                    execution_time = (time.time() - start_time) * 1000
                    error_msg = (
                        f"Failed to update {agent_field} after {max_retries} attempts: "
                        f"{error_message}"
                    )
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                # Calculate exponential backoff delay with jitter
                delay = base_delay * (2 ** (attempt - 1)) + (time.time() % 1)
                logger.info(f"Retrying in {delay:.2f}s...")
                await asyncio.sleep(delay)
                
            except Exception as e:
                logger.error(f"Unexpected error updating {agent_field}: {e}", exc_info=True)
                raise
    
    async def get_pricing_session(
        self,
        session_id: str,
        max_retries: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a pricing session record.
        
        Args:
            session_id: Pricing session identifier
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            Pricing session data or None if not found
            
        Raises:
            Exception: If retrieval fails after all retries
        """
        base_delay = 1.0
        
        for attempt in range(1, max_retries + 1):
            try:
                logger.debug(f"Retrieving session {session_id} (attempt {attempt}/{max_retries})")
                
                response = self.table.get_item(
                    Key={
                        'PK': f'PRICING#{session_id}',
                        'SK': 'METADATA'
                    }
                )
                
                if 'Item' in response:
                    logger.info(f"Session {session_id} retrieved successfully")
                    return response['Item']
                else:
                    logger.warning(f"Session {session_id} not found")
                    return None
                    
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_message = e.response.get('Error', {}).get('Message', str(e))
                
                logger.error(f"Attempt {attempt} failed: {error_code} - {error_message}")
                
                retryable_errors = [
                    'ProvisionedThroughputExceededException',
                    'ThrottlingException',
                    'ServiceUnavailable',
                    'InternalServerError'
                ]
                
                is_retryable = error_code in retryable_errors
                
                if attempt == max_retries or not is_retryable:
                    error_msg = f"Failed to retrieve session after {max_retries} attempts: {error_message}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                delay = base_delay * (2 ** (attempt - 1)) + (time.time() % 1)
                logger.info(f"Retrying in {delay:.2f}s...")
                await asyncio.sleep(delay)
    
    async def query_sessions_by_user(
        self,
        user_id: str,
        limit: int = 20,
        max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Query pricing sessions for a specific user.
        
        Args:
            user_id: User identifier
            limit: Maximum number of results (default: 20)
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            List of pricing sessions
            
        Raises:
            Exception: If query fails after all retries
        """
        base_delay = 1.0
        
        for attempt in range(1, max_retries + 1):
            try:
                logger.debug(f"Querying sessions for user {user_id} (attempt {attempt}/{max_retries})")
                
                response = self.table.query(
                    IndexName='GSI1',
                    KeyConditionExpression='GSI1PK = :userPK AND begins_with(GSI1SK, :sessionPrefix)',
                    ExpressionAttributeValues={
                        ':userPK': f'USER#{user_id}',
                        ':sessionPrefix': 'SESSION#'
                    },
                    ScanIndexForward=False,  # Most recent first
                    Limit=limit
                )
                
                items = response.get('Items', [])
                logger.info(f"Retrieved {len(items)} sessions for user {user_id}")
                return items
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_message = e.response.get('Error', {}).get('Message', str(e))
                
                logger.error(f"Attempt {attempt} failed: {error_code} - {error_message}")
                
                retryable_errors = [
                    'ProvisionedThroughputExceededException',
                    'ThrottlingException',
                    'ServiceUnavailable',
                    'InternalServerError'
                ]
                
                is_retryable = error_code in retryable_errors
                
                if attempt == max_retries or not is_retryable:
                    error_msg = f"Failed to query sessions after {max_retries} attempts: {error_message}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                delay = base_delay * (2 ** (attempt - 1)) + (time.time() % 1)
                logger.info(f"Retrying in {delay:.2f}s...")
                await asyncio.sleep(delay)
        
        return []
    
    async def batch_get_items(
        self,
        keys: List[Dict[str, str]],
        max_retries: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Retrieve multiple items in a single batch operation.
        
        Args:
            keys: List of key dictionaries with PK and SK
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            List of retrieved items
            
        Raises:
            Exception: If batch get fails after all retries
        """
        base_delay = 1.0
        
        for attempt in range(1, max_retries + 1):
            try:
                logger.debug(f"Batch getting {len(keys)} items (attempt {attempt}/{max_retries})")
                
                response = self.dynamodb.batch_get_item(
                    RequestItems={
                        self.table_name: {
                            'Keys': keys
                        }
                    }
                )
                
                items = response.get('Responses', {}).get(self.table_name, [])
                logger.info(f"Retrieved {len(items)} items in batch")
                return items
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_message = e.response.get('Error', {}).get('Message', str(e))
                
                logger.error(f"Attempt {attempt} failed: {error_code} - {error_message}")
                
                retryable_errors = [
                    'ProvisionedThroughputExceededException',
                    'ThrottlingException',
                    'ServiceUnavailable',
                    'InternalServerError'
                ]
                
                is_retryable = error_code in retryable_errors
                
                if attempt == max_retries or not is_retryable:
                    error_msg = f"Failed to batch get items after {max_retries} attempts: {error_message}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                delay = base_delay * (2 ** (attempt - 1)) + (time.time() % 1)
                logger.info(f"Retrying in {delay:.2f}s...")
                await asyncio.sleep(delay)
        
        return []


# Convenience functions for common operations

async def update_agent_result(
    table_name: str,
    session_id: str,
    agent_field: str,
    agent_data: Dict[str, Any],
    status: Optional[str] = None,
    region: str = 'us-east-1'
) -> Dict[str, Any]:
    """
    Convenience function to update an agent's analysis result.
    
    Creates a DynamoDBClient and updates the agent field in a single call.
    
    Args:
        table_name: DynamoDB table name
        session_id: Pricing session identifier
        agent_field: Field name (e.g., 'demandForecast', 'competitiveAnalysis')
        agent_data: Agent analysis data
        status: Optional status to set
        region: AWS region (default: us-east-1)
        
    Returns:
        Update result
        
    Raises:
        Exception: If update fails
    """
    client = DynamoDBClient(table_name, region)
    return await client.update_pricing_record(
        session_id=session_id,
        agent_field=agent_field,
        agent_data=agent_data,
        status=status
    )


async def get_session(
    table_name: str,
    session_id: str,
    region: str = 'us-east-1'
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to retrieve a pricing session.
    
    Args:
        table_name: DynamoDB table name
        session_id: Pricing session identifier
        region: AWS region (default: us-east-1)
        
    Returns:
        Pricing session data or None if not found
    """
    client = DynamoDBClient(table_name, region)
    return await client.get_pricing_session(session_id)
