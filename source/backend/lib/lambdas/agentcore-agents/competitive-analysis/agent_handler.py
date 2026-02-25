"""
AgentCore Competitive Analysis Agent - Pure Python Implementation.

This module implements the complete competitive analysis agent in pure Python,
eliminating the need for subprocess calls to JavaScript. The agent runs
natively in Amazon Bedrock AgentCore Runtime.

Architecture:
- Single Python file with all agent logic
- Direct AWS service integration using boto3
- Internal methods for agent-specific operations
- Product data retrieval via shared Lambda function
- Competitor data analysis and market positioning

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
"""

import json
import os
import time
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime

# Import AgentCore SDK
try:
    from bedrock_agentcore import BedrockAgentCoreApp
except ImportError:
    print("ERROR: bedrock_agentcore SDK not installed. Install with: pip install bedrock-agentcore")
    import sys
    sys.exit(1)

# Import AWS SDK
import boto3
from botocore.exceptions import ClientError

# Import AppSync utilities for real-time communication
# The shared directory is copied into the agent package during deployment
from shared.appsync_utils import AppSyncClient
from shared.pricing_utils import (
    round_to_nearest_dollar,
    calculate_price_floor,
    calculate_price_ceiling,
    apply_pricing_constraints,
    calculate_pricing_boundaries
)

# Initialize AgentCore app (only enable debug if explicitly requested)
app = BedrockAgentCoreApp(debug=os.environ.get('LOG_LEVEL') == 'DEBUG')

# System prompt defining agent behavior and instructions
SYSTEM_PROMPT = """
You are a Competitive Analysis Agent specializing in retail pricing intelligence.

Your role is to:
1. Analyze competitor pricing data and market positioning
2. Assess the product's position relative to competitors
3. Calculate price percentile and competitive advantages/disadvantages
4. Recommend optimal price positioning strategy
5. Provide comprehensive market analysis with confidence scores

Analysis Steps:
1. Validate product data from Step Function payload (cost, MSRP, MAP, category)
2. Retrieve competitor pricing data from S3 training data
3. Analyze market position (price percentile, market share implications)
4. Calculate optimal price position (premium, competitive, or value strategy)
5. Update pricing record in DynamoDB with competitive analysis results

Output Format:
- Market position assessment with price percentile
- Price position strategy (premium, competitive, value)
- Competitor count and price range analysis
- Competitive advantages and disadvantages
- Recommended price with comprehensive rationale
- Confidence score based on data quality

Be thorough, data-driven, and provide clear explanations for all recommendations.
Focus on actionable insights that help optimize pricing decisions.
"""


# =============================================================================
# Custom Exception Classes
# =============================================================================
# These exceptions provide structured error handling with descriptive messages
# for different failure scenarios in the competitive analysis workflow.
# Requirements: 1.5, 5.6

class AgentExecutionError(Exception):
    """
    Base exception for agent execution errors.
    
    All agent-specific exceptions inherit from this class to enable
    consistent error handling and logging throughout the agent workflow.
    """
    pass


class LambdaInvocationError(AgentExecutionError):
    """
    Error invoking a shared Lambda function.
    
    Raised when the agent fails to invoke the get-product-data Lambda
    or any other shared Lambda function. Includes context about the
    invocation failure for debugging.
    """
    pass


class ProductNotFoundError(AgentExecutionError):
    """
    Product not found in database.
    
    Raised when the requested product_id does not exist in the
    product database or when the get-product-data Lambda returns
    a 404 status.
    """
    pass


class ProductDataError(AgentExecutionError):
    """
    Error with product data validation.
    
    Raised when the product data is missing required fields or
    contains invalid values that prevent competitive analysis
    from being performed correctly.
    """
    pass


class CompetitorDataError(AgentExecutionError):
    """
    Error fetching competitor data.
    
    Raised when the agent fails to retrieve competitor pricing data
    from S3 or when the competitor data is malformed or unavailable
    for the requested product category.
    """
    pass


class MarketAnalysisError(AgentExecutionError):
    """
    Error analyzing market position.
    
    Raised when the agent fails to calculate market position metrics
    such as price percentile, competitive advantages, or market share
    implications due to insufficient or invalid data.
    """
    pass


class DynamoDBUpdateError(AgentExecutionError):
    """
    Error updating DynamoDB pricing record.
    
    Raised when the agent fails to update the pricing session record
    in DynamoDB with competitive analysis results. May occur due to
    conditional check failures, throughput limits, or connectivity issues.
    """
    pass


# =============================================================================
# Competitive Analysis Agent Class
# =============================================================================

class CompetitiveAnalysisAgent:
    """
    Competitive Analysis Agent for retail pricing intelligence.
    
    This agent orchestrates the complete competitive analysis workflow:
    - Product data retrieval via shared Lambda function
    - Competitor pricing data retrieval from S3
    - Market position analysis (price percentile, competitive advantages)
    - Price position strategy calculation
    - DynamoDB record updates with analysis results
    
    Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
    """
    
    def __init__(self):
        """
        Initialize the Competitive Analysis Agent with minimal setup.
        
        AWS service clients are lazy-loaded on first use to minimize
        initialization time and avoid the 30-second AgentCore timeout.
        
        Sets up:
        - Message tracking for real-time updates
        - Environment variable references
        - Configuration parameters
        - Lazy client initialization (clients created on-demand)
        - AppSync client for real-time communication
        
        Requirements: 1.4, 1.6, 5.1, 7.1, 10.1
        """
        # Lazy-loaded AWS service clients (initialized on first access)
        # These are set to None and created only when the property is accessed
        self._s3_client = None
        self._dynamodb = None
        self._lambda_client = None
        self._appsync_client = None
        
        # Initialize message tracking list for real-time updates (legacy)
        self.messages: List[Dict[str, Any]] = []
        
        # Environment variable references (fast - no network calls)
        self.pricing_table_name = os.environ.get('PRICING_TABLE_NAME')
        self.product_table_name = os.environ.get('PRODUCT_TABLE_NAME')
        self.training_data_bucket = os.environ.get('TRAINING_DATA_BUCKET')
        self.get_product_data_function = os.environ.get('GET_PRODUCT_DATA_FUNCTION_NAME')
        self.appsync_endpoint = os.environ.get('APPSYNC_ENDPOINT')
        self.aws_region = os.environ.get('AWS_REGION', 'us-east-1')
        
        # AppSync client will be lazy-loaded on first access
        # Check if endpoint is configured for logging purposes
        self.appsync_endpoint_configured = bool(self.appsync_endpoint)
        if self.appsync_endpoint_configured:
            app.logger.info("AppSync endpoint configured - client will be lazy-loaded")
        else:
            app.logger.warning("APPSYNC_ENDPOINT not set - real-time updates disabled")
        
        # Configuration parameters
        self.max_retries = 3  # DynamoDB update retries
        self.retry_base_delay = 0.5  # Base delay for exponential backoff (seconds)
        
        # Agent identification for AppSync messages
        self.agent_id = 'competitive-analysis'
        self.agent_name = 'Competitive Analysis Agent'
        
        app.logger.info("CompetitiveAnalysisAgent initialized (lazy loading enabled)", extra={
            'pricing_table': self.pricing_table_name,
            'product_table': self.product_table_name,
            'training_bucket': self.training_data_bucket,
            'get_product_data_function': self.get_product_data_function,
            'appsync_enabled': self.appsync_endpoint_configured
        })
    
    # =========================================================================
    # Lazy-Loaded AWS Client Properties
    # =========================================================================
    # These properties implement lazy initialization of AWS clients to minimize
    # agent startup time. Clients are only created when first accessed.
    # Requirements: 1.4, 5.2
    
    @property
    def s3_client(self):
        """
        Lazy-load S3 client on first access.
        
        The S3 client is used to fetch competitor pricing data from the
        training data bucket. By lazy-loading, we avoid initialization
        overhead if S3 is not needed for a particular request.
        
        Returns:
            boto3 S3 client instance
            
        Requirements: 1.4
        """
        if self._s3_client is None:
            app.logger.debug("Initializing S3 client")
            # Explicitly specify region from environment variable
            # Default to us-east-1 to match deployment configuration
            region = os.environ.get('AWS_REGION', 'us-east-1')
            app.logger.debug(f"Using AWS region: {region}")
            self._s3_client = boto3.client('s3', region_name=region)
        return self._s3_client
    
    @property
    def dynamodb(self):
        """
        Lazy-load DynamoDB resource on first access.
        
        The DynamoDB resource is used to update pricing session records
        with competitive analysis results. By lazy-loading, we avoid
        initialization overhead if DynamoDB is not needed.
        
        Returns:
            boto3 DynamoDB resource instance
            
        Requirements: 1.4
        """
        if self._dynamodb is None:
            app.logger.debug("Initializing DynamoDB resource")
            # Explicitly specify region from environment variable
            # Default to us-east-1 to match deployment configuration
            region = os.environ.get('AWS_REGION', 'us-east-1')
            app.logger.debug(f"Using AWS region: {region}")
            self._dynamodb = boto3.resource('dynamodb', region_name=region)
        return self._dynamodb
    
    @property
    def lambda_client(self):
        """
        Lazy-load Lambda client on first access for shared Lambda invocations.
        
        The Lambda client is used to invoke the shared get-product-data
        Lambda function. This enables code reuse across agents while
        maintaining the lazy-loading pattern for optimal startup time.
        
        Returns:
            boto3 Lambda client instance
            
        Requirements: 1.4, 5.2
        """
        if self._lambda_client is None:
            app.logger.debug("Initializing Lambda client")
            # Explicitly specify region from environment variable
            # Default to us-east-1 to match deployment configuration
            region = os.environ.get('AWS_REGION', 'us-east-1')
            app.logger.debug(f"Using AWS region: {region}")
            self._lambda_client = boto3.client('lambda', region_name=region)
        return self._lambda_client
    
    @property
    def appsync_client(self):
        """
        Lazy-load AppSync client on first access for real-time communication.
        
        The AppSync client is used to send real-time updates to the dashboard
        via GraphQL mutations and subscriptions. By lazy-loading, we avoid
        initialization overhead during agent startup, preventing the 30-second
        AgentCore timeout.
        
        Returns:
            AppSyncClient instance or None if not configured
            
        Requirements: 1.4, 7.1, 10.1
        """
        if self._appsync_client is None and self.appsync_endpoint:
            app.logger.debug("Initializing AppSync client")
            self._appsync_client = AppSyncClient(
                appsync_endpoint=self.appsync_endpoint,
                region=self.aws_region
            )
            app.logger.info("AppSync client initialized for real-time communication")
        return self._appsync_client

    # =========================================================================
    # Shared Lambda Invocation Methods
    # =========================================================================
    # These methods invoke shared Lambda functions for common operations,
    # maintaining code reusability across agents.
    # Requirements: 5.1, 5.2, 5.3, 5.6

    async def _invoke_get_product_data(self, product_id: str) -> Dict[str, Any]:
        """
        Invoke shared get-product-data Lambda to retrieve product information.
        
        This method invokes the shared get-product-data Lambda function using
        synchronous invocation (RequestResponse) to retrieve product details
        from DynamoDB. This approach maintains code reusability across agents
        while ensuring consistent product data retrieval.
        
        Args:
            product_id: The product identifier to retrieve data for
            
        Returns:
            Product data dictionary containing:
            - product_id: Product identifier
            - cost: Product cost
            - MSRP: Manufacturer's Suggested Retail Price
            - MAP: Minimum Advertised Price
            - category: Product category
            - subcategory: Product subcategory
            - vendor: Product vendor
            - yearTarget: Annual sales target
            - attributes: Product attributes
            - features: Product features list
            
        Raises:
            LambdaInvocationError: If Lambda invocation fails due to:
                - Function not found
                - Permission denied
                - Timeout
                - Internal Lambda error
            ProductNotFoundError: If the product_id does not exist in the database
            
        Requirements: 5.1, 5.2, 5.3, 5.6
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> product_data = await agent._invoke_get_product_data('PROD-001')
            >>> print(product_data['MSRP'])
            99.99
        """
        app.logger.info(f"Invoking get-product-data Lambda for product: {product_id}")
        
        # Validate that the function name is configured
        if not self.get_product_data_function:
            error_msg = "GET_PRODUCT_DATA_FUNCTION_NAME environment variable not configured"
            app.logger.error(error_msg)
            raise LambdaInvocationError(error_msg)
        
        try:
            # Prepare the payload for the Lambda invocation
            payload = json.dumps({
                'product_id': product_id
            })
            
            app.logger.debug(f"Invoking Lambda function: {self.get_product_data_function}")
            
            # Invoke the shared Lambda function synchronously
            # Using 'RequestResponse' invocation type for synchronous execution
            response = self.lambda_client.invoke(
                FunctionName=self.get_product_data_function,
                InvocationType='RequestResponse',
                Payload=payload.encode('utf-8')
            )
            
            # Read and parse the response payload
            response_payload_bytes = response['Payload'].read()
            response_payload = json.loads(response_payload_bytes.decode('utf-8'))
            
            app.logger.debug(f"Lambda response status code: {response.get('StatusCode')}")
            
            # Check for Lambda function errors (unhandled exceptions)
            if response.get('FunctionError'):
                error_type = response.get('FunctionError')
                error_message = response_payload.get('errorMessage', 'Unknown Lambda error')
                error_context = f"Lambda function error ({error_type}): {error_message}"
                app.logger.error(error_context, extra={
                    'function_name': self.get_product_data_function,
                    'product_id': product_id,
                    'error_type': error_type,
                    'response_payload': response_payload
                })
                raise LambdaInvocationError(error_context)
            
            # Check for application-level errors in the response
            # The Lambda may return a structured response with statusCode
            status_code = response_payload.get('statusCode')
            
            if status_code == 404:
                error_msg = f"Product not found: {product_id}"
                app.logger.warning(error_msg)
                raise ProductNotFoundError(error_msg)
            
            if status_code and status_code >= 400:
                # Handle other HTTP-style error responses
                error_body = response_payload.get('body', {})
                if isinstance(error_body, str):
                    try:
                        error_body = json.loads(error_body)
                    except json.JSONDecodeError:
                        pass
                error_message = error_body.get('error', error_body.get('message', f'HTTP {status_code} error'))
                error_context = f"get-product-data returned error: {error_message}"
                app.logger.error(error_context, extra={
                    'status_code': status_code,
                    'product_id': product_id
                })
                raise LambdaInvocationError(error_context)
            
            # Extract the product data from the response
            # The Lambda may return data directly or wrapped in a 'body' field
            product_data = response_payload.get('body', response_payload)
            
            # If body is a JSON string, parse it
            if isinstance(product_data, str):
                try:
                    product_data = json.loads(product_data)
                except json.JSONDecodeError:
                    error_msg = f"Invalid JSON in Lambda response body: {product_data[:100]}"
                    app.logger.error(error_msg)
                    raise LambdaInvocationError(error_msg)
            
            # Validate that we received actual product data
            if not product_data or not isinstance(product_data, dict):
                error_msg = f"Empty or invalid product data received for product: {product_id}"
                app.logger.error(error_msg)
                raise LambdaInvocationError(error_msg)
            
            app.logger.info(f"Successfully retrieved product data for: {product_id}", extra={
                'category': product_data.get('category'),
                'subcategory': product_data.get('subcategory'),
                'has_cost': 'cost' in product_data,
                'has_msrp': 'MSRP' in product_data,
                'has_map': 'MAP' in product_data
            })
            
            return product_data
            
        except ClientError as e:
            # Handle boto3 client errors (network issues, permissions, etc.)
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            error_context = f"Failed to invoke get-product-data Lambda: [{error_code}] {error_message}"
            app.logger.error(error_context, extra={
                'function_name': self.get_product_data_function,
                'product_id': product_id,
                'error_code': error_code,
                'boto_error': str(e)
            })
            raise LambdaInvocationError(error_context)
        
        except json.JSONDecodeError as e:
            # Handle JSON parsing errors
            error_context = f"Failed to parse Lambda response as JSON: {str(e)}"
            app.logger.error(error_context, extra={
                'function_name': self.get_product_data_function,
                'product_id': product_id
            })
            raise LambdaInvocationError(error_context)
        
        except (LambdaInvocationError, ProductNotFoundError):
            # Re-raise our custom exceptions without wrapping
            raise
        
        except Exception as e:
            # Handle any unexpected errors
            error_context = f"Unexpected error invoking get-product-data Lambda: {str(e)}"
            app.logger.error(error_context, exc_info=True, extra={
                'function_name': self.get_product_data_function,
                'product_id': product_id,
                'error_type': type(e).__name__
            })
            raise LambdaInvocationError(error_context)

    # =========================================================================
    # Helper Methods
    # =========================================================================
    # These methods provide common functionality used throughout the agent.
    # Requirements: 1.6

    async def _add_message(self, message: str, session_id: str = None, agent_name: str = None):
        """
        Add a progress message for real-time updates.
        
        This method now writes messages to AppSync for real-time dashboard updates
        in addition to maintaining the legacy messages list.
        
        Args:
            message: Message text describing the current progress or status
            session_id: Session identifier (required for AppSync)
            agent_name: Name of the agent (default: self.agent_name)
            
        Returns:
            None
            
        Requirements: 1.1, 1.2, 1.6, 2.1, 2.2, 7.2, 10.2
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> await agent._add_message("Starting competitive analysis...", session_id="session-123")
            >>> await agent._add_message("Fetching competitor data...", session_id="session-123")
            >>> print(len(agent.messages))
            2
        """
        if agent_name is None:
            agent_name = self.agent_name
        
        # Add to legacy messages list
        msg = {
            "agentName": agent_name,
            "message": message,
            "timestamp": time.time()
        }
        self.messages.append(msg)
        app.logger.debug(f"Message added: {message}")
        
        # Write to AppSync for real-time updates
        if self.appsync_client and session_id:
            try:
                await self.appsync_client.write_message(
                    session_id=session_id,
                    agent_id=self.agent_id,
                    agent_name=agent_name,
                    message=message
                )
                app.logger.debug(f"Message written to AppSync: {message[:50]}...")
            except Exception as e:
                # Log error but don't fail agent execution
                app.logger.warning(f"Failed to write message to AppSync: {e}")

    async def _validate_product_data(self, product_data: Dict[str, Any], session_id: str = None) -> None:
        """
        Validate that product data contains all required fields for competitive analysis.
        
        This method ensures that the product data received from the Step Function
        payload or shared Lambda contains all the fields necessary to perform
        competitive analysis. Required fields include pricing constraints (cost,
        MSRP, MAP), product identification (product_id), and categorization
        (category) for competitor matching.
        
        Also handles parsing of attributes field if it's a JSON string (double-encoded).
        
        Args:
            product_data: Product data dictionary from Step Function payload
                or get-product-data Lambda response. Expected to contain:
                - product_id: Unique product identifier
                - cost: Product cost for margin calculations
                - MSRP: Manufacturer's Suggested Retail Price
                - MAP: Minimum Advertised Price
                - category: Product category for competitor matching
                - attributes: Product attributes (may be JSON string or dict)
            
        Returns:
            None - Method returns successfully if validation passes
            
        Raises:
            ProductDataError: If any required fields are missing from the
                product data. The error message includes the list of
                missing fields for debugging purposes.
            
        Requirements: 3.6
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> product_data = {
            ...     'product_id': 'PROD-001',
            ...     'cost': 50.00,
            ...     'MSRP': 99.99,
            ...     'MAP': 79.99,
            ...     'category': 'powertools'
            ... }
            >>> agent._validate_product_data(product_data)  # No exception raised
            
            >>> incomplete_data = {'product_id': 'PROD-001'}
            >>> agent._validate_product_data(incomplete_data)
            ProductDataError: Missing required product fields: cost, MSRP, MAP, category
        """
        # Parse attributes if it's a JSON string (handle double-encoded JSON)
        if 'attributes' in product_data and isinstance(product_data['attributes'], str):
            try:
                attributes_str = product_data['attributes']
                # First decode if it's escaped (double-encoded)
                if attributes_str.startswith('"') and attributes_str.endswith('"'):
                    attributes_str = json.loads(attributes_str)
                # Then parse the JSON
                product_data['attributes'] = json.loads(attributes_str)
                app.logger.debug(f"Parsed attributes from JSON string: {product_data['attributes']}")
            except (json.JSONDecodeError, TypeError) as e:
                app.logger.warning(f"Failed to parse attributes JSON: {e}, using empty dict")
                product_data['attributes'] = {}
        elif 'attributes' not in product_data:
            product_data['attributes'] = {}
        
        # Parse features if it's a JSON string
        if 'features' in product_data and isinstance(product_data['features'], str):
            try:
                features_str = product_data['features']
                # First decode if it's escaped (double-encoded)
                if features_str.startswith('"') and features_str.endswith('"'):
                    features_str = json.loads(features_str)
                # Then parse the JSON
                product_data['features'] = json.loads(features_str)
                app.logger.debug(f"Parsed features from JSON string: {product_data['features']}")
            except (json.JSONDecodeError, TypeError) as e:
                app.logger.warning(f"Failed to parse features JSON: {e}, using empty list")
                product_data['features'] = []
        elif 'features' not in product_data:
            product_data['features'] = []
        
        # Define required fields for competitive analysis
        # These fields are essential for market position analysis and pricing recommendations
        required_fields = ['product_id', 'cost', 'MSRP', 'MAP', 'category']
        
        # Check for missing fields
        missing_fields = [field for field in required_fields if field not in product_data]
        
        if missing_fields:
            error_msg = f"Missing required product fields: {', '.join(missing_fields)}"
            app.logger.error(error_msg, extra={
                'product_id': product_data.get('product_id', 'unknown'),
                'missing_fields': missing_fields,
                'provided_fields': list(product_data.keys())
            })
            raise ProductDataError(error_msg)
        
        # Log successful validation
        app.logger.info(f"Product data validated successfully for {product_data.get('product_id')}", extra={
            'category': product_data.get('category'),
            'subcategory': product_data.get('subcategory'),
            'has_cost': True,
            'has_msrp': True,
            'has_map': True,
            'attributes_type': type(product_data.get('attributes')).__name__,
            'features_type': type(product_data.get('features')).__name__
        })
        
        # Add progress message for real-time updates
        await self._add_message(
            f"Product data validated: {product_data.get('category', 'N/A')} - {product_data.get('subcategory', 'N/A')}",
            session_id=session_id
        )

    # =========================================================================
    # Competitor Data Retrieval Methods
    # =========================================================================
    # These methods fetch and process competitor pricing data from S3.
    # Requirements: 3.1

    async def _get_competitor_data(self, product_id: str, category: str, session_id: str = None) -> Dict[str, Any]:
        """
        Fetch competitor pricing data from S3 or DynamoDB.
        
        This method retrieves competitor pricing data for market position analysis.
        It attempts to fetch data from multiple S3 locations in order of preference,
        falling back to default data if no historical data exists.
        
        The returned data structure includes:
        - market_statistics: Price ranges, averages, and competitor counts
        - competitive_positioning: Primary competitor and market share info
        - strategic_insights: Market position assessment and recommendations
        
        Args:
            product_id: The product identifier to fetch competitor data for
            category: Product category for competitor matching (e.g., 'powertools')
            
        Returns:
            Competitor data dictionary containing:
            - product_id: Product identifier
            - model_name: Data source identifier ('historical-fallback' or 'default-fallback')
            - model_accuracy: Confidence score for the data (0.0-1.0)
            - market_statistics: Dict with price statistics
                - lowest_market_price: Minimum competitor price
                - highest_market_price: Maximum competitor price
                - average_market_price: Mean competitor price
                - median_market_price: Median competitor price
                - market_volatility: Price volatility index (0.0-1.0)
                - competitor_count: Number of competitors analyzed
            - competitive_positioning: Dict with market position info
                - primary_competitor: Name of main competitor
                - competitive_relevance_score: Relevance score (0.0-1.0)
                - market_share_estimate: Estimated market share (0.0-1.0)
                - price_positioning: Position strategy ('premium', 'mid-range', 'value')
                - competitive_advantages: List of product advantages
            - strategic_insights: Dict with recommendations
                - market_position_assessment: Current position ('premium', 'mid-premium', 'mid-range', 'value')
                - recommended_strategy: Strategy recommendation ('undercut', 'match', 'premium_position', 'value_leader')
                - strategy_rationale: Explanation for the recommendation
                - confidence_intervals: Dict with confidence scores
            - data_quality_metrics: Dict with data quality info
            
        Raises:
            CompetitorDataError: If competitor data retrieval fails after all
                fallback attempts and default data generation fails.
            
        Requirements: 3.1
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> competitor_data = await agent._get_competitor_data('PROD-001', 'powertools')
            >>> print(competitor_data['market_statistics']['average_market_price'])
            149.99
            >>> print(competitor_data['competitive_positioning']['primary_competitor'])
            'DeWalt'
        """
        await self._add_message("Fetching competitor pricing data...", session_id=session_id)
        app.logger.info(f"Fetching competitor data for product: {product_id}, category: {category}")
        
        try:
            # Try to fetch historical competitor data from S3
            competitor_data = await self._fetch_competitor_data_from_s3(product_id, category)
            
            if competitor_data:
                # Process and validate the historical data
                processed_data = self._process_competitor_data(competitor_data, product_id)
                
                await self._add_message(
                    f"Competitor data retrieved: {processed_data['market_statistics'].get('competitor_count', 0)} competitors analyzed",
                    session_id=session_id
                )
                app.logger.info(f"Successfully retrieved competitor data for {product_id}", extra={
                    'source': processed_data.get('model_name', 'unknown'),
                    'competitor_count': processed_data['market_statistics'].get('competitor_count', 0),
                    'data_age_days': processed_data.get('data_age_days', 'unknown')
                })
                
                return processed_data
            else:
                # No historical data found, generate default fallback
                app.logger.info(f"No historical competitor data found for {product_id}, using default fallback")
                await self._add_message("No historical competitor data available, using default market estimates", session_id=session_id)
                
                default_data = self._generate_default_competitor_data(product_id, category)
                return default_data
                
        except CompetitorDataError:
            # Re-raise CompetitorDataError without wrapping
            raise
        except Exception as e:
            error_msg = f"Failed to retrieve competitor data for {product_id}: {str(e)}"
            app.logger.error(error_msg, exc_info=True, extra={
                'product_id': product_id,
                'category': category,
                'error_type': type(e).__name__
            })
            
            # Try to return default data as last resort
            try:
                await self._add_message("Error retrieving competitor data, using default estimates", session_id=session_id)
                return self._generate_default_competitor_data(product_id, category)
            except Exception as fallback_error:
                raise CompetitorDataError(f"{error_msg}. Fallback also failed: {str(fallback_error)}")

    async def _fetch_competitor_data_from_s3(self, product_id: str, category: str) -> Optional[Dict[str, Any]]:
        """
        Fetch competitor data from S3 with multiple location fallbacks.
        
        Attempts to retrieve competitor data from several S3 locations in order
        of preference. Returns None if no data is found in any location.
        
        Args:
            product_id: Product identifier
            category: Product category
            
        Returns:
            Raw competitor data dictionary or None if not found
            
        Requirements: 3.1
        """
        if not self.training_data_bucket:
            app.logger.warning("TRAINING_DATA_BUCKET not configured, skipping S3 fetch")
            return None
        
        # Define possible S3 locations in order of preference
        possible_locations = [
            f'competitive_data/{product_id}.json',
            f'competitive_analysis/{product_id}.json',
            f'market_data/{category}/{product_id}.json',
            f'historical_data/competitive/{product_id}.json',
            f'training_data/{product_id}/competitive_analysis.json'
        ]
        
        for location in possible_locations:
            try:
                app.logger.debug(f"Trying S3 location: s3://{self.training_data_bucket}/{location}")
                
                response = self.s3_client.get_object(
                    Bucket=self.training_data_bucket,
                    Key=location
                )
                
                data = json.loads(response['Body'].read().decode('utf-8'))
                
                # Add metadata about the data source
                data['_metadata'] = {
                    'source_location': location,
                    'source_bucket': self.training_data_bucket,
                    'last_modified': response['LastModified'].isoformat() if response.get('LastModified') else None,
                    'retrieval_timestamp': datetime.now().isoformat()
                }
                
                app.logger.info(f"Competitor data found at {location} for {product_id}")
                return data
                
            except self.s3_client.exceptions.NoSuchKey:
                app.logger.debug(f"No competitor data found at {location}")
                continue
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'NoSuchKey':
                    app.logger.debug(f"No competitor data found at {location}")
                    continue
                app.logger.warning(f"Error accessing {location}: {e}")
                continue
            except json.JSONDecodeError as e:
                app.logger.warning(f"Invalid JSON at {location}: {e}")
                continue
            except Exception as e:
                app.logger.warning(f"Unexpected error accessing {location}: {e}")
                continue
        
        app.logger.info(f"No competitor data found in any S3 location for {product_id}")
        return None

    def _process_competitor_data(self, raw_data: Dict[str, Any], product_id: str) -> Dict[str, Any]:
        """
        Process and validate raw competitor data from S3.
        
        Applies confidence reduction based on data age and quality,
        and ensures the data structure matches the expected schema.
        
        Args:
            raw_data: Raw competitor data from S3
            product_id: Product identifier
            
        Returns:
            Processed competitor data with confidence adjustments
            
        Requirements: 3.1
        """
        app.logger.debug(f"Processing competitor data for {product_id}")
        
        # Calculate data age if timestamp is available
        data_age_days = 0
        analysis_timestamp = raw_data.get('analysis_timestamp')
        if analysis_timestamp:
            try:
                analysis_date = datetime.fromisoformat(analysis_timestamp.replace('Z', '+00:00'))
                current_date = datetime.now(analysis_date.tzinfo) if analysis_date.tzinfo else datetime.now()
                data_age_days = max(0, (current_date - analysis_date).days)
            except (ValueError, TypeError) as e:
                app.logger.warning(f"Could not parse analysis_timestamp: {e}")
                data_age_days = 90  # Default to 90 days if timestamp is invalid
        
        # Calculate confidence reduction based on data age
        confidence_reduction = self._calculate_confidence_reduction(data_age_days, raw_data.get('data_quality_metrics', {}))
        
        # Extract or default market statistics
        market_stats = raw_data.get('market_statistics', {})
        processed_market_stats = {
            'lowest_market_price': market_stats.get('lowest_market_price', 0.0),
            'highest_market_price': market_stats.get('highest_market_price', 0.0),
            'average_market_price': market_stats.get('average_market_price', 0.0),
            'median_market_price': market_stats.get('median_market_price', 0.0),
            'market_volatility': market_stats.get('market_volatility', 0.25),
            'competitor_count': market_stats.get('competitor_count', 0)
        }
        
        # Extract or default competitive positioning
        positioning = raw_data.get('competitive_positioning', {})
        processed_positioning = {
            'primary_competitor': positioning.get('primary_competitor', 'Unknown'),
            'competitive_relevance_score': positioning.get('competitive_relevance_score', 0.5),
            'market_share_estimate': positioning.get('market_share_estimate', 0.0),
            'price_positioning': positioning.get('price_positioning', 'mid-range'),
            'competitive_advantages': positioning.get('competitive_advantages', [])
        }
        
        # Extract or default strategic insights with confidence reduction
        insights = raw_data.get('strategic_insights', {})
        original_confidence = insights.get('confidence_intervals', {})
        
        processed_insights = {
            'market_position_assessment': insights.get('market_position_assessment', 'mid-range'),
            'recommended_strategy': insights.get('recommended_strategy', 'match'),
            'strategy_rationale': insights.get('strategy_rationale', 'Based on historical competitive data'),
            'confidence_intervals': {
                'price_recommendation_confidence': max(0.1, 
                    original_confidence.get('price_recommendation_confidence', 0.5) * (1 - confidence_reduction)
                ),
                'market_position_confidence': max(0.1,
                    original_confidence.get('market_position_confidence', 0.5) * (1 - confidence_reduction)
                ),
                'competitive_analysis_confidence': max(0.1,
                    original_confidence.get('competitive_analysis_confidence', 0.5) * (1 - confidence_reduction)
                )
            }
        }
        
        # Build processed data structure
        processed_data = {
            'product_id': product_id,
            'model_name': 'historical-fallback',
            'model_accuracy': max(0.3, 0.70 * (1 - confidence_reduction)),  # Base 70% accuracy with reduction
            'analysis_type': 'historical_competitive_analysis',
            'data_source': raw_data.get('data_source', 'historical_s3'),
            'analysis_timestamp': analysis_timestamp or datetime.now().isoformat(),
            'data_age_days': data_age_days,
            'confidence_reduction_applied': confidence_reduction,
            'market_statistics': processed_market_stats,
            'competitive_positioning': processed_positioning,
            'strategic_insights': processed_insights,
            'data_quality_metrics': raw_data.get('data_quality_metrics', {
                'data_freshness_days': data_age_days,
                'sample_size': 0,
                'data_completeness_score': 0.5,
                'outliers_excluded': 0
            })
        }
        
        return processed_data

    def _calculate_confidence_reduction(self, data_age_days: int, quality_metrics: Dict[str, Any]) -> float:
        """
        Calculate confidence reduction factor based on data age and quality.
        
        Args:
            data_age_days: Age of data in days
            quality_metrics: Data quality metrics dictionary
            
        Returns:
            Confidence reduction factor (0.0-0.6)
        """
        # Base reduction for historical data (15%)
        reduction = 0.15
        
        # Additional reduction based on data age (up to 30% more)
        if data_age_days > 30:
            reduction += min(0.30, (data_age_days - 30) * 0.01)
        
        # Additional reduction based on data completeness
        completeness = quality_metrics.get('data_completeness_score', 0.8)
        if completeness < 0.8:
            reduction += (0.8 - completeness) * 0.2  # Up to 16% for poor completeness
        
        # Additional reduction for small sample size
        sample_size = quality_metrics.get('sample_size', 50)
        if sample_size < 50:
            reduction += 0.10  # 10% reduction for small sample
        
        # Cap at 60% reduction
        return min(0.60, reduction)

    def _generate_default_competitor_data(self, product_id: str, category: str) -> Dict[str, Any]:
        """
        Generate default fallback competitor data when no historical data exists.
        
        Creates conservative default values for competitive analysis when
        no historical data is available. The confidence scores are set low
        to indicate the uncertainty of the estimates.
        
        Args:
            product_id: Product identifier
            category: Product category
            
        Returns:
            Default competitor data with low confidence scores
            
        Requirements: 3.1
        """
        app.logger.info(f"Generating default competitor data for {product_id} in category {category}")
        
        timestamp = datetime.now().isoformat()
        
        # Category-specific default price ranges (conservative estimates)
        category_defaults = {
            'powertools': {
                'lowest': 79.99,
                'highest': 299.99,
                'average': 149.99,
                'median': 139.99
            },
            'handtools': {
                'lowest': 19.99,
                'highest': 99.99,
                'average': 49.99,
                'median': 44.99
            },
            'accessories': {
                'lowest': 9.99,
                'highest': 79.99,
                'average': 34.99,
                'median': 29.99
            }
        }
        
        # Get category-specific defaults or use generic defaults
        price_defaults = category_defaults.get(category.lower(), {
            'lowest': 50.00,
            'highest': 200.00,
            'average': 100.00,
            'median': 95.00
        })
        
        default_data = {
            'product_id': product_id,
            'model_name': 'default-fallback',
            'model_accuracy': 0.50,  # Low accuracy for default data
            'analysis_type': 'default_fallback',
            'data_source': 'default-fallback',
            'analysis_timestamp': timestamp,
            'data_age_days': 0,
            'confidence_reduction_applied': 0.50,  # 50% confidence reduction for defaults
            
            'market_statistics': {
                'lowest_market_price': price_defaults['lowest'],
                'highest_market_price': price_defaults['highest'],
                'average_market_price': price_defaults['average'],
                'median_market_price': price_defaults['median'],
                'market_volatility': 0.25,
                'competitor_count': 3  # Conservative estimate
            },
            
            'competitive_positioning': {
                'primary_competitor': 'Market Leader',
                'competitive_relevance_score': 0.5,
                'market_share_estimate': 0.30,
                'price_positioning': 'mid-range',
                'competitive_advantages': ['Quality construction', 'Reliable performance']
            },
            
            'strategic_insights': {
                'market_position_assessment': 'mid-range',
                'recommended_strategy': 'match',
                'strategy_rationale': 'Default strategy due to insufficient competitive data. Recommend gathering more market intelligence.',
                'confidence_intervals': {
                    'price_recommendation_confidence': 0.25,  # Very low confidence
                    'market_position_confidence': 0.30,
                    'competitive_analysis_confidence': 0.20
                }
            },
            
            'data_quality_metrics': {
                'data_freshness_days': 0,
                'sample_size': 0,
                'data_completeness_score': 0.0,
                'outliers_excluded': 0
            }
        }
        
        return default_data

    # =========================================================================
    # Market Position Analysis Methods
    # =========================================================================
    # These methods analyze market position relative to competitors.
    # Requirements: 3.2

    async def _analyze_market_position(self, product_data: Dict[str, Any], 
                                  competitor_data: Dict[str, Any], session_id: str = None) -> Dict[str, Any]:
        """
        Analyze market position relative to competitors.
        
        This method calculates the product's market position by analyzing:
        - Price percentile in the market (where the product falls in the price range)
        - Market position assessment (premium, mid-premium, mid-range, value)
        - Competitive advantages and disadvantages
        - Market share implications based on pricing strategy
        
        The analysis uses competitor pricing data to determine optimal positioning
        and provides actionable insights for pricing decisions.
        
        Args:
            product_data: Product data dictionary containing:
                - product_id: Product identifier
                - cost: Product cost
                - MSRP: Manufacturer's Suggested Retail Price
                - MAP: Minimum Advertised Price
                - category: Product category
                - subcategory: Product subcategory (optional)
                - role: Product role (best, better, good, entry) (optional)
                - features: Product features list (optional)
                - attributes: Product attributes dict (optional)
                
            competitor_data: Competitor data dictionary containing:
                - market_statistics: Dict with price statistics
                    - lowest_market_price: Minimum competitor price
                    - highest_market_price: Maximum competitor price
                    - average_market_price: Mean competitor price
                    - median_market_price: Median competitor price
                    - competitor_count: Number of competitors
                - competitive_positioning: Dict with positioning info
                    - primary_competitor: Main competitor name
                    - competitive_advantages: List of advantages
                - strategic_insights: Dict with strategy recommendations
                    - confidence_intervals: Confidence scores
                
        Returns:
            Market position analysis dictionary containing:
            - price_percentile: Float (0.0-1.0) indicating where product falls in market
            - market_position_assessment: String ('premium', 'mid-premium', 'mid-range', 'value')
            - competitive_advantages: List of product advantages
            - competitive_disadvantages: List of product disadvantages
            - market_share_implications: Dict with market share analysis
            - price_range_analysis: Dict with price range details
            - positioning_confidence: Float (0.0-1.0) confidence in the analysis
            - analysis_summary: String summarizing the market position
            
        Raises:
            MarketAnalysisError: If market position analysis fails due to
                insufficient data or calculation errors.
                
        Requirements: 3.2
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> product_data = {
            ...     'product_id': 'PROD-001',
            ...     'cost': 50.00,
            ...     'MSRP': 149.99,
            ...     'MAP': 99.99,
            ...     'category': 'powertools',
            ...     'role': 'best'
            ... }
            >>> competitor_data = {
            ...     'market_statistics': {
            ...         'lowest_market_price': 79.99,
            ...         'highest_market_price': 199.99,
            ...         'average_market_price': 129.99,
            ...         'median_market_price': 119.99,
            ...         'competitor_count': 5
            ...     },
            ...     'competitive_positioning': {
            ...         'primary_competitor': 'DeWalt',
            ...         'competitive_advantages': ['Quality', 'Warranty']
            ...     }
            ... }
            >>> analysis = agent._analyze_market_position(product_data, competitor_data)
            >>> print(analysis['market_position_assessment'])
            'mid-premium'
            >>> print(analysis['price_percentile'])
            0.58
        """
        await self._add_message("Analyzing market position...", session_id=session_id)
        app.logger.info(f"Analyzing market position for product: {product_data.get('product_id')}")
        
        try:
            # Extract market statistics from competitor data
            market_stats = competitor_data.get('market_statistics', {})
            competitive_positioning = competitor_data.get('competitive_positioning', {})
            strategic_insights = competitor_data.get('strategic_insights', {})
            
            # Get price boundaries
            lowest_price = market_stats.get('lowest_market_price', 0.0)
            highest_price = market_stats.get('highest_market_price', 0.0)
            average_price = market_stats.get('average_market_price', 0.0)
            median_price = market_stats.get('median_market_price', 0.0)
            competitor_count = market_stats.get('competitor_count', 0)
            
            # Get product pricing constraints
            msrp = self._parse_price(product_data.get('MSRP', 0))
            map_price = self._parse_price(product_data.get('MAP', 0))
            cost = self._parse_price(product_data.get('cost', 0))
            
            # Use MSRP as reference price for positioning analysis
            # If MSRP is not available, use MAP or average market price
            reference_price = msrp if msrp > 0 else (map_price if map_price > 0 else average_price)
            
            # Calculate price percentile (where the product falls in the market range)
            price_percentile = self._calculate_price_percentile(
                reference_price, lowest_price, highest_price
            )
            
            # Determine market position assessment based on percentile
            market_position = self._determine_market_position(price_percentile)
            
            # Assess competitive advantages and disadvantages
            advantages, disadvantages = self._assess_competitive_factors(
                product_data, competitor_data, price_percentile
            )
            
            # Calculate market share implications
            market_share_implications = self._calculate_market_share_implications(
                price_percentile, market_position, competitor_count
            )
            
            # Build price range analysis
            price_range_analysis = {
                'lowest_market_price': lowest_price,
                'highest_market_price': highest_price,
                'average_market_price': average_price,
                'median_market_price': median_price,
                'price_spread': highest_price - lowest_price if highest_price > lowest_price else 0,
                'price_spread_percentage': ((highest_price - lowest_price) / lowest_price * 100) if lowest_price > 0 else 0,
                'reference_price': reference_price,
                'competitor_count': competitor_count
            }
            
            # Calculate positioning confidence based on data quality
            confidence_intervals = strategic_insights.get('confidence_intervals', {})
            positioning_confidence = self._calculate_positioning_confidence(
                competitor_count, 
                confidence_intervals,
                competitor_data.get('model_accuracy', 0.5)
            )
            
            # Generate analysis summary
            analysis_summary = self._generate_position_summary(
                product_data.get('product_id', 'Unknown'),
                market_position,
                price_percentile,
                competitive_positioning.get('primary_competitor', 'Unknown'),
                advantages
            )
            
            # Build the complete market position analysis result
            market_position_analysis = {
                'price_percentile': round(price_percentile, 4),
                'market_position_assessment': market_position,
                'competitive_advantages': advantages,
                'competitive_disadvantages': disadvantages,
                'market_share_implications': market_share_implications,
                'price_range_analysis': price_range_analysis,
                'positioning_confidence': round(positioning_confidence, 4),
                'analysis_summary': analysis_summary,
                'primary_competitor': competitive_positioning.get('primary_competitor', 'Unknown'),
                'competitor_count': competitor_count
            }
            
            await self._add_message(
                f"Market position analysis complete: {market_position} "
                f"(percentile: {round(price_percentile * 100, 1)}%)",
                session_id=session_id
            )
            
            app.logger.info(f"Market position analysis completed for {product_data.get('product_id')}", extra={
                'market_position': market_position,
                'price_percentile': price_percentile,
                'positioning_confidence': positioning_confidence,
                'competitor_count': competitor_count,
                'advantages_count': len(advantages),
                'disadvantages_count': len(disadvantages)
            })
            
            return market_position_analysis
            
        except Exception as e:
            error_msg = f"Failed to analyze market position: {str(e)}"
            app.logger.error(error_msg, exc_info=True, extra={
                'product_id': product_data.get('product_id', 'unknown'),
                'error_type': type(e).__name__
            })
            raise MarketAnalysisError(error_msg)

    def _parse_price(self, price_value: Any) -> float:
        """
        Parse a price value that may be a string or number.
        
        Handles various price formats including strings with currency symbols
        and comma separators.
        
        Args:
            price_value: Price value (string, int, or float)
            
        Returns:
            Parsed price as float, or 0.0 if parsing fails
        """
        if price_value is None:
            return 0.0
        
        if isinstance(price_value, (int, float)):
            return float(price_value)
        
        if isinstance(price_value, str):
            try:
                # Remove currency symbols and commas
                cleaned = price_value.replace('$', '').replace(',', '').strip()
                return float(cleaned) if cleaned else 0.0
            except (ValueError, TypeError):
                return 0.0
        
        return 0.0

    def _calculate_price_percentile(self, reference_price: float, 
                                     lowest_price: float, 
                                     highest_price: float) -> float:
        """
        Calculate the price percentile (where the product falls in the market range).
        
        A percentile of 0.0 means the product is at the lowest price point,
        while 1.0 means it's at the highest price point.
        
        Args:
            reference_price: The product's reference price (MSRP or MAP)
            lowest_price: Lowest competitor price
            highest_price: Highest competitor price
            
        Returns:
            Price percentile as float (0.0-1.0)
        """
        # Handle edge cases
        if highest_price <= lowest_price:
            return 0.5  # Default to middle if no price range
        
        if reference_price <= lowest_price:
            return 0.0
        
        if reference_price >= highest_price:
            return 1.0
        
        # Calculate percentile within the price range
        price_range = highest_price - lowest_price
        position_in_range = reference_price - lowest_price
        percentile = position_in_range / price_range
        
        return max(0.0, min(1.0, percentile))

    def _determine_market_position(self, price_percentile: float) -> str:
        """
        Determine market position assessment based on price percentile.
        
        Market positions are categorized as:
        - premium: Top 25% of price range (percentile >= 0.75)
        - mid-premium: 50-75% of price range (0.50 <= percentile < 0.75)
        - mid-range: 25-50% of price range (0.25 <= percentile < 0.50)
        - value: Bottom 25% of price range (percentile < 0.25)
        
        Args:
            price_percentile: Price percentile (0.0-1.0)
            
        Returns:
            Market position string ('premium', 'mid-premium', 'mid-range', 'value')
        """
        if price_percentile >= 0.75:
            return 'premium'
        elif price_percentile >= 0.50:
            return 'mid-premium'
        elif price_percentile >= 0.25:
            return 'mid-range'
        else:
            return 'value'

    def _assess_competitive_factors(self, product_data: Dict[str, Any],
                                     competitor_data: Dict[str, Any],
                                     price_percentile: float) -> tuple:
        """
        Assess competitive advantages and disadvantages.
        
        Analyzes product attributes, features, and market position to identify
        competitive strengths and weaknesses.
        
        Args:
            product_data: Product data dictionary
            competitor_data: Competitor data dictionary
            price_percentile: Calculated price percentile
            
        Returns:
            Tuple of (advantages list, disadvantages list)
        """
        advantages = []
        disadvantages = []
        
        # Get existing competitive advantages from competitor data
        competitive_positioning = competitor_data.get('competitive_positioning', {})
        existing_advantages = competitive_positioning.get('competitive_advantages', [])
        
        # Add existing advantages
        advantages.extend(existing_advantages)
        
        # Analyze product role for advantages
        role = product_data.get('role', '').lower()
        if role == 'best':
            advantages.append('Premium product tier positioning')
        elif role == 'better':
            advantages.append('Strong value-to-quality ratio')
        elif role == 'good':
            advantages.append('Competitive entry point')
        
        # Analyze features for advantages
        features = product_data.get('features', [])
        if features and len(features) > 3:
            advantages.append(f'Rich feature set ({len(features)} features)')
        
        # Analyze attributes for advantages
        attributes = product_data.get('attributes', {})
        if attributes.get('powerType') == 'cordless':
            advantages.append('Cordless convenience')
        if attributes.get('warranty'):
            advantages.append(f"Warranty coverage: {attributes.get('warranty')}")
        
        # Analyze price position for advantages/disadvantages
        if price_percentile < 0.3:
            advantages.append('Competitive pricing advantage')
        elif price_percentile > 0.8:
            disadvantages.append('Premium pricing may limit market reach')
        
        # Analyze margin potential
        cost = self._parse_price(product_data.get('cost', 0))
        msrp = self._parse_price(product_data.get('MSRP', 0))
        if cost > 0 and msrp > 0:
            margin = (msrp - cost) / msrp
            if margin > 0.4:
                advantages.append('Strong margin potential')
            elif margin < 0.2:
                disadvantages.append('Limited margin flexibility')
        
        # Analyze competitor count
        competitor_count = competitor_data.get('market_statistics', {}).get('competitor_count', 0)
        if competitor_count > 10:
            disadvantages.append('Highly competitive market segment')
        elif competitor_count < 3:
            advantages.append('Limited direct competition')
        
        # Remove duplicates while preserving order
        advantages = list(dict.fromkeys(advantages))
        disadvantages = list(dict.fromkeys(disadvantages))
        
        return advantages, disadvantages

    def _calculate_market_share_implications(self, price_percentile: float,
                                              market_position: str,
                                              competitor_count: int) -> Dict[str, Any]:
        """
        Calculate market share implications based on positioning.
        
        Estimates potential market share and provides strategic implications
        based on the product's price position and competitive landscape.
        
        Args:
            price_percentile: Price percentile (0.0-1.0)
            market_position: Market position assessment string
            competitor_count: Number of competitors
            
        Returns:
            Market share implications dictionary
        """
        # Base market share estimate (assuming equal distribution)
        base_share = 1.0 / max(competitor_count + 1, 2)  # +1 for our product
        
        # Adjust based on price position
        # Value positioning typically captures more volume
        # Premium positioning captures less volume but higher margins
        position_multipliers = {
            'value': 1.3,
            'mid-range': 1.1,
            'mid-premium': 0.9,
            'premium': 0.7
        }
        
        multiplier = position_multipliers.get(market_position, 1.0)
        estimated_share = min(0.5, base_share * multiplier)  # Cap at 50%
        
        # Determine strategic implications
        if market_position == 'premium':
            strategy_implication = 'Focus on quality differentiation and brand positioning'
            volume_expectation = 'Lower volume, higher margins'
        elif market_position == 'mid-premium':
            strategy_implication = 'Balance quality perception with competitive pricing'
            volume_expectation = 'Moderate volume with good margins'
        elif market_position == 'mid-range':
            strategy_implication = 'Compete on value proposition and feature set'
            volume_expectation = 'Good volume potential with standard margins'
        else:  # value
            strategy_implication = 'Emphasize cost leadership and accessibility'
            volume_expectation = 'Higher volume, lower margins'
        
        return {
            'estimated_market_share': round(estimated_share, 4),
            'market_share_percentage': round(estimated_share * 100, 2),
            'strategy_implication': strategy_implication,
            'volume_expectation': volume_expectation,
            'competitive_intensity': 'high' if competitor_count > 5 else ('medium' if competitor_count > 2 else 'low')
        }

    def _calculate_positioning_confidence(self, competitor_count: int,
                                           confidence_intervals: Dict[str, float],
                                           model_accuracy: float) -> float:
        """
        Calculate confidence in the market position analysis.
        
        Combines multiple factors to determine overall confidence:
        - Number of competitors (more data = higher confidence)
        - Model accuracy from competitor data
        - Confidence intervals from strategic insights
        
        Args:
            competitor_count: Number of competitors analyzed
            confidence_intervals: Confidence scores from competitor data
            model_accuracy: Model accuracy from competitor data
            
        Returns:
            Positioning confidence as float (0.0-1.0)
        """
        # Base confidence from competitor count
        if competitor_count >= 10:
            count_confidence = 0.9
        elif competitor_count >= 5:
            count_confidence = 0.7
        elif competitor_count >= 3:
            count_confidence = 0.5
        else:
            count_confidence = 0.3
        
        # Get confidence from intervals
        market_confidence = confidence_intervals.get('market_position_confidence', 0.5)
        analysis_confidence = confidence_intervals.get('competitive_analysis_confidence', 0.5)
        
        # Weighted average of confidence factors
        # Model accuracy: 30%, Count confidence: 30%, Market confidence: 20%, Analysis confidence: 20%
        overall_confidence = (
            model_accuracy * 0.30 +
            count_confidence * 0.30 +
            market_confidence * 0.20 +
            analysis_confidence * 0.20
        )
        
        return max(0.1, min(1.0, overall_confidence))

    def _generate_position_summary(self, product_id: str,
                                    market_position: str,
                                    price_percentile: float,
                                    primary_competitor: str,
                                    advantages: List[str]) -> str:
        """
        Generate a human-readable summary of the market position analysis.
        
        Args:
            product_id: Product identifier
            market_position: Market position assessment
            price_percentile: Price percentile (0.0-1.0)
            primary_competitor: Name of primary competitor
            advantages: List of competitive advantages
            
        Returns:
            Summary string describing the market position
        """
        percentile_pct = round(price_percentile * 100, 1)
        
        position_descriptions = {
            'premium': 'positioned at the premium end of the market',
            'mid-premium': 'positioned in the upper-mid market segment',
            'mid-range': 'positioned in the competitive mid-market segment',
            'value': 'positioned as a value option in the market'
        }
        
        position_desc = position_descriptions.get(market_position, 'positioned in the market')
        
        summary = f"Product {product_id} is {position_desc} "
        summary += f"(price percentile: {percentile_pct}%). "
        
        if primary_competitor and primary_competitor != 'Unknown':
            summary += f"Primary competitor: {primary_competitor}. "
        
        if advantages:
            top_advantages = advantages[:3]  # Limit to top 3
            summary += f"Key advantages: {', '.join(top_advantages)}."
        
        return summary

    # =========================================================================
    # Price Position Calculation Methods
    # =========================================================================
    # These methods determine optimal price positioning strategy and calculate
    # recommended prices based on competitive landscape analysis.
    # Requirements: 3.3

    async def _calculate_price_position(self, product_data: Dict[str, Any],
                                   market_analysis: Dict[str, Any],
                                   competitor_data: Dict[str, Any], session_id: str = None) -> Dict[str, Any]:
        """
        Determine optimal price position strategy and calculate recommended price.
        
        This method analyzes the competitive landscape and market position to
        determine the optimal pricing strategy. It considers:
        - Market position assessment (premium, mid-premium, mid-range, value)
        - Competitor pricing data (median, average, range)
        - Product constraints (MAP, MSRP, cost)
        - Strategic insights from competitor analysis
        
        The method calculates a recommended price based on the selected strategy
        and ensures it falls within MAP and MSRP constraints.
        
        Args:
            product_data: Product data dictionary containing:
                - product_id: Product identifier
                - cost: Product cost
                - MSRP: Manufacturer's Suggested Retail Price
                - MAP: Minimum Advertised Price
                - category: Product category
                - role: Product role (best, better, good, entry) (optional)
                
            market_analysis: Market position analysis dictionary containing:
                - price_percentile: Float (0.0-1.0) indicating market position
                - market_position_assessment: String ('premium', 'mid-premium', etc.)
                - competitive_advantages: List of product advantages
                - competitive_disadvantages: List of product disadvantages
                - positioning_confidence: Float (0.0-1.0) confidence score
                
            competitor_data: Competitor data dictionary containing:
                - market_statistics: Dict with price statistics
                    - lowest_market_price: Minimum competitor price
                    - highest_market_price: Maximum competitor price
                    - average_market_price: Mean competitor price
                    - median_market_price: Median competitor price
                - strategic_insights: Dict with strategy recommendations
                    - recommended_strategy: Suggested strategy
                    - confidence_intervals: Confidence scores
                
        Returns:
            Price position recommendation dictionary containing:
            - recommended_price: Float - calculated optimal price
            - price_position_strategy: String - strategy name
                ('undercut', 'match', 'premium_position', 'value_leader')
            - strategy_rationale: String - explanation for the recommendation
            - price_range: Dict with min/max recommended prices
            - margin_analysis: Dict with margin calculations
            - confidence_score: Float (0.0-1.0) confidence in recommendation
            - constraints_applied: List of constraints that affected the price
            
        Requirements: 3.3
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> product_data = {
            ...     'product_id': 'PROD-001',
            ...     'cost': 50.00,
            ...     'MSRP': 149.99,
            ...     'MAP': 99.99,
            ...     'category': 'powertools',
            ...     'role': 'best'
            ... }
            >>> market_analysis = {
            ...     'price_percentile': 0.65,
            ...     'market_position_assessment': 'mid-premium',
            ...     'competitive_advantages': ['Quality', 'Warranty'],
            ...     'positioning_confidence': 0.75
            ... }
            >>> competitor_data = {
            ...     'market_statistics': {
            ...         'median_market_price': 129.99,
            ...         'average_market_price': 134.99,
            ...         'lowest_market_price': 89.99,
            ...         'highest_market_price': 179.99
            ...     },
            ...     'strategic_insights': {
            ...         'recommended_strategy': 'premium_position'
            ...     }
            ... }
            >>> result = agent._calculate_price_position(product_data, market_analysis, competitor_data)
            >>> print(result['price_position_strategy'])
            'premium_position'
            >>> print(result['recommended_price'])
            145.59
        """
        await self._add_message("Calculating optimal price position...", session_id=session_id)
        app.logger.info(f"Calculating price position for product: {product_data.get('product_id')}")
        
        try:
            # Extract product pricing constraints
            msrp = self._parse_price(product_data.get('MSRP', 0))
            map_price = self._parse_price(product_data.get('MAP', 0))
            cost = self._parse_price(product_data.get('cost', 0))
            product_role = product_data.get('role', '').lower()
            
            # Validate cost is positive
            if cost <= 0:
                raise MarketAnalysisError(f"Product cost must be positive, got: {cost}")
            
            # Extract market statistics
            market_stats = competitor_data.get('market_statistics', {})
            median_price = market_stats.get('median_market_price', 0)
            average_price = market_stats.get('average_market_price', 0)
            lowest_price = market_stats.get('lowest_market_price', 0)
            highest_price = market_stats.get('highest_market_price', 0)
            
            # Extract strategic insights
            strategic_insights = competitor_data.get('strategic_insights', {})
            suggested_strategy = strategic_insights.get('recommended_strategy', 'match')
            
            # Extract market position analysis
            market_position = market_analysis.get('market_position_assessment', 'mid-range')
            price_percentile = market_analysis.get('price_percentile', 0.5)
            positioning_confidence = market_analysis.get('positioning_confidence', 0.5)
            advantages = market_analysis.get('competitive_advantages', [])
            disadvantages = market_analysis.get('competitive_disadvantages', [])
            
            # Determine optimal strategy based on multiple factors
            strategy = self._determine_optimal_strategy(
                suggested_strategy=suggested_strategy,
                market_position=market_position,
                product_role=product_role,
                advantages=advantages,
                disadvantages=disadvantages,
                price_percentile=price_percentile
            )
            
            # Calculate recommended price based on strategy
            base_price = self._calculate_strategy_price(
                strategy=strategy,
                median_price=median_price,
                average_price=average_price,
                lowest_price=lowest_price,
                highest_price=highest_price
            )
            
            # Use shared pricing utilities to calculate boundaries and apply constraints
            # This handles MAP=0 and MSRP=0 cases consistently across all agents
            # Default minimum margin of 20% for competitive pricing
            min_margin = 0.20
            
            try:
                boundaries = calculate_pricing_boundaries(
                    cost=cost,
                    map_price=map_price if map_price > 0 else None,
                    msrp=msrp if msrp > 0 else None,
                    min_margin=min_margin,
                    default_ceiling_multiplier=3.0
                )
                
                price_floor = boundaries['floor']
                price_ceiling = boundaries['ceiling']
                
                app.logger.info(f"Pricing boundaries calculated", extra={
                    'cost': cost,
                    'map': map_price,
                    'msrp': msrp,
                    'floor': price_floor,
                    'ceiling': price_ceiling,
                    'floor_source': boundaries['floor_source'],
                    'ceiling_source': boundaries['ceiling_source'],
                    'boundaries_valid': boundaries['boundaries_valid']
                })
                
            except ValueError as e:
                app.logger.error(f"Error calculating pricing boundaries: {e}")
                raise MarketAnalysisError(f"Failed to calculate pricing boundaries: {str(e)}")
            
            # Apply constraints to ensure price is within boundaries
            constraints_applied = []
            recommended_price = apply_pricing_constraints(base_price, price_floor, price_ceiling)
            
            # Track which constraints were applied
            if base_price < price_floor:
                if boundaries['floor_source'] == 'map':
                    constraints_applied.append(f"MAP constraint applied (min: ${round_to_nearest_dollar(map_price):.0f})")
                else:
                    constraints_applied.append(f"Margin constraint applied (min: ${round_to_nearest_dollar(price_floor):.0f})")
                app.logger.debug(f"Price adjusted to floor: {price_floor}")
            
            if base_price > price_ceiling:
                if boundaries['ceiling_source'] == 'msrp':
                    constraints_applied.append(f"MSRP constraint applied (max: ${round_to_nearest_dollar(msrp):.0f})")
                else:
                    constraints_applied.append(f"Default ceiling constraint applied (max: ${round_to_nearest_dollar(price_ceiling):.0f})")
                app.logger.debug(f"Price adjusted to ceiling: {price_ceiling}")
            
            # Round to nearest dollar
            recommended_price = round_to_nearest_dollar(recommended_price)
            
            # Ensure recommended price is never 0
            if recommended_price <= 0:
                app.logger.error(f"Calculated price is 0 or negative: {recommended_price}")
                # Fallback to floor price if calculation results in 0
                recommended_price = round_to_nearest_dollar(price_floor)
                app.logger.warn(f"Using floor price as fallback: {recommended_price}")
            
            # Calculate margin analysis
            margin_analysis = self._calculate_margin_analysis(
                recommended_price=recommended_price,
                cost=cost,
                msrp=msrp,
                map_price=map_price
            )
            
            # Generate strategy rationale
            strategy_rationale = self._generate_strategy_rationale(
                strategy=strategy,
                market_position=market_position,
                recommended_price=recommended_price,
                median_price=median_price,
                advantages=advantages,
                margin_analysis=margin_analysis
            )
            
            # Add information about pricing constraints to rationale
            if boundaries['floor_source'] == 'map':
                strategy_rationale += f" Price floor set by MAP (${round_to_nearest_dollar(map_price):.0f})."
            else:
                strategy_rationale += f" Price floor set by margin requirements (${round_to_nearest_dollar(price_floor):.0f})."
            
            if boundaries['ceiling_source'] == 'msrp':
                strategy_rationale += f" Price ceiling set by MSRP (${round_to_nearest_dollar(msrp):.0f})."
            else:
                strategy_rationale += f" Price ceiling set by default (3x cost = ${round_to_nearest_dollar(price_ceiling):.0f})."
            
            # Calculate price range (recommended +/- 5%), constrained by boundaries
            price_range = {
                'min': round_to_nearest_dollar(
                    apply_pricing_constraints(recommended_price * 0.95, price_floor, price_ceiling)
                ),
                'max': round_to_nearest_dollar(
                    apply_pricing_constraints(recommended_price * 1.05, price_floor, price_ceiling)
                )
            }
            
            # Calculate confidence score for the recommendation
            confidence_score = self._calculate_price_confidence(
                positioning_confidence=positioning_confidence,
                strategy=strategy,
                constraints_applied=constraints_applied,
                margin_analysis=margin_analysis
            )
            
            # Build the complete price position result
            price_position_result = {
                'recommended_price': recommended_price,
                'price_position_strategy': strategy,
                'strategy_rationale': strategy_rationale,
                'price_range': price_range,
                'margin_analysis': margin_analysis,
                'confidence_score': round(confidence_score, 4),
                'constraints_applied': constraints_applied,
                'base_price_before_constraints': round_to_nearest_dollar(base_price),
                'market_reference_price': median_price,
                'price_vs_median': round((recommended_price / median_price - 1) * 100, 2) if median_price > 0 else 0,
                'pricing_boundaries': {
                    'floor': round_to_nearest_dollar(price_floor),
                    'ceiling': round_to_nearest_dollar(price_ceiling),
                    'floor_source': boundaries['floor_source'],
                    'ceiling_source': boundaries['ceiling_source'],
                    'boundaries_valid': boundaries['boundaries_valid']
                }
            }
            
            await self._add_message(
                f"Price position calculated: {strategy} strategy at ${recommended_price:.0f} "
                f"(confidence: {round(confidence_score * 100, 1)}%)",
                session_id=session_id
            )
            
            app.logger.info(f"Price position calculated for {product_data.get('product_id')}", extra={
                'strategy': strategy,
                'recommended_price': recommended_price,
                'confidence_score': confidence_score,
                'constraints_count': len(constraints_applied),
                'margin_percentage': margin_analysis.get('margin_percentage', 0)
            })
            
            return price_position_result
            
        except Exception as e:
            error_msg = f"Failed to calculate price position: {str(e)}"
            app.logger.error(error_msg, exc_info=True, extra={
                'product_id': product_data.get('product_id', 'unknown'),
                'error_type': type(e).__name__
            })
            raise MarketAnalysisError(error_msg)

    def _determine_optimal_strategy(self, suggested_strategy: str,
                                     market_position: str,
                                     product_role: str,
                                     advantages: List[str],
                                     disadvantages: List[str],
                                     price_percentile: float) -> str:
        """
        Determine the optimal pricing strategy based on multiple factors.
        
        Considers the suggested strategy from competitor analysis, product role,
        market position, and competitive factors to select the best strategy.
        
        Args:
            suggested_strategy: Strategy suggested by competitor analysis
            market_position: Current market position assessment
            product_role: Product role (best, better, good, entry)
            advantages: List of competitive advantages
            disadvantages: List of competitive disadvantages
            price_percentile: Current price percentile (0.0-1.0)
            
        Returns:
            Optimal strategy string ('undercut', 'match', 'premium_position', 'value_leader')
        """
        # Valid strategies
        valid_strategies = ['undercut', 'match', 'premium_position', 'value_leader']
        
        # Start with suggested strategy if valid
        if suggested_strategy in valid_strategies:
            strategy = suggested_strategy
        else:
            strategy = 'match'  # Default to match
        
        # Adjust based on product role
        role_strategy_hints = {
            'best': 'premium_position',
            'better': 'match',
            'good': 'value_leader',
            'entry': 'undercut'
        }
        
        role_hint = role_strategy_hints.get(product_role)
        
        # If product role strongly suggests a different strategy, consider it
        if role_hint:
            # Premium products should lean toward premium positioning
            if product_role == 'best' and strategy in ['undercut', 'value_leader']:
                strategy = 'premium_position'
                app.logger.debug(f"Strategy adjusted to premium_position based on 'best' product role")
            # Entry products should lean toward value positioning
            elif product_role == 'entry' and strategy == 'premium_position':
                strategy = 'value_leader'
                app.logger.debug(f"Strategy adjusted to value_leader based on 'entry' product role")
        
        # Adjust based on competitive advantages/disadvantages
        advantage_count = len(advantages)
        disadvantage_count = len(disadvantages)
        
        # Strong advantages support premium positioning
        if advantage_count >= 3 and disadvantage_count <= 1:
            if strategy == 'undercut':
                strategy = 'match'
                app.logger.debug("Strategy adjusted from undercut to match due to strong advantages")
        
        # Many disadvantages suggest more competitive pricing
        if disadvantage_count >= 3 and advantage_count <= 1:
            if strategy == 'premium_position':
                strategy = 'match'
                app.logger.debug("Strategy adjusted from premium_position to match due to disadvantages")
        
        return strategy

    def _calculate_strategy_price(self, strategy: str,
                                   median_price: float,
                                   average_price: float,
                                   lowest_price: float,
                                   highest_price: float) -> float:
        """
        Calculate the base price based on the selected strategy.
        
        Each strategy applies different multipliers to the median market price
        to achieve the desired competitive positioning.
        
        Args:
            strategy: Pricing strategy ('undercut', 'match', 'premium_position', 'value_leader')
            median_price: Median competitor price
            average_price: Average competitor price
            lowest_price: Lowest competitor price
            highest_price: Highest competitor price
            
        Returns:
            Calculated base price before constraints
        """
        # Use median as primary reference, fall back to average
        reference_price = median_price if median_price > 0 else average_price
        
        if reference_price <= 0:
            # If no reference price available, use midpoint of range
            if lowest_price > 0 and highest_price > 0:
                reference_price = (lowest_price + highest_price) / 2
            else:
                app.logger.warning("No valid reference price available for strategy calculation")
                return 0.0
        
        # Apply strategy-specific multipliers
        # These multipliers are based on the JavaScript implementation
        if strategy == 'undercut':
            # 5-10% below median (using 8% as midpoint)
            calculated_price = reference_price * 0.92
            app.logger.debug(f"Undercut strategy: {reference_price} * 0.92 = {calculated_price}")
            
        elif strategy == 'match':
            # Within 2% of median (using exact match)
            calculated_price = reference_price
            app.logger.debug(f"Match strategy: {reference_price}")
            
        elif strategy == 'premium_position':
            # 10-15% above median (using 12% as midpoint)
            calculated_price = reference_price * 1.12
            app.logger.debug(f"Premium position strategy: {reference_price} * 1.12 = {calculated_price}")
            
        elif strategy == 'value_leader':
            # Competitive but not lowest - 5% below median but at least 5% above lowest
            value_price = reference_price * 0.95
            floor_price = lowest_price * 1.05 if lowest_price > 0 else value_price
            calculated_price = max(value_price, floor_price)
            app.logger.debug(f"Value leader strategy: max({value_price}, {floor_price}) = {calculated_price}")
            
        else:
            # Default to match strategy
            calculated_price = reference_price
            app.logger.debug(f"Default (match) strategy: {reference_price}")
        
        return calculated_price

    def _calculate_margin_analysis(self, recommended_price: float,
                                    cost: float,
                                    msrp: float,
                                    map_price: float) -> Dict[str, Any]:
        """
        Calculate margin analysis for the recommended price.
        
        Provides detailed margin calculations including gross margin,
        margin percentage, and comparison to MSRP margin.
        
        Args:
            recommended_price: Calculated recommended price
            cost: Product cost
            msrp: Manufacturer's Suggested Retail Price
            map_price: Minimum Advertised Price
            
        Returns:
            Margin analysis dictionary
        """
        margin_analysis = {
            'gross_margin': 0.0,
            'margin_percentage': 0.0,
            'margin_vs_msrp': 0.0,
            'margin_health': 'unknown',
            'price_to_cost_ratio': 0.0
        }
        
        if cost > 0:
            # Calculate gross margin
            gross_margin = recommended_price - cost
            margin_analysis['gross_margin'] = round(gross_margin, 2)
            
            # Calculate margin percentage
            margin_percentage = (gross_margin / recommended_price) * 100 if recommended_price > 0 else 0
            margin_analysis['margin_percentage'] = round(margin_percentage, 2)
            
            # Calculate price to cost ratio
            margin_analysis['price_to_cost_ratio'] = round(recommended_price / cost, 2)
            
            # Determine margin health
            if margin_percentage >= 40:
                margin_analysis['margin_health'] = 'excellent'
            elif margin_percentage >= 30:
                margin_analysis['margin_health'] = 'good'
            elif margin_percentage >= 20:
                margin_analysis['margin_health'] = 'acceptable'
            elif margin_percentage >= 10:
                margin_analysis['margin_health'] = 'low'
            else:
                margin_analysis['margin_health'] = 'critical'
        
        # Calculate margin comparison to MSRP
        if msrp > 0 and cost > 0:
            msrp_margin = ((msrp - cost) / msrp) * 100
            margin_analysis['margin_vs_msrp'] = round(
                margin_analysis['margin_percentage'] - msrp_margin, 2
            )
        
        return margin_analysis

    def _generate_strategy_rationale(self, strategy: str,
                                      market_position: str,
                                      recommended_price: float,
                                      median_price: float,
                                      advantages: List[str],
                                      margin_analysis: Dict[str, Any]) -> str:
        """
        Generate a human-readable rationale for the pricing strategy.
        
        Explains why the selected strategy and price were chosen based on
        market position, competitive factors, and margin considerations.
        
        Args:
            strategy: Selected pricing strategy
            market_position: Market position assessment
            recommended_price: Calculated recommended price
            median_price: Median competitor price
            advantages: List of competitive advantages
            margin_analysis: Margin analysis dictionary
            
        Returns:
            Strategy rationale string
        """
        # Calculate price difference from median
        price_diff_pct = ((recommended_price / median_price) - 1) * 100 if median_price > 0 else 0
        
        # Strategy-specific rationale templates
        strategy_rationales = {
            'undercut': (
                f"Undercut strategy selected to gain market share. "
                f"Recommended price of ${recommended_price:.2f} is {abs(price_diff_pct):.1f}% below "
                f"the market median of ${median_price:.2f}. "
            ),
            'match': (
                f"Match strategy selected for competitive parity. "
                f"Recommended price of ${recommended_price:.2f} aligns with "
                f"the market median of ${median_price:.2f}. "
            ),
            'premium_position': (
                f"Premium positioning strategy selected to maximize margins. "
                f"Recommended price of ${recommended_price:.2f} is {price_diff_pct:.1f}% above "
                f"the market median of ${median_price:.2f}. "
            ),
            'value_leader': (
                f"Value leader strategy selected for volume optimization. "
                f"Recommended price of ${recommended_price:.2f} offers competitive value "
                f"while maintaining profitability. "
            )
        }
        
        rationale = strategy_rationales.get(strategy, f"Strategy: {strategy}. ")
        
        # Add market position context
        rationale += f"Current market position: {market_position}. "
        
        # Add advantage context if available
        if advantages:
            top_advantages = advantages[:2]
            rationale += f"Key differentiators: {', '.join(top_advantages)}. "
        
        # Add margin context
        margin_health = margin_analysis.get('margin_health', 'unknown')
        margin_pct = margin_analysis.get('margin_percentage', 0)
        if margin_health != 'unknown':
            rationale += f"Margin health: {margin_health} ({margin_pct:.1f}%)."
        
        return rationale

    def _calculate_price_confidence(self, positioning_confidence: float,
                                     strategy: str,
                                     constraints_applied: List[str],
                                     margin_analysis: Dict[str, Any]) -> float:
        """
        Calculate confidence score for the price recommendation.
        
        Combines positioning confidence with strategy-specific factors
        and constraint impacts to determine overall recommendation confidence.
        
        Args:
            positioning_confidence: Confidence from market position analysis
            strategy: Selected pricing strategy
            constraints_applied: List of constraints that affected the price
            margin_analysis: Margin analysis dictionary
            
        Returns:
            Confidence score (0.0-1.0)
        """
        # Start with positioning confidence
        confidence = positioning_confidence
        
        # Strategy confidence adjustments
        # Match strategy has highest confidence (most data-driven)
        # Undercut and premium have slightly lower confidence (more aggressive)
        strategy_confidence_factors = {
            'match': 1.0,
            'value_leader': 0.95,
            'premium_position': 0.90,
            'undercut': 0.85
        }
        
        strategy_factor = strategy_confidence_factors.get(strategy, 0.9)
        confidence *= strategy_factor
        
        # Reduce confidence if constraints were applied
        # Each constraint reduces confidence slightly
        constraint_penalty = len(constraints_applied) * 0.05
        confidence -= constraint_penalty
        
        # Adjust based on margin health
        margin_health = margin_analysis.get('margin_health', 'unknown')
        margin_confidence_factors = {
            'excellent': 1.0,
            'good': 0.95,
            'acceptable': 0.90,
            'low': 0.80,
            'critical': 0.60,
            'unknown': 0.85
        }
        
        margin_factor = margin_confidence_factors.get(margin_health, 0.85)
        confidence *= margin_factor
        
        # Ensure confidence is within valid range
        return max(0.1, min(1.0, confidence))

    # =========================================================================
    # DynamoDB Update Methods
    # =========================================================================
    # These methods update pricing records in DynamoDB with analysis results.
    # Requirements: 3.4

    async def _update_pricing_record(self, session_id: str, 
                                      analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update pricing analysis via AppSync mutation (replaces direct DynamoDB writes).
        
        This method uses AppSync to update the pricing analysis record, which automatically
        triggers subscriptions for real-time dashboard updates. This replaces the previous
        direct DynamoDB write pattern.
        
        Args:
            session_id: Pricing session identifier
            analysis: Competitive analysis results dictionary
                
        Returns:
            Update result dictionary containing:
            - status: 'success' or 'failed'
            - message: Description of the result
            - session_id: The session ID that was updated
            - updated_at: Timestamp of the update (if successful)
            
        Raises:
            DynamoDBUpdateError: If the update fails after all retry attempts.
                
        Requirements: 2.3, 2.4, 3.4, 7.4, 7.5, 10.3, 10.4
        """
        await self._add_message("Saving competitive analysis results via AppSync...", session_id=session_id)
        app.logger.info(f"Updating pricing analysis for session: {session_id}")
        
        # Validate inputs
        if not session_id:
            error_msg = "Session ID is required for pricing record update"
            app.logger.error(error_msg)
            raise DynamoDBUpdateError(error_msg)
        
        if not analysis:
            error_msg = "Analysis data is required for pricing record update"
            app.logger.error(error_msg)
            raise DynamoDBUpdateError(error_msg)
        
        # Check if AppSync client is configured
        if not self.appsync_client:
            app.logger.warning("AppSync client not configured - skipping update")
            await self._add_message("Warning: AppSync not configured, skipping update", session_id=session_id)
            return {
                'status': 'skipped',
                'message': 'AppSync not configured',
                'session_id': session_id
            }
        
        try:
            # Update pricing analysis via AppSync mutation
            # This automatically triggers the onPricingAnalysisById subscription
            result = await self.appsync_client.update_pricing_analysis(
                session_id=session_id,
                competitive_analysis=analysis,
                status='competitive_analysis_complete'
            )
            
            app.logger.info(f"Successfully updated pricing analysis for session: {session_id}", extra={
                'session_id': session_id,
                'status': 'competitive_analysis_complete',
                'updated_at': result.get('updatedAt')
            })
            
            await self._add_message("Competitive analysis results saved successfully", session_id=session_id)
            
            return {
                'status': 'success',
                'message': 'Pricing analysis updated successfully via AppSync',
                'session_id': session_id,
                'updated_at': result.get('updatedAt')
            }
            
        except Exception as e:
            error_context = f"Failed to update pricing analysis via AppSync: {str(e)}"
            app.logger.error(error_context, extra={
                'session_id': session_id,
                'error_type': type(e).__name__
            })
            
            await self._add_message(f"Warning: Failed to save results via AppSync", session_id=session_id)
            
            # Raise DynamoDBUpdateError with context (keeping same error type for compatibility)
            raise DynamoDBUpdateError(error_context)


    # =========================================================================
    # Main Orchestration Method
    # =========================================================================
    # This method orchestrates the complete competitive analysis workflow.
    # Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 5.1, 5.4, 5.5

    async def execute_analysis(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main orchestration method for competitive analysis.
        
        This method orchestrates the complete competitive analysis workflow:
        1. Extract and validate product data from payload
        2. Optionally invoke shared Lambda for additional product data
        3. Fetch competitor pricing data from S3
        4. Analyze market position relative to competitors
        5. Calculate optimal price positioning strategy
        6. Update DynamoDB with analysis results
        7. Return complete results with messages and performance metrics
        
        The workflow follows the same pattern as the demand-forecast agent,
        ensuring consistency across all agents in the multi-agent system.
        
        Args:
            payload: Invocation payload containing:
                - product: Product data object (from Step Function)
                    - product_id: Product identifier (required)
                    - cost: Product cost (required)
                    - MSRP: Manufacturer's Suggested Retail Price (required)
                    - MAP: Minimum Advertised Price (required)
                    - category: Product category (required)
                    - subcategory: Product subcategory (optional)
                    - role: Product role (best, better, good, entry) (optional)
                    - features: Product features list (optional)
                    - attributes: Product attributes dict (optional)
                - sessionId: Pricing session identifier (required)
                - user_input: Optional analysis request description
                
        Returns:
            Complete analysis results dictionary containing:
            - status: 'completed' or 'failed'
            - analysis: Dict with competitive analysis results
                - market_position_assessment: Market position string
                - price_position_strategy: Pricing strategy string
                - competitor_count: Number of competitors analyzed
                - price_percentile: Float (0.0-1.0) market position
                - recommended_price: Float - calculated optimal price
                - price_range: Dict with min/max prices
                - competitive_advantages: List of advantages
                - competitive_disadvantages: List of disadvantages
                - pricing_rationale: String explaining the recommendation
            - data_source: Source of competitor data
            - confidence_score: Float (0.0-1.0) overall confidence
            - messages: List of progress messages with timestamps
            - performance: Dict with execution metrics
                - totalDuration: Float - execution time in milliseconds
                - performanceStatus: String - 'optimal' or 'acceptable'
            - timestamp: Float - Unix timestamp of completion
            
        Raises:
            ProductDataError: If product data validation fails
            ProductNotFoundError: If product is not found in database
            LambdaInvocationError: If shared Lambda invocation fails
            CompetitorDataError: If competitor data retrieval fails
            MarketAnalysisError: If market position analysis fails
            DynamoDBUpdateError: If database update fails
            
        Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 5.1, 5.4, 5.5
        
        Example:
            >>> agent = CompetitiveAnalysisAgent()
            >>> payload = {
            ...     'product': {
            ...         'product_id': 'PROD-001',
            ...         'cost': 50.00,
            ...         'MSRP': 149.99,
            ...         'MAP': 99.99,
            ...         'category': 'powertools'
            ...     },
            ...     'sessionId': 'session-123'
            ... }
            >>> result = await agent.execute_analysis(payload)
            >>> print(result['status'])
            'completed'
            >>> print(result['analysis']['recommended_price'])
            129.99
        """
        # Track start time for performance metrics
        start_time = time.time()
        
        # Extract product data and session ID from payload
        product_data = payload.get('product', {})
        session_id = payload.get('sessionId') or payload.get('session_id')
        product_id = product_data.get('product_id', 'unknown')
        
        app.logger.info(f"Starting competitive analysis for product {product_id}, session {session_id}", extra={
            'product_id': product_id,
            'session_id': session_id,
            'category': product_data.get('category'),
            'has_product_data': bool(product_data)
        })
        
        await self._add_message(f"Starting competitive analysis for product {product_id}", session_id=session_id)
        
        try:
            # Step 1: Validate product data from Step Function payload
            # The Step Functions orchestrator provides complete product data,
            # so we typically don't need to fetch additional data from Lambda.
            # This ensures all required fields are present before proceeding.
            await self._validate_product_data(product_data, session_id=session_id)
            
            # Step 2: Use product data from Step Functions payload
            # The orchestrator already provides all necessary fields:
            # product_id, cost, MSRP, MAP, category, subcategory, role, vendor, features, attributes
            # No need to invoke shared Lambda unless data is incomplete (rare edge case)
            app.logger.info(f"Using product data from Step Functions payload for {product_id}", extra={
                'has_cost': 'cost' in product_data,
                'has_msrp': 'MSRP' in product_data,
                'has_map': 'MAP' in product_data,
                'has_category': 'category' in product_data,
                'has_subcategory': 'subcategory' in product_data,
                'has_role': 'role' in product_data
            })
            
            # Step 3: Fetch competitor pricing data from S3
            # This retrieves historical competitor data or generates defaults
            category = product_data.get('category', 'general')
            competitor_data = await self._get_competitor_data(product_id, category, session_id=session_id)
            
            # Step 4: Analyze market position relative to competitors
            # This calculates price percentile, advantages, and market share implications
            market_analysis = await self._analyze_market_position(product_data, competitor_data, session_id=session_id)
            
            # Step 5: Calculate optimal price positioning strategy
            # This determines the recommended price based on competitive landscape
            price_position = await self._calculate_price_position(
                product_data, market_analysis, competitor_data, session_id=session_id
            )
            
            # Step 6: Build complete analysis result for DynamoDB storage
            complete_analysis = self._build_complete_analysis(
                product_data=product_data,
                competitor_data=competitor_data,
                market_analysis=market_analysis,
                price_position=price_position
            )
            
            # Step 7: Update pricing analysis via AppSync (replaces direct DynamoDB writes)
            # This stores the analysis and sets status to "competitive_analysis_complete"
            # Automatically triggers subscriptions for real-time dashboard updates
            await self._update_pricing_record(session_id, complete_analysis)
            
            # Calculate performance metrics
            total_duration = (time.time() - start_time) * 1000  # milliseconds
            performance_status = 'optimal' if total_duration < 30000 else 'acceptable'
            
            await self._add_message(f"Competitive analysis complete in {total_duration:.0f}ms", session_id=session_id)
            
            app.logger.info(f"Competitive analysis completed successfully for {product_id}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'total_duration_ms': total_duration,
                'performance_status': performance_status,
                'recommended_price': price_position.get('recommended_price'),
                'strategy': price_position.get('price_position_strategy'),
                'confidence_score': price_position.get('confidence_score')
            })
            
            # Return complete results matching the expected response structure
            return {
                'status': 'completed',
                'analysis': {
                    'market_position_assessment': market_analysis.get('market_position_assessment'),
                    'price_position_strategy': price_position.get('price_position_strategy'),
                    'competitor_count': market_analysis.get('competitor_count', 0),
                    'price_percentile': market_analysis.get('price_percentile', 0.5),
                    'recommended_price': price_position.get('recommended_price'),
                    'price_range': price_position.get('price_range', {}),
                    'competitive_advantages': market_analysis.get('competitive_advantages', []),
                    'competitive_disadvantages': market_analysis.get('competitive_disadvantages', []),
                    'pricing_rationale': price_position.get('strategy_rationale', ''),
                    'margin_analysis': price_position.get('margin_analysis', {}),
                    'constraints_applied': price_position.get('constraints_applied', [])
                },
                'data_source': competitor_data.get('data_source', 'unknown'),
                'confidence_score': price_position.get('confidence_score', 0.5),
                'messages': self.messages,
                'performance': {
                    'totalDuration': total_duration,
                    'performanceStatus': performance_status
                },
                'timestamp': time.time()
            }
            
        except ProductDataError as e:
            app.logger.error(f"Product data error: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'ProductDataError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': f"Product data validation failed: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except ProductNotFoundError as e:
            app.logger.error(f"Product not found: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'ProductNotFoundError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': f"Product not found: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except LambdaInvocationError as e:
            app.logger.error(f"Lambda invocation error: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'LambdaInvocationError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': f"Failed to invoke shared Lambda: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except CompetitorDataError as e:
            app.logger.error(f"Competitor data error: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'CompetitorDataError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': f"Failed to retrieve competitor data: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except MarketAnalysisError as e:
            app.logger.error(f"Market analysis error: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'MarketAnalysisError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': f"Market analysis failed: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except DynamoDBUpdateError as e:
            app.logger.error(f"AppSync update error: {e}", extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': 'DynamoDBUpdateError'
            })
            await self._add_message(f"Error: {str(e)}", session_id=session_id)
            
            # For AppSync errors, we still have the analysis results
            # Return partial success with warning
            return {
                'status': 'partial',
                'error': f"Analysis complete but failed to save: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except Exception as e:
            app.logger.error(f"Unexpected error during competitive analysis: {e}", exc_info=True, extra={
                'product_id': product_id,
                'session_id': session_id,
                'error_type': type(e).__name__
            })
            await self._add_message(f"Unexpected error: {str(e)}", session_id=session_id)
            
            return {
                'status': 'failed',
                'error': str(e),
                'messages': self.messages,
                'timestamp': time.time()
            }

    def _needs_additional_product_data(self, product_data: Dict[str, Any]) -> bool:
        """
        Check if additional product data should be fetched from shared Lambda.
        
        The Step Functions orchestrator provides complete product data in the payload,
        so this method should rarely return True. It only returns True in edge cases
        where critical required fields are missing (which shouldn't happen in normal flow).
        
        Args:
            product_data: Product data from Step Function payload
            
        Returns:
            True if additional data should be fetched (rare), False otherwise (normal)
        """
        # Check if we have the shared Lambda function configured
        if not self.get_product_data_function:
            return False
        
        # Check for REQUIRED fields only (not optional fields)
        # The Step Functions orchestrator should always provide these
        required_fields = ['product_id', 'cost', 'MSRP', 'MAP', 'category']
        missing_required = [f for f in required_fields if f not in product_data or product_data[f] is None]
        
        # Only fetch additional data if required fields are missing (edge case)
        # This should not happen in normal operation
        if missing_required:
            app.logger.warning(f"Required fields missing from Step Functions payload: {missing_required}")
            return True
        
        return False

    def _build_complete_analysis(self, product_data: Dict[str, Any],
                                  competitor_data: Dict[str, Any],
                                  market_analysis: Dict[str, Any],
                                  price_position: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build the complete analysis result for DynamoDB storage.
        
        Combines all analysis components into a single structure that matches
        the expected schema for the competitiveAnalysis field in DynamoDB.
        
        Args:
            product_data: Validated product data
            competitor_data: Competitor pricing data from S3
            market_analysis: Market position analysis results
            price_position: Price positioning calculation results
            
        Returns:
            Complete analysis dictionary for DynamoDB storage
        """
        return {
            # Product identification
            'product_id': product_data.get('product_id'),
            'category': product_data.get('category'),
            'subcategory': product_data.get('subcategory'),
            
            # Market position analysis
            'market_position_assessment': market_analysis.get('market_position_assessment'),
            'price_percentile': market_analysis.get('price_percentile'),
            'competitive_advantages': market_analysis.get('competitive_advantages', []),
            'competitive_disadvantages': market_analysis.get('competitive_disadvantages', []),
            'market_share_implications': market_analysis.get('market_share_implications', {}),
            'primary_competitor': market_analysis.get('primary_competitor'),
            'competitor_count': market_analysis.get('competitor_count', 0),
            
            # Price position strategy
            'price_position_strategy': price_position.get('price_position_strategy'),
            'recommended_price': price_position.get('recommended_price'),
            'price_range': price_position.get('price_range', {}),
            'strategy_rationale': price_position.get('strategy_rationale'),
            'margin_analysis': price_position.get('margin_analysis', {}),
            'constraints_applied': price_position.get('constraints_applied', []),
            'confidence_score': price_position.get('confidence_score'),
            
            # Market statistics
            'market_statistics': competitor_data.get('market_statistics', {}),
            
            # Data quality and source
            'data_source': competitor_data.get('data_source', 'unknown'),
            'model_name': competitor_data.get('model_name', 'unknown'),
            'model_accuracy': competitor_data.get('model_accuracy', 0.5),
            'data_age_days': competitor_data.get('data_age_days', 0),
            
            # Timestamp
            'analysis_timestamp': datetime.now().isoformat()
        }


# =============================================================================
# AgentCore Entry Point
# =============================================================================
# This is the main entry point called by AgentCore Runtime when the agent
# is invoked. It handles payload parsing, agent instantiation, and execution.
# Requirements: 1.2

@app.entrypoint
async def invoke(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    AgentCore entry point for Competitive Analysis Agent.
    
    This function is called by AgentCore Runtime when the agent is invoked.
    It instantiates the agent, executes the analysis, and returns results.
    
    The function handles:
    - Payload parsing and validation
    - Agent instantiation
    - Analysis execution
    - Error handling and response formatting
    
    Args:
        payload: Invocation payload containing:
            - product: Product data object (required)
                - product_id: Product identifier
                - cost: Product cost
                - MSRP: Manufacturer's Suggested Retail Price
                - MAP: Minimum Advertised Price
                - category: Product category
            - sessionId: Pricing session identifier (required)
            - user_input: Analysis request description (optional)
    
    Returns:
        Agent execution result containing:
            - status: 'completed', 'partial', or 'failed'
            - analysis: Competitive analysis results (if successful)
                - market_position_assessment: Market position string
                - price_position_strategy: Pricing strategy string
                - competitor_count: Number of competitors analyzed
                - price_percentile: Float (0.0-1.0) market position
                - recommended_price: Float - calculated optimal price
                - price_range: Dict with min/max prices
                - competitive_advantages: List of advantages
                - competitive_disadvantages: List of disadvantages
                - pricing_rationale: String explaining the recommendation
            - data_source: Source of competitor data
            - confidence_score: Float (0.0-1.0) overall confidence
            - messages: Real-time progress messages
            - performance: Execution performance metrics
            - timestamp: Unix timestamp
            - error: Error message (if failed)
    
    Raises:
        Exception: If agent execution fails unexpectedly
    
    Requirements: 1.2
    
    Example:
        >>> # This function is called by AgentCore Runtime
        >>> payload = {
        ...     'product': {
        ...         'product_id': 'PROD-001',
        ...         'cost': 50.00,
        ...         'MSRP': 149.99,
        ...         'MAP': 99.99,
        ...         'category': 'powertools'
        ...     },
        ...     'sessionId': 'session-123'
        ... }
        >>> result = await invoke(payload)
        >>> print(result['status'])
        'completed'
    """
    # Extract session ID and product data from payload
    # Support both 'sessionId' (camelCase) and 'session_id' (snake_case)
    session_id = payload.get('sessionId') or payload.get('session_id')
    product_data = payload.get('product', {})
    product_id = product_data.get('product_id', 'unknown')
    
    app.logger.info("Competitive Analysis Agent invoked", extra={
        'session_id': session_id,
        'product_id': product_id,
        'has_product_data': bool(product_data),
        'category': product_data.get('category')
    })
    
    try:
        # Validate required parameters
        if not product_data:
            raise ValueError('Missing required parameter: product')
        
        if not session_id:
            raise ValueError('Missing required parameter: sessionId')
        
        # Instantiate the Competitive Analysis Agent
        # The agent uses lazy-loaded AWS clients for optimal startup time
        agent = CompetitiveAnalysisAgent()
        
        # Execute the competitive analysis workflow
        # This orchestrates all analysis steps and returns complete results
        result = await agent.execute_analysis(payload)
        
        app.logger.info("Agent execution completed successfully", extra={
            'status': result.get('status'),
            'duration': result.get('performance', {}).get('totalDuration'),
            'recommended_price': result.get('analysis', {}).get('recommended_price'),
            'strategy': result.get('analysis', {}).get('price_position_strategy')
        })
        
        return result
        
    except ValueError as e:
        # Handle validation errors (missing required parameters)
        app.logger.error(f"Validation error: {e}", extra={
            'session_id': session_id,
            'product_id': product_id,
            'error_type': 'ValueError'
        })
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': time.time()
        }
    
    except Exception as e:
        # Handle unexpected errors during agent execution
        app.logger.error(f"Unexpected error during agent execution: {e}", exc_info=True, extra={
            'session_id': session_id,
            'product_id': product_id,
            'error_type': type(e).__name__
        })
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': time.time()
        }


# =============================================================================
# Local Testing Entry Point
# =============================================================================
# This block enables local testing of the agent without deploying to AgentCore.
# Requirements: 1.1

if __name__ == "__main__":
    """
    Local testing entry point.
    
    Run locally with:
        python agent_handler.py
    
    Then test with:
        curl -X POST http://localhost:8080/invocations \
             -H "Content-Type: application/json" \
             -d '{
                 "product": {
                     "product_id": "TEST-001",
                     "cost": 50.00,
                     "MSRP": 149.99,
                     "MAP": 99.99,
                     "category": "powertools"
                 },
                 "sessionId": "test-session"
             }'
    
    Requirements: 1.1
    """
    print("Starting Competitive Analysis Agent in local mode...")
    print("Listening on http://localhost:8080")
    print("\nTest with:")
    print('  curl -X POST http://localhost:8080/invocations \\')
    print('       -H "Content-Type: application/json" \\')
    print('       -d \'{')
    print('           "product": {')
    print('               "product_id": "TEST-001",')
    print('               "cost": 50.00,')
    print('               "MSRP": 149.99,')
    print('               "MAP": 99.99,')
    print('               "category": "powertools"')
    print('           },')
    print('           "sessionId": "test-session"')
    print('       }\'')
    print()
    
    app.run()
