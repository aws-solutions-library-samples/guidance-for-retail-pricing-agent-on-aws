# Shared Agent Utilities

This directory contains shared utilities used across all AgentCore pricing analysis agents.

## AppSync Utilities (`appsync_utils.py`)

The AppSync utilities module provides a simple API for agents to communicate with the frontend through AppSync GraphQL mutations. All mutations automatically trigger subscriptions, enabling real-time updates in the pricing dashboard.

### Features

- **Automatic Retry**: Exponential backoff retry logic (3 attempts by default)
- **AWS Signature V4**: Secure authentication using IAM credentials
- **Error Handling**: Comprehensive error logging and graceful degradation
- **Non-blocking Messages**: Message writes don't fail agent execution
- **Critical Updates**: Session updates fail agent if all retries exhausted

### Installation

The utilities require the following dependencies:

```bash
pip install boto3>=1.40.0 requests>=2.31.0
```

Or install from the requirements file:

```bash
pip install -r requirements.txt
```

### Usage

#### Basic Usage with AppSyncClient

```python
import os
from shared.appsync_utils import AppSyncClient

# Initialize client
client = AppSyncClient(
    appsync_endpoint=os.environ['APPSYNC_ENDPOINT'],
    region=os.environ.get('AWS_REGION', 'us-east-1')
)

# Write a progress message
await client.write_message(
    session_id='session-123',
    agent_id='demand-forecast',
    agent_name='Demand Forecast Agent',
    message='Starting demand analysis...'
)

# Update session with results
await client.update_session(
    session_id='session-123',
    status='in-progress',
    current_agent='demand-forecast',
    agent_status={
        'demandForecast': 'in-progress',
        'competitiveAnalysis': 'pending',
        'marginAnalysis': 'pending'
    }
)
```

#### Convenience Functions

For simple one-off calls, use the convenience functions:

```python
import os
from shared.appsync_utils import write_agent_message, update_pricing_session

# Write a message
await write_agent_message(
    appsync_endpoint=os.environ['APPSYNC_ENDPOINT'],
    session_id='session-123',
    agent_id='demand-forecast',
    agent_name='Demand Forecast Agent',
    message='Analysis complete'
)

# Update session
await update_pricing_session(
    appsync_endpoint=os.environ['APPSYNC_ENDPOINT'],
    session_id='session-123',
    status='completed',
    analysis_data={'demandForecast': {...}}
)
```

#### Complete Agent Integration Example

```python
import os
from shared.appsync_utils import AppSyncClient

async def agent_handler(event, context):
    session_id = event['sessionId']
    
    # Initialize AppSync client
    client = AppSyncClient(
        appsync_endpoint=os.environ['APPSYNC_ENDPOINT'],
        region=os.environ.get('AWS_REGION', 'us-east-1')
    )
    
    try:
        # Update session to show agent is starting
        await client.update_session(
            session_id=session_id,
            status='in-progress',
            current_agent='demand-forecast',
            agent_status={
                'demandForecast': 'in-progress',
                'competitiveAnalysis': 'pending',
                'marginAnalysis': 'pending'
            }
        )
        
        # Write progress message
        await client.write_message(
            session_id=session_id,
            agent_id='demand-forecast',
            agent_name='Demand Forecast Agent',
            message='Starting demand analysis...'
        )
        
        # Perform analysis
        result = await perform_analysis(event)
        
        # Write completion message
        await client.write_message(
            session_id=session_id,
            agent_id='demand-forecast',
            agent_name='Demand Forecast Agent',
            message=f'Analysis complete. Recommended price: ${result["price"]:.2f}'
        )
        
        # Update session with results
        await client.update_session(
            session_id=session_id,
            current_agent='demand-forecast',
            agent_status={
                'demandForecast': 'complete',
                'competitiveAnalysis': 'pending',
                'marginAnalysis': 'pending'
            },
            analysis_data={
                'demandForecast': result
            }
        )
        
        return {'status': 'success', 'result': result}
        
    except Exception as e:
        # Update session with error
        await client.update_session(
            session_id=session_id,
            status='failed',
            current_agent='demand-forecast',
            agent_status={
                'demandForecast': 'failed',
                'competitiveAnalysis': 'pending',
                'marginAnalysis': 'pending'
            },
            error_details={
                'message': str(e),
                'agentId': 'demand-forecast',
                'timestamp': datetime.now().isoformat()
            }
        )
        raise
```

### Environment Variables

The utilities require the following environment variables:

- `APPSYNC_ENDPOINT`: AppSync GraphQL API endpoint URL
- `AWS_REGION`: AWS region (optional, defaults to us-east-1)

These should be set in your agent's Lambda configuration.

### Error Handling

#### Message Writes (Non-Critical)

Message writes are non-critical operations. If all retry attempts fail:
- The error is logged
- The function returns `None`
- Agent execution continues normally

This ensures that communication failures don't block the core analysis workflow.

#### Session Updates (Critical)

Session updates are critical operations. If all retry attempts fail:
- The error is logged
- An exception is raised
- Agent execution fails

This ensures that session state remains consistent and the frontend receives accurate status information.

### Retry Logic

Both `write_message()` and `update_session()` implement exponential backoff retry logic:

- **Max Retries**: 3 attempts (configurable)
- **Backoff Schedule**: 1s, 2s, 4s
- **Total Max Time**: ~7 seconds for all retries

### Authentication

The utilities use AWS Signature V4 authentication with IAM credentials:

1. Credentials are automatically obtained from the Lambda execution environment
2. Each request is signed with the agent's IAM role
3. AppSync validates the signature and authorizes the request

Ensure your agent's IAM role has the following permissions:

```json
{
  "Effect": "Allow",
  "Action": ["appsync:GraphQL"],
  "Resource": [
    "arn:aws:appsync:REGION:ACCOUNT:apis/API_ID/types/Mutation/fields/createChatMessage",
    "arn:aws:appsync:REGION:ACCOUNT:apis/API_ID/types/Mutation/fields/updatePricingSession"
  ]
}
```

### Logging

The utilities use Python's standard logging module. Configure logging in your agent:

```python
import logging

# Set log level
logging.basicConfig(level=logging.INFO)

# Or for more detailed logs
logging.basicConfig(level=logging.DEBUG)
```

Log levels:
- `DEBUG`: Detailed execution information (retries, request details)
- `INFO`: High-level operation status (success/failure)
- `WARNING`: Non-critical issues (unexpected response format)
- `ERROR`: Critical failures (all retries exhausted)

### Testing

To test the utilities locally, you can mock the AppSync endpoint:

```python
import asyncio
from unittest.mock import patch, MagicMock
from shared.appsync_utils import AppSyncClient

async def test_write_message():
    client = AppSyncClient('https://fake-endpoint.com/graphql')
    
    with patch.object(client, '_execute_mutation') as mock_execute:
        mock_execute.return_value = {
            'data': {
                'createChatMessage': {
                    'id': 'msg-123',
                    'message': 'Test message'
                }
            }
        }
        
        result = await client.write_message(
            session_id='test-session',
            agent_id='test-agent',
            agent_name='Test Agent',
            message='Test message'
        )
        
        assert result['id'] == 'msg-123'
        assert mock_execute.called

# Run test
asyncio.run(test_write_message())
```

## DynamoDB Utilities (`dynamodb_utils.py`)

The DynamoDB utilities module provides common database operations with built-in retry logic and error handling.

### Features

- **Automatic Retry**: Exponential backoff for transient errors
- **Error Handling**: Comprehensive error logging and recovery
- **Performance Tracking**: Execution time metrics
- **Batch Operations**: Efficient multi-item retrieval

### Usage

#### Basic Usage with DynamoDBClient

```python
import os
from shared.dynamodb_utils import DynamoDBClient

# Initialize client
client = DynamoDBClient(
    table_name=os.environ['PRICING_TABLE_NAME'],
    region=os.environ.get('AWS_REGION', 'us-east-1')
)

# Update agent result
await client.update_pricing_record(
    session_id='session-123',
    agent_field='demandForecast',
    agent_data={
        'recommended_price': 99.99,
        'confidence': 0.85
    },
    status='demand_analysis_complete'
)

# Get pricing session
session = await client.get_pricing_session('session-123')

# Query sessions by user
sessions = await client.query_sessions_by_user('user-456', limit=10)
```

#### Convenience Functions

```python
import os
from shared.dynamodb_utils import update_agent_result, get_session

# Update agent result
await update_agent_result(
    table_name=os.environ['PRICING_TABLE_NAME'],
    session_id='session-123',
    agent_field='competitiveAnalysis',
    agent_data={'average_price': 89.99},
    status='competitive_analysis_complete'
)

# Get session
session = await get_session(
    table_name=os.environ['PRICING_TABLE_NAME'],
    session_id='session-123'
)
```

#### Complete Agent Integration Example

```python
import os
from shared.appsync_utils import AppSyncClient
from shared.dynamodb_utils import DynamoDBClient

async def agent_handler(event, context):
    session_id = event['sessionId']
    
    # Initialize clients
    appsync_client = AppSyncClient(
        appsync_endpoint=os.environ['APPSYNC_ENDPOINT']
    )
    dynamodb_client = DynamoDBClient(
        table_name=os.environ['PRICING_TABLE_NAME']
    )
    
    try:
        # Update session state via AppSync
        await appsync_client.update_session(
            session_id=session_id,
            status='in-progress',
            current_agent='demand-forecast'
        )
        
        # Write progress message
        await appsync_client.write_message(
            session_id=session_id,
            agent_id='demand-forecast',
            agent_name='Demand Forecast Agent',
            message='Starting analysis...'
        )
        
        # Perform analysis
        result = await perform_analysis(event)
        
        # Update DynamoDB with results
        await dynamodb_client.update_pricing_record(
            session_id=session_id,
            agent_field='demandForecast',
            agent_data=result,
            status='demand_analysis_complete'
        )
        
        # Write completion message
        await appsync_client.write_message(
            session_id=session_id,
            agent_id='demand-forecast',
            agent_name='Demand Forecast Agent',
            message=f'Analysis complete: ${result["price"]:.2f}'
        )
        
        return {'status': 'success', 'result': result}
        
    except Exception as e:
        # Update session with error
        await appsync_client.update_session(
            session_id=session_id,
            status='failed',
            error_details={'message': str(e)}
        )
        raise
```

### DynamoDB Operations

#### Update Pricing Record

Updates a specific agent field in the pricing record with retry logic:

```python
result = await client.update_pricing_record(
    session_id='session-123',
    agent_field='marginAnalysis',
    agent_data={
        'margin_percentage': 35.5,
        'compliance_status': 'compliant'
    },
    status='margin_analysis_complete'
)
```

#### Get Pricing Session

Retrieves a complete pricing session record:

```python
session = await client.get_pricing_session('session-123')
if session:
    print(f"Status: {session.get('status')}")
    print(f"Product: {session.get('product', {}).get('product_id')}")
```

#### Query Sessions by User

Retrieves recent sessions for a specific user:

```python
sessions = await client.query_sessions_by_user(
    user_id='user-456',
    limit=20
)
for session in sessions:
    print(f"Session: {session['sessionId']}, Status: {session['status']}")
```

#### Batch Get Items

Retrieves multiple items efficiently:

```python
keys = [
    {'PK': 'PRICING#session-1', 'SK': 'METADATA'},
    {'PK': 'PRICING#session-2', 'SK': 'METADATA'},
    {'PK': 'PRICING#session-3', 'SK': 'METADATA'}
]
items = await client.batch_get_items(keys)
```

### Error Handling

The DynamoDB client handles both retryable and non-retryable errors:

**Retryable Errors** (automatic retry with backoff):
- `ProvisionedThroughputExceededException`
- `ThrottlingException`
- `ServiceUnavailable`
- `InternalServerError`
- `RequestLimitExceeded`

**Non-Retryable Errors** (immediate failure):
- `ResourceNotFoundException`
- `ValidationException`
- `ConditionalCheckFailedException`

### Retry Logic

- **Max Retries**: 3 attempts (configurable)
- **Backoff Schedule**: 1s, 2s, 4s (with jitter)
- **Total Max Time**: ~7 seconds for all retries

### Performance Metrics

All operations track execution time:

```python
result = await client.update_pricing_record(...)
print(f"Update took {result['execution_time_ms']:.0f}ms")
```

## Requirements

See `requirements.txt` for the complete list of dependencies.

## Related Documentation

- [Real-Time Communication Design](../../../../../.kiro/specs/pricing-dashboard/realtime-communication/design.md)
- [Real-Time Communication Requirements](../../../../../.kiro/specs/pricing-dashboard/realtime-communication/requirements.md)
- [AppSync GraphQL Schema](../../../../graphql/schema.graphql)
- [DynamoDB Single Table Design](../../../../../docs/architecture/data-models.md)
