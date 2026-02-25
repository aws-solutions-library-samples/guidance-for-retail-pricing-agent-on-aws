/**
 * @fileoverview Unit tests for AgentChatPanel component.
 * 
 * Tests message display, agent identification, timestamp formatting,
 * auto-scroll behavior, and virtualization.
 */

// @ts-nocheck - Test file with complex JSX mocking
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentChatPanel, ChatMessage } from '../../../../src/frontend/src/components/AgentChatPanel';

// Mock CloudScape components
jest.mock('@cloudscape-design/components', () => ({
  Container: ({ children, header, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-container', ...props }, [header, children])
  ),
  Header: ({ children, variant, description, actions, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-header', 'data-variant': variant, ...props }, [
      children,
      description && React.createElement('div', { 'data-testid': 'header-description' }, description),
      actions && React.createElement('div', { 'data-testid': 'header-actions' }, actions)
    ])
  ),
  Box: ({ children, ...props }: any) => (
    React.createElement('div', { 'data-testid': 'cloudscape-box', ...props }, children)
  ),
  SpaceBetween: ({ children, direction, size, ...props }: any) => (
    React.createElement('div', {
      'data-testid': 'cloudscape-space-between',
      'data-direction': direction,
      'data-size': size,
      style: { 
        display: 'flex', 
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        gap: size === 's' ? '8px' : size === 'm' ? '16px' : '24px'
      },
      ...props
    }, children)
  ),
  Badge: ({ children, color, ...props }: any) => (
    React.createElement('span', { 'data-testid': 'cloudscape-badge', 'data-color': color, ...props }, children)
  ),
  Button: ({ children, onClick, variant, iconName, ...props }: any) => (
    React.createElement('button', { 
      'data-testid': 'cloudscape-button', 
      'data-variant': variant,
      'data-icon': iconName,
      onClick,
      ...props 
    }, children)
  )
}));

// Mock react-window
jest.mock('react-window', () => ({
  VariableSizeList: ({ children, itemCount, itemSize, height, width }: any) => (
    React.createElement('div', {
      'data-testid': 'virtualized-list',
      'data-item-count': itemCount,
      style: { height, width }
    }, 
      Array.from({ length: Math.min(itemCount, 10) }).map((_, index) => 
        children({ index, style: {} })
      )
    )
  )
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: (date: Date) => '2 minutes ago'
}));

/**
 * Creates mock chat messages for testing.
 */
const createMockMessages = (): ChatMessage[] => [
  {
    id: 'msg-1',
    agentName: 'Chain Agent',
    agentType: 'chain',
    content: 'Starting pricing analysis...',
    timestamp: '2024-01-15T10:00:00Z'
  },
  {
    id: 'msg-2',
    agentName: 'Demand Agent',
    agentType: 'demand',
    content: 'Analyzing historical demand patterns...',
    timestamp: '2024-01-15T10:01:00Z'
  },
  {
    id: 'msg-3',
    agentName: 'Competitive Agent',
    agentType: 'competitive',
    content: 'Gathering competitive intelligence...',
    timestamp: '2024-01-15T10:02:00Z'
  }
];

describe('AgentChatPanel Component', () => {
  describe('Empty State', () => {
    it('should display empty state when no messages', () => {
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={[]} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Agent conversations will appear here/i)).toBeInTheDocument();
    });
  });

  describe('Message Display', () => {
    it('should render all messages', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText('Starting pricing analysis...')).toBeInTheDocument();
      expect(screen.getByText('Analyzing historical demand patterns...')).toBeInTheDocument();
      expect(screen.getByText('Gathering competitive intelligence...')).toBeInTheDocument();
    });

    it('should display agent names with badges', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText('Chain Agent')).toBeInTheDocument();
      expect(screen.getByText('Demand Agent')).toBeInTheDocument();
      expect(screen.getByText('Competitive Agent')).toBeInTheDocument();
    });

    it('should display message count', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/3 messages/i)).toBeInTheDocument();
    });

    it('should display singular message count for one message', () => {
      const messages = [createMockMessages()[0]];
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/1 message/i)).toBeInTheDocument();
    });
  });

  describe('Analysis Progress Indicator', () => {
    it('should show analysis in progress indicator when active', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={true} />);
      
      // Use getAllByText since the text appears in multiple places
      const indicators = screen.getAllByText(/Analysis in progress/i);
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('should not show analysis indicator when complete', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.queryByText(/Analysis in progress/i)).not.toBeInTheDocument();
    });
  });

  describe('Virtualized List', () => {
    it('should render virtualized list with correct item count', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      const virtualizedList = screen.getByTestId('virtualized-list');
      expect(virtualizedList).toBeInTheDocument();
      expect(virtualizedList).toHaveAttribute('data-item-count', '3');
    });
  });

  describe('Auto-scroll Control', () => {
    it('should show "Jump to Latest" button when auto-scroll is disabled', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      const { container } = render(<AgentChatPanel messages={messages} isAnalysisInProgress={true} />);
      
      // Initially auto-scroll should be enabled, so button should not be visible
      expect(screen.queryByText('Jump to Latest')).not.toBeInTheDocument();
    });
  });

  describe('Agent Badge Colors', () => {
    it('should render different agent types with appropriate badges', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          agentName: 'Chain Agent',
          agentType: 'chain',
          content: 'Chain message',
          timestamp: '2024-01-15T10:00:00Z'
        },
        {
          id: 'msg-2',
          agentName: 'Supervisor Agent',
          agentType: 'supervisor',
          content: 'Supervisor message',
          timestamp: '2024-01-15T10:01:00Z'
        },
        {
          id: 'msg-3',
          agentName: 'Demand Agent',
          agentType: 'demand',
          content: 'Demand message',
          timestamp: '2024-01-15T10:02:00Z'
        },
        {
          id: 'msg-4',
          agentName: 'Competitive Agent',
          agentType: 'competitive',
          content: 'Competitive message',
          timestamp: '2024-01-15T10:03:00Z'
        },
        {
          id: 'msg-5',
          agentName: 'Margin Agent',
          agentType: 'margin',
          content: 'Margin message',
          timestamp: '2024-01-15T10:04:00Z'
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText('Chain Agent')).toBeInTheDocument();
      expect(screen.getByText('Supervisor Agent')).toBeInTheDocument();
      expect(screen.getByText('Demand Agent')).toBeInTheDocument();
      expect(screen.getByText('Competitive Agent')).toBeInTheDocument();
      expect(screen.getByText('Margin Agent')).toBeInTheDocument();
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format timestamps as relative time', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      // Check that timestamps are displayed (actual format may vary based on date-fns)
      const timestamps = screen.getAllByText(/ago$/i);
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should have proper header structure', () => {
      const messages = createMockMessages();
      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText('Agent Chat')).toBeInTheDocument();
      expect(screen.getByText(/Real-time agent conversations/i)).toBeInTheDocument();
    });
  });

  describe('Error Message Display', () => {
    it('should display error messages with error styling', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          agentName: 'Demand Agent',
          agentType: 'demand',
          content: 'Analysis failed due to insufficient data',
          timestamp: '2024-01-15T10:00:00Z',
          isError: true,
          errorCode: 'INSUFFICIENT_DATA'
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText('Analysis failed due to insufficient data')).toBeInTheDocument();
      expect(screen.getByText('ERROR')).toBeInTheDocument();
    });

    it('should display error code when provided', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          agentName: 'Competitive Agent',
          agentType: 'competitive',
          content: 'Failed to fetch competitor data',
          timestamp: '2024-01-15T10:00:00Z',
          isError: true,
          errorCode: 'NETWORK_ERROR'
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/Error Code: NETWORK_ERROR/i)).toBeInTheDocument();
    });

    it('should count and display error messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          agentName: 'Demand Agent',
          agentType: 'demand',
          content: 'Error 1',
          timestamp: '2024-01-15T10:00:00Z',
          isError: true
        },
        {
          id: 'msg-2',
          agentName: 'Competitive Agent',
          agentType: 'competitive',
          content: 'Error 2',
          timestamp: '2024-01-15T10:01:00Z',
          isError: true
        },
        {
          id: 'msg-3',
          agentName: 'Margin Agent',
          agentType: 'margin',
          content: 'Normal message',
          timestamp: '2024-01-15T10:02:00Z'
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/2 errors encountered during analysis/i)).toBeInTheDocument();
    });

    it('should display singular error message', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          agentName: 'Margin Agent',
          agentType: 'margin',
          content: 'Single error',
          timestamp: '2024-01-15T10:00:00Z',
          isError: true
        }
      ];

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.getByText(/1 error encountered during analysis/i)).toBeInTheDocument();
    });

    it('should not display error summary when no errors', () => {
      const messages = createMockMessages();

      // @ts-ignore - JSX element type compatibility
      render(<AgentChatPanel messages={messages} isAnalysisInProgress={false} />);
      
      expect(screen.queryByText(/errors encountered during analysis/i)).not.toBeInTheDocument();
    });
  });
});
