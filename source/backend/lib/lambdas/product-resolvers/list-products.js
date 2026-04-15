/**
 * @fileoverview GraphQL resolver for listing products with cursor-based pagination.
 * 
 * Handles product listing with advanced filtering, sorting, and pagination
 * optimized for large product catalogs using DynamoDB GSI queries.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Lambda handler for listProducts GraphQL resolver.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Product connection with pagination
 */
const handler = async (event) => {
  console.log('ListProducts resolver event:', JSON.stringify(event, null, 2));
  
  const { 
    category, 
    filter = {}, 
    first = 20, 
    after, 
    sortBy = 'UPDATED_AT', 
    sortDirection = 'DESC' 
  } = event.arguments;
  
  try {
    // Validate inputs
    if (!category) {
      throw new Error('Category is required');
    }
    
    if (first > 100) {
      throw new Error('Maximum page size is 100 items');
    }
    
    // Build query parameters based on filters
    const queryParams = buildQueryParams(category, filter, sortBy, sortDirection, first, after);
    
    console.log('DynamoDB query params:', JSON.stringify(queryParams, null, 2));
    
    // Execute DynamoDB query
    const command = new QueryCommand(queryParams);
    const result = await dynamodb.send(command);
    
    console.log(`Query returned ${result.Items.length} items`);
    
    // Transform to GraphQL connection format
    const connection = transformToConnection(result, first);
    
    return connection;
    
  } catch (error) {
    console.error('ListProducts resolver error:', error);
    throw error;
  }
};

/**
 * Builds DynamoDB query parameters based on filters and sorting.
 */
function buildQueryParams(category, filter, sortBy, sortDirection, first, after) {
  let params = {
    TableName: process.env.PRODUCT_TABLE_NAME,
    Limit: first + 1, // Get one extra to determine hasNextPage
    ScanIndexForward: sortDirection === 'ASC'
  };
  
  // Decode cursor for pagination
  let exclusiveStartKey = null;
  if (after) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(after, 'base64').toString());
    } catch (err) {
      throw new Error('Invalid cursor format');
    }
  }
  
  // Choose index and key condition based on filters and sorting
  if (filter && filter.roles && filter.roles.length === 1) {
    // Use GSI1 for role-based filtering
    params.IndexName = 'GSI1';
    params.KeyConditionExpression = 'GSI1PK = :rolePK';
    params.ExpressionAttributeValues = {
      ':rolePK': `ROLE#${filter.roles[0]}#${category}`
    };
    
    if (sortBy === 'PRICE') {
      // Price sorting is built into the GSI1SK
      params.ScanIndexForward = sortDirection === 'ASC';
    }
    
  } else if (filter && filter.vendors && filter.vendors.length === 1) {
    // Use GSI2 for vendor-based filtering
    params.IndexName = 'GSI2';
    params.KeyConditionExpression = 'GSI2PK = :vendorPK';
    params.ExpressionAttributeValues = {
      ':vendorPK': `VENDOR#${filter.vendors[0]}#${category}`
    };
    
  } else {
    // Use main table for category-based queries
    params.KeyConditionExpression = 'PK = :categoryPK AND begins_with(SK, :productPrefix)';
    params.ExpressionAttributeValues = {
      ':categoryPK': `CATEGORY#${category}`,
      ':productPrefix': 'PRODUCT#'
    };
  }
  
  // Add filter expressions for additional filters
  const filterExpressions = [];
  const expressionAttributeNames = {};
  
  if (filter && filter.subcategories && filter.subcategories.length > 0) {
    filterExpressions.push('#subcategory IN (:subcategories)');
    expressionAttributeNames['#subcategory'] = 'subcategory';
    params.ExpressionAttributeValues[':subcategories'] = filter.subcategories;
  }
  
  if (filter && filter.priceRange) {
    if (filter.priceRange.min !== undefined) {
      filterExpressions.push('MSRP >= :minPrice');
      params.ExpressionAttributeValues[':minPrice'] = filter.priceRange.min;
    }
    if (filter.priceRange.max !== undefined) {
      filterExpressions.push('MSRP <= :maxPrice');
      params.ExpressionAttributeValues[':maxPrice'] = filter.priceRange.max;
    }
  }
  
  // Add category-specific filters
  if (filter) {
    // Kitchen-specific filters
    if (filter.capacities && filter.capacities.length > 0) {
      filterExpressions.push('contains(#attributes, :capacityKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':capacityKey'] = 'capacity';
    }
    
    if (filter.materials && filter.materials.length > 0) {
      filterExpressions.push('contains(#attributes, :materialKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':materialKey'] = 'material';
    }
    
    if (filter.colors && filter.colors.length > 0) {
      filterExpressions.push('contains(#attributes, :colorKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':colorKey'] = 'color';
    }
    
    if (filter.powers && filter.powers.length > 0) {
      filterExpressions.push('contains(#attributes, :powerKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':powerKey'] = 'power';
    }
    
    if (filter.speeds && filter.speeds.length > 0) {
      filterExpressions.push('contains(#attributes, :speedKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':speedKey'] = 'speed';
    }
    
    // Apparel-specific filters
    if (filter.sizes && filter.sizes.length > 0) {
      filterExpressions.push('contains(#attributes, :sizeKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':sizeKey'] = 'size';
    }
    
    if (filter.genders && filter.genders.length > 0) {
      filterExpressions.push('contains(#attributes, :genderKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':genderKey'] = 'gender';
    }
    
    if (filter.seasons && filter.seasons.length > 0) {
      filterExpressions.push('contains(#attributes, :seasonKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':seasonKey'] = 'season';
    }
    
    if (filter.fits && filter.fits.length > 0) {
      filterExpressions.push('contains(#attributes, :fitKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':fitKey'] = 'fit';
    }
    
    if (filter.sleeves && filter.sleeves.length > 0) {
      filterExpressions.push('contains(#attributes, :sleeveKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':sleeveKey'] = 'sleeve';
    }
    
    // Footwear-specific filters
    if (filter.widths && filter.widths.length > 0) {
      filterExpressions.push('contains(#attributes, :widthKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':widthKey'] = 'width';
    }
    
    if (filter.styles && filter.styles.length > 0) {
      filterExpressions.push('contains(#attributes, :styleKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':styleKey'] = 'style';
    }
    
    if (filter.closures && filter.closures.length > 0) {
      filterExpressions.push('contains(#attributes, :closureKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':closureKey'] = 'closure';
    }
    
    if (filter.soles && filter.soles.length > 0) {
      filterExpressions.push('contains(#attributes, :soleKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':soleKey'] = 'sole';
    }
    
    // Powertools-specific filters
    if (filter.powerTypes && filter.powerTypes.length > 0) {
      filterExpressions.push('contains(#attributes, :powerTypeKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':powerTypeKey'] = 'powerType';
    }
    
    if (filter.batteryVoltages && filter.batteryVoltages.length > 0) {
      filterExpressions.push('contains(#attributes, :batteryVoltageKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':batteryVoltageKey'] = 'batteryVoltage';
    }
    
    if (filter.motorTypes && filter.motorTypes.length > 0) {
      filterExpressions.push('contains(#attributes, :motorTypeKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':motorTypeKey'] = 'motorType';
    }
    
    // Common filters
    if (filter.dimensions && filter.dimensions.length > 0) {
      filterExpressions.push('contains(#attributes, :dimensionKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':dimensionKey'] = 'dimensions';
    }
    
    if (filter.weights && filter.weights.length > 0) {
      filterExpressions.push('contains(#attributes, :weightKey)');
      expressionAttributeNames['#attributes'] = 'attributes';
      params.ExpressionAttributeValues[':weightKey'] = 'weight';
    }
  }
  
  // Add attribute-based filters
  if (filter && filter.attributes) {
    Object.entries(filter.attributes).forEach(([key, values], index) => {
      if (Array.isArray(values) && values.length > 0) {
        const attrName = `#attr${index}`;
        const attrValue = `:attrVal${index}`;
        filterExpressions.push(`${attrName} IN (${attrValue})`);
        expressionAttributeNames[attrName] = `attributes.${key}`;
        params.ExpressionAttributeValues[attrValue] = values;
      }
    });
  }
  
  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(' AND ');
  }
  
  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }
  
  if (exclusiveStartKey) {
    params.ExclusiveStartKey = exclusiveStartKey;
  }
  
  return params;
}

/**
 * Transforms DynamoDB result to GraphQL connection format.
 */
function transformToConnection(result, requestedCount) {
  const items = result.Items || [];
  
  // Check if there are more items (we requested +1)
  const hasNextPage = items.length > requestedCount;
  const edges = items.slice(0, requestedCount).map(item => ({
    node: transformProduct(item),
    cursor: item.cursor || Buffer.from(JSON.stringify({
      timestamp: item.updatedAt,
      id: item.product_id
    })).toString('base64')
  }));
  
  const pageInfo = {
    hasNextPage,
    hasPreviousPage: false, // We don't support backward pagination yet
    startCursor: edges.length > 0 ? edges[0].cursor : null,
    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null
  };
  
  return {
    edges,
    pageInfo,
    totalCount: result.Count || 0 // Note: This is approximate for filtered queries
  };
}

/**
 * Transforms DynamoDB item to GraphQL Product type.
 */
function transformProduct(item) {
  return {
    id: item.id,
    product_id: item.product_id,
    category: item.category,
    subcategory: item.subcategory,
    role: item.role,
    vendor: item.vendor,
    cost: item.cost,
    MSRP: item.MSRP,
    MAP: item.MAP,
    yearTarget: item.yearTarget,
    attributes: JSON.stringify(item.attributes || {}),
    features: item.features || [],
    imageUrl: item.imageUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

module.exports = { handler };