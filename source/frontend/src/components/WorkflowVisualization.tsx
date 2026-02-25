/**
 * @fileoverview WorkflowVisualization component for pricing dashboard.
 * 
 * Displays agent workflow diagram using React Flow with color-coded status
 * indicators. Shows hierarchical agent execution (Chain → Supervisor → Parallel agents)
 * with real-time status updates from subscription data.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Badge,
  Button
} from '@cloudscape-design/components';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  NodeProps,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/**
 * Agent status enumeration.
 */
export type AgentStatus = 'pending' | 'in-progress' | 'complete' | 'failed';

/**
 * Agent information interface.
 */
export interface AgentInfo {
  /** Agent identifier */
  id: string;
  /** Agent display name */
  name: string;
  /** Agent type */
  type: 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin';
  /** Current agent status */
  status: AgentStatus;
  /** Start time (ISO timestamp) */
  startTime?: string;
  /** End time (ISO timestamp) */
  endTime?: string;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
  /** Whether partial results are available */
  hasPartialResults?: boolean;
}

/**
 * Props for WorkflowVisualization component.
 */
export interface WorkflowVisualizationProps {
  /** Map of agent statuses keyed by agent ID */
  agentStatuses: Map<string, AgentInfo>;
  /** Callback when node is clicked */
  onNodeClick?: (agentId: string, agentInfo: AgentInfo) => void;
  /** Callback to retry workflow execution */
  onRetry?: () => void;
  /** Whether workflow has failed */
  hasError?: boolean;
}

/**
 * Gets the color for an agent status.
 * 
 * @param status - Agent status
 * @returns Color hex code
 */
const getStatusColor = (status: AgentStatus): string => {
  switch (status) {
    case 'pending':
      return '#6B7280'; // Gray
    case 'in-progress':
      return '#3B82F6'; // Blue
    case 'complete':
      return '#10B981'; // Green
    case 'failed':
      return '#EF4444'; // Red
    default:
      return '#6B7280';
  }
};

/**
 * Gets the background color for an agent status.
 * 
 * @param status - Agent status
 * @returns Background color hex code
 */
const getStatusBackgroundColor = (status: AgentStatus): string => {
  switch (status) {
    case 'pending':
      return '#F3F4F6'; // Light gray
    case 'in-progress':
      return '#DBEAFE'; // Light blue
    case 'complete':
      return '#D1FAE5'; // Light green
    case 'failed':
      return '#FEE2E2'; // Light red
    default:
      return '#F3F4F6';
  }
};

/**
 * Gets the status icon for an agent status.
 * 
 * @param status - Agent status
 * @returns Status icon emoji
 */
const getStatusIcon = (status: AgentStatus): string => {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'in-progress':
      return '🔄';
    case 'complete':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '⏳';
  }
};

/**
 * Custom node component for agent visualization.
 * 
 * @param props - Node props from React Flow
 * @returns JSX element
 */
const AgentNode: React.FC<NodeProps> = ({ data }) => {
  const { name, status, type, agentInfo } = data as {
    name: string;
    status: AgentStatus;
    type: string;
    agentInfo: AgentInfo;
  };
  const statusColor = getStatusColor(status);
  const backgroundColor = getStatusBackgroundColor(status);
  const statusIcon = getStatusIcon(status);
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);

  return (
    <div
      style={{
        padding: '16px',
        borderRadius: '8px',
        border: `2px solid ${statusColor}`,
        backgroundColor,
        minWidth: '180px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        position: 'relative'
      }}
      onMouseEnter={() => status === 'failed' && setShowErrorDetails(true)}
      onMouseLeave={() => setShowErrorDetails(false)}
    >
      {/* Input handle for connections from above */}
      {type !== 'chain' && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: statusColor,
            width: '10px',
            height: '10px'
          }}
        />
      )}

      <SpaceBetween direction="vertical" size="xs">
        {/* Status Icon */}
        <div style={{ fontSize: '24px' }}>
          {statusIcon}
        </div>

        {/* Agent Name */}
        <div
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#000716'
          }}
        >
          {name}
        </div>

        {/* Status Badge */}
        <div>
          <Badge
            color={
              status === 'complete' ? 'green' :
              status === 'in-progress' ? 'blue' :
              status === 'failed' ? 'red' :
              'grey'
            }
          >
            {String(status).replace('-', ' ').toUpperCase()}
          </Badge>
        </div>

        {/* Partial Results Indicator */}
        {agentInfo?.hasPartialResults && (
          <div style={{ fontSize: '12px', color: '#FF9900' }}>
            ⚠️ Partial Results
          </div>
        )}
      </SpaceBetween>

      {/* Error Details Tooltip */}
      {showErrorDetails && agentInfo?.error && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            backgroundColor: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            color: '#991B1B',
            maxWidth: '200px',
            zIndex: 1000,
            whiteSpace: 'normal',
            wordBreak: 'break-word'
          }}
        >
          <strong>Error:</strong> {agentInfo.error}
          {agentInfo.errorCode && (
            <div style={{ marginTop: '4px', fontSize: '11px' }}>
              Code: {agentInfo.errorCode}
            </div>
          )}
        </div>
      )}

      {/* Output handle for connections to below */}
      {type !== 'demand' && type !== 'competitive' && type !== 'margin' && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: statusColor,
            width: '10px',
            height: '10px'
          }}
        />
      )}
    </div>
  );
};

/**
 * Node types configuration for React Flow.
 */
const nodeTypes = {
  agentNode: AgentNode
};

/**
 * WorkflowVisualization component.
 * 
 * Displays agent workflow diagram with hierarchical layout showing:
 * - Chain Agent (orchestrator) at top
 * - Supervisor Agent (coordinator) in middle
 * - Parallel agents (demand, competitive, margin) at bottom
 * 
 * Features:
 * - Color-coded status indicators (gray=pending, blue=in-progress, green=complete, red=failed)
 * - Real-time status updates from subscription data
 * - Interactive nodes (click to see details)
 * - Status legend for color meanings
 * - Minimap for navigation
 * - Zoom and pan controls
 * 
 * Performance optimizations:
 * - Memoized with React.memo to prevent unnecessary re-renders (Requirement 15.2)
 * - useMemo for expensive node/edge calculations
 * - useCallback for event handlers
 * 
 * @param props - Component props
 * @returns JSX element
 */
const WorkflowVisualizationComponent: React.FC<WorkflowVisualizationProps> = ({
  agentStatuses,
  onNodeClick,
  onRetry,
  hasError
}) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  /**
   * Gets agent info from the status map or returns default.
   * 
   * @param agentId - Agent identifier
   * @param defaultName - Default agent name
   * @param defaultType - Default agent type
   * @returns Agent information
   */
  const getAgentInfo = useCallback((
    agentId: string,
    defaultName: string,
    defaultType: 'chain' | 'supervisor' | 'demand' | 'competitive' | 'margin'
  ): AgentInfo => {
    const info = agentStatuses.get(agentId);
    if (info) {
      return info;
    }
    
    // Return default pending state if not found
    return {
      id: agentId,
      name: defaultName,
      type: defaultType,
      status: 'pending'
    };
  }, [agentStatuses]);

  /**
   * Creates nodes for the workflow diagram.
   * Positions are adjusted for better spacing and centering.
   */
  const nodes: Node[] = useMemo(() => {
    // Get agent information
    const chainAgent = getAgentInfo('chain', 'Chain Agent', 'chain');
    const supervisorAgent = getAgentInfo('supervisor', 'Supervisor Agent', 'supervisor');
    const demandAgent = getAgentInfo('demand', 'Demand Agent', 'demand');
    const competitiveAgent = getAgentInfo('competitive', 'Competitive Agent', 'competitive');
    const marginAgent = getAgentInfo('margin', 'Margin Agent', 'margin');

    return [
      // Chain Agent (Orchestrator) - Top level
      {
        id: 'chain',
        type: 'agentNode',
        position: { x: 300, y: 0 },
        data: {
          name: chainAgent.name,
          status: chainAgent.status,
          type: 'chain',
          agentInfo: chainAgent
        }
      },
      
      // Supervisor Agent (Coordinator) - Middle level (increased vertical spacing)
      {
        id: 'supervisor',
        type: 'agentNode',
        position: { x: 300, y: 180 },
        data: {
          name: supervisorAgent.name,
          status: supervisorAgent.status,
          type: 'supervisor',
          agentInfo: supervisorAgent
        }
      },
      
      // Parallel Agents - Bottom level (increased vertical spacing)
      // Demand Agent (Left)
      {
        id: 'demand',
        type: 'agentNode',
        position: { x: 0, y: 360 },
        data: {
          name: demandAgent.name,
          status: demandAgent.status,
          type: 'demand',
          agentInfo: demandAgent
        }
      },
      
      // Competitive Agent (Center)
      {
        id: 'competitive',
        type: 'agentNode',
        position: { x: 300, y: 360 },
        data: {
          name: competitiveAgent.name,
          status: competitiveAgent.status,
          type: 'competitive',
          agentInfo: competitiveAgent
        }
      },
      
      // Margin Agent (Right)
      {
        id: 'margin',
        type: 'agentNode',
        position: { x: 600, y: 360 },
        data: {
          name: marginAgent.name,
          status: marginAgent.status,
          type: 'margin',
          agentInfo: marginAgent
        }
      }
    ];
  }, [agentStatuses, getAgentInfo]);

  /**
   * Creates edges (connections) for the workflow diagram.
   */
  const edges: Edge[] = useMemo(() => {
    return [
      // Chain → Supervisor
      {
        id: 'chain-supervisor',
        source: 'chain',
        target: 'supervisor',
        type: 'smoothstep',
        animated: agentStatuses.get('supervisor')?.status === 'in-progress',
        style: { stroke: '#6B7280', strokeWidth: 2 }
      },
      
      // Supervisor → Demand
      {
        id: 'supervisor-demand',
        source: 'supervisor',
        target: 'demand',
        type: 'smoothstep',
        animated: agentStatuses.get('demand')?.status === 'in-progress',
        style: { stroke: '#6B7280', strokeWidth: 2 }
      },
      
      // Supervisor → Competitive
      {
        id: 'supervisor-competitive',
        source: 'supervisor',
        target: 'competitive',
        type: 'smoothstep',
        animated: agentStatuses.get('competitive')?.status === 'in-progress',
        style: { stroke: '#6B7280', strokeWidth: 2 }
      },
      
      // Supervisor → Margin
      {
        id: 'supervisor-margin',
        source: 'supervisor',
        target: 'margin',
        type: 'smoothstep',
        animated: agentStatuses.get('margin')?.status === 'in-progress',
        style: { stroke: '#6B7280', strokeWidth: 2 }
      }
    ];
  }, [agentStatuses]);

  /**
   * Handles node click events.
   */
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const nodeData = node.data as { agentInfo?: AgentInfo };
    if (onNodeClick && nodeData.agentInfo) {
      onNodeClick(node.id, nodeData.agentInfo);
    }
  }, [onNodeClick]);

  /**
   * Handles React Flow initialization.
   * Applies proper fit view after the instance is ready.
   */
  const onInit = useCallback((instance: any) => {
    setReactFlowInstance(instance);
    // Wait for next tick to ensure container is properly sized
    setTimeout(() => {
      instance.fitView({ 
        padding: 0.15,
        includeHiddenNodes: false,
        duration: 200
      });
    }, 100);
  }, []);

  /**
   * Status legend component.
   */
  const StatusLegend = () => (
    <div
      style={{
        padding: '12px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        marginBottom: '16px'
      }}
    >
      <Box variant="h4" margin={{ bottom: 's' }}>
        Status Legend
      </Box>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              backgroundColor: getStatusColor('pending')
            }}
          />
          <Box fontSize="body-s">Pending</Box>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              backgroundColor: getStatusColor('in-progress')
            }}
          />
          <Box fontSize="body-s">In Progress</Box>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              backgroundColor: getStatusColor('complete')
            }}
          />
          <Box fontSize="body-s">Complete</Box>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              backgroundColor: getStatusColor('failed')
            }}
          />
          <Box fontSize="body-s">Failed</Box>
        </div>
      </div>
    </div>
  );

  /**
   * Gets failed agents for error summary.
   */
  const failedAgents = useMemo(() => {
    const failed: AgentInfo[] = [];
    for (const [, agentInfo] of agentStatuses) {
      if (agentInfo.status === 'failed') {
        failed.push(agentInfo);
      }
    }
    return failed;
  }, [agentStatuses]);

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Real-time agent execution workflow and status"
        >
          Workflow Visualization
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="m">
        {/* Error Summary */}
        {hasError && failedAgents.length > 0 && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE2E2',
              borderRadius: '8px',
              border: '1px solid #EF4444'
            }}
          >
            <SpaceBetween direction="vertical" size="s">
              <Box color="text-status-error">
                <strong>⚠️ Workflow Error</strong>
              </Box>
              <Box fontSize="body-s" color="text-status-error">
                {failedAgents.length === 1
                  ? `${failedAgents[0].name} failed: ${failedAgents[0].error || 'Unknown error'}`
                  : `${failedAgents.length} agents failed. See details below.`}
              </Box>
              {onRetry && (
                <Button
                  variant="primary"
                  onClick={onRetry}
                  iconName="refresh"
                >
                  Retry Workflow
                </Button>
              )}
            </SpaceBetween>
          </div>
        )}

        {/* Status Legend */}
        <StatusLegend />

        {/* React Flow Diagram */}
        <div className="workflow-visualization-container">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onInit={onInit}
            minZoom={0.4}
            maxZoom={1.2}
            proOptions={{ hideAttribution: true }}
          >
            {/* Background pattern */}
            <Background
              color="#e9ecef"
              gap={16}
              size={1}
            />
            
            {/* Zoom and pan controls */}
            <Controls
              showZoom
              showFitView
              showInteractive
              position="bottom-right"
            />
          </ReactFlow>
        </div>

        {/* Workflow Description */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}
        >
          <Box fontSize="body-s" color="text-body-secondary">
            <strong>Workflow:</strong> The Chain Agent orchestrates the entire pricing analysis.
            It delegates to the Supervisor Agent, which coordinates three parallel agents:
            Demand Agent (forecasting), Competitive Agent (market analysis), and Margin Agent
            (compliance checking). Click on any agent node to view detailed information.
          </Box>
        </div>
      </SpaceBetween>
    </Container>
  );
};

/**
 * Memoized WorkflowVisualization component to prevent unnecessary re-renders.
 * Only re-renders when agentStatuses or onNodeClick changes.
 * 
 * Performance optimization (Requirement 15.2)
 */
export const WorkflowVisualization = React.memo(WorkflowVisualizationComponent, (prevProps, nextProps) => {
  // Custom comparison function for agentStatuses Map
  if (prevProps.agentStatuses.size !== nextProps.agentStatuses.size) {
    return false;
  }
  
  // Check if any agent status has changed
  for (const [key, value] of prevProps.agentStatuses) {
    const nextValue = nextProps.agentStatuses.get(key);
    if (!nextValue || value.status !== nextValue.status) {
      return false;
    }
  }
  
  // Check if onNodeClick changed
  if (prevProps.onNodeClick !== nextProps.onNodeClick) {
    return false;
  }
  
  return true; // Props are equal, skip re-render
});

WorkflowVisualization.displayName = 'WorkflowVisualization';

export default WorkflowVisualization;
