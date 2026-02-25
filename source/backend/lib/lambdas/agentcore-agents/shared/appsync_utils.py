"""
AppSync utility functions for agent communication.

Provides helper functions for agents to write messages and update session state
through AppSync mutations, ensuring real-time updates reach the frontend.

This module implements the agent communication pattern defined in the real-time
communication design document. It provides a simple API for agents to:
1. Write progress messages to the SessionChat table
2. Update pricing session state with results and status
3. Handle retries and errors gracefully

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 10.5, 10.6, 10.7
"""

import json
import time
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
import logging

# Import AWS SDK
import boto3
from botocore.exceptions import ClientError
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
# NOTE: requests is imported lazily in _execute_mutation to avoid slow startup

# Configure logging
logger = logging.getLogger(__name__)


class AppSyncClient:
    """
    Client for invoking AppSync mutations from agents.
    
    This client provides a simple interface for agents to communicate with
    the frontend through AppSync GraphQL mutations. All mutations automatically
    trigger subscriptions, enabling real-time updates in the dashboard.
    
    Features:
    - Automatic retry with exponential backoff
    - AWS Signature V4 authentication
    - Comprehensive error logging
    - Non-blocking message writes (don't fail agent on message errors)
    - Critical session updates (fail agent if update fails)
    
    Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
    """
    
    def __init__(self, appsync_endpoint: str, region: str = 'us-east-1'):
        """
        Initialize AppSync client.
        
        Args:
            appsync_endpoint: AppSync GraphQL API endpoint URL
            region: AWS region (default: us-east-1)
            
        Requirements: 7.1
        """
        self.endpoint = appsync_endpoint
        self.region = region
        
        # Get AWS credentials from boto3 session
        session = boto3.Session()
        self.credentials = session.get_credentials()
        
        # Get frozen credentials to ensure they're available
        if self.credentials:
            frozen_creds = self.credentials.get_frozen_credentials()
            logger.info(f"AppSyncClient initialized with credentials: access_key={frozen_creds.access_key[:10]}...")
        else:
            logger.error("AppSyncClient initialized WITHOUT credentials - IAM auth will fail!")
        
        logger.info(f"AppSyncClient initialized for endpoint: {appsync_endpoint}")
    
    def _to_json_string(self, value: Any) -> str:
        """
        Convert a value to a valid JSON string for AWSJSON scalar.
        
        Handles multiple input formats:
        - dict/list: Serialize with json.dumps()
        - Valid JSON string: Return as-is
        - Python repr string (single quotes): Parse and re-serialize
        - Other: Convert to string
        
        Args:
            value: Value to convert (dict, list, or string)
            
        Returns:
            Valid JSON string
        """
        # If it's a dict or list, serialize it
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        
        # If it's a string, check if it's valid JSON
        if isinstance(value, str):
            # Try to parse it as JSON first
            try:
                parsed = json.loads(value)
                # It's valid JSON, return as-is
                return value
            except json.JSONDecodeError:
                # Not valid JSON - might be Python repr with single quotes
                # Try to convert Python repr to valid JSON
                try:
                    # Replace Python-style booleans and None
                    fixed = value.replace("'", '"')
                    fixed = fixed.replace('True', 'true')
                    fixed = fixed.replace('False', 'false')
                    fixed = fixed.replace('None', 'null')
                    # Verify it's now valid JSON
                    json.loads(fixed)
                    return fixed
                except (json.JSONDecodeError, Exception) as e:
                    logger.warning(f"Could not convert string to JSON: {e}")
                    # Last resort: wrap in quotes as a string value
                    return json.dumps(value)
        
        # For other types, serialize directly
        return json.dumps(value, default=str)
    
    async def write_message(
        self,
        session_id: str,
        agent_id: str,
        agent_name: str,
        message: str,
        sender_type: str = 'agent',
        metadata: Optional[Dict[str, Any]] = None,
        max_retries: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        Write a message to the SessionChat table via AppSync mutation.
        
        This function invokes the createChatMessage mutation, which automatically
        triggers the onChatMessageBySession subscription for real-time updates.
        
        Message writes are non-critical: if all retries fail, the error is logged
        but the agent execution continues. This ensures that communication failures
        don't block the core analysis workflow.
        
        Args:
            session_id: Session identifier
            agent_id: Agent identifier (e.g., "demand-forecast")
            agent_name: Human-readable agent name (e.g., "Demand Forecast Agent")
            message: Message content
            sender_type: "agent" or "user" (default: "agent")
            metadata: Optional metadata dictionary
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            Created chat message or None if all retries failed
            
        Requirements: 7.2, 7.3, 7.6, 7.7, 10.2
        """
        mutation = """
        mutation CreateChatMessage(
          $sessionId: ID!
          $agentId: String!
          $agentName: String!
          $message: String!
          $senderType: String
          $metadata: AWSJSON
        ) {
          createChatMessage(
            sessionId: $sessionId
            agentId: $agentId
            agentName: $agentName
            message: $message
            senderType: $senderType
            metadata: $metadata
          ) {
            id
            sessionId
            timestamp
            agentId
            agentName
            message
            senderType
            metadata
          }
        }
        """
        
        variables = {
            'sessionId': session_id,
            'agentId': agent_id,
            'agentName': agent_name,
            'message': message,
            'senderType': sender_type
        }
        
        # Add metadata if provided (AWSJSON scalar expects a valid JSON string)
        if metadata:
            variables['metadata'] = self._to_json_string(metadata)
        
        # Retry loop with exponential backoff
        for attempt in range(max_retries):
            try:
                logger.debug(f"Writing message (attempt {attempt + 1}/{max_retries}): {message[:50]}...")
                
                response = await self._execute_mutation(mutation, variables)
                
                if response and 'data' in response and 'createChatMessage' in response['data']:
                    logger.info(f"Message written successfully: {response['data']['createChatMessage']['id']}")
                    return response['data']['createChatMessage']
                else:
                    logger.warning(f"Unexpected response format: {response}")
                    
            except Exception as e:
                logger.error(f"Failed to write message (attempt {attempt + 1}/{max_retries}): {e}")
                
                if attempt == max_retries - 1:
                    # Final attempt failed - log error but don't fail agent execution
                    logger.error(
                        f"Failed to write message after {max_retries} attempts. "
                        f"Agent execution will continue. Error: {e}"
                    )
                    return None
                
                # Exponential backoff: 1s, 2s, 4s
                backoff_seconds = 2 ** attempt
                logger.debug(f"Retrying in {backoff_seconds} seconds...")
                await asyncio.sleep(backoff_seconds)
        
        return None
    
    async def update_session(
        self,
        session_id: str,
        status: Optional[str] = None,
        current_agent: Optional[str] = None,
        agent_status: Optional[Dict[str, str]] = None,
        analysis_data: Optional[Dict[str, Any]] = None,
        error_details: Optional[Dict[str, Any]] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Update pricing session state via AppSync mutation.
        
        This function invokes the updatePricingSession mutation, which automatically
        triggers the onPricingById subscription for real-time updates.
        
        Session updates are critical: if all retries fail, an exception is raised
        to fail the agent execution. This ensures that session state remains
        consistent and the frontend receives accurate status information.
        
        Args:
            session_id: Session identifier
            status: Session status ("in-progress", "completed", "failed")
            current_agent: Currently executing agent
            agent_status: Status of each agent (dict with agent names as keys)
            analysis_data: Analysis results (dict with agent results)
            error_details: Error information if failed
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            Updated pricing session
            
        Raises:
            Exception: If mutation fails after all retries
            
        Requirements: 7.4, 7.5, 7.6, 7.7, 10.1, 10.3, 10.4
        """
        mutation = """
        mutation UpdatePricingSession($input: UpdatePricingSessionInput!) {
          updatePricingSession(input: $input) {
            id
            sessionId
            status
            currentAgent
            agentStatus
            analysisData {
              demandForecast
              competitiveAnalysis
              marginAnalysis
              supervisorResults
            }
            updatedAt
          }
        }
        """
        
        # Log mutation name for debugging
        logger.info(f"Calling updatePricingSession mutation for session {session_id}")
        
        # Build input object with only non-None values
        input_obj = {'id': session_id}
        
        # Status must be a PricingStatus enum value:
        # initiated, in_progress, completed, competitive_analysis_complete, success, error
        if status is not None:
            input_obj['status'] = status
        if current_agent is not None:
            input_obj['currentAgent'] = current_agent
        if agent_status is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['agentStatus'] = self._to_json_string(agent_status)
        if analysis_data is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['analysisData'] = self._to_json_string(analysis_data)
        if error_details is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['errorDetails'] = self._to_json_string(error_details)
        
        # Wrap in input parameter
        variables = {'input': input_obj}
        
        # Log the variables for debugging (especially to catch any unexpected status values)
        logger.info(f"UpdatePricingSession variables: {json.dumps(variables, indent=2, default=str)}")
        
        # Retry loop with exponential backoff
        for attempt in range(max_retries):
            try:
                logger.debug(f"Updating session (attempt {attempt + 1}/{max_retries}): {session_id}")
                
                response = await self._execute_mutation(mutation, variables)
                
                if response and 'data' in response and 'updatePricingSession' in response['data']:
                    logger.info(f"Session updated successfully: {session_id}")
                    return response['data']['updatePricingSession']
                else:
                    logger.warning(f"Unexpected response format: {response}")
                    
            except Exception as e:
                logger.error(f"Failed to update session (attempt {attempt + 1}/{max_retries}): {e}")
                
                if attempt == max_retries - 1:
                    # Final attempt failed - raise exception to fail agent execution
                    error_msg = (
                        f"Failed to update session after {max_retries} attempts. "
                        f"Agent execution failed. Error: {e}"
                    )
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                # Exponential backoff: 1s, 2s, 4s
                backoff_seconds = 2 ** attempt
                logger.debug(f"Retrying in {backoff_seconds} seconds...")
                await asyncio.sleep(backoff_seconds)
    
    async def update_pricing_analysis(
        self,
        session_id: str,
        demand_forecast: Optional[Dict[str, Any]] = None,
        competitive_analysis: Optional[Dict[str, Any]] = None,
        margin_analysis: Optional[Dict[str, Any]] = None,
        final_recommendation: Optional[Dict[str, Any]] = None,
        status: Optional[str] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Update pricing analysis results (PRICING# records) via AppSync mutation.
        
        This function invokes the updatePricingAnalysis mutation, which automatically
        triggers the onPricingAnalysisById subscription for real-time updates.
        
        Analysis updates are critical: if all retries fail, an exception is raised
        to fail the agent execution. This ensures that analysis results are properly
        persisted and the frontend receives accurate data.
        
        Args:
            session_id: Session identifier
            demand_forecast: Demand forecast results from agent
            competitive_analysis: Competitive analysis results from agent
            margin_analysis: Margin analysis results from agent
            status: Analysis status (initiated, demand_analysis_complete, etc.)
            max_retries: Maximum retry attempts (default: 3)
            
        Returns:
            Updated pricing analysis record
            
        Raises:
            Exception: If mutation fails after all retries
            
        Requirements: Agent updates to PRICING# records via AppSync
        """
        mutation = """
        mutation UpdatePricingAnalysis($input: UpdatePricingAnalysisInput!) {
          updatePricingAnalysis(input: $input) {
            id
            sessionId
            userId
            productId
            product
            status
            demandForecast
            competitiveAnalysis
            marginAnalysis
            finalRecommendation
            createdAt
            updatedAt
          }
        }
        """
        
        # Log mutation name for debugging
        logger.info(f"Calling updatePricingAnalysis mutation for session {session_id}")
        
        # Build input object with only non-None values
        input_obj = {'id': session_id}

        # Status must be a PricingAnalysisStatus enum value:
        # initiated, demand_analysis_complete, competitive_analysis_complete, completed, failed
        if status is not None:
            input_obj['status'] = status
        if demand_forecast is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['demandForecast'] = self._to_json_string(demand_forecast)
        if competitive_analysis is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['competitiveAnalysis'] = self._to_json_string(competitive_analysis)
        if margin_analysis is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['marginAnalysis'] = self._to_json_string(margin_analysis)
        if final_recommendation is not None:
            # AWSJSON scalar expects a valid JSON string
            input_obj['finalRecommendation'] = self._to_json_string(final_recommendation)
        
        # Wrap in input parameter
        variables = {'input': input_obj}
        
        # Log the variables for debugging
        logger.debug(f"UpdatePricingAnalysis variables: {json.dumps(variables, indent=2, default=str)}")
        
        # Retry loop with exponential backoff
        for attempt in range(max_retries):
            try:
                logger.debug(f"Updating pricing analysis (attempt {attempt + 1}/{max_retries}): {session_id}")
                
                response = await self._execute_mutation(mutation, variables)
                
                if response and 'data' in response and 'updatePricingAnalysis' in response['data']:
                    logger.info(f"Pricing analysis updated successfully: {session_id}")
                    return response['data']['updatePricingAnalysis']
                else:
                    logger.warning(f"Unexpected response format: {response}")
                    
            except Exception as e:
                logger.error(f"Failed to update pricing analysis (attempt {attempt + 1}/{max_retries}): {e}")
                
                if attempt == max_retries - 1:
                    # Final attempt failed - raise exception to fail agent execution
                    error_msg = (
                        f"Failed to update pricing analysis after {max_retries} attempts. "
                        f"Agent execution failed. Error: {e}"
                    )
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                # Exponential backoff: 1s, 2s, 4s
                backoff_seconds = 2 ** attempt
                logger.debug(f"Retrying in {backoff_seconds} seconds...")
                await asyncio.sleep(backoff_seconds)

    async def _execute_mutation(
        self,
        mutation: str,
        variables: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a GraphQL mutation via AppSync with AWS Signature V4 authentication.
        
        This method handles the low-level details of:
        1. Building the GraphQL request payload
        2. Signing the request with AWS Signature V4
        3. Sending the HTTP POST request
        4. Parsing and returning the response
        
        Args:
            mutation: GraphQL mutation string
            variables: Mutation variables
            
        Returns:
            Mutation response (parsed JSON)
            
        Raises:
            Exception: If the request fails or returns errors
            
        Requirements: 7.5, 10.5, 10.6, 10.7
        """
        # Build GraphQL request payload
        payload = {
            'query': mutation,
            'variables': variables
        }
        
        try:
            payload_json = json.dumps(payload, ensure_ascii=True, default=str)
            logger.debug(f"Payload JSON length: {len(payload_json)} bytes")
            # Log first 500 chars of payload for debugging (truncate for large payloads)
            if len(payload_json) > 500:
                logger.debug(f"Payload preview: {payload_json[:500]}...")
            else:
                logger.debug(f"Payload: {payload_json}")
        except (TypeError, ValueError) as e:
            logger.error(f"Failed to serialize payload to JSON: {e}")
            logger.error(f"Payload: {payload}")
            raise Exception(f"JSON serialization failed: {e}")
        
        # Parse endpoint to get host
        from urllib.parse import urlparse
        parsed_url = urlparse(self.endpoint)
        host = parsed_url.netloc
        
        # Create AWS request for signing with proper headers
        request = AWSRequest(
            method='POST',
            url=self.endpoint,
            data=payload_json,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'host': host  # Required for SigV4
            }
        )
        
        # Sign request with AWS Signature V4 for AppSync
        SigV4Auth(self.credentials, 'appsync', self.region).add_auth(request)
        
        # Convert to requests-compatible format
        headers = dict(request.headers)
        
        # Execute HTTP request
        logger.debug(f"Executing AppSync mutation to {self.endpoint}")
        logger.debug(f"Request headers: {list(headers.keys())}")
        if 'Authorization' in headers:
            logger.debug(f"Authorization header present: {headers['Authorization'][:50]}...")
        else:
            logger.warning("No Authorization header found - IAM auth may fail!")
        
        # Lazy import requests to avoid slow startup
        import requests
        
        response = requests.post(
            self.endpoint,
            headers=headers,
            data=payload_json,
            timeout=30  # 30 second timeout
        )
        
        # Check HTTP status
        response.raise_for_status()
        
        # Parse response
        response_data = response.json()
        
        # Check for GraphQL errors
        if 'errors' in response_data:
            error_messages = [err.get('message', str(err)) for err in response_data['errors']]
            error_msg = f"GraphQL errors: {', '.join(error_messages)}"
            logger.error(error_msg)
            raise Exception(error_msg)
        
        logger.debug("Mutation executed successfully")
        return response_data


# Convenience functions for backward compatibility and simpler usage

async def write_agent_message(
    appsync_endpoint: str,
    session_id: str,
    agent_id: str,
    agent_name: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
    region: str = 'us-east-1'
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to write an agent message.
    
    Creates an AppSyncClient and writes a message in a single call.
    Useful for simple one-off message writes.
    
    Args:
        appsync_endpoint: AppSync GraphQL API endpoint URL
        session_id: Session identifier
        agent_id: Agent identifier
        agent_name: Human-readable agent name
        message: Message content
        metadata: Optional metadata dictionary
        region: AWS region (default: us-east-1)
        
    Returns:
        Created chat message or None if failed
    """
    client = AppSyncClient(appsync_endpoint, region)
    return await client.write_message(
        session_id=session_id,
        agent_id=agent_id,
        agent_name=agent_name,
        message=message,
        metadata=metadata
    )


async def update_pricing_session(
    appsync_endpoint: str,
    session_id: str,
    status: Optional[str] = None,
    current_agent: Optional[str] = None,
    agent_status: Optional[Dict[str, str]] = None,
    analysis_data: Optional[Dict[str, Any]] = None,
    error_details: Optional[Dict[str, Any]] = None,
    region: str = 'us-east-1'
) -> Dict[str, Any]:
    """
    Convenience function to update a pricing session.
    
    Creates an AppSyncClient and updates the session in a single call.
    Useful for simple one-off session updates.
    
    Args:
        appsync_endpoint: AppSync GraphQL API endpoint URL
        session_id: Session identifier
        status: Session status
        current_agent: Currently executing agent
        agent_status: Status of each agent
        analysis_data: Analysis results
        error_details: Error information
        region: AWS region (default: us-east-1)
        
    Returns:
        Updated pricing session
        
    Raises:
        Exception: If update fails after retries
    """
    client = AppSyncClient(appsync_endpoint, region)
    return await client.update_session(
        session_id=session_id,
        status=status,
        current_agent=current_agent,
        agent_status=agent_status,
        analysis_data=analysis_data,
        error_details=error_details
    )


async def update_pricing_analysis(
    appsync_endpoint: str,
    session_id: str,
    demand_forecast: Optional[Dict[str, Any]] = None,
    competitive_analysis: Optional[Dict[str, Any]] = None,
    margin_analysis: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
    region: str = 'us-east-1'
) -> Dict[str, Any]:
    """
    Convenience function to update pricing analysis (PRICING# records).
    
    Creates an AppSyncClient and updates the analysis in a single call.
    This triggers the onPricingAnalysisById subscription for real-time updates.
    
    Args:
        appsync_endpoint: AppSync GraphQL API endpoint URL
        session_id: Session identifier
        demand_forecast: Demand forecast results
        competitive_analysis: Competitive analysis results
        margin_analysis: Margin analysis results
        status: Analysis status (initiated, demand_analysis_complete, etc.)
        region: AWS region (default: us-east-1)
        
    Returns:
        Updated pricing analysis record
        
    Raises:
        Exception: If update fails after retries
    """
    client = AppSyncClient(appsync_endpoint, region)
    return await client.update_pricing_analysis(
        session_id=session_id,
        demand_forecast=demand_forecast,
        competitive_analysis=competitive_analysis,
        margin_analysis=margin_analysis,
        status=status
    )
