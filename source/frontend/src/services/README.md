# Catalog Service Architecture

This document describes the GraphQL-based catalog service architecture for the product catalog management system.

## Overview

The `CatalogService` implements a modern GraphQL-based approach that combines:
- **Static categories** bundled with the frontend build for instant loading
- **GraphQL-based product fetching** via AWS AppSync for scalable operations
- **Comprehensive error handling** for GraphQL operations
- **Advanced caching** with Apollo Client integration

## Architecture

### Current (GraphQL-Based)
```
Frontend → CatalogService → GraphQL API → DynamoDB
                         ↘ Apollo Cache
```

## Key Components

### 1. CatalogService (`catalog-service.ts`)

The main service class that orchestrates data fetching:

```typescript
import { catalogService } from '../services/catalog-service';

// Get categories (static, instant)
const categories = await catalogService.getCategories();

// Get products with GraphQL
const result = await catalogService.getProducts({
  category: 'powertools',
  filter: { roles: ['best', 'better'] },
  searchQuery: 'drill',
  first: 20
});

// Get category statistics
const stats = await catalogService.getCategoryStats('powertools');

// Cache management
await catalogService.clearCache();
const cacheStats = catalogService.getCacheStats();
```

### 2. Product Catalog Hooks

All hooks use the GraphQL-based service:

```typescript
import { useProductCatalog, useProducts, useCategoryStats } from '../hooks/useProductCatalog';

// Main catalog hook with GraphQL architecture
const {
  categories,           // Static categories (instant)
  selectedCategory,
  products,            // GraphQL products
  isLoadingProducts,
  productsError,       // GraphQLServiceError with detailed info
  selectCategory,
  filters,
  setFilters
} = useProductCatalog();
```

## Error Handling

The new service provides comprehensive error handling:

```typescript
import { GraphQLServiceError, GraphQLErrorType } from '../services/catalog-service';

try {
  const products = await catalogService.getProducts({ category: 'powertools' });
} catch (error) {
  if (error instanceof GraphQLServiceError) {
    switch (error.type) {
      case GraphQLErrorType.NETWORK_ERROR:
        // Handle network issues
        break;
      case GraphQLErrorType.AUTHENTICATION_ERROR:
        // Handle auth issues
        break;
      case GraphQLErrorType.NOT_FOUND:
        // Handle missing data
        break;
      default:
        // Handle other errors
    }
  }
}
```

## Service Availability

The service provides methods to check GraphQL availability:

```typescript
// Check if GraphQL is available
const isAvailable = await catalogService.checkGraphQLAvailability();

// Get current service status
const status = catalogService.getServiceStatus();
```

## Cache Management

The service provides advanced caching capabilities:

```typescript
// Clear Apollo cache
await catalogService.clearCache();

// Reset cache and refetch active queries
await catalogService.resetCache();

// Get detailed cache statistics
const stats = catalogService.getCacheStats();
console.log('Apollo cache size:', stats.apolloCache.size);
console.log('Cache size in bytes:', stats.apolloCache.sizeInBytes);
```

## GraphQL Operations

The service supports various GraphQL operations:

### Product Queries
- `listProducts` - Paginated product listing with filters
- `searchProducts` - Full-text search across products
- `getCategoryStats` - Category statistics and counts
- `getCategoryFilters` - Available filter options

### Cursor-Based Pagination
```typescript
const result = await catalogService.getProducts({
  category: 'powertools',
  first: 20,
  after: 'cursor-token'
});

// Access pagination info
console.log('Has next page:', result.pageInfo.hasNextPage);
console.log('End cursor:', result.pageInfo.endCursor);
```

## Monitoring and Debugging

### Service Status
```typescript
const status = catalogService.getServiceStatus();
// Returns: { graphqlEnabled, cacheStats }
```

### Error Logging
All errors are logged with structured data:
```typescript
console.error('GraphQL getProducts error:', {
  type: 'NETWORK_ERROR',
  message: 'Failed to fetch',
  originalError: error,
  query: 'getProducts'
});
```

## Best Practices

### 1. Error Handling
Always handle GraphQLServiceError specifically:
```typescript
try {
  const result = await catalogService.getProducts(options);
} catch (error) {
  if (error instanceof GraphQLServiceError) {
    // Handle service-specific errors
    handleServiceError(error);
  } else {
    // Handle unexpected errors
    handleUnknownError(error);
  }
}
```

### 2. Loading States
Use the loading states from hooks:
```typescript
const { isLoadingProducts, productsError } = useProductCatalog();

if (isLoadingProducts) {
  return <Spinner />;
}

if (productsError) {
  return <Alert type="error">{productsError.message}</Alert>;
}
```

### 3. Cache Optimization
Clear cache when switching users or contexts:
```typescript
// On user logout
await catalogService.clearCache();

// On context switch
await catalogService.resetCache();
```

### 4. Service Health Monitoring
Monitor GraphQL service health:
```typescript
// Check if GraphQL is working
const isHealthy = await catalogService.checkGraphQLAvailability();

if (!isHealthy) {
  // Handle service unavailability
  showErrorMessage('Catalog service is currently unavailable');
}
```

## Service Features

The GraphQL-based service provides:
- All existing hook interfaces remain the same
- Enhanced error handling with detailed error types
- Improved performance with optimized queries
- Real-time capabilities via GraphQL subscriptions

## Performance Features

The GraphQL architecture provides:
- **Instant category loading** (static data)
- **Cursor-based pagination** for large product sets
- **Advanced caching** with Apollo Client
- **Real-time updates** via GraphQL subscriptions
- **Optimized queries** with DynamoDB single-table design

## Testing

Use the example component to test the migration:
```typescript
import { CatalogServiceExample } from '../examples/catalog-service-usage';

// Renders service status, migration tools, and demo
<CatalogServiceExample />
```

## Troubleshooting

### Common Issues

1. **GraphQL Unavailable**
   - Check network connectivity
   - Verify authentication tokens
   - Confirm AppSync endpoint configuration

2. **Cache Issues**
   - Clear Apollo cache: `catalogService.clearCache()`
   - Reset cache: `catalogService.resetCache()`
   - Check cache statistics: `catalogService.getCacheStats()`

3. **Query Errors**
   - Check GraphQL schema compatibility
   - Verify query variables and filters
   - Review error logs for specific issues

### Debug Tools

```typescript
// Enable debug logging
localStorage.setItem('debug', 'catalog-service:*');

// Check service health
const isHealthy = await catalogService.checkGraphQLAvailability();

// Get detailed status
const status = catalogService.getServiceStatus();
```