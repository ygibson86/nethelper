export const topologyLayers = { group: -1, edge: 0, node: 1, label: 2, selectedEdge: 1000, selectedLabel: 1001, selectedNode: 2000 } as const

export function topologyNodeZIndex(type?: string, selected?: boolean): number {
  return selected ? topologyLayers.selectedNode : type === 'group' ? topologyLayers.group : topologyLayers.node
}

export function topologyEdgeZIndex(selected?: boolean): number {
  return selected ? topologyLayers.selectedEdge : topologyLayers.edge
}
