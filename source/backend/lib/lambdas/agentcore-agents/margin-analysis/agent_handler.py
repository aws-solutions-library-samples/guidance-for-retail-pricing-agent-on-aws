"""
AgentCore Margin Analysis Agent - Pure Python Implementation.

This module implements the complete margin analysis agent in pure Python,
eliminating the need for subprocess calls to JavaScript. The agent runs
natively in Amazon Bedrock AgentCore Runtime.

Architecture:
- Single Python file with all agent logic
- Direct AWS service integration using boto3
- Internal methods for agent-specific operations
- Product data passed directly from Step Function orchestrator
- Synthesizes demand forecast and competitive analysis results
- Applies margin rules and compliance validation

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
"""

import json
import os
import time
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal, ROUND_DOWN

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
from shared.pricing_utils import round_to_nearest_dollar

# Initialize AgentCore app (only enable debug if explicitly requested)
app = BedrockAgentCoreApp(debug=os.environ.get('LOG_LEVEL') == 'DEBUG')

# System prompt defining agent behavior and instructions
SYSTEM_PROMPT = """
You are a Margin Analysis Agent specializing in retail pricing synthesis and compliance.

Your role is to:
1. Synthesize demand forecast and competitive analysis results
2. Apply margin rules and constraints for product categories
3. Validate pricing compliance (MAP, margin, MSRP)
4. Generate final pricing recommendations with comprehensive rationale
5. Determine if manual review is required

Analysis Steps:
1. Validate product data from Step Function payload (cost, MSRP, MAP, category, role)
2. Retrieve demand forecast results from DynamoDB
3. Retrieve competitive analysis results from DynamoDB
4. Fetch margin rules for product category and role
5. Synthesize pricing recommendation combining all inputs
6. Validate compliance (MAP, margin, MSRP)
7. Update pricing record with final recommendation

Compliance Checks:
- MAP Compliance: Recommended price >= MAP (Minimum Advertised Price)
- Margin Compliance: Calculated margin >= minimum margin threshold
- MSRP Compliance: Recommended price <= MSRP (Manufacturer's Suggested Retail Price)

Output Format:
- Final recommended price with confidence level
- Comprehensive pricing rationale explaining synthesis
- Compliance status with detailed checks
- Margin calculations and validation
- Review requirement flag if compliance issues exist

Be thorough, transparent, and provide clear explanations for all recommendations.
Ensure all pricing recommendations comply with business rules and constraints.
"""


# Custom exception classes for error handling
class AgentExecutionError(Exception):
    """Base exception for agent execution errors."""
    pass


class LambdaInvocationError(AgentExecutionError):
    """Error invoking a shared Lambda function."""
    pass


class ProductNotFoundError(AgentExecutionError):
    """Product not found in database."""
    pass


class DemandForecastError(AgentExecutionError):
    """Error retrieving demand forecast results."""
    pass


class CompetitiveResultsError(AgentExecutionError):
    """Error retrieving competitive analysis results."""
    pass


class MarginRulesError(AgentExecutionError):
    """Error retrieving margin rules."""
    pass


class ComplianceError(AgentExecutionError):
    """Error validating compliance."""
    pass


class DynamoDBUpdateError(AgentExecutionError):
    """Error updating DynamoDB pricing record."""
    pass


class MarginAnalysisAgent:
    """
    Margin Analysis Agent for retail pricing synthesis and compliance.
    
    This agent synthesizes demand forecast and competitive analysis results,
    applies margin rules and constraints, validates compliance, and generates
    final pricing recommendations.
    
    The agent receives complete product data from the Step Functions orchestrator
    in the payload, eliminating the need for Lambda invocations in normal operation.
    
    Architecture:
    - Lazy-loaded AWS clients (S3, DynamoDB) to minimize initialization time
    - Internal methods for all agent-specific operations
    - Progress message tracking for real-time updates
    - Comprehensive error handling with custom exceptions
    
    Requirements: 2.6, 5.1
    """
    
    def __init__(self):
        """
        Initialize the Margin Analysis Agent with minimal setup.
        
        AWS service clients are lazy-loaded on first use to minimize
        initialization time and avoid the 30-second AgentCore timeout.
        
        Sets up:
        - Message tracking for real-time updates
        - Environment variable references
        - Configuration parameters for margin thresholds
        - Lazy client initialization (clients created on-demand)
        - Pricing record cache for efficient data retrieval
        - AppSync client for real-time communication
        
        Note: No Lambda client needed - Step Functions provides complete product data
        
        Requirements: 2.6, 5.1, 10.1, 10.2, 10.3
        """
        # Lazy-loaded AWS service clients (initialized on first access)
        self._s3_client = None
        self._dynamodb = None
        self._appsync_client = None  # Lazy-loaded AppSync client
        
        # Initialize message tracking list for real-time updates
        self.messages: List[Dict[str, Any]] = []
        
        # Pricing record cache for efficient DynamoDB access
        # Eliminates redundant reads when fetching demand and competitive data
        self._pricing_record_cache = None
        self._pricing_record_session_id = None
        
        # Environment variable references (fast - no network calls)
        self.pricing_table_name = os.environ.get('PRICING_TABLE_NAME')
        self.training_data_bucket = os.environ.get('TRAINING_DATA_BUCKET')
        self.appsync_endpoint = os.environ.get('APPSYNC_ENDPOINT')
        self.aws_region = os.environ.get('AWS_REGION', 'us-east-1')
        
        # Configuration parameters for margin thresholds
        self.default_min_margin = 0.20  # 20% minimum margin
        self.target_margin_best = 0.35  # 35% target for "Best" tier
        self.target_margin_better = 0.30  # 30% target for "Better" tier
        self.target_margin_good = 0.25  # 25% target for "Good" tier
        self.target_margin_entry = 0.20  # 20% target for "Entry" tier
        self.max_retries = 3  # DynamoDB update retries
        
        app.logger.info("MarginAnalysisAgent initialized (lazy loading enabled)", extra={
            'pricing_table': self.pricing_table_name,
            'training_bucket': self.training_data_bucket,
            'default_min_margin': self.default_min_margin,
            'appsync_endpoint_configured': bool(self.appsync_endpoint)
        })
    
    @property
    def s3_client(self):
        """
        Lazy-load S3 client on first access.
        
        S3 client is used for:
        - Retrieving margin rules from S3 bucket
        - Accessing training data and historical pricing data
        
        The client is only initialized when first accessed, minimizing
        startup time and avoiding the 30-second AgentCore timeout.
        
        Returns:
            boto3.client: Initialized S3 client
            
        Requirements: 2.6, 5.2
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
        
        DynamoDB resource is used for:
        - Retrieving demand forecast results from pricing table
        - Retrieving competitive analysis results from pricing table
        - Updating pricing records with final recommendations
        
        The resource is only initialized when first accessed, minimizing
        startup time and avoiding the 30-second AgentCore timeout.
        
        Returns:
            boto3.resource: Initialized DynamoDB resource
            
        Requirements: 2.6, 5.2
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
    def appsync_client(self):
        """
        Lazy-load AppSync client on first access.
        
        AppSync client is used for:
        - Writing real-time messages to SessionChat table
        - Updating session status via GraphQL mutations
        - Triggering real-time subscriptions for dashboard updates
        
        The client is only initialized when first accessed, minimizing
        startup time and avoiding the 30-second AgentCore timeout.
        
        Returns:
            AppSyncClient: Initialized AppSync client or None if not configured
            
        Requirements: 7.1, 10.1, 10.2
        """
        if self._appsync_client is None and self.appsync_endpoint:
            app.logger.debug("Initializing AppSync client")
            self._appsync_client = AppSyncClient(
                appsync_endpoint=self.appsync_endpoint,
                region=self.aws_region
            )
            app.logger.info("AppSync client initialized for real-time communication", extra={
                'appsync_endpoint': self.appsync_endpoint,
                'region': self.aws_region
            })
        return self._appsync_client
    
    def _add_message(self, message: str) -> None:
        """
        Add a progress message with timestamp to the message tracking list.
        
        Progress messages provide real-time updates on agent execution status
        and are included in the final response for transparency and debugging.
        Each message includes:
        - Agent name identifier
        - Timestamp in ISO 8601 format
        - Message text describing the current operation
        
        Messages are accumulated throughout agent execution and returned
        in the final response to provide a complete audit trail.
        
        NOTE: This method only adds messages to the local list. For real-time
        updates via AppSync, use _write_message_to_appsync() in async context.
        
        Args:
            message: The progress message text to add
            
        Example:
            self._add_message("Retrieved demand forecast results")
            # Adds: {
            #   "agent": "margin-analysis",
            #   "timestamp": "2024-01-15T10:30:45.123Z",
            #   "message": "Retrieved demand forecast results"
            # }
            
        Requirements: 4.7
        """
        timestamp = datetime.utcnow().isoformat() + 'Z'
        message_entry = {
            'agent': 'margin-analysis',
            'timestamp': timestamp,
            'message': message
        }
        self.messages.append(message_entry)
        
        # Log the message for CloudWatch monitoring
        app.logger.info(f"[margin-analysis] {message}", extra={
            'timestamp': timestamp,
            'agent': 'margin-analysis'
        })
    
    def truncate_decimal(self, value, places):
        """
        Truncate a numeric value to the given number of decimal places using ROUND_DOWN.
        
        Args:
            value: Numeric value to truncate (float, int, or Decimal)
            places: Number of decimal places to keep
            
        Returns:
            float: Truncated value
            
        Example:
            >>> agent.truncate_decimal(0.876543, 2)
            0.87
        """
        # Convert to Decimal if not already
        if not isinstance(value, Decimal):
            d = Decimal(str(value))
        else:
            d = value
        
        # Create a quantization template like '0.01' for 2 places
        if places == 0:
            quantize_template = Decimal('1')
        else:
            # Create template: '0.01' for 2 places, '0.001' for 3 places, etc.
            quantize_template = Decimal(10) ** -places
        
        # Apply quantization with ROUND_DOWN strategy
        truncated = d.quantize(quantize_template, rounding=ROUND_DOWN)
        
        # Return as float for JSON serialization
        return float(truncated)


    async def _write_message_to_appsync(self, session_id: str, message: str) -> None:
        """
        Write a progress message to AppSync for real-time frontend updates.
        
        This method writes messages to the SessionChat table via AppSync mutation,
        which automatically triggers the onChatMessageBySession subscription for
        real-time updates in the dashboard.
        
        The method is non-blocking - if AppSync write fails, it logs the error
        but does not fail the agent execution. This ensures agent reliability
        even if real-time communication is temporarily unavailable.
        
        Args:
            session_id: Session identifier for the pricing analysis
            message: Progress message text to write
            
        Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
        """
        if not self.appsync_client:
            app.logger.debug("AppSync client not configured - skipping real-time message write")
            return
        
        try:
            await self.appsync_client.write_message(
                session_id=session_id,
                agent_id='margin-analysis',
                agent_name='Margin Analysis Agent',
                message=message,
                sender_type='agent'
            )
            app.logger.debug(f"Message written to AppSync: {message[:50]}...")
        except Exception as e:
            # Non-blocking - log error but don't fail agent execution
            app.logger.error(f"Failed to write message to AppSync: {e}", extra={
                'session_id': session_id,
                'message': message[:100],
                'error': str(e)
            })
    
    def _parse_product_data_fields(self, product_data: Dict[str, Any]) -> None:
        """
        Parse JSON string fields in product data (defensive coding).
        
        Handles cases where attributes or features are stored as JSON strings
        (including double-encoded JSON) instead of native Python objects.
        This prevents 'str' object has no attribute 'get' errors.
        
        Modifies product_data in-place to ensure:
        - attributes is always a dict (empty dict if missing/invalid)
        - features is always a list (empty list if missing/invalid)
        
        Args:
            product_data: Product data dictionary that may contain JSON strings
            
        Example:
            >>> product_data = {
            ...     'attributes': '"{\\\"powerType\\\":\\\"cordless\\\"}"'
            ... }
            >>> agent._parse_product_data_fields(product_data)
            >>> print(product_data['attributes'])
            {'powerType': 'cordless'}
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
    
    async def _fetch_pricing_record(self, session_id: str, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch the complete pricing record from DynamoDB with caching.
        
        This method retrieves the entire pricing record once and caches it
        for subsequent access, eliminating redundant DynamoDB calls.
        
        Architecture:
        - First call: Fetches from DynamoDB and caches result
        - Subsequent calls: Returns cached data (unless force_refresh=True)
        - Cache is session-specific (invalidated if session_id changes)
        
        Performance Benefits:
        - Reduces DynamoDB read operations from 2 to 1 per agent execution
        - Eliminates 50-100ms of latency from redundant network calls
        - Ensures data consistency (both fields from same record version)
        - Reduces DynamoDB read costs by 50%
        
        Args:
            session_id: Pricing session identifier
            force_refresh: If True, bypass cache and fetch fresh data
            
        Returns:
            Complete pricing record dictionary containing:
            - id: Session identifier
            - PK: Partition key (PRICING#{session_id})
            - SK: Sort key (METADATA)
            - status: Current workflow status
            - demandForecast: Demand forecast analysis (JSON string)
            - competitiveAnalysis: Competitive analysis (JSON string)
            - marginAnalysis: Margin analysis (JSON string, if exists)
            - product: Product data
            - userId: User identifier
            - createdAt: Creation timestamp
            - updatedAt: Last update timestamp
            
        Raises:
            DynamoDBUpdateError: If DynamoDB query fails or record not found
            
        Requirements: 2.6, 4.1, 4.2
        
        Example:
            >>> agent = MarginAnalysisAgent()
            >>> record = await agent._fetch_pricing_record("session-123")
            >>> print(record['status'])
            'competitive_analysis_complete'
            >>> # Second call uses cache - no DynamoDB call
            >>> record2 = await agent._fetch_pricing_record("session-123")
        """
        # Check if we have cached data for this session
        if (not force_refresh and 
            self._pricing_record_cache is not None and 
            self._pricing_record_session_id == session_id):
            
            app.logger.debug(f"Using cached pricing record for session {session_id}")
            self._add_message("Using cached pricing record data")
            return self._pricing_record_cache
        
        # Cache miss or force refresh - fetch from DynamoDB
        self._add_message(f"Fetching pricing record from database for session {session_id}")
        app.logger.info(f"Fetching pricing record from DynamoDB", extra={
            'session_id': session_id,
            'table_name': self.pricing_table_name,
            'cache_miss': self._pricing_record_cache is None,
            'force_refresh': force_refresh
        })
        
        try:
            # Get DynamoDB table
            table = self.dynamodb.Table(self.pricing_table_name)
            
            # Fetch the complete record with all fields using composite key
            # Using ConsistentRead for strong consistency
            response = table.get_item(
                Key={
                    'PK': f'PRICING#{session_id}',
                    'SK': 'METADATA'
                },
                ConsistentRead=True  # Ensure we get the latest data
            )
            
            # Check if record exists
            if 'Item' not in response:
                error_msg = f"Pricing record not found for session {session_id}"
                app.logger.error(error_msg, extra={
                    'session_id': session_id,
                    'table_name': self.pricing_table_name,
                    'key_used': f'PK=PRICING#{session_id}, SK=METADATA'
                })
                raise DynamoDBUpdateError(error_msg)
            
            # Extract the complete record
            pricing_record = response['Item']
            
            # Cache the record for subsequent access
            self._pricing_record_cache = pricing_record
            self._pricing_record_session_id = session_id
            
            app.logger.info(f"Successfully fetched and cached pricing record", extra={
                'session_id': session_id,
                'status': pricing_record.get('status'),
                'has_demand_forecast': 'demandForecast' in pricing_record,
                'has_competitive_analysis': 'competitiveAnalysis' in pricing_record,
                'record_size_bytes': len(json.dumps(pricing_record, default=str))
            })
            
            self._add_message("Pricing record fetched and cached successfully")
            
            return pricing_record
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            app.logger.error(f"DynamoDB error fetching pricing record", extra={
                'session_id': session_id,
                'error_code': error_code,
                'error_message': error_message,
                'table_name': self.pricing_table_name
            })
            
            if error_code == 'ResourceNotFoundException':
                raise DynamoDBUpdateError(
                    f"DynamoDB table not found: {self.pricing_table_name}"
                )
            else:
                raise DynamoDBUpdateError(
                    f"Failed to fetch pricing record from DynamoDB: {error_message}"
                )
        
        except DynamoDBUpdateError:
            # Re-raise our custom errors
            raise
        
        except Exception as e:
            app.logger.error(f"Unexpected error fetching pricing record", extra={
                'session_id': session_id,
                'error': str(e),
                'error_type': type(e).__name__
            })
            raise DynamoDBUpdateError(
                f"Unexpected error fetching pricing record: {str(e)}"
            )
    
    async def _get_demand_forecast_results(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch demand forecast results from cached pricing record.
        
        This method uses the cached pricing record instead of making a separate
        DynamoDB call, improving performance and reducing costs. The pricing record
        is fetched once via _fetch_pricing_record() and cached for subsequent access.
        
        The demand forecast data is stored as a JSON string in the demandForecast
        field by the demand-forecast agent. This method:
        1. Fetches the complete pricing record (uses cache if available)
        2. Extracts the demandForecast field
        3. Parses the JSON string to a Python dictionary
        4. Validates the data structure
        5. Returns formatted demand forecast information
        
        Data Structure (from demand-forecast agent):
        {
            "recommended_price": float,
            "price_floor": float,
            "price_ceiling": float,
            "pricing_rationale": str,
            "confidence_p10": float,
            "confidence_p50": float,
            "confidence_p90": float,
            "current_confidence_score": float,
            "demand_level": str,
            "ytd_performance": dict,
            "trend": str,
            "seasonality_detected": bool,
            "volatility_assessment": str,
            "data_source": str
        }
        
        Args:
            session_id: Pricing session identifier
            
        Returns:
            Dictionary containing demand forecast results with:
            - recommended_price: Demand-based price recommendation
            - confidence: Confidence score (0-1)
            - analysis: Detailed demand analysis data
            - _metadata: Retrieval metadata
            
            Returns None if:
            - Pricing record not found
            - demandForecast field is missing
            - Data cannot be parsed
            
        Raises:
            DemandForecastError: If DynamoDB query fails or data is invalid
            
        Example:
            results = await self._get_demand_forecast_results("session-123")
            if results:
                price = results['recommended_price']
                confidence = results['confidence']
                
        Requirements: 4.1
        """
        self._add_message(f"Retrieving demand forecast results for session {session_id}")
        
        try:
            # Fetch the complete pricing record (uses cache if available)
            pricing_record = await self._fetch_pricing_record(session_id)
            
            app.logger.info(f"Extracting demand forecast from pricing record", extra={
                'session_id': session_id,
                'record_status': pricing_record.get('status')
            })
            
            # Check if demandForecast field exists
            if 'demandForecast' not in pricing_record or not pricing_record['demandForecast']:
                app.logger.warn(f"demandForecast field not found in pricing record", extra={
                    'session_id': session_id,
                    'status': pricing_record.get('status'),
                    'updated_at': pricing_record.get('updatedAt'),
                    'available_fields': list(pricing_record.keys())
                })
                self._add_message("Warning: Demand forecast data not yet available")
                return None
            
            # Parse JSON string to dictionary
            demand_forecast_str = pricing_record['demandForecast']
            try:
                demand_data = json.loads(demand_forecast_str) if isinstance(demand_forecast_str, str) else demand_forecast_str
            except json.JSONDecodeError as e:
                app.logger.error(f"Failed to parse demandForecast JSON", extra={
                    'session_id': session_id,
                    'error': str(e)
                })
                raise DemandForecastError(
                    f"demandForecast field contains invalid JSON: {str(e)}"
                )
            
            # Validate required fields
            required_fields = ['recommended_price', 'current_confidence_score']
            missing_fields = [field for field in required_fields if field not in demand_data]
            
            if missing_fields:
                app.logger.warn(f"Demand forecast data missing required fields", extra={
                    'session_id': session_id,
                    'missing_fields': missing_fields
                })
                # Continue with partial data - graceful degradation
            
            # Extract and format key information
            extracted_data = {
                'recommended_price': None,
                'confidence': None,
                'analysis': {}
            }
            
            # Extract recommended price
            if 'recommended_price' in demand_data:
                try:
                    price = float(demand_data['recommended_price'])
                    if price > 0:
                        extracted_data['recommended_price'] = price
                except (ValueError, TypeError) as e:
                    app.logger.warn(f"Invalid recommended_price value", extra={
                        'session_id': session_id,
                        'value': demand_data['recommended_price'],
                        'error': str(e)
                    })
            
            # Extract confidence score
            if 'current_confidence_score' in demand_data:
                try:
                    confidence = float(demand_data['current_confidence_score'])
                    if 0 <= confidence <= 1:
                        extracted_data['confidence'] = confidence
                except (ValueError, TypeError) as e:
                    app.logger.warn(f"Invalid confidence score value", extra={
                        'session_id': session_id,
                        'value': demand_data['current_confidence_score'],
                        'error': str(e)
                    })
            
            # Extract analysis details
            extracted_data['analysis'] = {
                'price_floor': demand_data.get('price_floor'),
                'price_ceiling': demand_data.get('price_ceiling'),
                'pricing_rationale': demand_data.get('pricing_rationale'),
                'confidence_intervals': {
                    'p10': demand_data.get('confidence_p10'),
                    'p50': demand_data.get('confidence_p50'),
                    'p90': demand_data.get('confidence_p90')
                },
                'demand_patterns': {
                    'ytd_performance': demand_data.get('ytd_performance'),
                    'trend': demand_data.get('trend'),
                    'seasonality_detected': demand_data.get('seasonality_detected'),
                    'volatility_assessment': demand_data.get('volatility_assessment')
                },
                'metadata': {
                    'demand_level': demand_data.get('demand_level'),
                    'data_source': demand_data.get('data_source')
                }
            }
            
            # Remove None values to keep data clean
            extracted_data['analysis'] = self._remove_none_values(extracted_data['analysis'])
            
            # Add metadata about the retrieval
            result = {
                **extracted_data,
                '_metadata': {
                    'session_id': session_id,
                    'retrieved_at': datetime.utcnow().isoformat() + 'Z',
                    'table_name': self.pricing_table_name,
                    'data_complete': bool(extracted_data['recommended_price'] and extracted_data['confidence'])
                }
            }
            
            app.logger.info(f"Successfully retrieved demand forecast results", extra={
                'session_id': session_id,
                'has_recommended_price': bool(result['recommended_price']),
                'has_confidence': bool(result['confidence']),
                'confidence': result['confidence'],
                'data_complete': result['_metadata']['data_complete']
            })
            
            # Format confidence message with None check
            if result['confidence'] is not None:
                confidence_msg = f"Retrieved demand forecast results (confidence: {result['confidence']:.2f})"
            else:
                confidence_msg = "Retrieved demand forecast results (confidence: unavailable)"
            
            self._add_message(confidence_msg)
            await self._write_message_to_appsync(session_id, confidence_msg)
            
            return result
            
        except DynamoDBUpdateError as e:
            # Convert DynamoDB errors to DemandForecastError for consistency
            app.logger.error(f"Database error retrieving demand forecast", extra={
                'session_id': session_id,
                'error': str(e)
            })
            raise DemandForecastError(f"Failed to retrieve demand forecast: {str(e)}")
                
        except DemandForecastError:
            # Re-raise our custom errors
            raise
            
        except Exception as e:
            app.logger.error(f"Unexpected error retrieving demand forecast results", extra={
                'session_id': session_id,
                'error': str(e),
                'error_type': type(e).__name__
            })
            raise DemandForecastError(
                f"Unexpected error retrieving demand forecast results: {str(e)}"
            )
    
    async def _get_competitive_results(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch competitive analysis results from cached pricing record.
        
        This method uses the cached pricing record instead of making a separate
        DynamoDB call, improving performance and reducing costs. The pricing record
        is fetched once via _fetch_pricing_record() and cached for subsequent access.
        
        The competitive analysis data is stored as a JSON string in the
        competitiveAnalysis field (or legacy webScrap field) by the
        competitive-analysis agent. This method:
        1. Fetches the complete pricing record (uses cache if available)
        2. Extracts the competitiveAnalysis field (or webScrap as fallback)
        3. Parses the JSON string to a Python dictionary
        4. Validates the data structure
        5. Returns formatted competitive analysis information
        
        Data Structure (from competitive-analysis agent):
        {
            "recommended_price": float,
            "confidence_score": float,
            "competitor_prices": [
                {
                    "name": str,
                    "price": float,
                    "market_share": float,
                    "features": list
                }
            ],
            "market_statistics": {
                "average_price": float,
                "median_price": float,
                "min_price": float,
                "max_price": float,
                "price_range": float,
                "competitor_count": int
            },
            "market_position": str,
            "price_advantage": float,
            "competitive_gap": float,
            "positioning_strategy": str,
            "primary_competitor": str or dict,  # Can be string name or dict with details
            "pricing_rationale": str,
            "competitive_advantages": list,
            "strategy_rationale": str,
            "price_range": dict,
            "constraints_applied": list,
            "margin_analysis": dict,
            "market_position_assessment": str,
            "analysis_timestamp": str,
            "data_sources": list,
            "scraping_quality": str,
            "model_version": str
        }
        
        Args:
            session_id: Pricing session identifier
            
        Returns:
            Dictionary containing competitive analysis results with:
            - recommended_price: Competitive-based price recommendation
            - confidence_score: Confidence score (0-1)
            - analysis: Detailed competitive analysis data including all available fields
            - _metadata: Retrieval metadata
            
            Returns None if:
            - Pricing record not found
            - competitiveAnalysis field is missing
            - Data cannot be parsed
            
        Raises:
            CompetitiveResultsError: If DynamoDB query fails or data is invalid
            
        Example:
            results = await self._get_competitive_results("session-123")
            if results:
                price = results['recommended_price']
                confidence = results['confidence_score']
                
        Requirements: 4.2
        """
        self._add_message(f"Retrieving competitive analysis results for session {session_id}")
        
        try:
            # Fetch the complete pricing record (uses cache if available)
            pricing_record = await self._fetch_pricing_record(session_id)
            
            app.logger.info(f"Extracting competitive analysis from pricing record", extra={
                'session_id': session_id,
                'record_status': pricing_record.get('status')
            })
            
            # Check if competitiveAnalysis field exists (support both field names)
            competitive_field = pricing_record.get('competitiveAnalysis') or pricing_record.get('webScrap')
            if not competitive_field:
                app.logger.warn(f"competitiveAnalysis field not found in pricing record", extra={
                    'session_id': session_id,
                    'status': pricing_record.get('status'),
                    'updated_at': pricing_record.get('updatedAt'),
                    'available_fields': list(pricing_record.keys())
                })
                self._add_message("Warning: Competitive analysis data not yet available")
                return None
            
            # Parse JSON string to dictionary
            try:
                competitive_data = json.loads(competitive_field) if isinstance(competitive_field, str) else competitive_field
            except json.JSONDecodeError as e:
                app.logger.error(f"Failed to parse competitiveAnalysis JSON", extra={
                    'session_id': session_id,
                    'error': str(e)
                })
                raise CompetitiveResultsError(
                    f"competitiveAnalysis field contains invalid JSON: {str(e)}"
                )
            
            # Validate required fields
            required_fields = ['recommended_price', 'confidence_score']
            missing_fields = [field for field in required_fields if field not in competitive_data]
            
            if missing_fields:
                app.logger.warn(f"Competitive analysis data missing required fields", extra={
                    'session_id': session_id,
                    'missing_fields': missing_fields
                })
                # Continue with partial data - graceful degradation
            
            # Extract and format key information
            extracted_data = {
                'recommended_price': None,
                'confidence_score': None,
                'analysis': {}
            }
            
            # Extract recommended base price
            if 'recommended_price' in competitive_data:
                try:
                    price_value = competitive_data['recommended_price']
                    # Handle string prices with dollar signs
                    if isinstance(price_value, str):
                        price_value = price_value.replace('$', '').replace(',', '').strip()
                    price = float(price_value)
                    if price > 0:
                        extracted_data['recommended_price'] = price
                except (ValueError, TypeError) as e:
                    app.logger.warn(f"Invalid recommended_price value", extra={
                        'session_id': session_id,
                        'value': competitive_data['recommended_price'],
                        'error': str(e)
                    })
            
            # Extract confidence score
            if 'confidence_score' in competitive_data:
                try:
                    confidence = float(competitive_data['confidence_score'])
                    if 0 <= confidence <= 1:
                        extracted_data['confidence_score'] = confidence
                except (ValueError, TypeError) as e:
                    app.logger.warn(f"Invalid confidence_score value", extra={
                        'session_id': session_id,
                        'value': competitive_data['confidence_score'],
                        'error': str(e)
                    })
            
            # Extract competitor prices
            competitor_prices = []
            if 'competitor_prices' in competitive_data and isinstance(competitive_data['competitor_prices'], list):
                for competitor in competitive_data['competitor_prices']:
                    if isinstance(competitor, dict):
                        competitor_info = {
                            'name': competitor.get('name'),
                            'price': self._parse_price(competitor.get('price')),
                            'market_share': competitor.get('market_share'),
                            'features': competitor.get('features', [])
                        }
                        competitor_prices.append(competitor_info)
            
            # Extract market statistics
            market_stats = {}
            if 'market_statistics' in competitive_data and isinstance(competitive_data['market_statistics'], dict):
                stats = competitive_data['market_statistics']
                market_stats = {
                    'average_price': self._parse_price(stats.get('average_market_price')),
                    'median_price': self._parse_price(stats.get('median_market_price')),
                    'min_price': self._parse_price(stats.get('lowest_market_price')),
                    'max_price': self._parse_price(stats.get('highest_market_price')),
                    'price_range': self._parse_price(stats.get('price_range')),
                    'competitor_count': stats.get('competitor_count')
                }
            
            # Extract competitive positioning
            competitive_positioning = {
                'market_position': competitive_data.get('market_position'),
                'price_advantage': self._parse_price(competitive_data.get('price_advantage')),
                'competitive_gap': self._parse_price(competitive_data.get('competitive_gap')),
                'positioning_strategy': competitive_data.get('positioning_strategy')
            }
            
            # Extract primary competitor (handle both string and dict types)
            primary_competitor = {}
            if 'primary_competitor' in competitive_data:
                pc = competitive_data['primary_competitor']
                if isinstance(pc, dict):
                    # Dict format with detailed information
                    primary_competitor = {
                        'name': pc.get('name'),
                        'price': self._parse_price(pc.get('price')),
                        'market_share': pc.get('market_share'),
                        'competitive_advantage': pc.get('competitive_advantage')
                    }
                elif isinstance(pc, str):
                    # String format with just the name
                    primary_competitor = {
                        'name': pc,
                        'price': None,
                        'market_share': None,
                        'competitive_advantage': None
                    }
            
            # Build analysis structure with all available fields
            extracted_data['analysis'] = {
                'competitor_prices': competitor_prices,
                'market_statistics': market_stats,
                'competitive_positioning': competitive_positioning,
                'primary_competitor': primary_competitor,
                'pricing_rationale': competitive_data.get('pricing_rationale'),
                'competitive_advantages': competitive_data.get('competitive_advantages', []),
                'strategy_rationale': competitive_data.get('strategy_rationale'),
                'price_range': competitive_data.get('price_range'),
                'constraints_applied': competitive_data.get('constraints_applied', []),
                'margin_analysis': competitive_data.get('margin_analysis'),
                'market_position_assessment': competitive_data.get('market_position_assessment'),
                'metadata': {
                    'analysis_timestamp': competitive_data.get('analysis_timestamp'),
                    'data_sources': competitive_data.get('data_sources', []),
                    'scraping_quality': competitive_data.get('scraping_quality'),
                    'model_version': competitive_data.get('model_version')
                }
            }
            
            # Remove None values to keep data clean
            extracted_data['analysis'] = self._remove_none_values(extracted_data['analysis'])
            
            # Add metadata about the retrieval
            result = {
                **extracted_data,
                '_metadata': {
                    'session_id': session_id,
                    'retrieved_at': datetime.utcnow().isoformat() + 'Z',
                    'table_name': self.pricing_table_name,
                    'data_complete': bool(extracted_data['recommended_price'] and extracted_data['confidence_score'])
                }
            }
            
            app.logger.info(f"Successfully retrieved competitive analysis results", extra={
                'session_id': session_id,
                'has_recommended_price': bool(result['recommended_price']),
                'has_confidence': bool(result['confidence_score']),
                'confidence': result['confidence_score'],
                'competitor_count': len(competitor_prices),
                'data_complete': result['_metadata']['data_complete']
            })
            
            # Format confidence message with None check
            if result['confidence_score'] is not None:
                confidence_msg = f"Retrieved competitive analysis results (confidence: {result['confidence_score']:.2f}, {len(competitor_prices)} competitors)"
            else:
                confidence_msg = f"Retrieved competitive analysis results (confidence: unavailable, {len(competitor_prices)} competitors)"
            
            self._add_message(confidence_msg)
            await self._write_message_to_appsync(session_id, confidence_msg)

            return result
            
        except DynamoDBUpdateError as e:
            # Convert DynamoDB errors to CompetitiveResultsError for consistency
            app.logger.error(f"Database error retrieving competitive analysis", extra={
                'session_id': session_id,
                'error': str(e)
            })
            await self._write_message_to_appsync(session_id, f"DynamoDBUpdateError: Failed to retrieve competitive analysis: {str(e)}")
            raise CompetitiveResultsError(f"Failed to retrieve competitive analysis: {str(e)}")
                
        except CompetitiveResultsError:
            # Re-raise our custom errors
            raise
            
        except Exception as e:
            app.logger.error(f"Unexpected error retrieving competitive analysis results", extra={
                'session_id': session_id,
                'error': str(e),
                'error_type': type(e).__name__
            })
            await self._write_message_to_appsync(session_id, f"Unexpected error retrieving competitive analysis results: {str(e)}")
            raise CompetitiveResultsError(
                f"Unexpected error retrieving competitive analysis results: {str(e)}"
            )
    
    def _parse_price(self, price_value: Any) -> Optional[float]:
        """
        Parse a price value that may be a string with dollar signs or a number.
        
        Handles various price formats:
        - "$99.99" -> 99.99
        - "99.99" -> 99.99
        - 99.99 -> 99.99
        - "$1,234.56" -> 1234.56
        
        Args:
            price_value: Price value to parse (string, int, float, or None)
            
        Returns:
            Parsed price as float, or None if invalid
            
        Example:
            price = self._parse_price("$99.99")  # Returns 99.99
            price = self._parse_price(None)      # Returns None
        """
        if price_value is None:
            return None
        
        try:
            # Handle string prices with dollar signs and commas
            if isinstance(price_value, str):
                price_value = price_value.replace('$', '').replace(',', '').strip()
            
            price = float(price_value)
            return price if price > 0 else None
            
        except (ValueError, TypeError):
            return None
    
    def _remove_none_values(self, obj: Any) -> Any:
        """
        Recursively remove None values from dictionaries and lists.
        
        Cleans up data structures by removing None values to keep
        the output clean and reduce payload size.
        
        Args:
            obj: Object to clean (dict, list, or other)
            
        Returns:
            Cleaned object with None values removed
            
        Example:
            data = {'a': 1, 'b': None, 'c': {'d': None, 'e': 2}}
            cleaned = self._remove_none_values(data)
            # Returns: {'a': 1, 'c': {'e': 2}}
        """
        if obj is None:
            return obj
        
        if isinstance(obj, dict):
            cleaned = {}
            for key, value in obj.items():
                if value is not None:
                    if isinstance(value, (dict, list)):
                        cleaned_value = self._remove_none_values(value)
                        if cleaned_value or isinstance(cleaned_value, (bool, int, float)):
                            cleaned[key] = cleaned_value
                    else:
                        cleaned[key] = value
            return cleaned
        
        if isinstance(obj, list):
            return [self._remove_none_values(item) for item in obj if item is not None]
        
        return obj
    
    async def _get_margin_rules(self, category: str, role: str) -> Dict[str, Any]:
        """
        Fetch margin rules from S3 with fallback to hardcoded defaults.
        
        Retrieves margin rules configuration from S3 bucket, with comprehensive
        fallback to hardcoded default rules if S3 is unavailable or fails.
        Implements retry logic with exponential backoff (3 attempts).
        
        The margin rules define:
        - Role-based margin requirements (Best, Better, Good, Entry)
        - Feature adjustments (battery types, premium features)
        - Volume adjustments based on annual targets
        - Seasonal adjustments for pricing optimization
        - Compliance rules (MAP enforcement, margin floors)
        
        Data Structure:
        {
            "version": str,
            "last_updated": str (ISO 8601),
            "role_based": {
                "Best": {
                    "target_margin": float (0-1),
                    "min_margin": float (0-1),
                    "max_margin": float (0-1),
                    "promo_floor": float (0-1),
                    "max_volume_discount": float (0-1),
                    "description": str
                },
                # ... other roles
            },
            "feature_adjustments": {
                "battery": {
                    "60V_MAX": {"adjustment": float, "description": str},
                    # ... other battery types
                },
                "features": {
                    "metal_blade_guard": {"adjustment": float, "description": str},
                    # ... other features
                }
            },
            "volume_adjustments": {
                "high_volume": {"threshold": int, "adjustment": float, "description": str},
                # ... other volume tiers
            },
            "seasonal_adjustments": {
                "peak": {"adjustment": float, "description": str},
                # ... other seasons
            },
            "compliance_rules": {
                "map_enforcement": {"enabled": bool, "description": str},
                "margin_floor_enforcement": {"enabled": bool, "description": str},
                "review_thresholds": {
                    "low_margin_review": float,
                    "high_margin_review": float,
                    "description": str
                }
            },
            "calculation_rules": {
                "margin_formula": str,
                "rounding_precision": int,
                "currency": str,
                "price_increment": float
            }
        }
        
        Args:
            category: Product category (e.g., "powertools", "handtools")
            role: Product role/tier (e.g., "Best", "Better", "Good", "Entry")
            
        Returns:
            Dictionary containing margin rules with:
            - role_config: Role-specific margin requirements
            - feature_adjustments: Feature-based margin adjustments
            - volume_adjustments: Volume-based margin adjustments
            - seasonal_adjustments: Seasonal margin adjustments
            - compliance_rules: Compliance enforcement rules
            - calculation_rules: Margin calculation rules
            - _metadata: Retrieval metadata (source, timestamp, etc.)
            
        Raises:
            MarginRulesError: If both S3 fetch and fallback fail
            
        Example:
            rules = await self._get_margin_rules("powertools", "Best")
            min_margin = rules['role_config']['min_margin']
            target_margin = rules['role_config']['target_margin']
            
        Requirements: 4.3
        """
        self._add_message(f"Fetching margin rules for category={category}, role={role}")
        
        # Hardcoded default margin rules as fallback
        DEFAULT_MARGIN_RULES = {
            "version": "1.0",
            "last_updated": datetime.utcnow().isoformat() + 'Z',
            "description": "Default fallback margin rules configuration",
            "metadata": {
                "created_by": "margin_analysis_agent",
                "environment": "fallback",
                "schema_version": "1.0"
            },
            "role_based": {
                "Best": {
                    "target_margin": 0.45,
                    "min_margin": 0.40,
                    "max_margin": 0.55,
                    "promo_floor": 0.35,
                    "max_volume_discount": 0.10,
                    "description": "Premium tier products with highest margin requirements"
                },
                "Better": {
                    "target_margin": 0.40,
                    "min_margin": 0.35,
                    "max_margin": 0.50,
                    "promo_floor": 0.30,
                    "max_volume_discount": 0.12,
                    "description": "High-quality products with strong margin requirements"
                },
                "Good": {
                    "target_margin": 0.35,
                    "min_margin": 0.30,
                    "max_margin": 0.45,
                    "promo_floor": 0.25,
                    "max_volume_discount": 0.15,
                    "description": "Standard quality products with moderate margin requirements"
                },
                "Entry": {
                    "target_margin": 0.30,
                    "min_margin": 0.25,
                    "max_margin": 0.40,
                    "promo_floor": 0.20,
                    "max_volume_discount": 0.18,
                    "description": "Entry-level products with competitive margin requirements"
                }
            },
            "feature_adjustments": {
                "battery": {
                    "60V_MAX": {
                        "adjustment": 0.05,
                        "description": "Premium 60V MAX battery technology"
                    },
                    "40V_MAX": {
                        "adjustment": 0.03,
                        "description": "High-performance 40V MAX battery"
                    },
                    "20V_MAX": {
                        "adjustment": 0.00,
                        "description": "Standard 20V MAX battery"
                    },
                    "20V": {
                        "adjustment": -0.02,
                        "description": "Basic 20V battery technology"
                    }
                },
                "features": {
                    "metal_blade_guard": {
                        "adjustment": 0.02,
                        "description": "Premium metal blade guard for enhanced safety"
                    },
                    "premium_case": {
                        "adjustment": 0.015,
                        "description": "High-quality carrying case included"
                    },
                    "LED_light": {
                        "adjustment": 0.005,
                        "description": "Built-in LED work light"
                    },
                    "electric_brake": {
                        "adjustment": 0.01,
                        "description": "Electric brake safety feature"
                    }
                }
            },
            "volume_adjustments": {
                "high_volume": {
                    "threshold": 40000,
                    "adjustment": -0.03,
                    "description": "High volume discount for products with >40k annual target"
                },
                "medium_volume": {
                    "threshold": 30000,
                    "adjustment": -0.015,
                    "description": "Medium volume discount for products with 30k-40k annual target"
                },
                "low_volume": {
                    "threshold": 0,
                    "adjustment": 0.00,
                    "description": "No volume adjustment for products with <30k annual target"
                }
            },
            "seasonal_adjustments": {
                "peak": {
                    "adjustment": 0.02,
                    "description": "Peak season margin increase (spring/summer construction season)"
                },
                "off_season": {
                    "adjustment": -0.02,
                    "description": "Off-season margin reduction (winter months)"
                },
                "holiday": {
                    "adjustment": "dynamic",
                    "description": "Dynamic adjustment based on holiday demand patterns",
                    "calculation_method": "demand_based",
                    "min_adjustment": -0.01,
                    "max_adjustment": 0.03
                },
                "back_to_school": {
                    "adjustment": 0.01,
                    "description": "Back-to-school season moderate increase"
                },
                "end_of_year": {
                    "adjustment": -0.015,
                    "description": "End-of-year clearance adjustment"
                }
            },
            "compliance_rules": {
                "map_enforcement": {
                    "enabled": True,
                    "description": "Minimum Advertised Price enforcement"
                },
                "margin_floor_enforcement": {
                    "enabled": True,
                    "description": "Minimum margin requirements enforcement"
                },
                "review_thresholds": {
                    "low_margin_review": 0.20,
                    "high_margin_review": 0.60,
                    "description": "Margin thresholds requiring manual review"
                }
            },
            "calculation_rules": {
                "margin_formula": "(price - cost) / price",
                "rounding_precision": 2,
                "currency": "USD",
                "price_increment": 0.01
            }
        }
        
        margin_rules = None
        used_fallback = False
        
        try:
            # Attempt to fetch from S3 with retry logic
            bucket_name = self.training_data_bucket or os.environ.get('DATA_BUCKET')
            
            if not bucket_name:
                app.logger.warn("No S3 bucket configured for margin rules, using fallback")
                self._add_message("Warning: No S3 bucket configured, using default margin rules")
                margin_rules = DEFAULT_MARGIN_RULES
                used_fallback = True
            else:
                s3_key = 'margin_rules/margin_rules.json'
                
                app.logger.info(f"Attempting to fetch margin rules from S3", extra={
                    'bucket': bucket_name,
                    'key': s3_key,
                    'category': category,
                    'role': role
                })
                
                # Retry logic with exponential backoff (3 attempts: 1s, 2s, 4s)
                max_retries = 3
                base_delay = 1.0
                
                for attempt in range(max_retries):
                    try:
                        response = self.s3_client.get_object(
                            Bucket=bucket_name,
                            Key=s3_key
                        )
                        
                        rules_text = response['Body'].read().decode('utf-8')
                        margin_rules = json.loads(rules_text)
                        
                        app.logger.info(f"Successfully fetched margin rules from S3", extra={
                            'bucket': bucket_name,
                            'key': s3_key,
                            'version': margin_rules.get('version'),
                            'last_updated': margin_rules.get('last_updated'),
                            'size': len(rules_text),
                            'attempt': attempt + 1
                        })
                        
                        self._add_message(f"Retrieved margin rules from S3 (version {margin_rules.get('version')})")
                        break
                        
                    except ClientError as e:
                        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                        
                        if error_code == 'NoSuchKey':
                            app.logger.warn(f"Margin rules file not found in S3: {s3_key}")
                            margin_rules = DEFAULT_MARGIN_RULES
                            used_fallback = True
                            self._add_message(f"Warning: Margin rules not found in S3, using defaults")
                            break
                        elif error_code == 'NoSuchBucket':
                            app.logger.warn(f"S3 bucket not found: {bucket_name}")
                            margin_rules = DEFAULT_MARGIN_RULES
                            used_fallback = True
                            self._add_message(f"Warning: S3 bucket not found, using defaults")
                            break
                        else:
                            # Retry on other errors
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                app.logger.warn(f"S3 fetch failed (attempt {attempt + 1}/{max_retries}), retrying in {delay}s", extra={
                                    'error_code': error_code,
                                    'bucket': bucket_name,
                                    'key': s3_key
                                })
                                await asyncio.sleep(delay)
                            else:
                                app.logger.error(f"Failed to fetch margin rules from S3 after {max_retries} attempts", extra={
                                    'error_code': error_code,
                                    'bucket': bucket_name,
                                    'key': s3_key
                                })
                                margin_rules = DEFAULT_MARGIN_RULES
                                used_fallback = True
                                self._add_message(f"Warning: S3 fetch failed after retries, using defaults")
                                
                    except json.JSONDecodeError as e:
                        app.logger.error(f"Margin rules file contains invalid JSON", extra={
                            'bucket': bucket_name,
                            'key': s3_key,
                            'error': str(e)
                        })
                        margin_rules = DEFAULT_MARGIN_RULES
                        used_fallback = True
                        self._add_message(f"Warning: Invalid JSON in margin rules file, using defaults")
                        break
                        
                    except Exception as e:
                        if attempt < max_retries - 1:
                            delay = base_delay * (2 ** attempt)
                            app.logger.warn(f"Unexpected error fetching margin rules (attempt {attempt + 1}/{max_retries}), retrying in {delay}s", extra={
                                'error': str(e),
                                'bucket': bucket_name,
                                'key': s3_key
                            })
                            await asyncio.sleep(delay)
                        else:
                            app.logger.error(f"Unexpected error fetching margin rules after {max_retries} attempts", extra={
                                'error': str(e),
                                'bucket': bucket_name,
                                'key': s3_key
                            })
                            margin_rules = DEFAULT_MARGIN_RULES
                            used_fallback = True
                            self._add_message(f"Warning: Unexpected error, using default margin rules")
            
            # Validate that we have margin rules
            if not margin_rules:
                app.logger.error("Failed to retrieve margin rules from any source")
                raise MarginRulesError("Failed to retrieve margin rules from S3 or fallback")
            
            # Validate role exists in rules
            if 'role_based' not in margin_rules or role not in margin_rules['role_based']:
                app.logger.warn(f"Role '{role}' not found in margin rules, using 'Good' as fallback", extra={
                    'requested_role': role,
                    'available_roles': list(margin_rules.get('role_based', {}).keys())
                })
                # Fallback to 'Good' role if requested role not found
                fallback_role = 'Good' if 'Good' in margin_rules.get('role_based', {}) else list(margin_rules.get('role_based', {}).keys())[0]
                role_config = margin_rules['role_based'].get(fallback_role, {})
                self._add_message(f"Warning: Role '{role}' not found, using '{fallback_role}' as fallback")
            else:
                role_config = margin_rules['role_based'][role]
            
            # Extract and format the relevant rules
            result = {
                'role_config': role_config,
                'feature_adjustments': margin_rules.get('feature_adjustments', {}),
                'volume_adjustments': margin_rules.get('volume_adjustments', {}),
                'seasonal_adjustments': margin_rules.get('seasonal_adjustments', {}),
                'compliance_rules': margin_rules.get('compliance_rules', {}),
                'calculation_rules': margin_rules.get('calculation_rules', {}),
                '_metadata': {
                    'source': 'fallback' if used_fallback else 's3',
                    'retrieved_at': datetime.utcnow().isoformat() + 'Z',
                    'bucket_name': None if used_fallback else bucket_name,
                    'key': None if used_fallback else s3_key,
                    'version': margin_rules.get('version'),
                    'last_updated': margin_rules.get('last_updated'),
                    'category': category,
                    'role': role
                }
            }
            
            app.logger.info(f"Successfully retrieved margin rules", extra={
                'source': result['_metadata']['source'],
                'role': role,
                'category': category,
                'min_margin': role_config.get('min_margin'),
                'target_margin': role_config.get('target_margin'),
                'max_margin': role_config.get('max_margin')
            })
            
            self._add_message(f"Margin rules retrieved: min={role_config.get('min_margin'):.1%}, target={role_config.get('target_margin'):.1%}")
            
            return result
            
        except MarginRulesError:
            # Re-raise our custom errors
            raise
            
        except Exception as e:
            app.logger.error(f"Unexpected error in _get_margin_rules", extra={
                'category': category,
                'role': role,
                'error': str(e)
            })
            raise MarginRulesError(
                f"Unexpected error retrieving margin rules: {str(e)}"
            )
    
    def _validate_compliance(self, price: float, product_data: Dict[str, Any], 
                            margin_rules: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate price against compliance rules (MAP, margin, MSRP).
        
        Performs comprehensive compliance validation to ensure the recommended
        price meets all business rules and constraints:
        
        1. MAP Compliance: Price must be >= MAP (Minimum Advertised Price)
        2. Margin Compliance: Calculated margin must be >= minimum margin requirement
        3. MSRP Compliance: Price must be <= MSRP (Manufacturer's Suggested Retail Price)
        
        The method calculates the actual margin from the price and cost, then
        validates against role-based margin requirements. It determines if manual
        review is required based on compliance violations or margin thresholds.
        
        Compliance Checks:
        - MAP Check: Ensures price doesn't undercut minimum advertised price
        - Margin Check: Ensures adequate profit margin for product role
        - MSRP Check: Ensures price doesn't exceed manufacturer's suggested retail
        - Review Threshold: Flags prices requiring manual review
        
        Review Requirements:
        - Price below MAP (MAP violation)
        - Margin below minimum requirement (margin violation)
        - Price above MSRP (MSRP violation)
        - Margin significantly below target (>5% below target)
        - Margin exceeds maximum expected (opportunity for review)
        
        Args:
            price: Recommended price to validate
            product_data: Product information containing:
                - cost: Product cost for margin calculation
                - MAP: Minimum Advertised Price
                - MSRP: Manufacturer's Suggested Retail Price
                - role: Product role/tier (Best, Better, Good, Entry)
            margin_rules: Margin rules containing:
                - role_config: Role-specific margin requirements
                    - min_margin: Minimum required margin (0-1)
                    - target_margin: Target margin (0-1)
                    - max_margin: Maximum expected margin (0-1)
                - compliance_rules: Compliance enforcement rules
                    - map_enforcement: MAP enforcement settings
                    - margin_floor_enforcement: Margin floor settings
                    - review_thresholds: Review threshold settings
                
        Returns:
            Dictionary containing comprehensive compliance status:
            {
                "is_map_compliant": bool,           # Price >= MAP
                "is_margin_compliant": bool,        # Margin >= min_margin
                "is_msrp_compliant": bool,          # Price <= MSRP
                "requires_review": bool,            # Manual review required
                "compliance_details": {
                    "map_check": {
                        "passed": bool,
                        "map_price": float,
                        "recommended_price": float,
                        "difference": float,
                        "message": str
                    },
                    "margin_check": {
                        "passed": bool,
                        "calculated_margin": float,
                        "min_margin": float,
                        "target_margin": float,
                        "max_margin": float,
                        "margin_status": str,  # "optimal", "acceptable", "below_minimum", "above_maximum_opportunity", "below_target"
                        "target_difference": float,
                        "message": str
                    },
                    "msrp_check": {
                        "passed": bool,
                        "msrp": float,
                        "recommended_price": float,
                        "difference": float,
                        "message": str
                    }
                },
                "overall_status": str,              # "fully_compliant", "requires_attention", "non_compliant"
                "compliance_summary": str,          # Human-readable summary
                "review_reasons": list              # List of reasons requiring review
            }
            
        Raises:
            ComplianceError: If validation fails due to missing data or calculation errors
            
        Example:
            product_data = {
                'cost': 50.00,
                'MAP': 89.99,
                'MSRP': 129.99,
                'role': 'Good'
            }
            margin_rules = {
                'role_config': {
                    'min_margin': 0.30,
                    'target_margin': 0.35,
                    'max_margin': 0.45
                }
            }
            result = self._validate_compliance(99.99, product_data, margin_rules)
            
            if not result['requires_review']:
                print("Price is compliant, no review needed")
            else:
                print(f"Review required: {result['review_reasons']}")
                
        Requirements: 4.4
        """
        self._add_message(f"Validating compliance for price ${price:.2f}")
        
        try:
            # Extract required data
            cost = product_data.get('cost')
            map_price = product_data.get('MAP')
            msrp = product_data.get('MSRP')
            role = product_data.get('role', 'Good')
            
            # Validate required fields
            # Note: MAP and MSRP can be 0 or null - backend can handle products without these values
            if cost is None or cost <= 0:
                raise ComplianceError("Product cost is required for compliance validation")
            if price is None or price <= 0:
                raise ComplianceError("Price must be a positive number for compliance validation")
            
            # Validate MAP and MSRP are numbers if provided (but allow 0 or None)
            if map_price is not None and not isinstance(map_price, (int, float)):
                raise ComplianceError("MAP must be a number if provided")
            if msrp is not None and not isinstance(msrp, (int, float)):
                raise ComplianceError("MSRP must be a number if provided")
            
            # Extract margin requirements
            role_config = margin_rules.get('role_config', {})
            min_margin = role_config.get('min_margin', self.default_min_margin)
            target_margin = role_config.get('target_margin', 0.35)
            max_margin = role_config.get('max_margin', 0.50)
            
            app.logger.info(f"Starting compliance validation", extra={
                'price': price,
                'cost': cost,
                'map': map_price,
                'msrp': msrp,
                'role': role,
                'min_margin': min_margin,
                'target_margin': target_margin,
                'max_margin': max_margin
            })
            
            # Initialize compliance result
            compliance_result = {
                'is_map_compliant': False,
                'is_margin_compliant': False,
                'is_msrp_compliant': False,
                'requires_review': False,
                'compliance_details': {},
                'overall_status': 'unknown',
                'compliance_summary': '',
                'review_reasons': []
            }
            
            # 1. MAP Compliance Check
            # Price must be >= MAP (Minimum Advertised Price) if MAP is provided and > 0
            if map_price and map_price > 0:
                map_difference = price - map_price
                is_map_compliant = price >= map_price
                
                map_check = {
                    'passed': is_map_compliant,
                    'map_price': map_price,
                    'recommended_price': price,
                    'difference': map_difference,
                    'message': ''
                }
                
                if is_map_compliant:
                    if map_difference < 1.0:  # Very close to MAP
                        map_check['message'] = f"Price ${price:.2f} meets MAP requirement (${map_price:.2f}) but is very close to minimum"
                        app.logger.info(f"MAP compliance: PASS (close to minimum)", extra={
                            'price': price,
                            'map': map_price,
                            'difference': map_difference
                        })
                    else:
                        map_check['message'] = f"Price ${price:.2f} meets MAP requirement (${map_price:.2f})"
                        app.logger.info(f"MAP compliance: PASS", extra={
                            'price': price,
                            'map': map_price,
                            'difference': map_difference
                        })
                else:
                    map_check['message'] = f"Price ${price:.2f} is below MAP requirement (${map_price:.2f}) by ${abs(map_difference):.2f}"
                    compliance_result['review_reasons'].append(f"Price below MAP by ${abs(map_difference):.2f}")
                    app.logger.warn(f"MAP compliance: FAIL", extra={
                        'price': price,
                        'map': map_price,
                        'difference': map_difference
                    })
            else:
                # MAP not provided or is 0 - skip MAP compliance check
                is_map_compliant = True
                map_check = {
                    'passed': True,
                    'map_price': map_price,
                    'recommended_price': price,
                    'difference': 0,
                    'message': f"MAP not provided or is 0 (${map_price if map_price is not None else 'N/A'}) - compliance check skipped"
                }
                app.logger.info(f"MAP compliance: SKIPPED (MAP not provided or is 0)", extra={
                    'price': price,
                    'map': map_price
                })
            
            compliance_result['is_map_compliant'] = is_map_compliant
            compliance_result['compliance_details']['map_check'] = map_check
            
            # 2. Margin Compliance Check
            # Calculate actual margin: (price - cost) / price
            if price > 0:
                calculated_margin = (price - cost) / price
            else:
                calculated_margin = 0.0
            
            # Verify margin is within valid range (0-1)
            if calculated_margin < 0 or calculated_margin > 1:
                app.logger.error(f"Invalid margin calculation", extra={
                    'price': price,
                    'cost': cost,
                    'calculated_margin': calculated_margin
                })
                raise ComplianceError(
                    f"Invalid margin calculation: {calculated_margin:.2%}. "
                    f"Price: ${price:.2f}, Cost: ${cost:.2f}"
                )
            
            # Determine margin status
            margin_status = 'unknown'
            is_margin_compliant = calculated_margin >= min_margin
            target_difference = target_margin - calculated_margin
            
            if calculated_margin < min_margin:
                margin_status = 'below_minimum'
                compliance_result['review_reasons'].append(
                    f"Margin {calculated_margin:.1%} below minimum {min_margin:.1%}"
                )
            elif calculated_margin > max_margin:
                margin_status = 'above_maximum_opportunity'
                # High margin is flagged for review as an opportunity, not a violation
                compliance_result['review_reasons'].append(
                    f"High margin opportunity: {calculated_margin:.1%} exceeds guideline {max_margin:.1%} - consider if pricing can be optimized"
                )
            elif target_difference > 0.05:  # More than 5% below target
                margin_status = 'below_target'
                compliance_result['review_reasons'].append(
                    f"Margin {calculated_margin:.1%} significantly below target {target_margin:.1%}"
                )
            elif abs(calculated_margin - target_margin) <= 0.05:  # Within 5% of target
                margin_status = 'optimal'
            else:
                margin_status = 'acceptable'
            
            margin_check = {
                'passed': is_margin_compliant,
                'calculated_margin': calculated_margin,
                'min_margin': min_margin,
                'target_margin': target_margin,
                'max_margin': max_margin,
                'margin_status': margin_status,
                'target_difference': target_difference,
                'message': ''
            }
            
            if margin_status == 'optimal':
                margin_check['message'] = f"Margin {calculated_margin:.1%} is optimal for {role} role (target: {target_margin:.1%})"
                app.logger.info(f"Margin compliance: OPTIMAL", extra={
                    'calculated_margin': calculated_margin,
                    'target_margin': target_margin,
                    'role': role
                })
            elif margin_status == 'acceptable':
                margin_check['message'] = f"Margin {calculated_margin:.1%} is acceptable for {role} role (min: {min_margin:.1%}, target: {target_margin:.1%})"
                app.logger.info(f"Margin compliance: ACCEPTABLE", extra={
                    'calculated_margin': calculated_margin,
                    'min_margin': min_margin,
                    'target_margin': target_margin,
                    'role': role
                })
            elif margin_status == 'below_minimum':
                margin_check['message'] = f"Margin {calculated_margin:.1%} is below minimum {min_margin:.1%} for {role} role"
                app.logger.warn(f"Margin compliance: FAIL (below minimum)", extra={
                    'calculated_margin': calculated_margin,
                    'min_margin': min_margin,
                    'role': role
                })
            elif margin_status == 'below_target':
                margin_check['message'] = f"Margin {calculated_margin:.1%} is below target {target_margin:.1%} for {role} role"
                app.logger.warn(f"Margin compliance: WARNING (below target)", extra={
                    'calculated_margin': calculated_margin,
                    'target_margin': target_margin,
                    'role': role
                })
            elif margin_status == 'above_maximum_opportunity':
                margin_check['message'] = f"High margin opportunity: {calculated_margin:.1%} exceeds guideline {max_margin:.1%} for {role} role - consider if pricing can be optimized for competitiveness"
                app.logger.info(f"Margin compliance: HIGH MARGIN OPPORTUNITY (not a violation)", extra={
                    'calculated_margin': calculated_margin,
                    'max_margin': max_margin,
                    'role': role,
                    'treatment': 'guideline_only'
                })
            
            compliance_result['is_margin_compliant'] = is_margin_compliant
            compliance_result['compliance_details']['margin_check'] = margin_check
            
            # 3. MSRP Compliance Check
            # Price must be <= MSRP (Manufacturer's Suggested Retail Price) if MSRP is provided and > 0
            if msrp and msrp > 0:
                msrp_difference = msrp - price
                is_msrp_compliant = price <= msrp
                
                msrp_check = {
                    'passed': is_msrp_compliant,
                    'msrp': msrp,
                    'recommended_price': price,
                    'difference': msrp_difference,
                    'message': ''
                }
                
                if is_msrp_compliant:
                    if msrp_difference < 1.0:  # Very close to MSRP
                        msrp_check['message'] = f"Price ${price:.2f} meets MSRP requirement (${msrp:.2f}) but is very close to maximum"
                        app.logger.info(f"MSRP compliance: PASS (close to maximum)", extra={
                            'price': price,
                            'msrp': msrp,
                            'difference': msrp_difference
                        })
                    else:
                        msrp_check['message'] = f"Price ${price:.2f} meets MSRP requirement (${msrp:.2f})"
                        app.logger.info(f"MSRP compliance: PASS", extra={
                            'price': price,
                            'msrp': msrp,
                            'difference': msrp_difference
                        })
                else:
                    msrp_check['message'] = f"Price ${price:.2f} exceeds MSRP (${msrp:.2f}) by ${abs(msrp_difference):.2f}"
                    compliance_result['review_reasons'].append(f"Price exceeds MSRP by ${abs(msrp_difference):.2f}")
                    app.logger.warn(f"MSRP compliance: FAIL", extra={
                        'price': price,
                        'msrp': msrp,
                        'difference': msrp_difference
                    })
            else:
                # MSRP not provided or is 0 - skip MSRP compliance check
                is_msrp_compliant = True
                msrp_check = {
                    'passed': True,
                    'msrp': msrp,
                    'recommended_price': price,
                    'difference': 0,
                    'message': f"MSRP not provided or is 0 (${msrp if msrp is not None else 'N/A'}) - compliance check skipped"
                }
                app.logger.info(f"MSRP compliance: SKIPPED (MSRP not provided or is 0)", extra={
                    'price': price,
                    'msrp': msrp
                })
            
            compliance_result['is_msrp_compliant'] = is_msrp_compliant
            compliance_result['compliance_details']['msrp_check'] = msrp_check
            
            # 4. Determine Overall Status and Review Requirement
            # Review is required if:
            # - Any hard compliance check fails (MAP, minimum margin, MSRP)
            # - Margin is significantly below target (>5%)
            # - Margin exceeds maximum guideline (opportunity for review, not a violation)
            requires_review = (
                not is_map_compliant or
                not is_margin_compliant or
                not is_msrp_compliant or
                margin_status in ['below_target', 'above_maximum_opportunity']
            )
            
            compliance_result['requires_review'] = requires_review
            
            # Determine overall status
            if is_map_compliant and is_margin_compliant and is_msrp_compliant and margin_status == 'optimal':
                overall_status = 'fully_compliant'
            elif is_map_compliant and is_margin_compliant and is_msrp_compliant:
                overall_status = 'compliant_with_notes'
            elif requires_review:
                overall_status = 'requires_attention'
            else:
                overall_status = 'non_compliant'
            
            compliance_result['overall_status'] = overall_status
            
            # Generate compliance summary
            summary_parts = []
            
            if is_map_compliant:
                summary_parts.append("✓ MAP compliant")
            else:
                summary_parts.append("✗ MAP violation")
            
            if is_margin_compliant:
                if margin_status == 'optimal':
                    summary_parts.append("✓ Margin optimal")
                elif margin_status == 'acceptable':
                    summary_parts.append("✓ Margin acceptable")
                elif margin_status == 'below_target':
                    summary_parts.append("⚠ Margin below target")
                elif margin_status == 'above_maximum_opportunity':
                    summary_parts.append("⚠ High margin opportunity")
            else:
                summary_parts.append("✗ Margin below minimum")
            
            if is_msrp_compliant:
                summary_parts.append("✓ MSRP compliant")
            else:
                summary_parts.append("✗ MSRP violation")
            
            compliance_result['compliance_summary'] = " | ".join(summary_parts)
            
            # Log final compliance status
            app.logger.info(f"Compliance validation complete", extra={
                'overall_status': overall_status,
                'requires_review': requires_review,
                'is_map_compliant': is_map_compliant,
                'is_margin_compliant': is_margin_compliant,
                'is_msrp_compliant': is_msrp_compliant,
                'margin_status': margin_status,
                'calculated_margin': calculated_margin,
                'review_reasons_count': len(compliance_result['review_reasons'])
            })
            
            # Add progress message
            if requires_review:
                self._add_message(
                    f"Compliance validation complete: {overall_status} - "
                    f"Review required ({len(compliance_result['review_reasons'])} issues)"
                )
            else:
                self._add_message(
                    f"Compliance validation complete: {overall_status} - No review required"
                )
            
            return compliance_result
            
        except ComplianceError:
            # Re-raise our custom errors
            raise
            
        except Exception as e:
            app.logger.error(f"Unexpected error in compliance validation", extra={
                'price': price,
                'error': str(e)
            })
            raise ComplianceError(
                f"Unexpected error validating compliance: {str(e)}"
            )
    
    def _synthesize_pricing(self, demand_results: Optional[Dict[str, Any]], 
                           competitive_results: Optional[Dict[str, Any]],
                           margin_rules: Dict[str, Any], 
                           product_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synthesize final pricing recommendation combining all inputs.
        
        This is the core pricing synthesis method that combines:
        1. Demand forecast results (demand-based price recommendation)
        2. Competitive analysis results (market-based price recommendation)
        3. Margin rules and constraints (profitability requirements)
        4. Product data (cost, MAP, MSRP, role)
        
        The method implements a sophisticated confidence-weighted synthesis algorithm:
        - When both demand and competitive data are available with sufficient confidence,
          uses confidence-weighted averaging to balance both perspectives
        - When prices are similar (within 10%), uses simple averaging
        - When prices differ significantly, weights by confidence scores
        - Gracefully handles missing data by using available source with reduced confidence
        - Applies margin rules and constraints to ensure profitability
        - Calculates pricing boundaries (minimum, maximum, suggested)
        - Validates all price relationships and compliance
        
        Synthesis Methods:
        1. confidence_weighted: Both sources available, weighted by confidence
        2. similar_price_averaging: Both sources available with similar prices
        3. demand_only: Only demand data available
        4. competitive_only: Only competitive data available
        5. insufficient_data: Neither source has sufficient confidence
        
        Pricing Boundaries:
        - minimum_price: Max of (cost/(1-min_margin), MAP)
        - maximum_price: Min of (cost/(1-max_margin), MSRP)
        - suggested_price: Synthesized price adjusted to boundaries
        
        Args:
            demand_results: Demand forecast results containing:
                - recommended_price: Demand-based price recommendation
                - confidence: Confidence score (0-1)
                - analysis: Detailed demand analysis data
                Returns None if demand data unavailable
                
            competitive_results: Competitive analysis results containing:
                - recommended_price: Competition-based price
                - confidence_score: Confidence score (0-1)
                - analysis: Detailed competitive analysis data
                Returns None if competitive data unavailable
                
            margin_rules: Margin rules containing:
                - role_config: Role-specific margin requirements
                    - min_margin: Minimum required margin (0-1)
                    - target_margin: Target margin (0-1)
                    - max_margin: Maximum expected margin (0-1)
                - compliance_rules: Compliance enforcement rules
                - calculation_rules: Margin calculation rules
                
            product_data: Product information containing:
                - cost: Product cost for margin calculation
                - MAP: Minimum Advertised Price
                - MSRP: Manufacturer's Suggested Retail Price
                - role: Product role/tier (Best, Better, Good, Entry)
                - category: Product category
                
        Returns:
            Dictionary containing synthesized pricing recommendation:
            {
                "suggested_price": float,           # Final recommended price
                "confidence": float,                # Combined confidence (0-1)
                "synthesis_method": str,            # Method used for synthesis
                "pricing_rationale": str,           # Comprehensive explanation
                "source_data": {
                    "demand_price": float,
                    "demand_confidence": float,
                    "competitive_price": float,
                    "competitive_confidence": float
                },
                "pricing_boundaries": {
                    "minimum_price": float,         # Minimum allowable price
                    "maximum_price": float,         # Maximum recommended price
                    "suggested_price": float,       # Suggested optimal price
                    "calculated_margin": float,     # Actual margin at suggested price
                    "boundaries_valid": bool        # All relationships valid
                },
                "margin_analysis": {
                    "calculated_margin": float,     # Margin at suggested price
                    "target_margin": float,         # Target margin for role
                    "min_margin": float,            # Minimum required margin
                    "max_margin": float,            # Maximum expected margin
                    "margin_status": str            # optimal/acceptable/below_target
                },
                "demand_weight": float,             # Weight applied to demand (0-1)
                "competitive_weight": float,        # Weight applied to competitive (0-1)
                "margin_adjustment": float,         # Margin-based adjustment applied
                "limitations": list,                # Any limitations or warnings
                "_metadata": {
                    "synthesis_timestamp": str,
                    "min_confidence_threshold": float,
                    "similarity_threshold": float
                }
            }
            
        Raises:
            AgentExecutionError: If synthesis fails due to insufficient data
            
        Example:
            demand_results = {
                'recommended_price': 95.00,
                'confidence': 0.8,
                'analysis': {...}
            }
            competitive_results = {
                'recommended_price': 92.00,
                'confidence_score': 0.7,
                'analysis': {...}
            }
            margin_rules = {
                'role_config': {
                    'min_margin': 0.30,
                    'target_margin': 0.35,
                    'max_margin': 0.45
                }
            }
            product_data = {
                'cost': 65.00,
                'MAP': 89.99,
                'MSRP': 129.99,
                'role': 'Good'
            }
            
            result = self._synthesize_pricing(
                demand_results, competitive_results, margin_rules, product_data
            )
            
            print(f"Suggested price: ${result['suggested_price']:.2f}")
            print(f"Confidence: {result['confidence']:.1%}")
            print(f"Method: {result['synthesis_method']}")
            
        Requirements: 4.5
        """
        self._add_message("Synthesizing final pricing recommendation")
        
        # Configuration parameters
        min_confidence_threshold = 0.3  # Minimum confidence to use data source
        similarity_threshold = 0.1      # Price similarity threshold (10%)
        
        app.logger.info(f"Starting pricing synthesis", extra={
            'has_demand_data': bool(demand_results),
            'has_competitive_data': bool(competitive_results),
            'demand_price': demand_results.get('recommended_price') if demand_results else None,
            'competitive_price': competitive_results.get('recommended_price') if competitive_results else None,
            'demand_confidence': demand_results.get('confidence') if demand_results else None,
            'competitive_confidence': competitive_results.get('confidence_score') if competitive_results else None,
            'product_cost': product_data.get('cost'),
            'product_role': product_data.get('role')
        })
        
        # Initialize result structure
        result = {
            'suggested_price': None,
            'confidence': 0.0,
            'synthesis_method': 'none',
            'pricing_rationale': '',
            'source_data': {
                'demand_price': demand_results.get('recommended_price') if demand_results else None,
                'demand_confidence': demand_results.get('confidence') if demand_results else None,
                'competitive_price': competitive_results.get('recommended_price') if competitive_results else None,
                'competitive_confidence': competitive_results.get('confidence_score') if competitive_results else None
            },
            'pricing_boundaries': {},
            'margin_analysis': {},
            'demand_weight': 0.0,
            'competitive_weight': 0.0,
            'margin_adjustment': 0.0,
            'limitations': [],
            '_metadata': {
                'synthesis_timestamp': datetime.utcnow().isoformat() + 'Z',
                'min_confidence_threshold': min_confidence_threshold,
                'similarity_threshold': similarity_threshold
            }
        }
        
        # Validate input data quality
        demand_valid = (
            demand_results is not None and
            demand_results.get('recommended_price') is not None and
            demand_results.get('recommended_price') > 0 and
            demand_results.get('confidence', 0) >= min_confidence_threshold
        )
        
        competitive_valid = (
            competitive_results is not None and
            competitive_results.get('recommended_price') is not None and
            competitive_results.get('recommended_price') > 0 and
            competitive_results.get('confidence_score', 0) >= min_confidence_threshold
        )
        
        app.logger.info(f"Data validation results", extra={
            'demand_valid': demand_valid,
            'competitive_valid': competitive_valid,
            'min_confidence_threshold': min_confidence_threshold
        })
        
        # Synthesize price based on available data
        synthesized_price = None
        
        if demand_valid and competitive_valid:
            # Both data sources available - use confidence-weighted synthesis
            demand_price = demand_results['recommended_price']
            competitive_price = competitive_results['recommended_price']
            demand_conf = demand_results['confidence']
            competitive_conf = competitive_results['confidence_score']
            
            # Check if prices are similar (within threshold)
            price_difference = abs(demand_price - competitive_price)
            avg_price = (demand_price + competitive_price) / 2
            relative_difference = price_difference / avg_price if avg_price > 0 else 0
            
            if relative_difference <= similarity_threshold:
                # Prices are similar - use simple average
                result['synthesis_method'] = 'similar_price_averaging'
                synthesized_price = avg_price
                result['confidence'] = (demand_conf + competitive_conf) / 2
                result['demand_weight'] = 0.5
                result['competitive_weight'] = 0.5
                
                result['pricing_rationale'] = (
                    f"Demand and competitive recommendations are similar "
                    f"({relative_difference:.1%} difference). Using average price of "
                    f"${avg_price:.2f} with high confidence from both sources. "
                    f"Demand: ${demand_price:.2f} ({demand_conf:.1%} confidence), "
                    f"Competitive: ${competitive_price:.2f} ({competitive_conf:.1%} confidence)."
                )
                
                app.logger.info(f"Used similar price averaging", extra={
                    'demand_price': demand_price,
                    'competitive_price': competitive_price,
                    'avg_price': avg_price,
                    'relative_difference': relative_difference
                })
                
            else:
                # Prices differ significantly - use confidence weighting
                result['synthesis_method'] = 'confidence_weighted'
                total_confidence = demand_conf + competitive_conf
                demand_weight = demand_conf / total_confidence
                competitive_weight = competitive_conf / total_confidence
                
                synthesized_price = (demand_price * demand_weight) + (competitive_price * competitive_weight)
                
                # Boost confidence when both sources are available
                result['confidence'] = min(demand_conf, competitive_conf) + (abs(demand_conf - competitive_conf) * 0.3)
                result['demand_weight'] = demand_weight
                result['competitive_weight'] = competitive_weight
                
                result['pricing_rationale'] = (
                    f"Demand (${demand_price:.2f}, {demand_conf:.1%} confidence) and "
                    f"competitive (${competitive_price:.2f}, {competitive_conf:.1%} confidence) "
                    f"recommendations differ by {relative_difference:.1%}. Using confidence-weighted "
                    f"average: {demand_weight:.1%} demand + {competitive_weight:.1%} competitive = "
                    f"${synthesized_price:.2f}."
                )
                
                app.logger.info(f"Used confidence-weighted synthesis", extra={
                    'demand_price': demand_price,
                    'competitive_price': competitive_price,
                    'demand_weight': demand_weight,
                    'competitive_weight': competitive_weight,
                    'synthesized_price': synthesized_price
                })
                
        elif demand_valid and not competitive_valid:
            # Only demand data available
            result['synthesis_method'] = 'demand_only'
            synthesized_price = demand_results['recommended_price']
            result['confidence'] = demand_results['confidence'] * 0.8  # Reduce confidence
            result['demand_weight'] = 1.0
            result['competitive_weight'] = 0.0
            
            result['pricing_rationale'] = (
                f"Using demand-based recommendation of ${synthesized_price:.2f} "
                f"({demand_results['confidence']:.1%} confidence). Competitive analysis "
                f"data not available or below confidence threshold."
            )
            
            result['limitations'].append(
                'Competitive analysis data not available - recommendation based solely on demand patterns'
            )
            
            app.logger.warn(f"Using demand data only", extra={
                'demand_price': demand_results['recommended_price'],
                'demand_confidence': demand_results['confidence'],
                'competitive_data_available': bool(competitive_results),
                'competitive_confidence': competitive_results.get('confidence') if competitive_results else None
            })
            
        elif not demand_valid and competitive_valid:
            # Only competitive data available
            result['synthesis_method'] = 'competitive_only'
            synthesized_price = competitive_results['recommended_price']
            result['confidence'] = competitive_results['confidence_score'] * 0.8  # Reduce confidence
            result['demand_weight'] = 0.0
            result['competitive_weight'] = 1.0
            
            result['pricing_rationale'] = (
                f"Using competitive-based recommendation of ${synthesized_price:.2f} "
                f"({competitive_results['confidence_score']:.1%} confidence). Demand forecast "
                f"data not available or below confidence threshold."
            )
            
            result['limitations'].append(
                'Demand forecast data not available - recommendation based solely on competitive analysis'
            )
            
            app.logger.warn(f"Using competitive data only", extra={
                'competitive_price': competitive_results['recommended_price'],
                'competitive_confidence': competitive_results['confidence_score'],
                'demand_data_available': bool(demand_results),
                'demand_confidence': demand_results.get('confidence') if demand_results else None
            })
            
        else:
            # Neither data source is valid
            result['synthesis_method'] = 'insufficient_data'
            result['confidence'] = 0.0
            
            error_message = (
                'Insufficient data for price synthesis - both demand and competitive data '
                'are missing or below confidence threshold'
            )
            result['pricing_rationale'] = error_message
            result['limitations'].append(
                'Both demand and competitive analysis data are insufficient for reliable pricing recommendation'
            )
            
            app.logger.error(f"Insufficient data for synthesis", extra={
                'demand_data_available': bool(demand_results),
                'competitive_data_available': bool(competitive_results),
                'demand_confidence': demand_results.get('confidence') if demand_results else None,
                'competitive_confidence': competitive_results.get('confidence') if competitive_results else None,
                'min_confidence_threshold': min_confidence_threshold
            })
            
            self._add_message("Error: Insufficient data for pricing synthesis")
            
            raise AgentExecutionError(error_message)
        
        # Add source analysis details to rationale if available
        if demand_results and demand_results.get('analysis', {}).get('pricing_rationale'):
            result['pricing_rationale'] += f" Demand analysis: {demand_results['analysis']['pricing_rationale']}"
        
        if competitive_results and competitive_results.get('analysis', {}).get('pricing_rationale'):
            result['pricing_rationale'] += f" Competitive analysis: {competitive_results['analysis']['pricing_rationale']}"
        
        # Extract margin configuration
        role_config = margin_rules.get('role_config', {})
        min_margin = role_config.get('min_margin', self.default_min_margin)
        target_margin = role_config.get('target_margin', 0.35)
        max_margin = role_config.get('max_margin', 0.50)
        
        # Extract product constraints
        product_cost = product_data.get('cost')
        map_price = product_data.get('MAP')
        msrp = product_data.get('MSRP')
        
        # Validate required fields for boundary calculation
        if not product_cost or product_cost <= 0:
            raise AgentExecutionError("Product cost is required for pricing synthesis")
        
        # Calculate pricing boundaries
        # Minimum price: Max of (cost/(1-min_margin), MAP)
        # This is a hard constraint - prices below this violate minimum margin or MAP requirements
        min_price_from_margin = product_cost / (1 - min_margin)
        min_price_from_map = map_price if map_price and map_price > 0 else 0
        minimum_price = max(min_price_from_margin, min_price_from_map)
        
        # Maximum price: Use MSRP as the primary constraint (hard limit)
        # max_margin is treated as a guideline for review, not a hard cap
        # Edge case handling: If MSRP is None, 0, or negative, use a reasonable multiple of cost
        if msrp and msrp > 0:
            maximum_price = msrp
        else:
            # Fallback: Use 3x cost as reasonable maximum when MSRP is missing
            maximum_price = product_cost * 3.0
            result['limitations'].append(
                f"MSRP not available - using 3x cost (${maximum_price:.2f}) as maximum price guideline"
            )
        
        # Store max_margin calculation for reference (guideline only, not enforced)
        max_price_from_margin = product_cost / (1 - max_margin)
        
        # Cap maximum price at reasonable level (2x synthesized price) for sanity check
        max_reasonable_price = synthesized_price * 2.0
        if maximum_price > max_reasonable_price:
            maximum_price = max_reasonable_price
            result['limitations'].append(
                f"Maximum price capped at 200% above synthesized price for reasonableness"
            )
        
        app.logger.info(f"Calculated pricing boundaries", extra={
            'min_price_from_margin': min_price_from_margin,
            'min_price_from_map': min_price_from_map,
            'minimum_price': minimum_price,
            'max_price_from_margin': max_price_from_margin,
            'max_price_from_msrp': msrp if msrp and msrp > 0 else 'not_available',
            'maximum_price': maximum_price,
            'max_margin_treatment': 'guideline_only'
        })
        
        # Determine suggested price and apply boundary constraints
        suggested_price = synthesized_price
        
        # Ensure suggested price falls within boundaries
        if suggested_price < minimum_price:
            suggested_price = minimum_price
            result['limitations'].append(
                f"Suggested price adjusted upward to meet minimum price requirement (${round_to_nearest_dollar(minimum_price):.0f})"
            )
            result['margin_adjustment'] = minimum_price - synthesized_price
            
            app.logger.warn(f"Adjusted suggested price to minimum", extra={
                'original_suggested': synthesized_price,
                'adjusted_suggested': suggested_price,
                'adjustment': result['margin_adjustment']
            })
            
        if suggested_price > maximum_price:
            suggested_price = maximum_price
            result['limitations'].append(
                f"Suggested price adjusted downward to meet maximum price limit (${round_to_nearest_dollar(maximum_price):.0f})"
            )
            result['margin_adjustment'] = maximum_price - synthesized_price
            
            app.logger.warn(f"Adjusted suggested price to maximum", extra={
                'original_suggested': synthesized_price,
                'adjusted_suggested': suggested_price,
                'adjustment': result['margin_adjustment']
            })
        
        # Calculate actual margin at suggested price
        calculated_margin = (suggested_price - product_cost) / suggested_price if suggested_price > 0 else 0
        
        # Determine margin status
        # Note: max_margin is treated as a guideline, not a hard constraint
        margin_status = 'unknown'
        if calculated_margin < min_margin:
            margin_status = 'below_minimum'
        elif calculated_margin > max_margin:
            # High margin is an opportunity, not a violation
            margin_status = 'above_maximum_opportunity'
        elif abs(calculated_margin - target_margin) <= 0.05:
            margin_status = 'optimal'
        elif calculated_margin < target_margin - 0.05:
            margin_status = 'below_target'
        else:
            margin_status = 'acceptable'
        
        # Validate price relationships
        # Note: Only enforce minimum constraints, not maximum margin
        boundaries_valid = (
            minimum_price <= suggested_price <= maximum_price and
            calculated_margin >= min_margin
        )
        
        # Round suggested price to nearest dollar
        suggested_price = round_to_nearest_dollar(suggested_price)
        
        # Round calculated boundary prices to nearest dollar
        # Note: Only round calculated values, not input parameters (MAP, MSRP)
        minimum_price_rounded = round_to_nearest_dollar(minimum_price)
        maximum_price_rounded = round_to_nearest_dollar(maximum_price)
        min_price_from_margin_rounded = round_to_nearest_dollar(min_price_from_margin)
        max_price_from_margin_rounded = round_to_nearest_dollar(max_price_from_margin)
        
        # Populate result structure
        result['suggested_price'] = suggested_price
        
        result['pricing_boundaries'] = {
            'minimum_price': minimum_price_rounded,
            'maximum_price': maximum_price_rounded,
            'suggested_price': suggested_price,
            'calculated_margin': calculated_margin,
            'boundaries_valid': boundaries_valid,
            'min_price_from_margin': min_price_from_margin_rounded,
            'min_price_from_map': min_price_from_map,
            'max_price_from_margin': max_price_from_margin_rounded,  # Reference only, not enforced
            'max_price_from_msrp': msrp if msrp and msrp > 0 else maximum_price,  # Use calculated default when MSRP is 0 or None
            'max_margin_treatment': 'guideline_only'  # Indicates max_margin is not a hard constraint
        }
        
        result['margin_analysis'] = {
            'calculated_margin': calculated_margin,
            'target_margin': target_margin,
            'min_margin': min_margin,
            'max_margin': max_margin,
            'margin_status': margin_status,
            'target_difference': abs(calculated_margin - target_margin)
        }
        
        # Add comprehensive summary to rationale
        result['pricing_rationale'] += (
            f" Final suggested price: ${suggested_price:.0f} with {calculated_margin:.1%} margin "
            f"(target: {target_margin:.1%}). Price boundaries: ${minimum_price_rounded:.0f} - ${maximum_price_rounded:.0f}."
        )
        
        app.logger.info(f"Pricing synthesis completed", extra={
            'suggested_price': suggested_price,
            'confidence': result['confidence'],
            'synthesis_method': result['synthesis_method'],
            'calculated_margin': calculated_margin,
            'margin_status': margin_status,
            'boundaries_valid': boundaries_valid,
            'limitations_count': len(result['limitations'])
        })
        
        self._add_message(
            f"Pricing synthesis complete: ${suggested_price:.0f} "
            f"({result['confidence']:.1%} confidence, {calculated_margin:.1%} margin)"
        )
        
        return result
    
    async def execute_analysis(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main workflow orchestration method for margin analysis.
        
        This is the primary entry point for margin analysis execution. It orchestrates
        the complete workflow by calling all internal methods in sequence and handling
        the overall execution flow.
        
        The method implements the following workflow:
        1. Validate product data from Step Functions payload (complete data provided)
        2. Use product data directly from payload (no Lambda call needed)
        3. Retrieve demand forecast results from DynamoDB
        4. Retrieve competitive analysis results from DynamoDB
        5. Fetch margin rules for product category and role
        6. Synthesize final pricing recommendation combining all inputs
        7. Validate compliance (MAP, margin, MSRP)
        8. Update DynamoDB pricing record with final results
        9. Track performance metrics throughout execution
        10. Collect all progress messages for transparency
        11. Return complete analysis results with final pricing
        
        Key Design Decisions:
        - Product data comes directly from Step Functions orchestrator payload
        - No Lambda invocation needed for product data (already provided)
        - Graceful handling of missing demand/competitive data
        - Comprehensive error handling with custom exceptions
        - Performance tracking for monitoring and optimization
        - Progress messages for real-time status updates
        
        Workflow Steps:
        
        Step 1: Validate Product Data
        - Extract product data from payload
        - Validate required fields (product_id, cost, MAP, MSRP, category, role)
        - Log validation results
        
        Step 2: Retrieve Demand Forecast Results
        - Query DynamoDB for demand analysis from previous agent
        - Handle missing data gracefully (optional input)
        - Extract demand-based price recommendation and confidence
        
        Step 3: Retrieve Competitive Analysis Results
        - Query DynamoDB for competitive analysis from previous agent
        - Handle missing data gracefully (optional input)
        - Extract competition-based price recommendation and confidence
        
        Step 4: Fetch Margin Rules
        - Retrieve margin rules from S3 (with fallback to defaults)
        - Extract role-specific margin requirements
        - Get compliance rules and calculation parameters
        
        Step 5: Synthesize Pricing
        - Combine demand and competitive recommendations
        - Apply confidence-weighted synthesis algorithm
        - Calculate pricing boundaries (min, max, suggested)
        - Apply margin rules and constraints
        - Generate comprehensive pricing rationale
        
        Step 6: Validate Compliance
        - Check MAP compliance (price >= MAP)
        - Check margin compliance (margin >= min_margin)
        - Check MSRP compliance (price <= MSRP)
        - Determine if manual review is required
        - Generate compliance summary
        
        Step 7: Update Pricing Record
        - Build comprehensive marginAnalysis field
        - Set status to "completed" (final status)
        - Add updatedAt timestamp
        - Implement retry logic with exponential backoff
        
        Step 8: Return Results
        - Compile complete analysis results
        - Include final pricing recommendation
        - Include compliance status
        - Include performance metrics
        - Include all progress messages
        
        Args:
            payload: Input payload from Step Functions orchestrator containing:
                - product_id: Product identifier (required)
                - session_id: Pricing session identifier (required)
                - user_input: Optional user input or context
                - product_data: Complete product information (required)
                    - cost: Product cost (required)
                    - MAP: Minimum Advertised Price (required)
                    - MSRP: Manufacturer's Suggested Retail Price (required)
                    - category: Product category (required)
                    - subcategory: Product subcategory (optional)
                    - role: Product role/tier (Best, Better, Good, Entry) (required)
                    - vendor: Product vendor (optional)
                    - features: Product features list (optional)
                    - attributes: Product attributes dict (optional)
                - supervisor_results: Optional results from supervisor agent
                
        Returns:
            Dictionary containing complete margin analysis results:
            {
                "status": "completed",
                "analysis": {
                    "suggested_price": float,
                    "calculated_margin": float,
                    "is_map_compliant": bool,
                    "is_margin_compliant": bool,
                    "is_msrp_compliant": bool,
                    "requires_review": bool,
                    "compliance_details": {...},
                    "pricing_rationale": str,
                    "demand_weight": float,
                    "competitive_weight": float,
                    "margin_adjustment": float
                },
                "final_recommendation": {
                    "recommended_price": float,
                    "confidence": float,
                    "price_range": {"min": float, "max": float}
                },
                "messages": list,
                "performance": {
                    "totalDuration": float,
                    "performanceStatus": str
                },
                "timestamp": float
            }
            
            On error, returns:
            {
                "status": "failed",
                "error": str,
                "messages": list,
                "timestamp": float
            }
            
        Raises:
            AgentExecutionError: Base exception for agent execution errors
            DemandForecastError: Error retrieving demand forecast results
            CompetitiveResultsError: Error retrieving competitive analysis results
            MarginRulesError: Error retrieving margin rules
            ComplianceError: Error validating compliance
            DynamoDBUpdateError: Error updating DynamoDB pricing record
            
        Example:
            payload = {
                'sessionId': 'session-123',
                'user_input': 'Analyze pricing for this product',
                'product': {
                    'product_id': 'PROD-001',
                    'cost': 65.00,
                    'MAP': 89.99,
                    'MSRP': 129.99,
                    'category': 'powertools',
                    'subcategory': 'drills',
                    'role': 'Good',
                    'vendor': 'DEWALT',
                    'features': ['LED Light', 'Variable Speed'],
                    'attributes': {'powerType': 'cordless', 'voltage': '20V'}
                }
            }
            
            result = await agent.execute_analysis(payload)
            
            if result['status'] == 'completed':
                print(f"Recommended price: ${result['final_recommendation']['recommended_price']:.2f}")
                print(f"Confidence: {result['final_recommendation']['confidence']:.1%}")
                print(f"Requires review: {result['analysis']['requires_review']}")
            else:
                print(f"Analysis failed: {result['error']}")
                
        Requirements: 2.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.4, 5.5
        """
        # Track performance metrics
        start_time = time.time()
        
        try:
            app.logger.info("Starting margin analysis execution", extra={
                'payload_keys': list(payload.keys()),
                'has_product_data': 'product_data' in payload,
                'has_session_id': 'session_id' in payload
            })
            
            self._add_message("Starting margin analysis agent execution")
            
            # Extract session_id early for AppSync communication
            session_id = payload.get('sessionId') or payload.get('session_id')
            
            # Write agent start message to AppSync for real-time updates
            # Requirements: 1.1, 2.1, 10.1, 10.2
            if session_id:
                await self._write_message_to_appsync(session_id, "Starting margin analysis agent execution")
                
                # Update session to show margin analysis agent is starting
                # Requirements: 10.1, 10.2, 10.3
                if self.appsync_client:
                    try:
                        await self.appsync_client.update_session(
                            session_id=session_id,
                            status='in-progress',
                            current_agent='margin-analysis',
                            agent_status={
                                'demandForecast': 'complete',
                                'competitiveAnalysis': 'complete',
                                'marginAnalysis': 'in-progress'
                            }
                        )
                        app.logger.info("Session updated via AppSync - margin analysis started")
                    except Exception as e:
                        app.logger.error(f"Failed to update session via AppSync: {e}")
            
            # Step 1: Validate product data from Step Functions payload
            # NOTE: Step Functions provides complete product data - no Lambda call needed
            self._add_message("Validating product data from Step Functions payload")
            await self._write_message_to_appsync(session_id, "Validating product data from Step Functions payload")
            
            # Extract data from payload (consistent with demand-forecast and competitive-analysis agents)
            # Note: session_id already extracted above for AppSync communication
            product_data = payload.get('product', {})
            product_id = product_data.get('product_id', 'unknown')
            
            # Validate required fields
            if not session_id:
                raise AgentExecutionError("sessionId is required in payload")
            
            if not product_data:
                raise AgentExecutionError("product data is required in payload")
            
            if not product_id or product_id == 'unknown':
                raise AgentExecutionError("product_id is required in product data")
            
            # Validate required product data fields
            # Note: MAP and MSRP are optional - products can have 0 or null values
            required_fields = ['cost', 'category', 'role']
            missing_fields = [field for field in required_fields if field not in product_data or product_data[field] is None]
            
            if missing_fields:
                error_msg = f"Missing required product data fields: {', '.join(missing_fields)}"
                app.logger.error(error_msg, extra={
                    'product_id': product_id,
                    'session_id': session_id,
                    'missing_fields': missing_fields,
                    'available_fields': list(product_data.keys())
                })
                raise AgentExecutionError(error_msg)
            
            # Validate cost is a positive number
            cost = product_data.get('cost')
            if cost is None or cost <= 0:
                error_msg = f"Product cost must be a positive number, got: {cost}"
                app.logger.error(error_msg, extra={
                    'product_id': product_id,
                    'session_id': session_id,
                    'cost': cost
                })
                raise AgentExecutionError(error_msg)
            
            # Extract product information
            cost = product_data.get('cost')
            map_price = product_data.get('MAP')
            msrp = product_data.get('MSRP')
            category = product_data.get('category')
            role = product_data.get('role')
            
            # Format MAP and MSRP for display (handle None/0 values)
            map_display = f"${map_price:.2f}" if map_price and map_price > 0 else "N/A"
            msrp_display = f"${msrp:.2f}" if msrp and msrp > 0 else "N/A"
            
            app.logger.info("Product data validated successfully", extra={
                'product_id': product_id,
                'session_id': session_id,
                'cost': cost,
                'map': map_price,
                'msrp': msrp,
                'category': category,
                'role': role
            })
            
            self._add_message(
                f"Product data validated: {product_id} ({category}/{role}) - "
                f"Cost: ${cost:.2f}, MAP: {map_display}, MSRP: {msrp_display}"
            )
            await self._write_message_to_appsync(
                session_id,
                f"Product data validated: {product_id} ({category}/{role}) - Cost: ${cost:.2f}, MAP: {map_display}, MSRP: {msrp_display}"
            )
            
            # Step 2: Retrieve demand forecast results from DynamoDB
            self._add_message("Retrieving demand forecast results")
            await self._write_message_to_appsync(session_id, "Retrieving demand forecast results")
            
            try:
                demand_results = await self._get_demand_forecast_results(session_id)
                
                if demand_results:
                    app.logger.info("Demand forecast results retrieved", extra={
                        'session_id': session_id,
                        'has_recommended_price': bool(demand_results.get('recommended_price')),
                        'confidence': demand_results.get('confidence')
                    })
                else:
                    app.logger.warn("Demand forecast results not available", extra={
                        'session_id': session_id
                    })
                    self._add_message("Warning: Demand forecast data not available - will proceed with competitive data only")
                    
            except DemandForecastError as e:
                app.logger.error(f"Error retrieving demand forecast results: {e}", extra={
                    'session_id': session_id
                })
                # Continue with None - synthesis will handle missing data
                demand_results = None
                self._add_message(f"Warning: Failed to retrieve demand forecast data - {str(e)}")
            
            # Step 3: Retrieve competitive analysis results from DynamoDB
            self._add_message("Retrieving competitive analysis results")
            await self._write_message_to_appsync(session_id, "Retrieving competitive analysis results")
            
            try:
                competitive_results = await self._get_competitive_results(session_id)
                
                if competitive_results:
                    app.logger.info("Competitive analysis results retrieved", extra={
                        'session_id': session_id,
                        'has_recommended_price': bool(competitive_results.get('recommended_price')),
                        'confidence': competitive_results.get('confidence_score')
                    })
                else:
                    app.logger.warn("Competitive analysis results not available", extra={
                        'session_id': session_id
                    })
                    self._add_message("Warning: Competitive analysis data not available - will proceed with demand data only")
                    
            except CompetitiveResultsError as e:
                app.logger.error(f"Error retrieving competitive analysis results: {e}", extra={
                    'session_id': session_id
                })
                # Continue with None - synthesis will handle missing data
                competitive_results = None
                self._add_message(f"Warning: Failed to retrieve competitive analysis data - {str(e)}")
            
            # Step 4: Fetch margin rules for product category and role
            self._add_message(f"Fetching margin rules for {category}/{role}")
            await self._write_message_to_appsync(session_id, f"Fetching margin rules for {category}/{role}")
            
            margin_rules = await self._get_margin_rules(category, role)
            
            app.logger.info("Margin rules retrieved", extra={
                'category': category,
                'role': role,
                'source': margin_rules.get('_metadata', {}).get('source'),
                'min_margin': margin_rules.get('role_config', {}).get('min_margin'),
                'target_margin': margin_rules.get('role_config', {}).get('target_margin')
            })
            
            # Step 5: Synthesize final pricing recommendation
            self._add_message("Synthesizing final pricing recommendation")
            await self._write_message_to_appsync(session_id, "Synthesizing final pricing recommendation")
            
            final_pricing = self._synthesize_pricing(
                demand_results=demand_results,
                competitive_results=competitive_results,
                margin_rules=margin_rules,
                product_data=product_data
            )
            
            suggested_price = final_pricing.get('suggested_price')
            confidence = final_pricing.get('confidence')
            synthesis_method = final_pricing.get('synthesis_method')
            
            app.logger.info("Pricing synthesis completed", extra={
                'suggested_price': suggested_price,
                'confidence': confidence,
                'synthesis_method': synthesis_method,
                'demand_weight': final_pricing.get('demand_weight'),
                'competitive_weight': final_pricing.get('competitive_weight')
            })
            
            self._add_message(
                f"Pricing synthesized: ${suggested_price:.2f} "
                f"({confidence:.1%} confidence, method: {synthesis_method})"
            )
            await self._write_message_to_appsync(
                session_id,
                f"Pricing synthesized: ${suggested_price:.2f} ({confidence:.1%} confidence, method: {synthesis_method})"
            )
            
            # Step 6: Validate compliance (MAP, margin, MSRP)
            self._add_message("Validating pricing compliance")
            await self._write_message_to_appsync(session_id, "Validating pricing compliance")
            
            compliance_status = self._validate_compliance(
                price=suggested_price,
                product_data=product_data,
                margin_rules=margin_rules
            )
            
            is_compliant = (
                compliance_status.get('is_map_compliant') and
                compliance_status.get('is_margin_compliant') and
                compliance_status.get('is_msrp_compliant')
            )
            requires_review = compliance_status.get('requires_review')
            
            app.logger.info("Compliance validation completed", extra={
                'is_map_compliant': compliance_status.get('is_map_compliant'),
                'is_margin_compliant': compliance_status.get('is_margin_compliant'),
                'is_msrp_compliant': compliance_status.get('is_msrp_compliant'),
                'requires_review': requires_review,
                'overall_status': compliance_status.get('overall_status')
            })
            
            if requires_review:
                self._add_message(
                    f"Compliance check: {compliance_status.get('overall_status')} - "
                    f"Manual review required ({len(compliance_status.get('review_reasons', []))} issues)"
                )
            else:
                self._add_message(
                    f"Compliance check: {compliance_status.get('overall_status')} - "
                    f"All checks passed, no review required"
                )
            
            # Step 7: Update pricing record via AppSync (replaces direct DynamoDB writes)
            # NOTE: Direct DynamoDB update removed in favor of AppSync mutation
            # The update_session call below (after completion) handles all updates
            # Requirements: 10.3, 10.4 - Use AppSync instead of direct DynamoDB writes
            self._add_message("Pricing record will be updated via AppSync after completion")
            await self._write_message_to_appsync(session_id, "Preparing final results for update")
            
            app.logger.info("Skipping direct DynamoDB update - using AppSync instead", extra={
                'session_id': session_id,
                'suggested_price': suggested_price,
                'requires_review': requires_review
            })
            
            # Step 8: Calculate performance metrics
            end_time = time.time()
            total_duration = end_time - start_time
            
            # Determine performance status
            if total_duration < 5.0:
                performance_status = 'excellent'
            elif total_duration < 10.0:
                performance_status = 'good'
            elif total_duration < 15.0:
                performance_status = 'acceptable'
            else:
                performance_status = 'slow'
            
            app.logger.info("Margin analysis execution completed", extra={
                'session_id': session_id,
                'product_id': product_id,
                'total_duration': total_duration,
                'performance_status': performance_status,
                'suggested_price': suggested_price,
                'confidence': confidence,
                'requires_review': requires_review,
                'message_count': len(self.messages)
            })
            
            
            margin_analysis_data = {
                # Core pricing recommendation
                'suggested_price': suggested_price,
                'calculated_margin': final_pricing.get('pricing_boundaries', {}).get('calculated_margin'),
                    
                # Compliance status
                'is_map_compliant': compliance_status.get('is_map_compliant'),
                'is_margin_compliant': compliance_status.get('is_margin_compliant'),
                'is_msrp_compliant': compliance_status.get('is_msrp_compliant'),
                'requires_review': requires_review,
                'compliance_details': compliance_status.get('compliance_details', {}),
                    
                # Pricing rationale and synthesis details
                'pricing_rationale': final_pricing.get('pricing_rationale'),
                'synthesis_method': synthesis_method,
                'demand_weight': final_pricing.get('demand_weight'),
                'competitive_weight': final_pricing.get('competitive_weight'),
                'margin_adjustment': final_pricing.get('margin_adjustment'),
                    
                # Pricing boundaries
                'pricing_boundaries': final_pricing.get('pricing_boundaries', {}),
                    
                 # Margin analysis
                'margin_analysis': final_pricing.get('margin_analysis', {}),
                    
                 # Source data
                'source_data': final_pricing.get('source_data', {}),
                    
                # Limitations and warnings
                'limitations': final_pricing.get('limitations', []),
                'review_reasons': compliance_status.get('review_reasons', [])
            }

            # Build final recommendation separately (clean summary for frontend)
            # Truncate confidence to 4 decimal places for cleaner display
            final_recommendation_data = {
                'recommended_price': suggested_price,
                'confidence': self.truncate_decimal(confidence, 2),
                'price_range': {
                    'min': final_pricing.get('pricing_boundaries', {}).get('minimum_price'),
                    'max': final_pricing.get('pricing_boundaries', {}).get('maximum_price')
                }
            }

            # Update PRICING# record (analysis results) - triggers onPricingAnalysisById subscription
            # This uses PricingAnalysisStatus enum: initiated, demand_analysis_complete, 
            # competitive_analysis_complete, completed, failed
            await self.appsync_client.update_pricing_analysis(
                session_id=session_id,
                margin_analysis=margin_analysis_data,
                final_recommendation=final_recommendation_data,
                status='margin_analysis_complete'
            )
            app.logger.info("PRICING# record updated with margin analysis and final recommendation via AppSync")



            self._add_message(
                f"Margin analysis completed successfully in {total_duration:.2f}s - "
                f"Final price: ${suggested_price:.2f}"
            )
            await self._write_message_to_appsync(
                session_id,
                f"Margin analysis completed successfully in {total_duration:.2f}s - Final price: ${suggested_price:.2f}"
            )
            
            # Update session with final results via AppSync
            # Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 10.3, 10.4
            if self.appsync_client:
                try:
                    await self.appsync_client.update_session(
                        session_id=session_id,
                        status='completed',
                        current_agent='margin-analysis',
                        agent_status={
                            'demandForecast': 'complete',
                            'competitiveAnalysis': 'complete',
                            'marginAnalysis': 'complete'
                        },
                        analysis_data={
                            'marginAnalysis': {
                                'suggested_price': suggested_price,
                                'calculated_margin': final_pricing.get('pricing_boundaries', {}).get('calculated_margin'),
                                'is_map_compliant': compliance_status.get('is_map_compliant'),
                                'is_margin_compliant': compliance_status.get('is_margin_compliant'),
                                'is_msrp_compliant': compliance_status.get('is_msrp_compliant'),
                                'requires_review': requires_review,
                                'pricing_rationale': final_pricing.get('pricing_rationale'),
                                'confidence': confidence,
                                'synthesis_method': synthesis_method
                            }
                        }
                    )
                    app.logger.info("Session updated via AppSync - margin analysis completed")
                except Exception as e:
                    app.logger.error(f"Failed to update session via AppSync: {e}")
            
            # Step 9: Return complete analysis results with final pricing
            return {
                'status': 'completed',
                'analysis': {
                    # Core pricing recommendation
                    'suggested_price': suggested_price,
                    'calculated_margin': final_pricing.get('pricing_boundaries', {}).get('calculated_margin'),
                    
                    # Compliance status
                    'is_map_compliant': compliance_status.get('is_map_compliant'),
                    'is_margin_compliant': compliance_status.get('is_margin_compliant'),
                    'is_msrp_compliant': compliance_status.get('is_msrp_compliant'),
                    'requires_review': requires_review,
                    'compliance_details': compliance_status.get('compliance_details', {}),
                    
                    # Pricing rationale and synthesis details
                    'pricing_rationale': final_pricing.get('pricing_rationale'),
                    'synthesis_method': synthesis_method,
                    'demand_weight': final_pricing.get('demand_weight'),
                    'competitive_weight': final_pricing.get('competitive_weight'),
                    'margin_adjustment': final_pricing.get('margin_adjustment'),
                    
                    # Pricing boundaries
                    'pricing_boundaries': final_pricing.get('pricing_boundaries', {}),
                    
                    # Margin analysis
                    'margin_analysis': final_pricing.get('margin_analysis', {}),
                    
                    # Source data
                    'source_data': final_pricing.get('source_data', {}),
                    
                    # Limitations and warnings
                    'limitations': final_pricing.get('limitations', []),
                    'review_reasons': compliance_status.get('review_reasons', [])
                },
                'final_recommendation': {
                    'recommended_price': suggested_price,
                    'confidence': confidence,
                    'price_range': {
                        'min': final_pricing.get('pricing_boundaries', {}).get('minimum_price'),
                        'max': final_pricing.get('pricing_boundaries', {}).get('maximum_price')
                    }
                },
                'messages': self.messages,
                'performance': {
                    'totalDuration': total_duration,
                    'performanceStatus': performance_status
                },
                'timestamp': end_time
            }
            
        except DemandForecastError as e:
            app.logger.error(f"Demand forecast error: {e}", extra={
                'session_id': payload.get('session_id'),
                'error': str(e)
            })
            self._add_message(f"Error: Failed to retrieve demand forecast data - {str(e)}")
            
            return {
                'status': 'failed',
                'error': f"Demand forecast error: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except CompetitiveResultsError as e:
            app.logger.error(f"Competitive results error: {e}", extra={
                'session_id': payload.get('session_id'),
                'error': str(e)
            })
            self._add_message(f"Error: Failed to retrieve competitive analysis data - {str(e)}")
            
            return {
                'status': 'failed',
                'error': f"Competitive results error: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except MarginRulesError as e:
            app.logger.error(f"Margin rules error: {e}", extra={
                'session_id': payload.get('session_id'),
                'category': payload.get('product_data', {}).get('category'),
                'role': payload.get('product_data', {}).get('role'),
                'error': str(e)
            })
            self._add_message(f"Error: Failed to retrieve margin rules - {str(e)}")
            
            return {
                'status': 'failed',
                'error': f"Margin rules error: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except ComplianceError as e:
            app.logger.error(f"Compliance validation error: {e}", extra={
                'session_id': payload.get('session_id'),
                'error': str(e)
            })
            self._add_message(f"Error: Compliance validation failed - {str(e)}")
            
            return {
                'status': 'failed',
                'error': f"Compliance validation error: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except DynamoDBUpdateError as e:
            app.logger.error(f"DynamoDB update error: {e}", extra={
                'session_id': payload.get('session_id'),
                'error': str(e)
            })
            self._add_message(f"Error: Failed to update pricing record - {str(e)}")
            
            # Don't fail the entire analysis if DynamoDB update fails
            # Return results but indicate update failure
            return {
                'status': 'completed_with_warnings',
                'warning': f"Analysis completed but failed to update DynamoDB: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except AgentExecutionError as e:
            app.logger.error(f"Agent execution error: {e}", extra={
                'session_id': payload.get('session_id'),
                'error': str(e)
            })
            self._add_message(f"Error: Agent execution failed - {str(e)}")
            
            return {
                'status': 'failed',
                'error': str(e),
                'messages': self.messages,
                'timestamp': time.time()
            }
            
        except Exception as e:
            app.logger.error(f"Unexpected error in margin analysis execution", extra={
                'session_id': payload.get('session_id'),
                'error': str(e),
                'error_type': type(e).__name__
            }, exc_info=True)
            self._add_message(f"Error: Unexpected error - {str(e)}")
            
            return {
                'status': 'failed',
                'error': f"Unexpected error: {str(e)}",
                'messages': self.messages,
                'timestamp': time.time()
            }




@app.entrypoint
async def invoke(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    AgentCore entry point for Margin Analysis Agent.
    
    This function is called by AgentCore Runtime when the agent is invoked.
    It instantiates the agent, executes the analysis, and returns results.
    
    The margin analysis agent synthesizes demand forecast and competitive
    analysis results, applies margin rules and compliance validation, and
    generates the final pricing recommendation.
    
    Args:
        payload: Invocation payload containing:
            - product: Product data object (required)
                - product_id: Product identifier
                - cost: Product cost for margin calculation
                - MSRP: Manufacturer's Suggested Retail Price
                - MAP: Minimum Advertised Price
                - category: Product category (e.g., "powertools")
                - subcategory: Product subcategory (e.g., "drills")
                - role: Product role/tier (Best, Better, Good, Entry)
                - vendor: Product vendor
                - features: Product features list
                - attributes: Product attributes dictionary
            - sessionId: Pricing session identifier (required)
            - user_input: Analysis request description (optional)
            - supervisor_results: Results from previous agents (optional)
                - demand_forecast: Demand forecast results
                - competitive_analysis: Competitive analysis results
    
    Returns:
        Agent execution result containing:
            - status: 'completed', 'completed_with_warnings', or 'failed'
            - analysis: Margin analysis results with:
                - suggested_price: Final recommended price
                - calculated_margin: Calculated margin percentage
                - is_map_compliant: MAP compliance status
                - is_margin_compliant: Margin compliance status
                - is_msrp_compliant: MSRP compliance status
                - requires_review: Manual review requirement flag
                - compliance_details: Detailed compliance checks
                - pricing_rationale: Comprehensive pricing explanation
                - demand_weight: Weight given to demand forecast
                - competitive_weight: Weight given to competitive analysis
                - margin_adjustment: Margin-based price adjustment
            - final_recommendation: Final pricing recommendation with:
                - recommended_price: Final recommended price
                - confidence: Overall confidence score (0-1)
                - price_range: Min/max price range
            - messages: Real-time progress messages
            - performance: Execution performance metrics
            - timestamp: Unix timestamp
    
    Raises:
        Exception: If agent execution fails
    
    Example Payload:
        {
            "product": {
                "product_id": "DCCS620B",
                "cost": 50.00,
                "MSRP": 129.99,
                "MAP": 89.99,
                "category": "powertools",
                "subcategory": "drills",
                "role": "Good",
                "vendor": "DEWALT",
                "features": ["LED Light", "Electric Brake"],
                "attributes": {"powerType": "cordless", "voltage": "20V"}
            },
            "sessionId": "session-123-456",
            "user_input": "Generate final pricing recommendation"
        }
    
    Example Response:
        {
            "status": "completed",
            "analysis": {
                "suggested_price": 99.99,
                "calculated_margin": 0.35,
                "is_map_compliant": true,
                "is_margin_compliant": true,
                "is_msrp_compliant": true,
                "requires_review": false,
                "pricing_rationale": "Final price synthesizes demand forecast...",
                "demand_weight": 0.40,
                "competitive_weight": 0.35,
                "margin_adjustment": 0.25
            },
            "final_recommendation": {
                "recommended_price": 99.99,
                "confidence": 0.87,
                "price_range": {"min": 89.99, "max": 109.99}
            },
            "messages": [...],
            "performance": {
                "totalDuration": 2.45,
                "performanceStatus": "optimal"
            },
            "timestamp": 1705320645.123
        }
    
    Requirements: 2.2
    """
    # Extract session ID and product data
    session_id = payload.get('sessionId') or payload.get('session_id')
    product_data = payload.get('product', {})
    product_id = product_data.get('product_id', 'unknown')
    user_input = payload.get('user_input', 'Generate final pricing recommendation')
    supervisor_results = payload.get('supervisor_results', {})
    
    app.logger.info("Margin Analysis Agent invoked", extra={
        'session_id': session_id,
        'product_id': product_id,
        'has_product_data': bool(product_data),
        'has_supervisor_results': bool(supervisor_results),
        'user_input': user_input
    })
    
    try:
        # Validate required parameters
        if not product_data:
            raise ValueError('Missing required parameter: product')
        
        if not session_id:
            raise ValueError('Missing required parameter: sessionId')
        
        # Validate product data has required fields
        required_fields = ['product_id', 'cost', 'MSRP', 'MAP', 'category', 'role']
        missing_fields = [field for field in required_fields if field not in product_data]
        
        if missing_fields:
            raise ValueError(f'Product data missing required fields: {", ".join(missing_fields)}')
        
        # Instantiate agent
        agent = MarginAnalysisAgent()
        
        # Execute analysis
        result = await agent.execute_analysis(payload)
        
        app.logger.info("Margin Analysis Agent execution completed", extra={
            'status': result.get('status'),
            'session_id': session_id,
            'product_id': product_id,
            'duration': result.get('performance', {}).get('totalDuration'),
            'requires_review': result.get('analysis', {}).get('requires_review'),
            'recommended_price': result.get('final_recommendation', {}).get('recommended_price'),
            'confidence': result.get('final_recommendation', {}).get('confidence')
        })
        
        return result
        
    except ValueError as e:
        app.logger.error(f"Validation error: {e}", extra={
            'session_id': session_id,
            'product_id': product_id
        })
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': time.time()
        }
    
    except Exception as e:
        app.logger.error(f"Unexpected error during agent execution: {e}", extra={
            'session_id': session_id,
            'product_id': product_id,
            'error_type': type(e).__name__
        }, exc_info=True)
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': time.time()
        }




if __name__ == "__main__":
    """
    Local testing entry point.
    
    Run locally with:
        python agent_handler_new.py
    
    Then test with:
        curl -X POST http://localhost:8080/invocations \
             -H "Content-Type: application/json" \
             -d '{
               "product": {
                 "product_id": "TEST-001",
                 "cost": 50.00,
                 "MSRP": 129.99,
                 "MAP": 89.99,
                 "category": "powertools",
                 "subcategory": "drills",
                 "role": "Good",
                 "vendor": "TEST_VENDOR"
               },
               "sessionId": "test-session-123"
             }'
    
    Requirements: 2.1
    """
    print("Starting Margin Analysis Agent in local mode...")
    print("Listening on http://localhost:8080")
    print("\nTest with:")
    print('  curl -X POST http://localhost:8080/invocations \\')
    print('       -H "Content-Type: application/json" \\')
    print('       -d \'{"product":{"product_id":"TEST-001","cost":50.00,"MSRP":129.99,"MAP":89.99,"category":"powertools","role":"Good"},"sessionId":"test-session"}\'')
    print()
    
    app.run()
