/**
 * useGroupOrder - Calculate group order tags (G1, G2, G3...) based on edges or position
 * 
 * Order priority:
 * 1. If edges exist: follow the graph (topological sort from start node)
 * 2. If no edges: sort by position (X first, then Y)
 * 
 * The order tag is purely display/publish metadata - group names are independent.
 */

import { useMemo } from 'react';
import type { FlowNode, FlowEdge } from '@/types/workflow';

export interface GroupOrderInfo {
  groupId: string;
  orderTag: string; // "G1", "G2", etc.
  orderIndex: number; // 0, 1, 2, etc.
}

/**
 * Build adjacency map from edges (source -> targets[])
 */
function buildAdjacencyMap(edges: FlowEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = adj.get(edge.source) || [];
    existing.push(edge.target);
    adj.set(edge.source, existing);
  }
  return adj;
}

/**
 * Topological sort using DFS, starting from 'start-node'
 * Returns group IDs in flow order
 */
function topologicalSortFromStart(
  startNodeId: string,
  groupIds: Set<string>,
  edges: FlowEdge[],
  nodePositions: Map<string, { x: number; y: number }>
): string[] {
  const adj = buildAdjacencyMap(edges);
  const visited = new Set<string>();
  const result: string[] = [];

  // BFS-like traversal following edges
  const queue: string[] = [];
  
  // Find groups directly connected from start node
  const fromStart = adj.get(startNodeId) || [];
  
  // Sort initial targets by position (left-to-right, top-to-bottom)
  const sortByPosition = (ids: string[]): string[] => {
    return [...ids].sort((a, b) => {
      const posA = nodePositions.get(a) || { x: 0, y: 0 };
      const posB = nodePositions.get(b) || { x: 0, y: 0 };
      if (posA.x !== posB.x) return posA.x - posB.x;
      return posA.y - posB.y;
    });
  };

  // Add initial nodes from start
  for (const target of sortByPosition(fromStart)) {
    if (groupIds.has(target) && !visited.has(target)) {
      queue.push(target);
      visited.add(target);
    }
  }

  // Process queue
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const targets = adj.get(current) || [];
    for (const target of sortByPosition(targets)) {
      if (groupIds.has(target) && !visited.has(target)) {
        queue.push(target);
        visited.add(target);
      }
    }
  }

  // Add any remaining unvisited groups (disconnected)
  const remaining = [...groupIds].filter((id) => !visited.has(id));
  const sortedRemaining = sortByPosition(remaining);
  result.push(...sortedRemaining);

  return result;
}

/**
 * Sort groups by canvas position (X first, then Y)
 */
function sortByCanvasPosition(
  groupIds: string[],
  nodePositions: Map<string, { x: number; y: number }>
): string[] {
  return [...groupIds].sort((a, b) => {
    const posA = nodePositions.get(a) || { x: 0, y: 0 };
    const posB = nodePositions.get(b) || { x: 0, y: 0 };
    if (posA.x !== posB.x) return posA.x - posB.x;
    return posA.y - posB.y;
  });
}

/**
 * Calculate group order based on edges or position
 */
export function calculateGroupOrder(
  nodes: FlowNode[],
  edges: FlowEdge[]
): GroupOrderInfo[] {
  const groupNodes = nodes.filter((n) => n.type === 'group');
  
  if (groupNodes.length === 0) return [];

  const groupIds = new Set(groupNodes.map((n) => n.id));
  const nodePositions = new Map<string, { x: number; y: number }>();
  
  for (const node of groupNodes) {
    nodePositions.set(node.id, node.position);
  }

  // Check if there are any meaningful edges (group-to-group connections)
  const groupEdges = edges.filter(
    (e) => groupIds.has(e.source) && groupIds.has(e.target)
  );
  
  // Also check for start-node to group edges
  const startEdges = edges.filter(
    (e) => e.source === 'start-node' && groupIds.has(e.target)
  );

  let orderedGroupIds: string[];

  if (groupEdges.length > 0 || startEdges.length > 0) {
    // Use topological sort following edges
    orderedGroupIds = topologicalSortFromStart(
      'start-node',
      groupIds,
      edges,
      nodePositions
    );
  } else {
    // No edges: sort purely by position
    orderedGroupIds = sortByCanvasPosition([...groupIds], nodePositions);
  }

  // Build result with order tags
  return orderedGroupIds.map((groupId, index) => ({
    groupId,
    orderTag: `G${index + 1}`,
    orderIndex: index,
  }));
}

/**
 * Hook to get group order info for all groups in a flow
 */
export function useGroupOrder(nodes: FlowNode[], edges: FlowEdge[]) {
  const orderInfo = useMemo(() => {
    return calculateGroupOrder(nodes, edges);
  }, [nodes, edges]);

  // Build a lookup map for quick access
  const orderMap = useMemo(() => {
    const map = new Map<string, GroupOrderInfo>();
    for (const info of orderInfo) {
      map.set(info.groupId, info);
    }
    return map;
  }, [orderInfo]);

  return {
    orderInfo,
    orderMap,
    getOrderTag: (groupId: string) => orderMap.get(groupId)?.orderTag ?? null,
    getOrderIndex: (groupId: string) => orderMap.get(groupId)?.orderIndex ?? -1,
  };
}
