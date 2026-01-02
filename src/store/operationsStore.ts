import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Operation } from "@/types/operation";
import type { Group, Flow, FlowEdge, FlowNode, SupabaseConfig, BubbleData, NodeData, NodeType } from "@/types/workflow";
import { reorganizeColumnsAfterDeletion, normalizeAllColumns, normalizeColumnsWithGroupOrder } from "@/lib/supabaseColumnMapping";
import { calculateGroupOrder } from "@/hooks/useGroupOrder";

// Helper to apply column normalization to nodes respecting GROUP ORDER
function applyNormalizationToNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  // Calculate group order based on edges (topological sort) or position
  const orderInfo = calculateGroupOrder(nodes, edges);
  const groupOrder = orderInfo.map((info) => info.groupId);
  
  // Use the group-order-aware normalization
  const updates = normalizeColumnsWithGroupOrder(nodes, groupOrder);
  if (!updates || updates.size === 0) return nodes;

  return nodes.map((n) => {
    if (n.type !== "group") return n;
    const updatedBubbles = (n.data.bubbles || []).map((b: BubbleData) => {
      const newColumn = updates.get(b.id);
      if (newColumn) {
        return { ...b, data: { ...b.data, supabaseColumn: newColumn } };
      }
      return b;
    });
    return { ...n, data: { ...n.data, bubbles: updatedBubbles } };
  });
}

interface OperationsStore {
  operations: Operation[];
  currentOperationId: string | null;

  // Operation actions
  createOperation: (name: string, description?: string) => Operation;
  updateOperation: (id: string, updates: Partial<Pick<Operation, "name" | "description">>) => void;
  deleteOperation: (id: string) => void;
  setCurrentOperation: (id: string | null) => void;

  // Supabase actions (scoped)
  setOperationSupabaseConfig: (operationId: string, config: Partial<SupabaseConfig>) => void;

  // Group actions (scoped)
  createGroup: (operationId: string, name: string, description?: string) => Group;
  updateGroup: (operationId: string, id: string, updates: Partial<Group>) => void;
  deleteGroup: (operationId: string, id: string) => void;

  // Flow actions (scoped)
  createFlow: (operationId: string, groupId: string, name: string) => Flow;
  updateFlow: (operationId: string, id: string, updates: Partial<Flow>) => void;
  deleteFlow: (operationId: string, id: string) => void;
  addFlowToGroup: (operationId: string, groupId: string, flow: Flow) => void;
  removeFlowFromGroup: (operationId: string, groupId: string, flowId: string) => void;

  // Node actions (scoped)
  addNode: (operationId: string, flowId: string, node: FlowNode) => void;
  updateNode: (operationId: string, flowId: string, nodeId: string, updates: Partial<FlowNode>) => void;
  deleteNode: (operationId: string, flowId: string, nodeId: string) => void;

  // Bubble actions (scoped)
  addBubbleToNode: (operationId: string, flowId: string, nodeId: string, bubble: BubbleData) => void;
  updateBubble: (operationId: string, flowId: string, nodeId: string, bubbleId: string, data: NodeData, newType?: NodeType) => void;
  deleteBubble: (operationId: string, flowId: string, nodeId: string, bubbleId: string) => void;
  reorderBubblesInNode: (operationId: string, flowId: string, nodeId: string, newBubbleOrder: BubbleData[]) => void;
  moveBubbleBetweenNodes: (operationId: string, flowId: string, sourceNodeId: string, targetNodeId: string, bubbleId: string, insertIndex?: number) => void;

  // Edge actions (scoped)
  addEdge: (operationId: string, flowId: string, edge: FlowEdge) => void;
  deleteEdge: (operationId: string, flowId: string, edgeId: string) => void;
}

const newSupabaseConfig = (): SupabaseConfig => ({
  url: "",
  anonKey: "",
  isConnected: false,
});

export const useOperationsStore = create<OperationsStore>()(
  persist(
    (set, get) => ({
      operations: [],
      currentOperationId: null,

      createOperation: (name, description) => {
        const op: Operation = {
          id: uuidv4(),
          name,
          description,
          createdAt: new Date(),
          supabaseConfig: newSupabaseConfig(),
          groups: [],
        };
        set((state) => ({
          operations: [...state.operations, op],
          currentOperationId: state.currentOperationId ?? op.id,
        }));
        return op;
      },

      updateOperation: (id, updates) =>
        set((state) => ({
          operations: state.operations.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        })),

      deleteOperation: (id) =>
        set((state) => ({
          operations: state.operations.filter((o) => o.id !== id),
          currentOperationId: state.currentOperationId === id ? null : state.currentOperationId,
        })),

      setCurrentOperation: (id) => set({ currentOperationId: id }),

      setOperationSupabaseConfig: (operationId, config) =>
        set((state) => ({
          operations: state.operations.map((o) =>
            o.id === operationId ? { ...o, supabaseConfig: { ...o.supabaseConfig, ...config } } : o,
          ),
        })),

      createGroup: (operationId, name, description) => {
        const newGroup: Group = {
          id: uuidv4(),
          name,
          description,
          createdAt: new Date(),
          flows: [],
        };
        set((state) => ({
          operations: state.operations.map((o) =>
            o.id === operationId ? { ...o, groups: [...o.groups, newGroup] } : o,
          ),
        }));
        return newGroup;
      },

      updateGroup: (operationId, id, updates) =>
        set((state) => ({
          operations: state.operations.map((o) =>
            o.id === operationId
              ? { ...o, groups: o.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)) }
              : o,
          ),
        })),

      deleteGroup: (operationId, id) =>
        set((state) => ({
          operations: state.operations.map((o) =>
            o.id === operationId ? { ...o, groups: o.groups.filter((g) => g.id !== id) } : o,
          ),
        })),

      createFlow: (operationId, groupId, name) => {
        const newFlow: Flow = {
          id: uuidv4(),
          name,
          groupId,
          nodes: [
            {
              id: "start-node",
              type: "start",
              position: { x: 50, y: 50 },
              data: { label: "Início" },
            },
          ],
          edges: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: false,
        };

        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => (g.id === groupId ? { ...g, flows: [...g.flows, newFlow] } : g)),
            };
          }),
        }));

        return newFlow;
      },

      updateFlow: (operationId, id, updates) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => (f.id === id ? { ...f, ...updates, updatedAt: new Date() } : f)),
              })),
            };
          }),
        })),

      deleteFlow: (operationId, id) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({ ...g, flows: g.flows.filter((f) => f.id !== id) })),
            };
          }),
        })),

      addFlowToGroup: (operationId, groupId, flow) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) =>
                g.id === groupId ? { ...g, flows: [...g.flows, flow] } : g
              ),
            };
          }),
        })),

      removeFlowFromGroup: (operationId, groupId, flowId) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) =>
                g.id === groupId ? { ...g, flows: g.flows.filter((f) => f.id !== flowId) } : g
              ),
            };
          }),
        })),

      addNode: (operationId, flowId, node) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => (f.id === flowId ? { ...f, nodes: [...f.nodes, node] } : f)),
              })),
            };
          }),
        })),

      updateNode: (operationId, flowId, nodeId, updates) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) =>
                  f.id === flowId
                    ? {
                        ...f,
                        nodes: f.nodes.map((n) => {
                          if (n.id !== nodeId) return n;
                          
                          // Merge updates, handling data object specifically
                          const nextNode = { ...n, ...updates };
                          if (updates.data) {
                            nextNode.data = { ...n.data, ...updates.data };
                          }
                          return nextNode;
                        }),
                      }
                    : f,
                ),
              })),
            };
          }),
        })),

      deleteNode: (operationId, flowId, nodeId) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) =>
                  f.id === flowId
                    ? {
                        ...f,
                        nodes: f.nodes.filter((n) => n.id !== nodeId),
                        edges: f.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                      }
                    : f,
                ),
              })),
            };
          }),
        })),

      addBubbleToNode: (operationId, flowId, nodeId, bubble) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;
                  return {
                    ...f,
                    nodes: f.nodes.map((n) =>
                      n.id === nodeId && n.type === "group"
                        ? { ...n, data: { ...n.data, bubbles: [...(n.data.bubbles || []), bubble] } }
                        : n,
                    ),
                  };
                }),
              })),
            };
          }),
        })),

      updateBubble: (operationId, flowId, nodeId, bubbleId, data, newType) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;
                  return {
                    ...f,
                    nodes: f.nodes.map((n) =>
                      n.id === nodeId && n.type === "group"
                        ? {
                            ...n,
                            data: {
                              ...n.data,
                              bubbles: (n.data.bubbles || []).map((b) => 
                                b.id === bubbleId 
                                  ? { ...b, data, ...(newType ? { type: newType } : {}) } 
                                  : b
                              ),
                            },
                          }
                        : n,
                    ),
                  };
                }),
              })),
            };
          }),
        })),

      deleteBubble: (operationId, flowId, nodeId, bubbleId) =>
        set((state) => {
          let deletedColumn: string | undefined;

          // 1. Remove the bubble and capture the deleted column
          const updatedOperations = state.operations.map((o) => {
            if (o.id !== operationId) return o;

            const updatedGroups = o.groups.map((g) => ({
              ...g,
              flows: g.flows.map((f) => {
                if (f.id !== flowId) return f;

                const updatedNodes = f.nodes.map((n) => {
                  if (n.id !== nodeId || n.type !== "group") return n;

                  const bubbles = n.data.bubbles || [];
                  const targetBubble = bubbles.find((b) => b.id === bubbleId);
                  if (targetBubble) {
                    deletedColumn = targetBubble.data.supabaseColumn;
                  }

                  return {
                    ...n,
                    data: {
                      ...n.data,
                      bubbles: bubbles.filter((b) => b.id !== bubbleId),
                    },
                  };
                });

                return { ...f, nodes: updatedNodes };
              }),
            }));

            if (!deletedColumn) {
              return { ...o, groups: updatedGroups };
            }

            // 2. Reorganize columns based on the state *after* deletion
            const flowAfterDeletion = updatedGroups
              .flatMap((g) => g.flows)
              .find((f) => f.id === flowId);

            if (!flowAfterDeletion) return { ...o, groups: updatedGroups };

            const columnUpdates = reorganizeColumnsAfterDeletion(flowAfterDeletion.nodes, deletedColumn);

            if (!columnUpdates) {
              return { ...o, groups: updatedGroups };
            }

            // 3. Apply column updates across all nodes in the flow
            const finalGroups = updatedGroups.map((g) => ({
              ...g,
              flows: g.flows.map((f) => {
                if (f.id !== flowId) return f;

                const finalNodes = f.nodes.map((n) => {
                  if (n.type !== "group") return n;

                  const updatedBubbles = (n.data.bubbles || []).map((b) => {
                    const newColumn = columnUpdates.get(b.id);
                    if (newColumn) {
                      return { ...b, data: { ...b.data, supabaseColumn: newColumn } };
                    }
                    return b;
                  });

                  return { ...n, data: { ...n.data, bubbles: updatedBubbles } };
                });

                return { ...f, nodes: finalNodes };
              }),
            }));

            return { ...o, groups: finalGroups };
          });

          return { operations: updatedOperations };
        }),

      reorderBubblesInNode: (operationId, flowId, nodeId, newBubbleOrder) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;
                  const reorderedNodes = f.nodes.map((n) =>
                    n.id === nodeId && n.type === "group" ? { ...n, data: { ...n.data, bubbles: newBubbleOrder } } : n,
                  );
                  // Apply normalization immediately after reorder (pass edges for group order)
                  return { ...f, nodes: applyNormalizationToNodes(reorderedNodes, f.edges) };
                }),
              })),
            };
          }),
        })),

      addEdge: (operationId, flowId, edge) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;
                  const newEdges = [...f.edges, edge];
                  // Re-normalize columns when edges change (group order may have changed)
                  return { ...f, edges: newEdges, nodes: applyNormalizationToNodes(f.nodes, newEdges) };
                }),
              })),
            };
          }),
        })),

      deleteEdge: (operationId, flowId, edgeId) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;
                  const newEdges = f.edges.filter((e) => e.id !== edgeId);
                  // Re-normalize columns when edges change (group order may have changed)
                  return { ...f, edges: newEdges, nodes: applyNormalizationToNodes(f.nodes, newEdges) };
                }),
              })),
            };
          }),
        })),
      moveBubbleBetweenNodes: (operationId, flowId, sourceNodeId, targetNodeId, bubbleId, insertIndex) =>
        set((state) => ({
          operations: state.operations.map((o) => {
            if (o.id !== operationId) return o;
            return {
              ...o,
              groups: o.groups.map((g) => ({
                ...g,
                flows: g.flows.map((f) => {
                  if (f.id !== flowId) return f;

                  // Find the bubble in source node
                  let movedBubble: BubbleData | null = null;
                  const nodesAfterRemove = f.nodes.map((n) => {
                    if (n.id !== sourceNodeId || n.type !== "group") return n;
                    const bubbles = n.data.bubbles || [];
                    const bubbleToMove = bubbles.find((b) => b.id === bubbleId);
                    if (bubbleToMove) {
                      movedBubble = bubbleToMove;
                    }
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        bubbles: bubbles.filter((b) => b.id !== bubbleId),
                      },
                    };
                  });

                  if (!movedBubble) return f;

                  // Add bubble to target node
                  const nodesAfterAdd = nodesAfterRemove.map((n) => {
                    if (n.id !== targetNodeId || n.type !== "group") return n;
                    const bubbles = [...(n.data.bubbles || [])];
                    if (typeof insertIndex === "number" && insertIndex >= 0) {
                      bubbles.splice(insertIndex, 0, movedBubble!);
                    } else {
                      bubbles.push(movedBubble!);
                    }
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        bubbles,
                      },
                    };
                  });

                  // Apply normalization immediately after move (pass edges for group order)
                  return { ...f, nodes: applyNormalizationToNodes(nodesAfterAdd, f.edges) };
                }),
              })),
            };
          }),
        })),
    }),
    { name: "type-builder-operations-storage" },
  ),
);

export function getOperationById(operations: Operation[], id: string | null) {
  if (!id) return null;
  return operations.find((o) => o.id === id) ?? null;
}