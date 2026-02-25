/**
 * @fileoverview React hook for pricing service operations with React Query.
 * 
 * Provides mutations and queries for pricing sessions with optimistic updates,
 * error handling, and retry logic as specified in the requirements.
 * 
 * Requirements: 1.1 - Query pricingByUserId for SESSION# records
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { client } from '../graphql/client';
import { PRICING_BY_USER_ID } from '../graphql/queries';
import type { PricingByUserIdResponse, PricingAnalysisQueryResult } from '../graphql/queries';
import { type ParsedProductData, type PricingAnalysisStatus } from '../graphql/types';
import type { ProductType } from '../types/product-types';

/**
 * Input type for creating pricing session.
 */
interface CreatePricingInput {
  product: ProductType;
}

/**
 * Response type for created pricing session.
 */
interface CreatePricingResponse {
  id: string;
  userId: string;
  product: string;
  status: 'initiated' | 'in_progress' | 'success' | 'error';
  createdAt: string;
}

/**
 * Pricing session type with parsed product data.
 * Extends the GraphQL query result with parsed product information.
 */
export interface PricingSessionWithParsedProduct extends PricingAnalysisQueryResult {
  /** Parsed product data */
  parsedProduct: ParsedProductData | null;
  /** Flattened demand forecast data for component compatibility */
  demandForecast?: any;
  /** Flattened competitive analysis data for component compatibility */
  competitiveAnalysis?: any;
  /** Flattened margin analysis data for component compatibility */
  marginAnalysis?: any;
  /** Flattened final recommendation data for component compatibility */
  finalRecommendation?: any;
}

/**
 * Response type for pricing sessions query with parsed data.
 */
interface PricingSessionsResponse {
  items: PricingSessionWithParsedProduct[];
  nextToken: string | null;
}

/**
 * Input type for resolver invocation.
 */
interface ResolverInput {
  userID: string;
  sessionID: string;
  product: ProductType;
}

/**
 * Response type for resolver invocation.
 */
interface ResolverResponse {
  status: string;
  message: string;
  executionArn?: string;
  sessionId?: string;
}

/**
 * Validates that a pricing session exists in DynamoDB by polling.
 * 
 * Polls for session availability with 500ms intervals and a 5-second timeout.
 * If the session is not found within the timeout, logs a warning but allows
 * the process to continue (eventual consistency).
 * 
 * @param sessionId - The session ID to validate
 * @param userId - The user ID for querying sessions
 * @param timeoutMs - Maximum time to wait for session (default: 5000ms)
 * @returns Promise that resolves when session is found or timeout occurs
 * @throws Error if session validation fails critically
 */
const waitForSessionReady = async (
  sessionId: string,
  userId: string,
  timeoutMs: number = 5000
): Promise<void> => {
  const startTime = Date.now();
  const pollInterval = 500; // 500ms intervals as per requirements

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await client.graphql({
        query: `
          query PricingByUserId($userId: ID!) {
            pricingByUserId(userId: $userId, limit: 50) {
              items {
                id
                userId
                status
                createdAt
              }
            }
          }
        `,
        variables: { userId }
      });

      if ((result as any).errors && (result as any).errors.length > 0) {
        console.warn('GraphQL error during session validation:', (result as any).errors[0].message);
      } else {
        const items = (result as any).data?.pricingByUserId?.items || [];
        const sessionFound = items.some((item: any) => item.id === sessionId);

        if (sessionFound) {
          return;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Error during session validation:', errorMessage);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout occurred - log warning but don't throw (allow eventual consistency)
  console.warn('Session validation timeout - proceeding anyway (eventual consistency)');
};

/**
 * Hook for pricing service operations with React Query integration.
 * 
 * @returns Object containing mutations and queries for pricing operations
 */
export const usePricingService = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthenticator();
  
  const userId = user?.userId || user?.username;

  /**
   * Mutation for creating pricing sessions with optimistic updates.
   */
  const createPricingMutation = useMutation<CreatePricingResponse, Error, CreatePricingInput>({
    mutationFn: async ({ product }) => {
      const result = await client.graphql({
        query: `
          mutation CreatePricing($input: CreatePricingInput!) {
            createPricing(input: $input) {
              id
              userId
              product
              status
              createdAt
            }
          }
        `,
        variables: {
          input: {
            product: JSON.stringify(product)
          }
        }
      });

      if ((result as any).errors && (result as any).errors.length > 0) {
        throw new Error((result as any).errors[0].message);
      }

      return (result as any).data.createPricing;
    },
    onMutate: async ({ product }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['pricingSessions', userId] });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData<PricingSessionsResponse>(['pricingSessions', userId]);

      // Optimistically update to the new value
      if (previousSessions) {
        const optimisticSession: PricingSessionWithParsedProduct = {
          id: `temp-${Date.now()}`,
          sessionId: `temp-${Date.now()}`,
          userId: userId!,
          productId: product.product_id || '',
          product: JSON.stringify(product),
          status: 'initiated' as PricingAnalysisStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parsedProduct: product as unknown as ParsedProductData
        };

        queryClient.setQueryData<PricingSessionsResponse>(['pricingSessions', userId], {
          ...previousSessions,
          items: [optimisticSession, ...previousSessions.items]
        });
      }

      // Return a context object with the snapshotted value
      return { previousSessions };
    },
    onError: (error, variables, context: any) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSessions) {
        queryClient.setQueryData(['pricingSessions', userId], context.previousSessions);
      }
      console.error('Failed to create pricing session:', error);
    },
    onSuccess: () => {
      // Invalidate and refetch pricing sessions
      queryClient.invalidateQueries({ queryKey: ['pricingSessions', userId] });
    },
    retry: 2, // Retry 2 times as specified
    retryDelay: 1000 // 1 second delay as specified
  });

  /**
   * Mutation for invoking resolver Lambda with error handling and retry logic.
   */
  const invokeResolverMutation = useMutation<ResolverResponse, Error, ResolverInput>({
    mutationFn: async ({ userID, sessionID, product }) => {
      const result = await client.graphql({
        query: `
          mutation AppsyncResolver(
            $userID: String!
            $sessionID: String!
            $product: AWSJSON!
          ) {
            appsyncResolver(
              userID: $userID
              sessionID: $sessionID
              product: $product
            ) {
              status
              message
              executionArn
              sessionId
            }
          }
        `,
        variables: {
          userID,
          sessionID,
          product: JSON.stringify(product)
        }
      });

      if ((result as any).errors && (result as any).errors.length > 0) {
        throw new Error((result as any).errors[0].message);
      }

      return (result as any).data.appsyncResolver;
    },
    onSuccess: () => {
      // Resolver invoked successfully
    },
    onError: (error) => {
      console.error('Failed to invoke resolver:', error.message);
    },
    retry: 2, // Retry 2 times as specified
    retryDelay: 1000 // 1 second delay as specified
  });

  /**
   * Query for fetching user pricing sessions (SESSION# records).
   * Uses centralized PRICING_BY_USER_ID query and parses product data.
   * 
   * Requirements: 1.1 - Query pricingByUserId for SESSION# records
   * 
   * @param limit - Maximum number of sessions to fetch (default: 20)
   * @param nextToken - Pagination token for fetching next page
   * @returns Query result with parsed pricing sessions
   */
  const usePricingSessions = (limit: number = 20, nextToken?: string) => {
    return useQuery<PricingSessionsResponse, Error>({
      queryKey: ['pricingSessions', userId, limit, nextToken],
      queryFn: async () => {
        if (!userId) {
          throw new Error('User authentication required');
        }

        const result = await client.graphql({
          query: PRICING_BY_USER_ID,
          variables: {
            userId,
            limit,
            nextToken
          }
        });

        if ((result as any).errors && (result as any).errors.length > 0) {
          const errorMsg = (result as any).errors[0].message || 'GraphQL query failed';
          throw new Error(errorMsg);
        }

        if (!(result as any).data) {
          throw new Error('No data returned from GraphQL query');
        }

        const response = (result as any).data as PricingByUserIdResponse;
        
        if (!response.pricingByUserId) {
          throw new Error('Invalid response structure from GraphQL query');
        }
        
        const items = response.pricingByUserId.items;

        // Parse product field for each session
        const parsedItems: PricingSessionWithParsedProduct[] = items.map((item) => {
          let parsedProduct: ParsedProductData | null = null;
          
          try {
            // Handle double-encoded JSON (product field may be double-stringified)
            let productData: unknown = item.product;
            if (typeof productData === 'string') {
              // First parse
              productData = JSON.parse(productData);
              // Check if still a string (double-encoded)
              if (typeof productData === 'string') {
                productData = JSON.parse(productData);
              }
            }
            
            // Type guard to ensure productData is an object
            if (productData && typeof productData === 'object') {
              const productObj = productData as Record<string, unknown>;
              
              // Parse attributes if they're also double-encoded
              if (typeof productObj.attributes === 'string') {
                try {
                  let attrs: unknown = productObj.attributes;
                  if (typeof attrs === 'string') {
                    attrs = JSON.parse(attrs);
                    if (typeof attrs === 'string') {
                      attrs = JSON.parse(attrs);
                    }
                  }
                  productObj.attributes = attrs;
                } catch (attrError) {
                  console.warn('Failed to parse product attributes:', attrError);
                  productObj.attributes = {};
                }
              }
              
              parsedProduct = productObj as unknown as ParsedProductData;
            }
          } catch (parseError) {
            console.warn('Failed to parse product data for session:', item.id, parseError);
            parsedProduct = null;
          }

          // Flatten analysisData fields for backward compatibility with components
          // Components expect demandForecast, competitiveAnalysis, etc. at the top level
          return {
            ...item,
            parsedProduct,
            // Flatten analysisData fields to top level for component compatibility
            demandForecast: item.analysisData?.demandForecast,
            competitiveAnalysis: item.analysisData?.competitiveAnalysis,
            marginAnalysis: item.analysisData?.marginAnalysis,
            finalRecommendation: item.analysisData?.supervisorResults
          };
        });

        return {
          items: parsedItems,
          nextToken: response.pricingByUserId.nextToken
        };
      },
      enabled: !!userId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2, // Retry 2 times as specified
      retryDelay: 1000, // 1 second delay as specified
      refetchOnMount: true, // Always refetch on mount
      refetchOnWindowFocus: false // Don't refetch on window focus
    });
  };

  /**
   * Helper function to implement exponential backoff retry strategy.
   * 
   * Retries with delays: 1s, 2s, 4s, 8s, 16s, max 30s
   * 
   * @param fn - Async function to retry
   * @param maxRetries - Maximum number of retry attempts
   * @param maxDelayMs - Maximum delay between retries (default: 30000ms)
   * @returns Promise with the result of the function
   */
  const retryWithExponentialBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 2,
    maxDelayMs: number = 30000
  ): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          // Calculate exponential backoff: 1s, 2s, 4s, etc.
          const delayMs = Math.min(1000 * Math.pow(2, attempt), maxDelayMs);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('Unknown error during retry');
  };

  /**
   * Combined mutation for creating pricing session and invoking resolver.
   * 
   * Implements the complete pricing analysis initiation workflow:
   * 1. Create pricing session in DynamoDB
   * 2. Validate session is ready (with polling)
   * 3. Invoke resolver Lambda with exponential backoff
   */
  const createPricingAndInvokeResolver = useMutation<
    { pricing: CreatePricingResponse; resolver: ResolverResponse },
    Error,
    CreatePricingInput
  >({
    mutationFn: async ({ product }) => {
      if (!userId) {
        throw new Error('User authentication required');
      }

      // Step 1: Create pricing session
      const pricingResult = await retryWithExponentialBackoff(
        () => createPricingMutation.mutateAsync({ product }),
        2,
        30000
      );

      // Step 2: Validate session is ready
      try {
        await waitForSessionReady(pricingResult.id, userId, 5000);
      } catch (validationError) {
        // Proceed anyway - eventual consistency
        console.warn('Session validation timeout, proceeding with resolver invocation');
      }

      // Step 3: Invoke resolver with exponential backoff
      const resolverResult = await retryWithExponentialBackoff(
        () =>
          invokeResolverMutation.mutateAsync({
            userID: userId,
            sessionID: pricingResult.id,
            product
          }),
        2,
        30000
      );

      return {
        pricing: pricingResult,
        resolver: resolverResult
      };
    },
    onSuccess: () => {
      // Pricing workflow completed successfully
    },
    onError: (error) => {
      console.error('Pricing workflow failed:', error.message);
    },
    retry: 2, // Retry 2 times as specified
    retryDelay: (attemptIndex) => {
      // Exponential backoff: 1s, 2s, 4s, max 30s
      return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
    }
  });

  return {
    // Mutations
    createPricing: createPricingMutation,
    invokeResolver: invokeResolverMutation,
    createPricingAndInvokeResolver,
    
    // Queries
    usePricingSessions,
    
    // Helper functions
    waitForSessionReady,
    
    // State
    isCreatingPricing: createPricingMutation.isPending,
    isInvokingResolver: invokeResolverMutation.isPending,
    isStartingWorkflow: createPricingAndInvokeResolver.isPending,
    
    // Error states
    createPricingError: createPricingMutation.error,
    invokeResolverError: invokeResolverMutation.error,
    workflowError: createPricingAndInvokeResolver.error
  };
};