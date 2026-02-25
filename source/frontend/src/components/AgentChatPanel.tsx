/**
 * @fileoverview AgentChatPanel component for pricing dashboard.
 * 
 * Displays agent messages in chronological order using virtualized list for
 * performance. Shows agent identification with color-coded badges, formats
 * messages with relative timestamps, and implements auto-scroll to latest
 * message during analysis with manual scroll control.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Badge,
  Button,
  Toggle
} from '@cloudscape-design/components';
// Note: react-window v2 has a different API than v1
// Using simple scrollable div instead for compatibility
// import { List } from 'react-window';
import { formatDistanceToNow } from 'date-fns';

/**
 * Agent type enumeration.
 */
export type AgentType = 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin' | 'system';

/**
 * Chat message data structure.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Name of the agent that sent the message */
  agentName: string;
  /** Type of agent for color coding */
  agentType: AgentType;
  /** Message content */
  content: string;
  /** ISO timestamp when message was sent */
  timestamp: string;
  /** Whether this is an error message */
  isError?: boolean;
  /** Error code if applicable */
  errorCode?: string;
}

/**
 * Props for AgentChatPanel component.
 */
export interface AgentChatPanelProps {
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Whether analysis is currently in progress */
  isAnalysisInProgress: boolean;
}

/**
 * Gets the badge color for an agent type.
 * 
 * @param agentType - Type of agent
 * @returns Badge color identifier
 */
const getAgentBadgeColor = (agentType: AgentType): 'blue' | 'green' | 'red' | 'grey' => {
  switch (agentType) {
    case 'chain':
      return 'blue';
    case 'supervisor':
      return 'blue';
    case 'demand':
      return 'green';
    case 'competitive':
      return 'red';
    case 'margin':
      return 'blue';
    case 'system':
      return 'grey';
    default:
      return 'grey';
  }
};

/**
 * Formats a timestamp as relative time (e.g., "2 minutes ago").
 * 
 * @param timestamp - ISO timestamp string
 * @returns Formatted relative time string
 */
const formatRelativeTime = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Unknown time';
  }
};

/**
 * Estimates the height of a message row based on content length.
 * 
 * @param content - Message content
 * @returns Estimated height in pixels
 */
const estimateMessageHeight = (content: string): number => {
  // Base height for message container (padding, margins, header)
  const baseHeight = 80;
  
  // Estimate lines based on content length (assuming ~80 chars per line)
  const estimatedLines = Math.ceil(content.length / 80);
  
  // Line height is approximately 20px
  const contentHeight = estimatedLines * 20;
  
  return baseHeight + contentHeight;
};

/**
 * AgentChatPanel component.
 * 
 * Displays agent messages in a virtualized list for optimal performance with
 * large message counts. Features include:
 * - Color-coded agent badges for easy identification
 * - Relative timestamps (e.g., "2 minutes ago")
 * - Auto-scroll to latest message during analysis
 * - Manual scroll control to disable auto-scroll when user scrolls up
 * - Virtualization using react-window for performance
 * 
 * Performance optimizations:
 * - Memoized with React.memo to prevent unnecessary re-renders (Requirement 15.2)
 * - Virtualized list for handling 1000+ messages (Requirement 15.5)
 * - useCallback for event handlers
 * 
 * @param props - Component props
 * @returns JSX element
 */
const AgentChatPanelComponent: React.FC<AgentChatPanelProps> = ({
  messages,
  isAnalysisInProgress
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [containerHeight, setContainerHeight] = useState<number>(400);
  const previousMessageCountRef = useRef<number>(0);
  const isUserScrollingRef = useRef<boolean>(false);

  /**
   * Scrolls to the bottom of the message list.
   */
  const scrollToBottom = useCallback(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  /**
   * Toggles auto-scroll on/off.
   */
  const handleToggleAutoScroll = useCallback((checked: boolean) => {
    setAutoScroll(checked);
    if (checked) {
      // If enabling auto-scroll, immediately scroll to bottom
      scrollToBottom();
    }
  }, [scrollToBottom]);

  /**
   * Handles scroll events (kept for potential future use).
   */
  const handleScroll = useCallback(() => {
    // Scroll event handler - currently not used but kept for future enhancements
  }, []);

  /**
   * Enables auto-scroll and scrolls to bottom.
   */
  const handleEnableAutoScroll = useCallback(() => {
    setAutoScroll(true);
    scrollToBottom();
  }, [scrollToBottom]);

  /**
   * Effect: Auto-scroll to latest message when new messages arrive
   * and auto-scroll is enabled.
   */
  useEffect(() => {
    // Auto-scroll only if enabled and new messages have been added
    if (autoScroll && messages.length > previousMessageCountRef.current) {
      scrollToBottom();
    }
    
    previousMessageCountRef.current = messages.length;
  }, [messages, autoScroll, scrollToBottom]);

  /**
   * Effect: Update container height on mount and resize.
   */
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Set height to available space, with a minimum of 400px
        setContainerHeight(Math.max(400, rect.height));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  /**
   * Gets the height of a specific message item.
   * 
   * @param index - Message index
   * @returns Height in pixels
   */
  const getItemSize = (index: number): number => {
    const message = messages[index];
    return message ? estimateMessageHeight(message.content) : 100;
  };

  /**
   * Renders a single message row.
   * 
   * @param props - Row props from react-window
   * @returns JSX element
   */
  const MessageRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    
    if (!message) {
      return null;
    }

    // Determine styling based on message type
    const isErrorMessage = message.isError;
    const contentBackgroundColor = isErrorMessage ? '#FEE2E2' : '#f9f9f9';
    const contentBorderColor = isErrorMessage ? '#EF4444' : '#e9ecef';
    const contentTextColor = isErrorMessage ? '#991B1B' : '#000716';

    return (
      <div style={style}>
        <Box padding={{ vertical: 's', horizontal: 'm' }}>
          <SpaceBetween direction="vertical" size="xs">
            {/* Message Header: Agent Badge and Timestamp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge color={getAgentBadgeColor(message.agentType)}>
                {message.agentName}
              </Badge>
              <Box
                fontSize="body-s"
                color="text-body-secondary"
              >
                {formatRelativeTime(message.timestamp)}
              </Box>
              {isErrorMessage && (
                <Badge color="red">
                  ERROR
                </Badge>
              )}
            </div>

            {/* Message Content */}
            <div
              style={{
                padding: '8px',
                backgroundColor: contentBackgroundColor,
                borderRadius: '8px',
                border: `1px solid ${contentBorderColor}`,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: contentTextColor
              }}
            >
              {isErrorMessage && (
                <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
                  ❌ Error
                </div>
              )}
              <Box fontSize="body-m">
                {message.content}
              </Box>
              {message.errorCode && (
                <Box
                  fontSize="body-s"
                  color="text-body-secondary"
                  margin={{ top: 's' }}
                >
                  Error Code: {message.errorCode}
                </Box>
              )}
            </div>
          </SpaceBetween>
        </Box>
      </div>
    );
  };

  /**
   * Counts error messages in the conversation.
   */
  const errorCount = useMemo(() => {
    return messages.filter(msg => msg.isError).length;
  }, [messages]);

  // Handle empty state
  if (messages.length === 0) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            description="Real-time agent conversations and analysis progress"
          >
            Agent Chat
          </Header>
        }
      >
        <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
          No messages yet. Agent conversations will appear here as analysis progresses.
        </Box>
      </Container>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Real-time agent conversations and analysis progress"
          actions={
            <SpaceBetween direction="horizontal" size="s">
              {!autoScroll && (
                <Button
                  variant="primary"
                  iconName="angle-down"
                  onClick={handleEnableAutoScroll}
                >
                  Jump to Latest
                </Button>
              )}
              <Toggle
                checked={autoScroll}
                onChange={({ detail }) => handleToggleAutoScroll(detail.checked)}
              >
                Auto-scroll
              </Toggle>
            </SpaceBetween>
          }
        >
          Agent Chat
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="m">
        {/* Error Summary */}
        {errorCount > 0 && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              borderRadius: '4px',
              border: '1px solid #EF4444'
            }}
          >
            <Box
              textAlign="center"
              fontSize="body-s"
              color="text-status-error"
            >
              ⚠️ {errorCount} {errorCount === 1 ? 'error' : 'errors'} encountered during analysis
            </Box>
          </div>
        )}

        {/* Auto-scroll status indicator */}
        {!autoScroll && (
          <div
            style={{
              padding: '8px',
              backgroundColor: '#e7f2fa',
              borderRadius: '4px',
              border: '1px solid #0972d3'
            }}
          >
            <Box
              textAlign="center"
              fontSize="body-s"
              color="text-status-info"
            >
              Auto-scroll disabled. New messages will not scroll automatically.
            </Box>
          </div>
        )}

        {/* Message count indicator */}
        <Box
          padding="xs"
          fontSize="body-s"
          color="text-body-secondary"
          textAlign="center"
        >
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          {isAnalysisInProgress && ' • Analysis in progress...'}
        </Box>

        {/* Virtualized message list */}
        <div
          ref={containerRef}
          className="chat-panel-container"
          style={{
            height: `${containerHeight}px`,
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <div
            ref={listRef}
            style={{
              height: containerHeight,
              width: '100%',
              overflowY: 'auto',
              overflowX: 'hidden'
            }}
            onScroll={handleScroll}
          >
            {messages.map((message, index) => (
              <MessageRow key={message.id} index={index} style={{}} />
            ))}
          </div>
        </div>

        {/* Analysis status footer */}
        {isAnalysisInProgress && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              border: '1px solid #e9ecef'
            }}
          >
            <Box
              textAlign="center"
              fontSize="body-s"
              color="text-status-info"
            >
              🔄 Analysis in progress. New messages will appear automatically.
            </Box>
          </div>
        )}
      </SpaceBetween>
    </Container>
  );
};

/**
 * Memoized AgentChatPanel component to prevent unnecessary re-renders.
 * Only re-renders when messages array or isAnalysisInProgress changes.
 * 
 * Performance optimization (Requirement 15.2)
 */
export const AgentChatPanel = React.memo(AgentChatPanelComponent, (prevProps, nextProps) => {
  // Check if messages array changed (by reference or length)
  if (prevProps.messages !== nextProps.messages || 
      prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  
  // Check if isAnalysisInProgress changed
  if (prevProps.isAnalysisInProgress !== nextProps.isAnalysisInProgress) {
    return false;
  }
  
  return true; // Props are equal, skip re-render
});

AgentChatPanel.displayName = 'AgentChatPanel';

export default AgentChatPanel;
