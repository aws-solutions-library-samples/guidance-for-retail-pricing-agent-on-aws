/**
 * @fileoverview ProductSelector main container component for product catalog management.
 * 
 * Orchestrates category selection, product catalog display, filtering, searching,
 * and product selection using the hybrid GraphQL architecture with static categories
 * and dynamic product fetching. Integrates with authentication, pricing services,
 * and notification management.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Grid,
  Box,
  Alert,
  BreadcrumbGroup,
  Flashbar
} from '@cloudscape-design/components';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useAtom } from 'jotai';
import { useProductCatalog } from '../hooks/useProductCatalog';
import { useCategoryFilters } from '../hooks/useCategoryFilters';
import { usePricingService } from '../hooks/usePricingService';
import { useNavigation } from '../hooks/useNavigation';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { 
  notificationsAtom, 
  addNotificationAtom, 
  removeNotificationAtom,
  createSuccessNotification,
  createErrorNotification,
  createInfoNotification,
  createWarningNotification
} from '../atoms/notification';
import { ProductType } from '../types/product-types';
import { CategorySelector } from './CategorySelector';
import { ProductCatalogGrid } from './ProductCatalogGrid';
import { ProductFilters } from './ProductFilters';
import { ProductSearch } from './ProductSearch';
import { ProductDetailModal } from './ProductDetailModal';
import { DebugInfo } from './DebugInfo';

/**
 * Props for ProductSelector component.
 */
export interface ProductSelectorProps {
  /** Callback when a product is selected for pricing analysis */
  onProductSelected?: (product: ProductType) => void;
  /** Whether pricing analysis is currently starting */
  isStartingAnalysis?: boolean;
}

/**
 * ProductSelector main container component.
 * 
 * Manages the complete product catalog workflow including category selection,
 * product browsing, filtering, searching, and product selection. Uses the
 * hybrid architecture with static categories and GraphQL products.
 * Integrates with authentication, pricing services, and navigation.
 */
export const ProductSelector = ({
  onProductSelected,
  isStartingAnalysis = false
}: ProductSelectorProps) => {
  // Authentication
  const { user } = useAuthenticator();
  
  // Navigation
  const { navigateToPricingAnalysis } = useNavigation();
  
  // Notification state management
  const [notifications] = useAtom(notificationsAtom);
  const [, addNotification] = useAtom(addNotificationAtom);
  const [, removeNotification] = useAtom(removeNotificationAtom);
  
  // Error handling
  const {
    hasError,
    currentError,
    isRetrying,
    retryCount,
    handleError,
    retry,
    clearError,
    canRetry
  } = useErrorHandler({
    maxRetries: 3,
    enableAutoRetry: false, // Manual retry for better UX
    logErrors: true,
    showNotifications: true
  });
  
  // Pricing service integration
  const {
    createPricingAndInvokeResolver,
    isStartingWorkflow,
    workflowError
  } = usePricingService();

  // Modal state
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductType | null>(null);

  // Use the main product catalog hook
  const {
    // Categories (with real product counts)
    categories,
    isLoadingCategories,
    categoriesError,
    refetchCounts,
    selectedCategory,
    selectedCategoryInfo,
    selectCategory,

    // Products (GraphQL)
    products,
    totalProductCount,
    isLoadingProducts,
    productsError,
    hasMoreProducts,
    loadMoreProducts,
    refetchProducts,

    // Product selection
    selectedProduct,
    selectedProductId,
    selectProduct,

    // Filtering and search
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    clearFilters,

    // Sorting
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,

    // Utility
    isEmpty
  } = useProductCatalog();

  // Get filter options for selected category
  const {
    filterOptions,
    isLoading: isLoadingFilters,
    error: filtersError
  } = useCategoryFilters(selectedCategory || 'powertools', !!selectedCategory);

  // Handle product detail modal
  const handleShowProductDetails = useCallback((product: ProductType) => {
    setDetailProduct(product);
    setShowProductDetail(true);
  }, []);

  const handleCloseProductDetails = useCallback(() => {
    setShowProductDetail(false);
    setDetailProduct(null);
  }, []);

  /**
   * Handles pricing analysis initiation with comprehensive validation and error handling.
   * 
   * This function implements a multi-step process:
   * 1. Validate product has required pricing data
   * 2. Create pricing session in DynamoDB
   * 3. Validate session is ready
   * 4. Invoke multi-agent orchestration workflow
   * 5. Navigate to pricing analysis page
   * 6. Handle errors with specific messages and retry capability
   */
  const handleStartPricingAnalysis = useCallback(async (product: ProductType) => {
    const analysisStartTime = Date.now();
    
    console.log(`[${new Date().toISOString()}] Starting pricing analysis initiation`, {
      productId: product.product_id,
      userId: user?.userId || user?.username,
      timestamp: analysisStartTime
    });

    // Pre-flight validation: Check if product has all required pricing fields
    // Note: MAP and MSRP are optional and can be 0 or null. The backend can handle
    // products without these values for pricing analysis. Only cost is strictly required.
    if (!product.cost || product.cost <= 0) {
      const missingFields = [];
      if (!product.cost || product.cost <= 0) missingFields.push('cost');
      
      const validationError = `Missing required pricing data: ${missingFields.join(', ')}`;
      console.error(`[${new Date().toISOString()}] Validation failed`, {
        productId: product.product_id,
        missingFields,
        error: validationError
      });
      
      // Show user-friendly error message with specific missing fields
      addNotification(createErrorNotification(
        'Missing Required Data',
        `This product is missing required pricing data (${missingFields.join(', ')}) and cannot be analyzed. Please select a different product.`
      ));
      return; // Early return to prevent further processing
    }

    /**
     * Inner function that performs the actual analysis workflow.
     * Separated to enable retry functionality through error handler.
     */
    const startAnalysis = async () => {
      // Step 1: Notify user that process is starting
      console.log(`[${new Date().toISOString()}] Step 1: Starting pricing analysis`, {
        productId: product.product_id,
        status: 'initiated'
      });

      addNotification(createInfoNotification(
        'Starting Pricing Analysis',
        `Initializing pricing analysis for ${product.product_id}...`
      ));

      // Step 2: Create pricing session and invoke multi-agent resolver
      // This is the main GraphQL mutation that:
      // - Creates a new pricing session in DynamoDB
      // - Validates session is ready
      // - Invokes the Lambda resolver for agent orchestration
      console.log(`[${new Date().toISOString()}] Step 2: Creating pricing session and validating`, {
        productId: product.product_id,
        status: 'in_progress'
      });

      addNotification(createInfoNotification(
        'Waiting for session to be ready',
        'Creating pricing session and validating availability...'
      ));

      const result = await createPricingAndInvokeResolver.mutateAsync({ product });
      
      const sessionCreationTime = Date.now() - analysisStartTime;
      console.log(`[${new Date().toISOString()}] Step 2 complete: Session created and validated`, {
        sessionId: result.pricing.id,
        productId: product.product_id,
        duration: `${sessionCreationTime}ms`,
        status: result.pricing.status
      });

      // Step 3: Notify user of resolver invocation
      console.log(`[${new Date().toISOString()}] Step 3: Invoking pricing analysis resolver`, {
        sessionId: result.pricing.id,
        productId: product.product_id,
        status: 'invoking'
      });

      addNotification(createInfoNotification(
        'Invoking pricing analysis',
        `Resolver invoked successfully. Session: ${result.pricing.id}`
      ));

      // Step 4: Notify user of successful initiation
      const totalTime = Date.now() - analysisStartTime;
      console.log(`[${new Date().toISOString()}] Step 4: Pricing analysis initiated successfully`, {
        sessionId: result.pricing.id,
        productId: product.product_id,
        resolverStatus: result.resolver.status,
        totalDuration: `${totalTime}ms`,
        status: 'success'
      });

      addNotification(createSuccessNotification(
        'Pricing Analysis Started',
        `Analysis session ${result.pricing.id} has been created successfully. Redirecting to dashboard...`
      ));

      // Step 5: Navigate to pricing analysis dashboard
      console.log(`[${new Date().toISOString()}] Step 5: Navigating to pricing analysis dashboard`, {
        sessionId: result.pricing.id
      });

      navigateToPricingAnalysis(result.pricing.id);
      
      // Step 6: Execute optional callback for parent component
      if (onProductSelected) {
        onProductSelected(product);
      }
      
      // Step 7: Clean up UI state
      handleCloseProductDetails();
    };

    try {
      await startAnalysis();
    } catch (error) {
      const errorTime = Date.now() - analysisStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Categorize error and provide specific user message
      let userMessage = 'An unexpected error occurred. Please try again.';
      let errorTitle = 'Analysis Failed';
      
      if (errorMessage.includes('authentication') || errorMessage.includes('Unauthorized')) {
        userMessage = 'Your session has expired. Please log in again and try the analysis.';
        errorTitle = 'Authentication Required';
        console.error(`[${new Date().toISOString()}] Authentication error`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`
        });
      } else if (errorMessage.includes('timeout') || errorMessage.includes('not ready')) {
        userMessage = 'The pricing session took too long to initialize. Please try again.';
        errorTitle = 'Session Initialization Timeout';
        console.error(`[${new Date().toISOString()}] Session timeout error`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`
        });
      } else if (errorMessage.includes('network') || errorMessage.includes('Network')) {
        userMessage = 'Network error occurred. Please check your connection and try again.';
        errorTitle = 'Network Error';
        console.error(`[${new Date().toISOString()}] Network error`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`
        });
      } else if (errorMessage.includes('DynamoDB') || errorMessage.includes('database')) {
        userMessage = 'Database error occurred. Please try again in a moment.';
        errorTitle = 'Database Error';
        console.error(`[${new Date().toISOString()}] Database error`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`
        });
      } else if (errorMessage.includes('resolver') || errorMessage.includes('Lambda')) {
        userMessage = 'Failed to invoke pricing analysis. Please try again.';
        errorTitle = 'Resolver Invocation Failed';
        console.error(`[${new Date().toISOString()}] Resolver invocation error`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`
        });
      } else {
        console.error(`[${new Date().toISOString()}] Unexpected error during pricing analysis`, {
          productId: product.product_id,
          error: errorMessage,
          duration: `${errorTime}ms`,
          stack: error instanceof Error ? error.stack : undefined
        });
      }

      // Show error notification with specific message
      addNotification(createErrorNotification(
        errorTitle,
        userMessage
      ));

      // Comprehensive error handling with retry capability
      // The error handler will:
      // - Process and categorize the error
      // - Show appropriate user notifications
      // - Provide retry functionality if applicable
      // - Log errors for debugging
      await handleError(error, 'PricingAnalysis', startAnalysis);
    }
  }, [
    addNotification, 
    createPricingAndInvokeResolver, 
    navigateToPricingAnalysis, 
    onProductSelected, 
    handleCloseProductDetails,
    handleError,
    user
  ]);

  // Handle back to categories
  const handleBackToCategories = useCallback(() => {
    selectCategory(null as any);
    selectProduct('');
    clearFilters();
    setSearchQuery('');
    clearError(); // Clear any existing errors when navigating
  }, [selectCategory, selectProduct, clearFilters, setSearchQuery, clearError]);

  // Helper function to get user-friendly error titles
  const getErrorTitle = useCallback((error: any) => {
    switch (error.type) {
      case 'NETWORK_ERROR':
        return 'Connection Error';
      case 'AUTHENTICATION_ERROR':
        return 'Authentication Required';
      case 'SESSION_EXPIRED':
        return 'Session Expired';
      case 'VALIDATION_ERROR':
        return 'Invalid Data';
      case 'DATA_FETCH_ERROR':
        return 'Loading Error';
      case 'GRAPHQL_ERROR':
        return 'Server Error';
      default:
        return 'Error';
    }
  }, []);

  // Handle workflow errors with comprehensive error processing
  useEffect(() => {
    if (workflowError) {
      handleError(workflowError, 'PricingWorkflow');
    }
  }, [workflowError, handleError]);

  // Handle products error with retry capability
  useEffect(() => {
    if (productsError) {
      const retryProductsLoad = async () => {
        await refetchProducts();
      };
      handleError(productsError, 'ProductsLoad', retryProductsLoad);
    }
  }, [productsError, handleError, refetchProducts]);

  // Handle filters error
  useEffect(() => {
    if (filtersError) {
      handleError(filtersError, 'FiltersLoad');
    }
  }, [filtersError, handleError]);

  // Handle categories error with retry capability
  useEffect(() => {
    if (categoriesError) {
      const retryCategoriesLoad = async () => {
        await refetchCounts();
      };
      handleError(categoriesError, 'CategoriesLoad', retryCategoriesLoad);
    }
  }, [categoriesError, handleError, refetchCounts]);

  // Network connectivity monitoring
  useEffect(() => {
    const handleOnline = () => {
      if (hasError && currentError?.type === 'NETWORK_ERROR') {
        addNotification(createSuccessNotification(
          'Connection Restored',
          'Network connection has been restored. You can retry your last action.'
        ));
      }
    };

    const handleOffline = () => {
      addNotification(createWarningNotification(
        'Connection Lost',
        'Network connection lost. Some features may not work properly.',
        { autoHide: false }
      ));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hasError, currentError, addNotification]);

  // Generate breadcrumbs
  const breadcrumbs = [
    { text: 'Product Catalog', href: '#' }
  ];

  if (selectedCategoryInfo) {
    breadcrumbs.push({
      text: selectedCategoryInfo.categoryName,
      href: '#'
    });
  }

  return (
    <Container>
      <SpaceBetween size="l">
        {/* Notifications */}
        {notifications.length > 0 && (
          <Flashbar
            items={notifications.map(notification => ({
              id: notification.id,
              type: notification.type,
              header: notification.title,
              content: notification.message,
              dismissible: notification.dismissible,
              onDismiss: notification.dismissible 
                ? () => removeNotification(notification.id)
                : undefined
            }))}
          />
        )}
        
        {/* Debug Info - Temporary */}
        {/* <DebugInfo /> */}
        
        {/* Header */}
        <Header
          variant="h1"
          description={
            selectedCategory
              ? `Browse and select products from the ${selectedCategoryInfo?.categoryName} category`
              : 'Select a product category to browse available products for pricing analysis'
          }
          actions={
            selectedCategory && selectedProduct ? (
              <Button
                variant="primary"
                onClick={() => handleStartPricingAnalysis(selectedProduct)}
                disabled={isStartingAnalysis || isStartingWorkflow || !user}
                loading={isStartingAnalysis || isStartingWorkflow}
                ariaLabel={
                  !user 
                    ? 'Sign in required to generate pricing analysis'
                    : selectedProduct 
                      ? `Generate pricing analysis for ${selectedProduct.product_id}`
                      : 'Select a product to generate pricing analysis'
                }
              >
                {(isStartingAnalysis || isStartingWorkflow) 
                  ? 'Starting Analysis...' 
                  : 'Generate Pricing Analysis'}
              </Button>
            ) : undefined
          }
        >
          Product Catalog
        </Header>

        {/* Breadcrumbs */}
        {selectedCategory && (
          <BreadcrumbGroup
            items={breadcrumbs}
            ariaLabel="Navigation breadcrumbs showing current location in product catalog"
          />
        )}

        {/* Back to Categories Button */}
        {selectedCategory && (
          <Box>
            <Button
              variant="link"
              iconName="arrow-left"
              onClick={handleBackToCategories}
              ariaLabel={`Go back to category selection from ${selectedCategoryInfo?.categoryName} products`}
            >
              Back to Categories
            </Button>
          </Box>
        )}

        {/* Category Selection with Error Handling */}
        {!selectedCategory && (
          <>
            <CategorySelector
              categories={categories}
              selectedCategory={selectedCategory}
              onCategorySelect={selectCategory}
              isLoading={isLoadingCategories}
              error={categoriesError}
            />
            
            {/* Category-specific error handling */}
            {categoriesError && (
              <Alert
                type="error"
                header="Error Loading Category Counts"
                action={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={refetchCounts}>
                      Retry
                    </Button>
                    <Button onClick={() => window.location.reload()}>
                      Refresh Page
                    </Button>
                  </SpaceBetween>
                }
              >
                Unable to load product counts for categories: {categoriesError.message}
              </Alert>
            )}
            
            {categories.length === 0 && !isLoadingCategories && !categoriesError && (
              <Alert
                type="warning"
                header="No Categories Available"
                action={
                  <Button onClick={() => window.location.reload()}>
                    Refresh Page
                  </Button>
                }
              >
                No product categories are currently available. This may be due to a temporary issue.
              </Alert>
            )}
          </>
        )}

        {/* Product Catalog */}
        {selectedCategory && (
          <SpaceBetween size="m">
            {/* Sort Controls */}
            <Box>
              <SpaceBetween direction="horizontal" size="xs">
                <Box variant="small" color="text-body-secondary">
                  Sort by:
                </Box>
                <Button
                  variant={sortBy === 'UPDATED_AT' ? 'primary' : 'normal'}
                  onClick={() => setSortBy('UPDATED_AT')}
                >
                  Updated
                </Button>
                <Button
                  variant={sortBy === 'PRICE' ? 'primary' : 'normal'}
                  onClick={() => setSortBy('PRICE')}
                >
                  Price
                </Button>
                <Button
                  variant={sortBy === 'NAME' ? 'primary' : 'normal'}
                  onClick={() => setSortBy('NAME')}
                >
                  Name
                </Button>
                <Button
                  iconName={sortDirection === 'ASC' ? 'caret-up-filled' : 'caret-down-filled'}
                  onClick={() => setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC')}
                  ariaLabel={`Sort ${sortDirection === 'ASC' ? 'descending' : 'ascending'}`}
                />
              </SpaceBetween>
            </Box>

            {/* Filters */}
            <ProductFilters
              category={selectedCategory}
              filters={filters as any}
              onFilterChange={setFilters as any}
              filterOptions={filterOptions}
              isLoadingOptions={isLoadingFilters}
              optionsError={filtersError}
              filteredCount={products.length}
              totalCount={totalProductCount}
            />

            {/* Products Grid */}
            <ProductCatalogGrid
              products={products}
              selectedProductID={selectedProductId}
              onProductSelect={selectProduct}
              onShowProductDetails={handleShowProductDetails}
              isLoading={isLoadingProducts}
              isLoadingMore={false}
              error={productsError}
              hasMoreProducts={hasMoreProducts}
              onLoadMore={loadMoreProducts}
              totalCount={totalProductCount}
              isEmpty={isEmpty}
            />

            {/* Comprehensive Error States */}
            {hasError && currentError && (
              <Alert
                type="error"
                header={getErrorTitle(currentError)}
                action={
                  <SpaceBetween direction="horizontal" size="xs">
                    {canRetry && (
                      <Button 
                        onClick={() => retry(async () => {
                          if (currentError.source === 'ProductsLoad') {
                            await refetchProducts();
                          }
                        })}
                        loading={isRetrying}
                        disabled={isRetrying}
                      >
                        {isRetrying ? `Retrying... (${retryCount}/${3})` : 'Retry'}
                      </Button>
                    )}
                    {currentError.recoverable && (
                      <Button 
                        variant="link"
                        onClick={clearError}
                      >
                        Dismiss
                      </Button>
                    )}
                    {currentError.type === 'DATA_FETCH_ERROR' && (
                      <Button 
                        variant="link"
                        onClick={() => window.location.reload()}
                      >
                        Refresh Page
                      </Button>
                    )}
                  </SpaceBetween>
                }
                dismissible={currentError.recoverable}
                onDismiss={currentError.recoverable ? clearError : undefined}
              >
                <SpaceBetween size="s">
                  <Box>{currentError.userMessage}</Box>
                  {retryCount > 0 && (
                    <Box variant="small" color="text-status-info">
                      Retry attempt {retryCount} of 3
                    </Box>
                  )}
                  {currentError.code && (
                    <Box variant="small" color="text-body-secondary">
                      Error code: {currentError.code}
                    </Box>
                  )}
                </SpaceBetween>
              </Alert>
            )}

            {/* Legacy error handling for backward compatibility */}
            {!hasError && productsError && (
              <Alert
                type="error"
                header="Error loading products"
                action={
                  <Button onClick={refetchProducts}>
                    Retry
                  </Button>
                }
              >
                {productsError.message}
              </Alert>
            )}
          </SpaceBetween>
        )}

        {/* Product Detail Modal */}
        <ProductDetailModal
          product={detailProduct}
          isOpen={showProductDetail}
          onClose={handleCloseProductDetails}
          onStartPricingAnalysis={handleStartPricingAnalysis}
          isStarting={isStartingAnalysis || isStartingWorkflow}
        />
      </SpaceBetween>
    </Container>
  );
};