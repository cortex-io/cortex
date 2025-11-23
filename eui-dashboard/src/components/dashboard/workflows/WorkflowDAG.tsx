import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
// import dagre from '@dagrejs/dagre'
// TODO: dagre has CommonJS compatibility issues with Vite - temporarily disabled
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dagre: any = {
  graphlib: {
    Graph: class {
      private nodes_: Map<string, { width: number; height: number }> = new Map()
      setDefaultEdgeLabel(_fn: () => object) {}
      setGraph(_opts: object) {}
      setNode(id: string, data: { width: number; height: number }) { this.nodes_.set(id, data) }
      setEdge(_source: string, _target: string) {}
      nodes() { return Array.from(this.nodes_.keys()) }
      node(id: string) {
        const idx = Array.from(this.nodes_.keys()).indexOf(id)
        return { x: (idx % 3) * 250 + 125, y: Math.floor(idx / 3) * 150 + 75 }
      }
    }
  },
  layout(_graph: unknown) {} // No-op layout function
}
import 'reactflow/dist/style.css'
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiText,
  EuiIcon,
} from '@elastic/eui'
import WorkflowStepNode, { WorkflowStepNodeData } from './WorkflowStepNode'
import { WorkflowStep } from '../../../hooks/useWorkflows'

interface WorkflowDAGProps {
  steps: WorkflowStep[]
  onStepClick?: (stepId: string) => void
  height?: number
}

// Node types registration
const nodeTypes = {
  workflowStep: WorkflowStepNode,
}

// Status to edge color mapping
const statusColors = {
  pending: '#6B7280',
  running: '#3B82F6',
  completed: '#10B981',
  failed: '#EF4444',
  skipped: '#9CA3AF',
}

// Create a dagre graph layout
const getLayoutedElements = (
  steps: WorkflowStep[],
  onStepClick?: (stepId: string) => void
): { nodes: Node<WorkflowStepNodeData>[]; edges: Edge[] } => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: 'TB', // Top to Bottom layout
    ranksep: 80,
    nodesep: 50,
    marginx: 20,
    marginy: 20,
  })

  // Node dimensions
  const nodeWidth = 200
  const nodeHeight = 120

  // Create nodes
  const nodes: Node<WorkflowStepNodeData>[] = steps.map((step) => ({
    id: step.id,
    type: 'workflowStep',
    position: { x: 0, y: 0 },
    data: {
      id: step.id,
      name: step.name,
      master: step.master,
      action: step.action,
      status: step.status,
      duration_ms: step.duration_ms,
      error: step.error,
      onClick: onStepClick,
    },
  }))

  // Create edges from dependencies
  const edges: Edge[] = []
  steps.forEach((step) => {
    step.dependencies.forEach((depId) => {
      const sourceStep = steps.find((s) => s.id === depId)
      edges.push({
        id: `${depId}-${step.id}`,
        source: depId,
        target: step.id,
        type: 'smoothstep',
        animated: step.status === 'running',
        style: {
          stroke: sourceStep ? statusColors[sourceStep.status] : statusColors.pending,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: sourceStep ? statusColors[sourceStep.status] : statusColors.pending,
        },
      })
    })
  })

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Calculate layout
  dagre.layout(dagreGraph)

  // Apply calculated positions to nodes
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    }
  })

  return { nodes, edges }
}

const WorkflowDAG = ({ steps, onStepClick, height = 500 }: WorkflowDAGProps) => {
  const { fitView } = useReactFlow()

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(steps, onStepClick),
    [steps, onStepClick]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Update nodes and edges when steps change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(steps, onStepClick)
    setNodes(newNodes)
    setEdges(newEdges)

    // Fit view after layout update
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 })
    }, 50)
  }, [steps, onStepClick, setNodes, setEdges, fitView])

  // MiniMap node color based on status
  const getMinimapNodeColor = useCallback((node: Node<WorkflowStepNodeData>) => {
    return statusColors[node.data.status] || statusColors.pending
  }, [])

  if (steps.length === 0) {
    return (
      <EuiPanel hasBorder style={{ height }}>
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          style={{ height: '100%' }}
        >
          <EuiFlexItem grow={false}>
            <EuiFlexGroup direction="column" alignItems="center" gutterSize="m">
              <EuiFlexItem>
                <EuiIcon type="visVega" size="xl" color="subdued" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText color="subdued" textAlign="center">
                  <p>No workflow steps to display</p>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )
  }

  return (
    <div style={{ height, width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap
          nodeColor={getMinimapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={12}
          size={1}
        />
      </ReactFlow>
    </div>
  )
}

// Wrapper component that provides ReactFlow context
const WorkflowDAGWrapper = (props: WorkflowDAGProps) => {
  return (
    <ReactFlowProvider>
      <WorkflowDAG {...props} />
    </ReactFlowProvider>
  )
}

export default WorkflowDAGWrapper
