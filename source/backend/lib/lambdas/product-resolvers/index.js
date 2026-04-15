/**
 * @fileoverview Main entry point for product resolver Lambda functions.
 * 
 * Routes AppSync resolver events to the appropriate handler based on field name.
 */

const { handler: listProductsHandler } = require('./list-products');
const { handler: searchProductsHandler } = require('./search-products');
const { handler: categoryStatsHandler } = require('./category-stats');
const { handler: categoryFiltersHandler } = require('./category-filters');
const { handler: getProductHandler } = require('./get-product');
const { handler: createProductHandler } = require('./create-product');
const { handler: updateProductHandler } = require('./update-product');
const { handler: deleteProductHandler } = require('./delete-product');
const { handler: createPricingHandler } = require('./create-pricing');
const { handler: updatePricingSessionHandler } = require('./update-pricing-session');
const { handler: updatePricingAnalysisHandler } = require('./update-pricing-analysis');
const { handler: pricingByUserIdHandler } = require('./pricing-by-user-id');
const { handler: appsyncResolverHandler } = require('./appsync-resolver');
const { handler: resetDemoHandler } = require('./reset-demo');

/**
 * Main Lambda handler that routes to specific resolvers.
 * 
 * @param {Object} event - AppSync resolver event
 * @returns {Promise<Object>} Resolver response
 */
const handler = async (event) => {
  console.log('Product resolver event:', JSON.stringify(event, null, 2));
  
  const { fieldName } = event.info;
  
  try {
    switch (fieldName) {
      case 'listProducts':
        return await listProductsHandler(event);
        
      case 'searchProducts':
        return await searchProductsHandler(event);
        
      case 'getCategoryStats':
        return await categoryStatsHandler(event);
        
      case 'getCategoryFilters':
        return await categoryFiltersHandler(event);
        
      case 'getProduct':
        return await getProductHandler(event);
        
      case 'createProduct':
        return await createProductHandler(event);
        
      case 'updateProduct':
        return await updateProductHandler(event);
        
      case 'deleteProduct':
        return await deleteProductHandler(event);
        
      case 'createPricing':
        return await createPricingHandler(event);
        
      case 'updatePricingSession':
        return await updatePricingSessionHandler(event);
        
      case 'updatePricingAnalysis':
        return await updatePricingAnalysisHandler(event);
        
      case 'pricingByUserId':
        return await pricingByUserIdHandler(event);
        
      case 'appsyncResolver':
        return await appsyncResolverHandler(event);
        
      case 'resetDemo':
        return await resetDemoHandler(event);
        
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error(`Error in ${fieldName} resolver:`, error);
    throw error;
  }
};

module.exports = { handler };