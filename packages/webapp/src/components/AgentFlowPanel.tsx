import React, { useCallback, useState, memo, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  NodeMouseHandler,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Modal, SpaceBetween } from '@cloudscape-design/components';
import { CodeView } from "@cloudscape-design/code-view";
import typescriptHighlight from "@cloudscape-design/code-view/highlight/typescript";
import { createInitialLoanNodes, createInitialLoanEdges, loanNodeDetailsMap, CustomNode } from './AgentFlowNodeConfig';
import CustomAgentNode from './CustomAgentNode';

type NodeType = 'supervisor' | 'loanApplicant' | 'broker' | 'user' | 'response';

const nodeTypes = {
  customAgent: CustomAgentNode,
};

interface NodeTrace {
  timestamp: string;
  text: string;
}

interface NodeDetails {
  title: string;
  description: string;
  details: string;
  traces?: NodeTrace[]; 
}

interface AgentFlowRef {
  updateEdgeAnimation: (edgeId: string, isAnimated: boolean) => void;
  incrementEdgeCount: (edgeId: string) => void;
  updateNodeState: (nodeId: string, state: {
      isProcessing?: boolean;
      processingComplete?: boolean;
  }) => void;
  addNodeTrace: (nodeId: string, trace: NodeTrace) => void; 
}

interface AgentFlowPanelProps {
  height?: string;
  sessionId: string;
  modelId?: string;
  createInitialNodes: () => CustomNode[];
  createInitialEdges: () => Edge[];
  initialNodeDetailsMap: Record<string, NodeDetails>;
}

interface EdgeStats {
  callCount: number;
  isAnimated: boolean;
}

const AgentFlowPanel = forwardRef<AgentFlowRef, AgentFlowPanelProps>((props, ref) => {
    const { height = '399px', sessionId, createInitialNodes, createInitialEdges, initialNodeDetailsMap } = props;
    const [nodes, setNodes, onNodesChange] = useNodesState(createInitialNodes());
    const [edges, setEdges, onEdgesChange] = useEdgesState(createInitialEdges());
    const [selectedNode, setSelectedNode] = useState<NodeType | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [nodeDetailsMap, setNodeDetailsMap] = useState<Record<string, NodeDetails>>(initialNodeDetailsMap);

    // Add edge stats state
    const [edgeStats, setEdgeStats] = useState<Record<string, EdgeStats>>({
      'e-user-supervisor': { callCount: 0, isAnimated: false },
      'e-supervisor-loanApplicant': { callCount: 0, isAnimated: false },
      'e-supervisor-broker': { callCount: 0, isAnimated: false },
      'e-supervisor-response': { callCount: 0, isAnimated: false }
    });

    useImperativeHandle(ref, () => ({
      updateEdgeAnimation: (edgeId: string, isAnimated: boolean) => {
          setEdgeStats(prev => ({
              ...prev,
              [edgeId]: {
                  ...prev[edgeId],
                  isAnimated
              }
          }));
      },
      incrementEdgeCount: (edgeId: string) => {
          setEdgeStats(prev => ({
              ...prev,
              [edgeId]: {
                  ...prev[edgeId],
                  callCount: prev[edgeId].callCount + 1
              }
          }));
      },
      updateNodeState: (nodeId: string, state: {
          isProcessing?: boolean;
          processingComplete?: boolean;
      }) => {
          setNodes(nodes => 
              nodes.map(node => 
                  node.id === nodeId 
                      ? { 
                          ...node, 
                          data: { 
                              ...node.data, 
                              ...state 
                          } 
                      }
                      : node
              )
          );
      },
      addNodeTrace: (nodeId: string, trace: NodeTrace) => {
          setNodeDetailsMap(prev => ({
              ...prev,
              [nodeId]: {
                  ...prev[nodeId],
                  traces: [...(prev[nodeId].traces || []), trace]
              }
          }));
      }
    }));
  

    // Use useLayoutEffect to measure container before ReactFlow mounts
    useLayoutEffect(() => {
      setMounted(true);
      return () => setMounted(false);
    }, []);

    // Update edges based on edgeStats
    useEffect(() => {
      setEdges(currentEdges => 
        currentEdges.map(edge => ({
          ...edge,
          animated: edgeStats[edge.id]?.isAnimated || false,
          label: edgeStats[edge.id]?.callCount > 0 ? `${edgeStats[edge.id].callCount} calls` : '',
          labelStyle: {
            fill: 'white',
            fontWeight: 'bold',
            fontSize: '12px'
          },
          labelBgStyle: {
            fill: '#1a192b',
            opacity: 0.7,
            rx: 4
          },
          labelBgPadding: [4, 4]
        }))
      );
    }, [edgeStats, setEdges]);

    const onConnect = useCallback(
      (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
      [setEdges]
    );

    const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
      if (isValidNodeType(node.id)) {
        setSelectedNode(node.id);
        setIsModalVisible(true);
      }
    }, []);

    const isValidNodeType = (id: string): id is NodeType => {
      return ['supervisor', 'loanApplicant', 'broker', 'user', 'response'].includes(id);
    };

    // Style for the wrapper that ensures proper dimensions
    const wrapperStyle: React.CSSProperties = {
      width: '100%',
      height: height,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    };

  return (
    <div style={wrapperStyle} className="react-flow-wrapper">
      <ReactFlowProvider>
        {mounted && ( 
          <div style={{ flex: 1, minHeight: 0 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.4}
              maxZoom={1.5}
              defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
              attributionPosition="bottom-left"
              style={{ width: '100%', height: '100%' }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}
      </ReactFlowProvider>

      <Modal
        visible={isModalVisible}
        onDismiss={() => setIsModalVisible(false)}
        header={selectedNode ? nodeDetailsMap[selectedNode]?.title : "Agent Details"}
        size="medium"
      >
        {selectedNode && (
            <SpaceBetween size="l">
                <Box variant="h4">{nodeDetailsMap[selectedNode]?.description}</Box>
                <Box variant="p">{nodeDetailsMap[selectedNode]?.details}</Box>
                {nodeDetailsMap[selectedNode]?.traces && nodeDetailsMap[selectedNode].traces.length > 0 && (
                    <Box>
                        <Box variant="h4">Processing History:</Box>
                        <CodeView
                            content={nodeDetailsMap[selectedNode].traces
                                .map(trace => `[${trace.timestamp}] \n ${trace.text}`)
                                .join('\n\n\n')
                            }
                          wrapLines
                        />
                    </Box>
                )}
            </SpaceBetween>
        )}
      </Modal>
    </div>
  );
});

export default memo(AgentFlowPanel);
