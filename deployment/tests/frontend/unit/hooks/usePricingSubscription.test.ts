/**
 * @fileoverview Tests for usePricingSubscription hook.
 * 
 * Tests the usePricingSubscription hook functionality including:
 * - Subscription initialization with sessionId parameter
 * - Data updates through mock subscription
 * - Error handling and retry logic with exponential backoff
 * - Cleanup on component unmount
 * - Auto-unsubscribe when analysis completes
 * 
 * Requirements addressed:
 * - 6.2: Test subscription functionality with new table structure
 */

// @ts-nocheck
import { renderHook, waitFor, act } from '@testing-library/react';
import { ReactNode } from 'react';
import {
  usePricingSubscription,
  PricingSession,
  SubscriptionError,
  AnalysisData,
  BotMessage
} from '@/hooks/usePricingSubscription';

// Mock the GraphQL client
jest.mock('@/graphql/client', () => ({
  client: {
    graphql: jest.fn()
  }
}));

import { client } from '@/graphql/client';

describe('usePricingSubscription Hook', () => {
  // Mock data
  const mockSessionId = 'session-123';
  const mockUserId = 'user-456';
  const mockProductId = 'product-789';

  const mockAnalysisData: AnalysisData = {
    demandForecast: {
      forecastedDemand: 1500,
      confidence: 0.85,
      trend: 'increasing'
    },
    competitiveAnalysis: {
      competitorCount: 3,
      averagePrice: 89.99,
      pricePosition: 'competitive'
    },
    marginAnalysis: {
      currentMargin: 0.35,
      targetMargin: 0.40,
      marginGap: 0.05
    }
  };

  const mockBotResponses: BotMessage[] = [
    {
      agentId: 'demand-agent',
      agentName: 'Demand Forecaster',
      message: 'Analyzed historical demand patterns',
      timestamp: '2024-01-15T10:30:00Z'
    },
    {
      agentId: 'competitive-agent',
      agentName: 'Competitive Analyst',
      message: 'Identified 3 key competitors',
      timestamp: '2024-01-15T10:31:00Z'
    }
  ];

  const mockPricingSession: PricingSession = {
    id: 'pricing-1',
    sessionId: mockSessionId,
    userId: mockUserId,
    productId: mockProductId,
    product: {
      id: mockProductId,
      product_id: 'CMAN-SAW-PRO725',
      category: 'powertools',
      name: 'Craftsman Professional Saw'
    },
    status: 'in_progress',
    analysisData: mockAnalysisData,
    botResponses: mockBotResponses,
    currentAgent: 'margin-agent',
    agentStatus: 'in_progress',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:31:00Z'
  };

  const mockSubscriptionError: SubscriptionError = {
    message: 'Subscription connection failed',
    code: 'SUBSCRIPTION_ERROR',
    timestamp: '2024-01-15T10:32:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Hook Initialization', () => {
    it('should initialize with valid sessionId parameter', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      // Verify graphql was called with correct sessionId
      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      const callArgs = (client.graphql as jest.Mock).mock.calls[0][0];
      expect(callArgs.variables.sessionId).toBe(mockSessionId);
      
      // After subscription connects, loading should be false and connected should be true
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.connected).toBe(true);
    });

    it('should not subscribe when disabled', () => {
      (client.graphql as jest.Mock).mockReturnValue({
        subscribe: jest.fn()
      });

      renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          enabled: false
        })
      );

      expect(client.graphql).not.toHaveBeenCalled();
    });

    it('should not subscribe when sessionId is empty', () => {
      (client.graphql as jest.Mock).mockReturnValue({
        subscribe: jest.fn()
      });

      renderHook(() =>
        usePricingSubscription({
          sessionId: ''
        })
      );

      expect(client.graphql).not.toHaveBeenCalled();
    });
  });

  describe('Subscription Connection and Data Updates', () => {
    it('should receive pricing session data through subscription', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          // Simulate receiving data
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: mockPricingSession
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      // After subscription connects, loading is false
      expect(result.current.loading).toBe(false);

      // Wait for data to be received
      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data).toEqual(mockPricingSession);
      expect(result.current.connected).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should parse nested analysisData structure correctly', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: mockPricingSession
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      // Verify nested analysisData is accessible
      expect(result.current.data?.analysisData?.demandForecast).toEqual(
        mockAnalysisData.demandForecast
      );
      expect(result.current.data?.analysisData?.competitiveAnalysis).toEqual(
        mockAnalysisData.competitiveAnalysis
      );
      expect(result.current.data?.analysisData?.marginAnalysis).toEqual(
        mockAnalysisData.marginAnalysis
      );
    });

    it('should include botResponses and agent status in data', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: mockPricingSession
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      expect(result.current.data?.botResponses).toEqual(mockBotResponses);
      expect(result.current.data?.currentAgent).toBe('margin-agent');
      expect(result.current.data?.agentStatus).toBe('in_progress');
    });

    it('should call onData callback when data is received', async () => {
      const onDataCallback = jest.fn();

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: mockPricingSession
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          onData: onDataCallback
        })
      );

      await waitFor(() => {
        expect(onDataCallback).toHaveBeenCalledWith(mockPricingSession);
      });
    });

    it('should handle multiple data updates', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          // First update
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: {
                  ...mockPricingSession,
                  status: 'in_progress',
                  currentAgent: 'demand-agent'
                }
              }
            });
          }, 0);

          // Second update
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: {
                  ...mockPricingSession,
                  status: 'in_progress',
                  currentAgent: 'competitive-agent'
                }
              }
            });
          }, 100);

          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.data?.currentAgent).toBe('demand-agent');
      });

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(result.current.data?.currentAgent).toBe('competitive-agent');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle subscription errors', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error({
              message: 'Subscription connection failed',
              code: 'SUBSCRIPTION_ERROR'
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Subscription connection failed');
      expect(result.current.error?.code).toBe('SUBSCRIPTION_ERROR');
      expect(result.current.loading).toBe(false);
      expect(result.current.connected).toBe(false);
    });

    it('should call onError callback when error occurs', async () => {
      const onErrorCallback = jest.fn();

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error({
              message: 'Connection failed',
              code: 'ERROR'
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          onError: onErrorCallback
        })
      );

      await waitFor(() => {
        expect(onErrorCallback).toHaveBeenCalled();
      });

      const errorArg = onErrorCallback.mock.calls[0][0];
      expect(errorArg.message).toBe('Connection failed');
      expect(errorArg.code).toBe('ERROR');
    });

    it('should handle missing error details gracefully', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error(null);
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Subscription error occurred');
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should retry subscription on error with exponential backoff', async () => {
      let callCount = 0;

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          callCount++;

          if (callCount < 3) {
            // First two calls fail
            setTimeout(() => {
              callbacks.error(new Error('Connection failed'));
            }, 0);
          } else {
            // Third call succeeds
            setTimeout(() => {
              callbacks.next({
                data: {
                  onPricingById: mockPricingSession
                }
              });
            }, 0);
          }

          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          maxRetries: 3,
          retryDelay: 1000
        })
      );

      // Initial error
      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // First retry after 1000ms
      jest.advanceTimersByTime(1000);
      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(2);
      });

      // Second retry after 2000ms (exponential backoff)
      jest.advanceTimersByTime(2000);
      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(3);
      });

      // Should succeed on third attempt
      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
        expect(result.current.error).toBeNull();
      });
    });

    it('should respect maxRetries limit', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error(new Error('Connection failed'));
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          maxRetries: 2,
          retryDelay: 500
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // First retry
      jest.advanceTimersByTime(500);
      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(2);
      });

      // Second retry
      jest.advanceTimersByTime(1000);
      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(3);
      });

      // Should not retry again (max retries reached)
      jest.advanceTimersByTime(2000);
      expect(client.graphql).toHaveBeenCalledTimes(3);
    });

    it('should reset retry count on successful data', async () => {
      let callCount = 0;

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          callCount++;

          if (callCount === 1) {
            // First call fails
            setTimeout(() => {
              callbacks.error(new Error('Connection failed'));
            }, 0);
          } else {
            // Second call succeeds
            setTimeout(() => {
              callbacks.next({
                data: {
                  onPricingById: mockPricingSession
                }
              });
            }, 0);
          }

          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          maxRetries: 3,
          retryDelay: 1000
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Retry after 1000ms
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(result.current.data).not.toBeNull();
      });

      // Verify retry count was reset
      expect(result.current.error).toBeNull();
    });

    it('should allow manual retry', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error(new Error('Connection failed'));
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          maxRetries: 1,
          retryDelay: 1000
        })
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Max retries reached, no more automatic retries
      jest.advanceTimersByTime(2000);
      expect(client.graphql).toHaveBeenCalledTimes(2);

      // Manual retry should reset and try again
      act(() => {
        result.current.retry();
      });

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Cleanup on Component Unmount', () => {
    it('should unsubscribe on component unmount', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { unmount } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it('should clear retry timeout on unmount', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.error(new Error('Connection failed'));
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { unmount } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          maxRetries: 3,
          retryDelay: 1000
        })
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      // Unmount before retry timeout fires
      unmount();

      // Advance timers - should not cause additional subscriptions
      jest.advanceTimersByTime(2000);

      expect(client.graphql).toHaveBeenCalledTimes(1);
    });

    it('should call onDisconnected callback on unmount', async () => {
      const onDisconnectedCallback = jest.fn();

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { unmount } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          onDisconnected: onDisconnectedCallback
        })
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      unmount();

      expect(onDisconnectedCallback).toHaveBeenCalled();
    });
  });

  describe('Auto-Unsubscribe on Analysis Completion', () => {
    it('should auto-unsubscribe when status is success', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: {
                  ...mockPricingSession,
                  status: 'success'
                }
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.data?.status).toBe('success');
      });

      // Wait for auto-unsubscribe timeout
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      });
    });

    it('should auto-unsubscribe when status is error', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: {
                  ...mockPricingSession,
                  status: 'error',
                  error: mockSubscriptionError
                }
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.data?.status).toBe('error');
      });

      // Wait for auto-unsubscribe timeout
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      });
    });

    it('should not auto-unsubscribe when status is in_progress', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn((callbacks: any) => {
          setTimeout(() => {
            callbacks.next({
              data: {
                onPricingById: {
                  ...mockPricingSession,
                  status: 'in_progress'
                }
              }
            });
          }, 0);
          return mockSubscription;
        })
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      // Advance timers
      jest.advanceTimersByTime(2000);

      // Should not unsubscribe
      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should resubscribe when sessionId changes', async () => {
      const mockSubscription1 = {
        unsubscribe: jest.fn()
      };

      const mockSubscription2 = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn()
          .mockReturnValueOnce(mockSubscription1)
          .mockReturnValueOnce(mockSubscription2)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { rerender } = renderHook(
        ({ sessionId }: { sessionId: string }) =>
          usePricingSubscription({ sessionId }),
        { initialProps: { sessionId: 'session-1' } }
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalledTimes(1);
      });

      // Change sessionId
      rerender({ sessionId: 'session-2' });

      await waitFor(() => {
        expect(mockSubscription1.unsubscribe).toHaveBeenCalled();
        expect(client.graphql).toHaveBeenCalledTimes(2);
      });

      const secondCallArgs = (client.graphql as jest.Mock).mock.calls[1][0];
      expect(secondCallArgs.variables.sessionId).toBe('session-2');
    });

    it('should unsubscribe when enabled is set to false', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          usePricingSubscription({ sessionId: mockSessionId, enabled }),
        { initialProps: { enabled: true } }
      );

      await waitFor(() => {
        expect(client.graphql).toHaveBeenCalled();
      });

      // Disable subscription
      rerender({ enabled: false });

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it('should call onConnected callback when subscription connects', async () => {
      const onConnectedCallback = jest.fn();

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          onConnected: onConnectedCallback
        })
      );

      await waitFor(() => {
        expect(onConnectedCallback).toHaveBeenCalled();
      });
    });
  });

  describe('Manual Unsubscribe', () => {
    it('should unsubscribe when unsubscribe function is called', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({ sessionId: mockSessionId })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      act(() => {
        result.current.unsubscribe();
      });

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(result.current.connected).toBe(false);
    });

    it('should call onDisconnected callback when manually unsubscribing', async () => {
      const onDisconnectedCallback = jest.fn();

      const mockSubscription = {
        unsubscribe: jest.fn()
      };

      const mockObservable = {
        subscribe: jest.fn().mockReturnValue(mockSubscription)
      };

      (client.graphql as jest.Mock).mockReturnValue(mockObservable);

      const { result } = renderHook(() =>
        usePricingSubscription({
          sessionId: mockSessionId,
          onDisconnected: onDisconnectedCallback
        })
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });

      act(() => {
        result.current.unsubscribe();
      });

      expect(onDisconnectedCallback).toHaveBeenCalled();
    });
  });
});
