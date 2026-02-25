/**
 * @fileoverview React hook for GraphQL subscription to pricing updates.
 * 
 * Provides real-time updates for pricing analysis sessions using GraphQL subscriptions.
 * Handles subscription lifecycle (connect, disconnect, reconnect) with automatic
 * error handling and retry logic.
 * 
 * Requirements addressed:
 * - 10.1: Subscribe to pricing updates when dashboard loads
 * - 10.2: Update relevant panels when subscription receives updates
 * - 10.7: Unsubscribe from updates when all analysis completes
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { client } from '../graphql/client';

/**
 * Pricing session status enum.
 */
export type PricingStatus = 'initiated' | 'in_progress' | 'success' | 'error';

/**
 * Analysis data structure containing demand, competitive, and margin analysis results.
 */
export interface AnalysisData {
  demandForecast?: any;
  competitiveAnalysis?: any;
  marginAnalysis?: any;
}

/**
 * Bot message structure for agent communication.
 */
export interface BotMessage {
  agentId: string;
  agentName: string;
  message: string;
  timestamp: string;
}

/**
 * Pricing session data structure from subscription.
 */
export interface PricingSession {
  id: string;
  sessionId: string;
  userId: string;
  productId: string;
  product: any;
  status: PricingStatus;
  analysisData?: AnalysisData;
  botResponses?: BotMessage[];
  currentAgent?: string;
  agentStatus?: string;
  error?: SubscriptionError;
  createdAt: string;
  updatedAt: string;
}

/**
 * Subscription error details.
 */
export interface SubscriptionError {
  message: string;
  code?: string;
  timestamp: string;
}

/**
 * Hook return type.
 */
export interface UsePricingSubscriptionResult {
  /** Current pricing session data */
  data: PricingSession | null;
  /** Loading state - true while establishing connection */
  loading: boolean;
  /** Error state - contains error details if subscription fails */
  error: SubscriptionError | null;
  /** Connection state - true when subscription is active */
  connected: boolean;
  /** Retry function - manually retry failed subscription */
  retry: () => void;
  /** Unsubscribe function - manually close subscription */
  unsubscribe: () => void;
}

/**
 * Hook options.
 */
export interface UsePricingSubscriptionOptions {
  /** Session ID to subscribe to - passed as $sessionId parameter to GraphQL subscription */
  sessionId: string;
  /** Enable/disable subscription */
  enabled?: boolean;
  /** Callback when data is received - receives PricingSession with nested analysisData */
  onData?: (data: PricingSession) => void;
  /** Callback when error occurs - receives error details with message, code, and timestamp */
  onError?: (error: SubscriptionError) => void;
  /** Callback when subscription connects */
  onConnected?: () => void;
  /** Callback when subscription disconnects */
  onDisconnected?: () => void;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry delay in milliseconds (default: 2000) */
  retryDelay?: number;
}

/**
 * React hook for subscribing to pricing session updates from PricingOrchestration table.
 * 
 * Automatically manages subscription lifecycle:
 * - Connects when component mounts or sessionId changes
 * - Reconnects on network errors with exponential backoff
 * - Disconnects when component unmounts or subscription is disabled
 * - Provides manual retry and unsubscribe functions
 * - Auto-unsubscribes when analysis completes (status === 'success' or 'error')
 * 
 * Receives real-time updates from the PricingOrchestration DynamoDB table including:
 * - Nested analysisData with demandForecast, competitiveAnalysis, marginAnalysis
 * - botResponses array for agent messages
 * - currentAgent and agentStatus for workflow tracking
 * - error details if analysis fails
 * 
 * @param options - Subscription configuration options
 * @returns Subscription state and control functions
 * 
 * @example
 * ```typescript
 * const { data, loading, error, connected, retry } = usePricingSubscription({
 *   sessionId: 'session-123',
 *   onData: (session) => {
 *     console.log('Received update:', session);
 *     console.log('Demand forecast:', session.analysisData?.demandForecast);
 *     console.log('Competitive analysis:', session.analysisData?.competitiveAnalysis);
 *     console.log('Margin analysis:', session.analysisData?.marginAnalysis);
 *     console.log('Agent messages:', session.botResponses);
 *   },
 *   onError: (error) => {
 *     console.error('Subscription error:', error.message);
 *   }
 * });
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Alert type="error">{error.message}</Alert>;
 * if (data) return <PricingDashboard data={data} />;
 * ```
 */
export const usePricingSubscription = (
  options: UsePricingSubscriptionOptions
): UsePricingSubscriptionResult => {
  const {
    sessionId,
    enabled = true,
    onData,
    onError,
    onConnected,
    onDisconnected,
    maxRetries = 3,
    retryDelay = 2000
  } = options;

  // State
  const [data, setData] = useState<PricingSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<SubscriptionError | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  // Refs for subscription management
  const subscriptionRef = useRef<any>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  /**
   * Clear retry timeout.
   */
  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  /**
   * Handle subscription error with retry logic.
   */
  const handleError = useCallback((err: any) => {
    if (isUnmountedRef.current) return;

    const subscriptionError: SubscriptionError = {
      message: err?.message || 'Subscription error occurred',
      code: err?.code || err?.errors?.[0]?.errorType,
      timestamp: new Date().toISOString()
    };

    console.error('Pricing subscription error:', subscriptionError);
    setError(subscriptionError);
    setConnected(false);
    setLoading(false);

    // Call error callback
    if (onError) {
      onError(subscriptionError);
    }

    // Retry logic with exponential backoff
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current += 1;
      const delay = retryDelay * Math.pow(2, retryCountRef.current - 1);
      
      console.log(
        `Retrying subscription (attempt ${retryCountRef.current}/${maxRetries}) in ${delay}ms...`
      );

      retryTimeoutRef.current = setTimeout(() => {
        if (!isUnmountedRef.current && enabled) {
          subscribe();
        }
      }, delay);
    } else {
      console.error(`Max retry attempts (${maxRetries}) reached. Subscription failed.`);
    }
  }, [enabled, maxRetries, retryDelay, onError]);

  /**
   * Unsubscribe from current subscription.
   */
  const unsubscribe = useCallback(() => {
    clearRetryTimeout();
    
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
        console.log('Unsubscribed from pricing updates');
      } catch (err) {
        console.error('Error unsubscribing:', err);
      }
      subscriptionRef.current = null;
    }

    setConnected(false);
    
    if (onDisconnected) {
      onDisconnected();
    }
  }, [clearRetryTimeout, onDisconnected]);

  /**
   * Subscribe to pricing updates.
   */
  const subscribe = useCallback(() => {
    if (!sessionId || !enabled || isUnmountedRef.current) {
      return;
    }

    // Unsubscribe from any existing subscription
    unsubscribe();

    setLoading(true);
    setError(null);

    try {
      console.log(`Subscribing to pricing updates for session: ${sessionId}`);

      // Create GraphQL subscription using Amplify v6 API
      const subscriptionObservable = client.graphql({
        query: `
          subscription OnPricingById($sessionId: String!) {
            onPricingById(sessionId: $sessionId) {
              id
              sessionId
              userId
              productId
              product
              status
              analysisData {
                demandForecast
                competitiveAnalysis
                marginAnalysis
              }
              botResponses {
                agentId
                agentName
                message
                timestamp
              }
              currentAgent
              agentStatus
              error {
                message
                code
                timestamp
              }
              createdAt
              updatedAt
            }
          }
        `,
        variables: { sessionId: sessionId }
      });

      // Subscribe to the observable
      const subscription = (subscriptionObservable as any).subscribe({
        next: (response: any) => {
          if (isUnmountedRef.current) return;

          const sessionData = response?.data?.onPricingById;
          
          if (sessionData) {
            console.log('Received pricing update:', {
              id: sessionData.id,
              sessionId: sessionData.sessionId,
              status: sessionData.status,
              currentAgent: sessionData.currentAgent,
              agentStatus: sessionData.agentStatus,
              hasData: {
                demandForecast: !!sessionData.analysisData?.demandForecast,
                competitiveAnalysis: !!sessionData.analysisData?.competitiveAnalysis,
                marginAnalysis: !!sessionData.analysisData?.marginAnalysis,
                botResponses: !!sessionData.botResponses,
                error: !!sessionData.error
              }
            });

            setData(sessionData);
            setLoading(false);
            setError(null);
            
            // Reset retry count on successful data
            retryCountRef.current = 0;

            // Call data callback
            if (onData) {
              onData(sessionData);
            }

            // Auto-unsubscribe when analysis completes (success or error status)
            if (sessionData.status === 'success' || sessionData.status === 'error') {
              console.log(`Analysis completed with status: ${sessionData.status}. Unsubscribing...`);
              setTimeout(() => {
                unsubscribe();
              }, 1000); // Small delay to ensure final update is processed
            }
          }
        },
        error: (err: any) => {
          handleError(err);
        },
        complete: () => {
          if (isUnmountedRef.current) return;
          console.log('Subscription completed');
          setConnected(false);
          setLoading(false);
        }
      });

      subscriptionRef.current = subscription;
      setConnected(true);
      setLoading(false);

      // Call connected callback
      if (onConnected) {
        onConnected();
      }

    } catch (err) {
      handleError(err);
    }
  }, [sessionId, enabled, onData, onConnected, handleError, unsubscribe]);

  /**
   * Manual retry function.
   */
  const retry = useCallback(() => {
    console.log('Manual retry triggered');
    retryCountRef.current = 0;
    clearRetryTimeout();
    setError(null);
    subscribe();
  }, [subscribe, clearRetryTimeout]);

  /**
   * Effect: Subscribe when sessionId or enabled changes.
   */
  useEffect(() => {
    isUnmountedRef.current = false;

    if (sessionId && enabled) {
      subscribe();
    } else {
      unsubscribe();
    }

    // Cleanup on unmount or dependency change
    return () => {
      isUnmountedRef.current = true;
      unsubscribe();
    };
  }, [sessionId, enabled, subscribe, unsubscribe]);

  return {
    data,
    loading,
    error,
    connected,
    retry,
    unsubscribe
  };
};

/**
 * Default export for convenience.
 */
export default usePricingSubscription;
