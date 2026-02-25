/**
 * @fileoverview React hook for pricing analysis with load-then-subscribe pattern.
 * 
 * Implements the load-then-subscribe pattern where the hook first fetches existing
 * data via GraphQL query, then establishes a subscription for real-time updates.
 * This ensures users see current state immediately while receiving live updates.
 * 
 * Requirements addressed:
 * - 2.1: Execute getPricingAnalysis query on page load
 * - 2.2: Populate analysis panels with available data
 * - 2.3: Subscribe to onPricingAnalysisById for real-time updates
 * - 2.4: Merge subscription data with existing state
 * - 7.1: Reconnection with exponential backoff
 * - 7.2: Re-fetch data via query after reconnection
 * - 7.4: Clean unsubscribe on component unmount
 * - 7.5: Auto-unsubscribe on completion
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { client } from '../graphql/client';
import { GET_PRICING_ANALYSIS } from '../graphql/queries';
import { ON_PRICING_ANALYSIS_BY_ID } from '../graphql/subscriptions';
import type { 
  PricingAnalysis, 
  PricingAnalysisStatus 
} from '../graphql/types';
import { isTerminalStatus } from '../graphql/types';
import type { 
  GetPricingAnalysisResponse, 
  GetPricingAnalysisVariables 
} from '../graphql/queries';
import type { 
  OnPricingAnalysisByIdResponse,
  OnPricingAnalysisByIdVariables,
  SubscriptionConnectionState,
  SubscriptionError
} from '../graphql/subscriptions';

/**
 * Configuration options for the usePricingAnalysis hook.
 */
export interface UsePricingAnalysisOptions {
  /** Session ID to fetch and subscribe to */
  sessionId: string;
  /** Enable/disable the hook (default: true) */
  enabled?: boolean;
  /** Callback when status changes */
  onStatusChange?: (status: PricingAnalysisStatus) => void;
  /** Callback when data is received */
  onData?: (data: PricingAnalysis) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Maximum retry attempts for reconnection (default: 5) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseRetryDelay?: number;
  /** Maximum delay for exponential backoff in ms (default: 30000) */
  maxRetryDelay?: number;
}

/**
 * Result returned by the usePricingAnalysis hook.
 */
export interface UsePricingAnalysisResult {
  /** Current pricing analysis data */
  data: PricingAnalysis | null;
  /** Loading state - true during initial query */
  loading: boolean;
  /** Error state - contains error if query or subscription fails */
  error: Error | null;
  /** Subscription connection state */
  connectionState: SubscriptionConnectionState;
  /** Whether subscription is currently connected */
  connected: boolean;
  /** Retry function - manually retry failed operations */
  retry: () => void;
  /** Refetch function - manually refetch data via query */
  refetch: () => Promise<void>;
}

/**
 * Default configuration values.
 */
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY = 1000;
const DEFAULT_MAX_RETRY_DELAY = 30000;
const AUTO_UNSUBSCRIBE_DELAY = 2000;

/**
 * Debug flag - set to false to silence debug console logs.
 * Can be controlled via environment variable or set to false for production.
 */
const DEBUG_ENABLED = process.env.NODE_ENV === 'development' && false; // Set to true to enable debug logs

/**
 * Calculates exponential backoff delay.
 * 
 * @param attempt - Current retry attempt (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = DEFAULT_BASE_RETRY_DELAY,
  maxDelay: number = DEFAULT_MAX_RETRY_DELAY
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Merges existing pricing analysis data with new subscription data.
 * New data takes precedence for fields present in both.
 * 
 * @param existing - Existing pricing analysis data
 * @param incoming - New data from subscription
 * @returns Merged pricing analysis data
 */
export function mergePricingAnalysisData(
  existing: PricingAnalysis | null,
  incoming: PricingAnalysis
): PricingAnalysis {
  if (!existing) {
    return incoming;
  }

  // Merge with incoming data taking precedence for non-null fields
  return {
    ...existing,
    ...incoming,
    // Preserve existing analysis data if incoming is null/undefined
    demandForecast: incoming.demandForecast ?? existing.demandForecast,
    competitiveAnalysis: incoming.competitiveAnalysis ?? existing.competitiveAnalysis,
    marginAnalysis: incoming.marginAnalysis ?? existing.marginAnalysis,
    finalRecommendation: incoming.finalRecommendation ?? existing.finalRecommendation,
    currentAgent: incoming.currentAgent ?? existing.currentAgent,
    agentStatus: incoming.agentStatus ?? existing.agentStatus,
  };
}

/**
 * React hook for pricing analysis with load-then-subscribe pattern.
 * 
 * Implements the following workflow:
 * 1. On mount, execute getPricingAnalysis query to fetch existing data
 * 2. After successful query, establish subscription for real-time updates
 * 3. Merge subscription updates with existing state
 * 4. Handle disconnections with exponential backoff reconnection
 * 5. Auto-unsubscribe when analysis reaches terminal status
 * 6. Clean up subscription on unmount
 * 
 * @param options - Hook configuration options
 * @returns Hook result with data, loading, error, and control functions
 * 
 * @example
 * ```typescript
 * const { data, loading, error, connected, retry, refetch } = usePricingAnalysis({
 *   sessionId: 'session-123',
 *   onStatusChange: (status) => console.log('Status changed:', status),
 *   onData: (data) => console.log('Data received:', data),
 * });
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Alert type="error">{error.message}</Alert>;
 * if (data) return <PricingDashboard data={data} />;
 * ```
 */
export const usePricingAnalysis = (
  options: UsePricingAnalysisOptions
): UsePricingAnalysisResult => {
  if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Hook called with options:', options);
  
  const {
    sessionId,
    enabled = true,
    onStatusChange,
    onData,
    onError,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseRetryDelay = DEFAULT_BASE_RETRY_DELAY,
    maxRetryDelay = DEFAULT_MAX_RETRY_DELAY,
  } = options;

  if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Hook initialized with:', { sessionId, enabled });

  // State
  const [data, setData] = useState<PricingAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<SubscriptionConnectionState>('disconnected');

  // Refs for subscription management
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const previousStatusRef = useRef<PricingAnalysisStatus | null>(null);
  const autoUnsubscribeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Clears all pending timeouts.
   */
  const clearTimeouts = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (autoUnsubscribeTimeoutRef.current) {
      clearTimeout(autoUnsubscribeTimeoutRef.current);
      autoUnsubscribeTimeoutRef.current = null;
    }
  }, []);

  /**
   * Unsubscribes from the current subscription.
   */
  const unsubscribe = useCallback(() => {
    clearTimeouts();

    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
        if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Unsubscribed from pricing updates');
      } catch (err) {
        console.error('[usePricingAnalysis] Error unsubscribing:', err);
      }
      subscriptionRef.current = null;
    }

    setConnectionState('disconnected');
  }, [clearTimeouts]);

  /**
   * Fetches pricing analysis data via GraphQL query.
   */
  const fetchData = useCallback(async (): Promise<PricingAnalysis | null> => {
    if (!sessionId || isUnmountedRef.current) {
      return null;
    }

    if (DEBUG_ENABLED) {
      console.log(`[usePricingAnalysis] Fetching data for session: ${sessionId}`);
      console.log('[usePricingAnalysis] Query:', GET_PRICING_ANALYSIS);
      console.log('[usePricingAnalysis] Variables:', { sessionId });
    }

    try {
      const result = await client.graphql({
        query: GET_PRICING_ANALYSIS,
        variables: { sessionId } as GetPricingAnalysisVariables,
      });

      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Raw result:', JSON.stringify(result, null, 2));

      const response = result as { data: GetPricingAnalysisResponse; errors?: any[] };

      if (response.errors && response.errors.length > 0) {
        console.error('[usePricingAnalysis] GraphQL errors:', response.errors);
        throw new Error(response.errors[0].message);
      }

      const pricingData = response.data?.getPricingAnalysis;
      
      if (DEBUG_ENABLED) {
        console.log('[usePricingAnalysis] Parsed pricing data:', pricingData);
        
        if (pricingData) {
          console.log('[usePricingAnalysis] Data fetched successfully:', {
            sessionId: pricingData.sessionId,
            status: pricingData.status,
            hasDemandForecast: !!pricingData.demandForecast,
            hasCompetitiveAnalysis: !!pricingData.competitiveAnalysis,
            hasMarginAnalysis: !!pricingData.marginAnalysis,
            hasFinalRecommendation: !!pricingData.finalRecommendation,
          });
        } else {
          console.log('[usePricingAnalysis] No data found for session:', sessionId);
          console.log('[usePricingAnalysis] Response.data:', response.data);
        }
      }

      return pricingData as PricingAnalysis | null;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[usePricingAnalysis] Error fetching data:', error);
      throw error;
    }
  }, [sessionId]);

  /**
   * Establishes subscription for real-time updates.
   */
  const subscribe = useCallback(() => {
    if (!sessionId || !enabled || isUnmountedRef.current) {
      return;
    }

    // Don't subscribe if already connected
    if (subscriptionRef.current) {
      return;
    }

    if (DEBUG_ENABLED) console.log(`[usePricingAnalysis] Establishing subscription for session: ${sessionId}`);
    setConnectionState('connecting');

    try {
      const subscriptionObservable = client.graphql({
        query: ON_PRICING_ANALYSIS_BY_ID,
        variables: { sessionId } as OnPricingAnalysisByIdVariables,
      });

      const subscription = (subscriptionObservable as any).subscribe({
        next: (response: { data: OnPricingAnalysisByIdResponse; errors?: any[] }) => {
          if (isUnmountedRef.current) return;

          if (response.errors && response.errors.length > 0) {
            console.error('[usePricingAnalysis] Subscription error:', response.errors);
            return;
          }

          const incomingData = response.data?.onPricingAnalysisById;
          
          if (incomingData) {
            if (DEBUG_ENABLED) {
              console.log('[usePricingAnalysis] Subscription update received:', {
                sessionId: incomingData.sessionId,
                status: incomingData.status,
                currentAgent: incomingData.currentAgent,
                agentStatus: incomingData.agentStatus,
              });
            }

            // Merge with existing data
            setData((prevData) => {
              const mergedData = mergePricingAnalysisData(prevData, incomingData as PricingAnalysis);
              
              // Call onData callback
              if (onData) {
                onData(mergedData);
              }

              // Check for status change
              if (previousStatusRef.current !== mergedData.status) {
                previousStatusRef.current = mergedData.status;
                if (onStatusChange) {
                  onStatusChange(mergedData.status);
                }

                // Auto-unsubscribe on terminal status
                if (isTerminalStatus(mergedData.status)) {
                  if (DEBUG_ENABLED) console.log(`[usePricingAnalysis] Terminal status reached: ${mergedData.status}. Scheduling auto-unsubscribe...`);
                  
                  // Clear any existing auto-unsubscribe timeout
                  if (autoUnsubscribeTimeoutRef.current) {
                    clearTimeout(autoUnsubscribeTimeoutRef.current);
                  }
                  
                  autoUnsubscribeTimeoutRef.current = setTimeout(() => {
                    if (!isUnmountedRef.current) {
                      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Auto-unsubscribing after terminal status');
                      unsubscribe();
                    }
                  }, AUTO_UNSUBSCRIBE_DELAY);
                }
              }

              return mergedData;
            });

            // Reset retry count on successful data
            retryCountRef.current = 0;
          }
        },
        error: (err: any) => {
          if (isUnmountedRef.current) return;

          const subscriptionError = err instanceof Error ? err : new Error(err?.message || 'Subscription error');
          console.error('[usePricingAnalysis] Subscription error:', subscriptionError);
          
          setConnectionState('error');
          setError(subscriptionError);

          if (onError) {
            onError(subscriptionError);
          }

          // Attempt reconnection with exponential backoff
          if (retryCountRef.current < maxRetries) {
            const delay = calculateBackoffDelay(retryCountRef.current, baseRetryDelay, maxRetryDelay);
            retryCountRef.current += 1;

            if (DEBUG_ENABLED) {
              console.log(
                `[usePricingAnalysis] Scheduling reconnection attempt ${retryCountRef.current}/${maxRetries} in ${delay}ms`
              );
            }

            retryTimeoutRef.current = setTimeout(async () => {
              if (!isUnmountedRef.current && enabled) {
                // Re-fetch data via query after reconnection
                try {
                  const freshData = await fetchData();
                  if (freshData && !isUnmountedRef.current) {
                    setData((prevData) => mergePricingAnalysisData(prevData, freshData));
                    setError(null);
                  }
                } catch (fetchErr) {
                  console.error('[usePricingAnalysis] Error re-fetching data:', fetchErr);
                }

                // Re-establish subscription
                subscriptionRef.current = null;
                subscribe();
              }
            }, delay);
          } else {
            console.error(`[usePricingAnalysis] Max retry attempts (${maxRetries}) reached`);
          }
        },
        complete: () => {
          if (isUnmountedRef.current) return;
          if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Subscription completed');
          setConnectionState('disconnected');
        },
      });

      subscriptionRef.current = subscription;
      setConnectionState('connected');
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Subscription established successfully');

    } catch (err) {
      const subscriptionError = err instanceof Error ? err : new Error(String(err));
      console.error('[usePricingAnalysis] Error establishing subscription:', subscriptionError);
      setConnectionState('error');
      setError(subscriptionError);

      if (onError) {
        onError(subscriptionError);
      }
    }
  }, [sessionId, enabled, onData, onStatusChange, onError, maxRetries, baseRetryDelay, maxRetryDelay, fetchData, unsubscribe]);

  /**
   * Initializes the hook by fetching data and establishing subscription.
   */
  const initialize = useCallback(async () => {
    if (DEBUG_ENABLED) console.log('[usePricingAnalysis] initialize() called', { sessionId, enabled, isUnmounted: isUnmountedRef.current });
    
    if (!sessionId || !enabled || isUnmountedRef.current) {
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Skipping initialization - conditions not met');
      setLoading(false);
      return;
    }

    if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Starting initialization...');
    setLoading(true);
    setError(null);

    try {
      // Step 1: Fetch existing data via query
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] About to call fetchData()');
      const initialData = await fetchData();
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] fetchData() returned:', initialData);
      
      if (isUnmountedRef.current) return;

      if (initialData) {
        setData(initialData);
        previousStatusRef.current = initialData.status;

        // Call callbacks
        if (onData) {
          onData(initialData);
        }
        if (onStatusChange) {
          onStatusChange(initialData.status);
        }

        // Don't subscribe if already in terminal status
        if (isTerminalStatus(initialData.status)) {
          if (DEBUG_ENABLED) console.log(`[usePricingAnalysis] Data already in terminal status: ${initialData.status}. Skipping subscription.`);
          setLoading(false);
          return;
        }
      }

      // Step 2: Establish subscription for real-time updates
      subscribe();
      
    } catch (err) {
      if (isUnmountedRef.current) return;

      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);

      if (onError) {
        onError(fetchError);
      }
    } finally {
      if (!isUnmountedRef.current) {
        setLoading(false);
      }
    }
  }, [sessionId, enabled, fetchData, subscribe, onData, onStatusChange, onError]);

  /**
   * Manual retry function.
   */
  const retry = useCallback(() => {
    if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Manual retry triggered');
    retryCountRef.current = 0;
    clearTimeouts();
    setError(null);
    unsubscribe();
    initialize();
  }, [clearTimeouts, unsubscribe, initialize]);

  /**
   * Manual refetch function.
   */
  const refetch = useCallback(async () => {
    if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Manual refetch triggered');
    setLoading(true);
    setError(null);

    try {
      const freshData = await fetchData();
      
      if (freshData && !isUnmountedRef.current) {
        setData((prevData) => mergePricingAnalysisData(prevData, freshData));
        
        if (onData) {
          onData(freshData);
        }
      }
    } catch (err) {
      if (!isUnmountedRef.current) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        setError(fetchError);

        if (onError) {
          onError(fetchError);
        }
      }
    } finally {
      if (!isUnmountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchData, onData, onError]);

  /**
   * Effect: Initialize on mount or when sessionId/enabled changes.
   */
  useEffect(() => {
    if (DEBUG_ENABLED) console.log('[usePricingAnalysis] useEffect triggered', { sessionId, enabled });
    isUnmountedRef.current = false;

    if (sessionId && enabled) {
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Calling initialize()');
      initialize();
    } else {
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Skipping initialize - sessionId or enabled is false');
      setLoading(false);
      unsubscribe();
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (DEBUG_ENABLED) console.log('[usePricingAnalysis] Cleanup - unmounting');
      isUnmountedRef.current = true;
      unsubscribe();
    };
  }, [sessionId, enabled, initialize, unsubscribe]);

  return {
    data,
    loading,
    error,
    connectionState,
    connected: connectionState === 'connected',
    retry,
    refetch,
  };
};

/**
 * Default export for convenience.
 */
export default usePricingAnalysis;
