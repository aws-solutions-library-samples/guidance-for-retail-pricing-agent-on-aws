/**
 * @fileoverview React hook for demo reset operations with React Query.
 * 
 * Provides mutation for resetting demo data with error handling,
 * success states, and cache invalidation as specified in requirements.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { client } from '../graphql/client';

/**
 * Response type for reset demo mutation.
 */
export interface ResetDemoResponse {
  success: boolean;
  message: string;
  deletedCount: number;
  timestamp: string;
}

/**
 * Error type for reset demo mutation.
 */
export interface ResetDemoError extends Error {
  code?: string;
  statusCode?: number;
}

/**
 * Hook for demo reset operations with React Query integration.
 * 
 * Features:
 * - GraphQL mutation for resetDemo
 * - Error handling with detailed error state
 * - Success handling with success state
 * - Automatic cache invalidation on success
 * - Complete React Query cache clearing after reset
 * - Retry logic for transient failures
 * 
 * Requirements: 17.3, 17.4, 17.5, 17.6
 * 
 * @returns Object containing mutation and state for demo reset
 */
export const useDemoReset = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthenticator();
  
  const userId = user?.userId || user?.username;

  /**
   * Mutation for resetting demo data.
   * 
   * Executes the resetDemo GraphQL mutation which deletes all pricing
   * sessions while preserving product catalog data.
   */
  const resetDemoMutation = useMutation<ResetDemoResponse, ResetDemoError, void>({
    mutationFn: async () => {
      try {
        const result = await client.graphql({
          query: `
            mutation ResetDemo {
              resetDemo {
                success
                message
                deletedCount
                timestamp
              }
            }
          `
        });

        // Check for GraphQL errors
        if ((result as any).errors && (result as any).errors.length > 0) {
          const error = (result as any).errors[0];
          const resetError: ResetDemoError = new Error(error.message) as ResetDemoError;
          resetError.code = error.extensions?.code;
          resetError.statusCode = error.extensions?.statusCode;
          throw resetError;
        }

        const response = (result as any).data.resetDemo;

        // Validate response structure
        if (!response || typeof response.success !== 'boolean') {
          throw new Error('Invalid response from resetDemo mutation');
        }

        return response;
      } catch (error) {
        // Handle network errors or other exceptions
        if (error instanceof Error) {
          const resetError: ResetDemoError = error as ResetDemoError;
          console.error('Demo reset failed:', {
            message: resetError.message,
            code: resetError.code,
            statusCode: resetError.statusCode
          });
          throw resetError;
        }
        throw new Error('Unknown error occurred during demo reset');
      }
    },
    onSuccess: (data) => {
      console.log('Demo reset completed successfully:', {
        deletedCount: data.deletedCount,
        timestamp: data.timestamp,
        message: data.message
      });

      // Invalidate all pricing session queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['pricingSessions'] });
      
      // Optionally invalidate specific user queries
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['pricingSessions', userId] });
      }

      // Clear all React Query cache to ensure fresh data after reset
      // This removes all cached queries and mutations from memory
      queryClient.clear();
    },
    onError: (error) => {
      console.error('Demo reset mutation failed:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
    },
    retry: 2, // Retry 2 times for transient failures
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000) // Exponential backoff
  });

  return {
    // Mutation function
    resetDemo: resetDemoMutation.mutate,
    resetDemoAsync: resetDemoMutation.mutateAsync,
    
    // Loading state
    isResetting: resetDemoMutation.isPending,
    
    // Success state
    isSuccess: resetDemoMutation.isSuccess,
    resetData: resetDemoMutation.data,
    
    // Error state
    isError: resetDemoMutation.isError,
    error: resetDemoMutation.error,
    
    // Reset mutation state
    reset: resetDemoMutation.reset
  };
};
