/**
 * @fileoverview React hook for chat messages with load-then-subscribe pattern.
 * 
 * Implements the load-then-subscribe pattern where the hook first fetches existing
 * chat messages via GraphQL query, then establishes a subscription for real-time
 * message updates. Messages are maintained in chronological order.
 * 
 * Requirements addressed:
 * - 5.1: Execute listChatMessages query on page load
 * - 5.2: Display messages in chronological order
 * - 5.3: Subscribe to onChatMessageBySession for real-time updates
 * - 5.4: Append new messages without removing existing ones
 */

import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Debug flag for verbose logging.
 * 
 * Set to true to enable detailed authentication and query logging.
 * Useful for troubleshooting authentication or query issues.
 * 
 * When enabled, logs include:
 * - Authentication status and token expiry
 * - Query variables and execution
 * - Complete GraphQL responses
 * - Subscription connection status
 * - Detailed error information
 * 
 * To enable: Change `false` to `true` below
 */
const DEBUG_CHAT_MESSAGES = false;
import { client } from '../graphql/client';
import { LIST_CHAT_MESSAGES } from '../graphql/queries';
import { ON_CHAT_MESSAGE_BY_SESSION } from '../graphql/subscriptions';
import type { ChatMessage } from '../graphql/types';
import type { 
  ListChatMessagesResponse, 
  ListChatMessagesVariables,
  ChatMessageQueryResult
} from '../graphql/queries';
import type { 
  OnChatMessageBySessionResponse,
  OnChatMessageBySessionVariables,
  SubscriptionConnectionState,
  ChatMessageSubscriptionResult
} from '../graphql/subscriptions';

/**
 * Configuration options for the useChatMessages hook.
 */
export interface UseChatMessagesOptions {
  /** Session ID to fetch and subscribe to */
  sessionId: string;
  /** Enable/disable the hook (default: true) */
  enabled?: boolean;
  /** Enable auto-scroll on new messages (default: true) */
  autoScroll?: boolean;
  /** Callback when new message is received */
  onMessage?: (message: ChatMessage) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Maximum number of messages to fetch initially (default: 100) */
  limit?: number;
}

/**
 * Result returned by the useChatMessages hook.
 */
export interface UseChatMessagesResult {
  /** Array of chat messages in chronological order */
  messages: ChatMessage[];
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
  /** Refetch function - manually refetch messages via query */
  refetch: () => Promise<void>;
  /** Clear messages function */
  clearMessages: () => void;
}

/**
 * Default configuration values.
 */
const DEFAULT_LIMIT = 100;


/**
 * Converts a ChatMessageQueryResult to a ChatMessage.
 * Parses the metadata JSON string if present.
 * 
 * @param result - Query result from GraphQL
 * @returns ChatMessage object
 */
function convertQueryResultToMessage(result: ChatMessageQueryResult): ChatMessage {
  let parsedMetadata: Record<string, unknown> = {};
  
  if (result.metadata) {
    try {
      parsedMetadata = JSON.parse(result.metadata);
    } catch (error) {
      console.warn('[useChatMessages] Failed to parse message metadata:', error);
    }
  }

  return {
    id: result.id,
    sessionId: result.sessionId,
    timestamp: result.timestamp,
    agentId: result.agentId,
    agentName: result.agentName,
    message: result.message,
    senderType: result.senderType,
    metadata: parsedMetadata,
  };
}

/**
 * Converts a ChatMessageSubscriptionResult to a ChatMessage.
 * Parses the metadata JSON string if present.
 * 
 * @param result - Subscription result from GraphQL
 * @returns ChatMessage object
 */
function convertSubscriptionResultToMessage(result: ChatMessageSubscriptionResult): ChatMessage {
  let parsedMetadata: Record<string, unknown> = {};
  
  if (result.metadata) {
    try {
      parsedMetadata = JSON.parse(result.metadata);
    } catch (error) {
      console.warn('[useChatMessages] Failed to parse message metadata:', error);
    }
  }

  return {
    id: result.id,
    sessionId: result.sessionId,
    timestamp: result.timestamp,
    agentId: result.agentId,
    agentName: result.agentName,
    message: result.message,
    senderType: result.senderType,
    metadata: parsedMetadata,
  };
}

/**
 * Sorts messages by timestamp in ascending order (oldest first).
 * 
 * @param messages - Array of chat messages
 * @returns Sorted array of chat messages
 */
export function sortMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}

/**
 * Appends a new message to the existing messages array.
 * Maintains chronological order and prevents duplicates.
 * 
 * @param existingMessages - Current array of messages
 * @param newMessage - New message to append
 * @returns Updated array with new message in correct position
 */
export function appendMessage(
  existingMessages: ChatMessage[],
  newMessage: ChatMessage
): ChatMessage[] {
  // Check for duplicate by ID
  const isDuplicate = existingMessages.some(msg => msg.id === newMessage.id);
  
  if (isDuplicate) {
    console.log('[useChatMessages] Duplicate message ignored:', newMessage.id);
    return existingMessages;
  }

  // Append and sort to maintain chronological order
  const updatedMessages = [...existingMessages, newMessage];
  return sortMessagesByTimestamp(updatedMessages);
}


/**
 * React hook for chat messages with load-then-subscribe pattern.
 * 
 * Implements the following workflow:
 * 1. On mount, execute listChatMessages query to fetch existing messages
 * 2. Sort messages in chronological order (oldest first)
 * 3. Establish subscription for real-time message updates
 * 4. Append new messages while maintaining chronological order
 * 5. Clean up subscription on unmount
 * 
 * @param options - Hook configuration options
 * @returns Hook result with messages, loading, error, and control functions
 * 
 * @example
 * ```typescript
 * const { messages, loading, error, connected } = useChatMessages({
 *   sessionId: 'session-123',
 *   onMessage: (message) => console.log('New message:', message),
 * });
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Alert type="error">{error.message}</Alert>;
 * 
 * return (
 *   <ChatPanel>
 *     {messages.map(msg => (
 *       <ChatMessage key={msg.id} message={msg} />
 *     ))}
 *   </ChatPanel>
 * );
 * ```
 */
export const useChatMessages = (
  options: UseChatMessagesOptions
): UseChatMessagesResult => {
  const {
    sessionId,
    enabled = true,
    // autoScroll is exposed for consumers but scroll behavior is handled by the component
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    autoScroll: _autoScroll = true,
    onMessage,
    onError,
    limit = DEFAULT_LIMIT,
  } = options;

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<SubscriptionConnectionState>('disconnected');

  // Refs for subscription management
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  /**
   * Unsubscribes from the current subscription.
   */
  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
        console.log('[useChatMessages] Unsubscribed from chat messages');
      } catch (err) {
        console.error('[useChatMessages] Error unsubscribing:', err);
      }
      subscriptionRef.current = null;
    }

    setConnectionState('disconnected');
  }, []);

  /**
   * Fetches chat messages via GraphQL query.
   */
  const fetchMessages = useCallback(async (): Promise<ChatMessage[]> => {
    if (!sessionId || isUnmountedRef.current) {
      return [];
    }

    console.log(`[useChatMessages] Fetching messages for session: ${sessionId}`);

    try {
      // Check authentication status (with optional debug logging)
      if (DEBUG_CHAT_MESSAGES) {
        try {
          const { getCurrentUser, fetchAuthSession } = await import('aws-amplify/auth');
          const user = await getCurrentUser();
          const session = await fetchAuthSession();
          
          console.log('[useChatMessages] Authentication check:', {
            username: user.username,
            userId: user.userId,
            hasAccessToken: !!session.tokens?.accessToken,
            hasIdToken: !!session.tokens?.idToken,
            accessTokenExpiry: session.tokens?.accessToken?.payload?.exp,
            currentTime: Math.floor(Date.now() / 1000),
            isExpired: session.tokens?.accessToken?.payload?.exp 
              ? session.tokens.accessToken.payload.exp < Math.floor(Date.now() / 1000)
              : 'unknown'
          });

          // Check if token is expired
          if (session.tokens?.accessToken?.payload?.exp) {
            const now = Math.floor(Date.now() / 1000);
            if (session.tokens.accessToken.payload.exp < now) {
              console.error('[useChatMessages] Access token is expired!');
              throw new Error('Access token expired. Please refresh the page.');
            }
          }
        } catch (authError) {
          console.error('[useChatMessages] User not authenticated:', authError);
          throw new Error('User must be authenticated to fetch chat messages');
        }
      }

      if (DEBUG_CHAT_MESSAGES) {
        console.log('[useChatMessages] Executing query with sessionId:', sessionId);
        console.log('[useChatMessages] Query variables:', { sessionId, limit });
      }
      
      // Let Amplify automatically determine the auth mode based on amplify_outputs.json
      // This should use AMAZON_COGNITO_USER_POOLS as configured
      const result = await client.graphql({
        query: LIST_CHAT_MESSAGES,
        variables: { sessionId, limit } as ListChatMessagesVariables
      });

      const response = result as { data: ListChatMessagesResponse; errors?: any[] };

      // Log the complete response for debugging (if enabled)
      if (DEBUG_CHAT_MESSAGES) {
        console.log('[useChatMessages] Complete GraphQL response:', {
          hasData: !!response.data,
          hasErrors: !!(response.errors && response.errors.length > 0),
          dataKeys: response.data ? Object.keys(response.data) : [],
          errorCount: response.errors?.length || 0
        });
      }

      if (response.errors && response.errors.length > 0) {
        const firstError = response.errors[0];
        
        if (DEBUG_CHAT_MESSAGES) {
          console.error('[useChatMessages] GraphQL errors:', JSON.stringify(response.errors, null, 2));
          console.error('[useChatMessages] Detailed error analysis:', {
            errorObject: firstError,
            errorKeys: Object.keys(firstError),
            message: firstError.message,
            errorType: firstError.errorType,
            path: firstError.path,
            locations: firstError.locations
          });
        }
        
        const errorMessage = firstError.message 
          || firstError.errorType 
          || firstError.errorMessage
          || firstError.extensions?.message
          || 'GraphQL query failed';
        
        throw new Error(errorMessage);
      }

      const items = response.data?.listChatMessages?.items || [];
      const chatMessages = items.map(convertQueryResultToMessage);
      const sortedMessages = sortMessagesByTimestamp(chatMessages);

      if (DEBUG_CHAT_MESSAGES) {
        console.log(`[useChatMessages] Fetched ${sortedMessages.length} messages`);
      }

      return sortedMessages;
    } catch (err) {
      if (DEBUG_CHAT_MESSAGES) {
        console.error('[useChatMessages] Error fetching messages:', {
          error: err,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
      }
      const error = err instanceof Error ? err : new Error(String(err));
      throw error;
    }
  }, [sessionId, limit]);


  /**
   * Establishes subscription for real-time message updates.
   */
  const subscribe = useCallback(() => {
    if (!sessionId || !enabled || isUnmountedRef.current) {
      return;
    }

    // Don't subscribe if already connected
    if (subscriptionRef.current) {
      return;
    }

    if (DEBUG_CHAT_MESSAGES) {
      console.log(`[useChatMessages] Establishing subscription for session: ${sessionId}`);
    }
    setConnectionState('connecting');

    try {
      const subscriptionObservable = client.graphql({
        query: ON_CHAT_MESSAGE_BY_SESSION,
        variables: { sessionId } as OnChatMessageBySessionVariables,
      });

      const subscription = (subscriptionObservable as any).subscribe({
        next: (response: { data: OnChatMessageBySessionResponse; errors?: any[] }) => {
          if (isUnmountedRef.current) return;

          if (response.errors && response.errors.length > 0) {
            console.error('[useChatMessages] Subscription error:', response.errors);
            return;
          }

          const incomingMessage = response.data?.onChatMessageBySession;
          
          if (incomingMessage) {
            if (DEBUG_CHAT_MESSAGES) {
              console.log('[useChatMessages] New message received:', {
                id: incomingMessage.id,
                agentName: incomingMessage.agentName,
                senderType: incomingMessage.senderType,
              });
            }

            const chatMessage = convertSubscriptionResultToMessage(incomingMessage);

            // Append message while maintaining chronological order
            setMessages((prevMessages) => {
              const updatedMessages = appendMessage(prevMessages, chatMessage);
              return updatedMessages;
            });

            // Call onMessage callback
            if (onMessage) {
              onMessage(chatMessage);
            }
          }
        },
        error: (err: any) => {
          if (isUnmountedRef.current) return;

          const subscriptionError = err instanceof Error ? err : new Error(err?.message || 'Subscription error');
          console.error('[useChatMessages] Subscription error:', subscriptionError);
          
          setConnectionState('error');
          setError(subscriptionError);

          if (onError) {
            onError(subscriptionError);
          }
        },
        complete: () => {
          if (isUnmountedRef.current) return;
          console.log('[useChatMessages] Subscription completed');
          setConnectionState('disconnected');
        },
      });

      subscriptionRef.current = subscription;
      setConnectionState('connected');
      
      if (DEBUG_CHAT_MESSAGES) {
        console.log('[useChatMessages] Subscription established successfully');
      }

    } catch (err) {
      const subscriptionError = err instanceof Error ? err : new Error(String(err));
      console.error('[useChatMessages] Error establishing subscription:', subscriptionError);
      setConnectionState('error');
      setError(subscriptionError);

      if (onError) {
        onError(subscriptionError);
      }
    }
  }, [sessionId, enabled, onMessage, onError]);

  /**
   * Initializes the hook by fetching messages and establishing subscription.
   */
  const initialize = useCallback(async () => {
    if (!sessionId || !enabled || isUnmountedRef.current) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Fetch existing messages via query
      const initialMessages = await fetchMessages();
      
      if (isUnmountedRef.current) return;

      setMessages(initialMessages);

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
  }, [sessionId, enabled, fetchMessages, subscribe, onError]);

  /**
   * Manual retry function.
   */
  const retry = useCallback(() => {
    if (DEBUG_CHAT_MESSAGES) {
      console.log('[useChatMessages] Manual retry triggered');
    }
    setError(null);
    unsubscribe();
    initialize();
  }, [unsubscribe, initialize]);

  /**
   * Manual refetch function.
   */
  const refetch = useCallback(async () => {
    if (DEBUG_CHAT_MESSAGES) {
      console.log('[useChatMessages] Manual refetch triggered');
    }
    setLoading(true);
    setError(null);

    try {
      const freshMessages = await fetchMessages();
      
      if (!isUnmountedRef.current) {
        setMessages(freshMessages);
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
  }, [fetchMessages, onError]);

  /**
   * Clear all messages.
   */
  const clearMessages = useCallback(() => {
    if (DEBUG_CHAT_MESSAGES) {
      console.log('[useChatMessages] Clearing messages');
    }
    setMessages([]);
  }, []);

  /**
   * Effect: Initialize on mount or when sessionId/enabled changes.
   */
  useEffect(() => {
    isUnmountedRef.current = false;

    if (sessionId && enabled) {
      initialize();
    } else {
      setLoading(false);
      unsubscribe();
    }

    // Cleanup on unmount or dependency change
    return () => {
      isUnmountedRef.current = true;
      unsubscribe();
    };
  }, [sessionId, enabled, initialize, unsubscribe]);

  return {
    messages,
    loading,
    error,
    connectionState,
    connected: connectionState === 'connected',
    retry,
    refetch,
    clearMessages,
  };
};

/**
 * Default export for convenience.
 */
export default useChatMessages;
