/**
 * @fileoverview GraphQL resolver for searching products with full-text search.
 *
 * Handles product search with advanced filtering and pagination
 * using DynamoDB GSI3 for searchable text matching.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Lambda handler for searchProducts GraphQL resolver.
 *
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Product connection with search results
 */
const handler = async (event) => {
  console.log("SearchProducts resolver event:", JSON.stringify(event, null, 2));

  const { category, query, filter = {}, first = 20, after } = event.arguments;

  try {
    // Validate inputs
    if (!category) {
      throw new Error("Category is required");
    }

    if (!query || query.trim().length === 0) {
      throw new Error("Search query is required");
    }

    if (first > 100) {
      throw new Error("Maximum page size is 100 items");
    }

    // Build search parameters
    const searchParams = buildSearchParams(
      category,
      query,
      filter,
      first,
      after
    );

    console.log(
      "DynamoDB search params:",
      JSON.stringify(searchParams, null, 2)
    );

    // Execute DynamoDB scan with filter (since GSI3 doesn't exist)
    const command = new ScanCommand(searchParams);
    const result = await dynamodb.send(command);

    console.log(`Search returned ${result.Items.length} items`);

    // Transform to GraphQL connection format
    const connection = transformToConnection(result, first);

    return connection;
  } catch (error) {
    console.error("SearchProducts resolver error:", error);
    throw error;
  }
};

/**
 * Builds DynamoDB query parameters for search.
 */
function buildSearchParams(category, query, filter, first, after) {
  // Normalize search query
  const normalizedQuery = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

  // Use scan with filter since GSI3 doesn't exist in the deployed table
  let params = {
    TableName: process.env.PRODUCT_TABLE_NAME,
    FilterExpression:
      "PK = :categoryPK AND begins_with(SK, :productPrefix) AND (contains(product_id, :searchQuery) OR contains(vendor, :searchQuery) OR contains(subcategory, :searchQuery))",
    ExpressionAttributeValues: {
      ":categoryPK": `CATEGORY#${category}`,
      ":productPrefix": "PRODUCT#",
      ":searchQuery": normalizedQuery,
    },
    Limit: first + 1, // Get one extra to determine hasNextPage
  };

  // Decode cursor for pagination
  if (after) {
    try {
      const exclusiveStartKey = JSON.parse(
        Buffer.from(after, "base64").toString()
      );
      params.ExclusiveStartKey = exclusiveStartKey;
    } catch (err) {
      throw new Error("Invalid cursor format");
    }
  }

  // Add filter expressions for additional filters
  const filterExpressions = [];
  const expressionAttributeNames = {};

  if (filter && filter.roles && filter.roles.length > 0) {
    filterExpressions.push("#role IN (:roles)");
    expressionAttributeNames["#role"] = "role";
    params.ExpressionAttributeValues[":roles"] = filter.roles;
  }

  if (filter && filter.subcategories && filter.subcategories.length > 0) {
    filterExpressions.push("#subcategory IN (:subcategories)");
    expressionAttributeNames["#subcategory"] = "subcategory";
    params.ExpressionAttributeValues[":subcategories"] = filter.subcategories;
  }

  if (filter && filter.vendors && filter.vendors.length > 0) {
    filterExpressions.push("#vendor IN (:vendors)");
    expressionAttributeNames["#vendor"] = "vendor";
    params.ExpressionAttributeValues[":vendors"] = filter.vendors;
  }

  if (filter && filter.priceRange) {
    if (filter.priceRange.min !== undefined) {
      filterExpressions.push("MSRP >= :minPrice");
      params.ExpressionAttributeValues[":minPrice"] = filter.priceRange.min;
    }
    if (filter.priceRange.max !== undefined) {
      filterExpressions.push("MSRP <= :maxPrice");
      params.ExpressionAttributeValues[":maxPrice"] = filter.priceRange.max;
    }
  }

  // Add category-specific filters
  if (filter) {
    // Kitchen-specific filters
    if (filter.capacities && filter.capacities.length > 0) {
      filterExpressions.push("contains(#attributes, :capacityKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":capacityKey"] = "capacity";
    }

    if (filter.materials && filter.materials.length > 0) {
      filterExpressions.push("contains(#attributes, :materialKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":materialKey"] = "material";
    }

    if (filter.colors && filter.colors.length > 0) {
      filterExpressions.push("contains(#attributes, :colorKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":colorKey"] = "color";
    }

    if (filter.powers && filter.powers.length > 0) {
      filterExpressions.push("contains(#attributes, :powerKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":powerKey"] = "power";
    }

    if (filter.speeds && filter.speeds.length > 0) {
      filterExpressions.push("contains(#attributes, :speedKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":speedKey"] = "speed";
    }

    // Apparel-specific filters
    if (filter.sizes && filter.sizes.length > 0) {
      filterExpressions.push("contains(#attributes, :sizeKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":sizeKey"] = "size";
    }

    if (filter.genders && filter.genders.length > 0) {
      filterExpressions.push("contains(#attributes, :genderKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":genderKey"] = "gender";
    }

    if (filter.seasons && filter.seasons.length > 0) {
      filterExpressions.push("contains(#attributes, :seasonKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":seasonKey"] = "season";
    }

    if (filter.fits && filter.fits.length > 0) {
      filterExpressions.push("contains(#attributes, :fitKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":fitKey"] = "fit";
    }

    if (filter.sleeves && filter.sleeves.length > 0) {
      filterExpressions.push("contains(#attributes, :sleeveKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":sleeveKey"] = "sleeve";
    }

    // Footwear-specific filters
    if (filter.widths && filter.widths.length > 0) {
      filterExpressions.push("contains(#attributes, :widthKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":widthKey"] = "width";
    }

    if (filter.styles && filter.styles.length > 0) {
      filterExpressions.push("contains(#attributes, :styleKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":styleKey"] = "style";
    }

    if (filter.closures && filter.closures.length > 0) {
      filterExpressions.push("contains(#attributes, :closureKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":closureKey"] = "closure";
    }

    if (filter.soles && filter.soles.length > 0) {
      filterExpressions.push("contains(#attributes, :soleKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":soleKey"] = "sole";
    }

    // Powertools-specific filters
    if (filter.powerTypes && filter.powerTypes.length > 0) {
      filterExpressions.push("contains(#attributes, :powerTypeKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":powerTypeKey"] = "powerType";
    }

    if (filter.batteryVoltages && filter.batteryVoltages.length > 0) {
      filterExpressions.push("contains(#attributes, :batteryVoltageKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":batteryVoltageKey"] = "batteryVoltage";
    }

    if (filter.motorTypes && filter.motorTypes.length > 0) {
      filterExpressions.push("contains(#attributes, :motorTypeKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":motorTypeKey"] = "motorType";
    }

    // Common filters
    if (filter.dimensions && filter.dimensions.length > 0) {
      filterExpressions.push("contains(#attributes, :dimensionKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":dimensionKey"] = "dimensions";
    }

    if (filter.weights && filter.weights.length > 0) {
      filterExpressions.push("contains(#attributes, :weightKey)");
      expressionAttributeNames["#attributes"] = "attributes";
      params.ExpressionAttributeValues[":weightKey"] = "weight";
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
    params.FilterExpression = filterExpressions.join(" AND ");
  }

  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
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
  const edges = items.slice(0, requestedCount).map((item) => ({
    node: transformProduct(item),
    cursor:
      item.cursor ||
      Buffer.from(
        JSON.stringify({
          timestamp: item.updatedAt,
          id: item.product_id,
        })
      ).toString("base64"),
  }));

  const pageInfo = {
    hasNextPage,
    hasPreviousPage: false, // We don't support backward pagination yet
    startCursor: edges.length > 0 ? edges[0].cursor : null,
    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
  };

  return {
    edges,
    pageInfo,
    totalCount: result.Count || 0, // Note: This is approximate for search queries
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
    updatedAt: item.updatedAt,
  };
}

module.exports = { handler };
