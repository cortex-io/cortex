declare module '@dagrejs/dagre' {
  export namespace graphlib {
    class Graph {
      constructor(opts?: { directed?: boolean; compound?: boolean; multigraph?: boolean })
      setGraph(label: GraphLabel): Graph
      setDefaultEdgeLabel(fn: () => any): Graph
      setNode(node: string, label: NodeLabel): Graph
      setEdge(source: string, target: string, label?: any): Graph
      node(node: string): NodeLabel & { x: number; y: number; width: number; height: number }
      nodes(): string[]
      edges(): Array<{ v: string; w: string }>
    }
  }

  interface GraphLabel {
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
    align?: 'UL' | 'UR' | 'DL' | 'DR'
    nodesep?: number
    edgesep?: number
    ranksep?: number
    marginx?: number
    marginy?: number
    acyclicer?: 'greedy'
    ranker?: 'network-simplex' | 'tight-tree' | 'longest-path'
  }

  interface NodeLabel {
    width?: number
    height?: number
    [key: string]: any
  }

  export function layout(graph: graphlib.Graph): void
}
