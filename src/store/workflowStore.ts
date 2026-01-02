import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Group, Flow, FlowNode, FlowEdge, SupabaseConfig, BubbleData, NodeData, NodeType } from '@/types/workflow';
import { reorganizeColumnsAfterDeletion, normalizeColumnsWithGroupOrder } from '@/lib/supabaseColumnMapping';
import { calculateGroupOrder } from '@/hooks/useGroupOrder';

// Helper to apply column normalization to nodes respecting GROUP ORDER
function applyNormalizationToNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  // Calculate group order based on edges (topological sort) or position
  const orderInfo = calculateGroupOrder(nodes, edges);
  const groupOrder = orderInfo.map((info) => info.groupId);
  
  // Use the group-order-aware normalization
  const updates = normalizeColumnsWithGroupOrder(nodes, groupOrder);
  if (!updates || updates.size === 0) return nodes;

  return nodes.map((n) => {
    if (n.type !== 'group') return n;
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

interface WorkflowStore {
  supabaseConfig: SupabaseConfig;
  groups: Group[];
  currentGroup: Group | null;
  currentFlow: Flow | null;
  
  // Supabase actions
  setSupabaseConfig: (config: Partial<SupabaseConfig>) => void;
  
  // Group actions
  createGroup: (name: string, description?: string) => Group;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  setCurrentGroup: (group: Group | null) => void;
  
  // Flow actions
  createFlow: (groupId: string, name: string) => Flow;
  updateFlow: (id: string, updates: Partial<Flow>) => void;
  deleteFlow: (id: string) => void;
  setCurrentFlow: (flow: Flow | null) => void;
  
  // Node actions (group nodes)
  addNode: (flowId: string, node: FlowNode) => void;
  updateNode: (flowId: string, nodeId: string, updates: Partial<FlowNode>) => void;
  deleteNode: (flowId: string, nodeId: string) => void;

  // Bubble actions
  addBubbleToNode: (flowId: string, nodeId: string, bubble: BubbleData) => void;
  updateBubble: (flowId: string, nodeId: string, bubbleId: string, data: NodeData, newType?: NodeType) => void;
  deleteBubble: (flowId: string, nodeId: string, bubbleId: string) => void;
  reorderBubblesInNode: (flowId: string, nodeId: string, newBubbleOrder: BubbleData[]) => void;
  moveBubbleBetweenNodes: (flowId: string, sourceNodeId: string, targetNodeId: string, bubbleId: string, insertIndex?: number) => void;
  
  // Edge actions
  addEdge: (flowId: string, edge: FlowEdge) => void;
  deleteEdge: (flowId: string, edgeId: string) => void;
  
  // Publish
  publishFlow: (flowId: string) => Promise<boolean>;
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set, get) => ({
      supabaseConfig: {
        url: '',
        anonKey: '',
        isConnected: false,
      },
      groups: [],
      currentGroup: null,
      currentFlow: null,

      setSupabaseConfig: (config) => set((state) => ({
        supabaseConfig: { ...state.supabaseConfig, ...config },
      })),

      createGroup: (name, description) => {
        const newGroup: Group = {
          id: uuidv4(),
          name,
          description,
          createdAt: new Date(),
          flows: [],
        };
        set((state) => ({ groups: [...state.groups, newGroup] }));
        return newGroup;
      },

      updateGroup: (id, updates) => set((state) => ({
        groups: state.groups.map((g) =>
          g.id === id ? { ...g, ...updates } : g
        ),
      })),

      deleteGroup: (id) => set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        currentGroup: state.currentGroup?.id === id ? null : state.currentGroup,
      })),

      setCurrentGroup: (group) => set({ currentGroup: group, currentFlow: null }),

      createFlow: (groupId, name) => {
        const newFlow: Flow = {
          id: uuidv4(),
          name,
          groupId,
          nodes: [
            {
              id: 'start-node', // Fixed ID for the start node
              type: 'start',
              position: { x: 50, y: 50 }, // Initial position
              data: { label: 'Início' },
            },
          ],
          edges: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isPublished: false,
        };
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, flows: [...g.flows, newFlow] } : g
          ),
        }));
        return newFlow;
      },

      updateFlow: (id, updates) => set((state) => ({
        groups: state.groups.map((g) => ({
          ...g,
          flows: g.flows.map((f) =>
            f.id === id ? { ...f, ...updates, updatedAt: new Date() } : f
          ),
        })),
        currentFlow: state.currentFlow?.id === id 
          ? { ...state.currentFlow, ...updates, updatedAt: new Date() }
          : state.currentFlow,
      })),

      deleteFlow: (id) => set((state) => ({
        groups: state.groups.map((g) => ({
          ...g,
          flows: g.flows.filter((f) => f.id !== id),
        })),
        currentFlow: state.currentFlow?.id === id ? null : state.currentFlow,
      })),

      setCurrentFlow: (flow) => set({ currentFlow: flow }),

      addNode: (flowId, node) => set((state) => ({
        groups: state.groups.map((g) => ({
          ...g,
          flows: g.flows.map((f) =>
            f.id === flowId ? { ...f, nodes: [...f.nodes, node] } : f
          ),
        })),
        currentFlow: state.currentFlow?.id === flowId
          ? { ...state.currentFlow, nodes: [...state.currentFlow.nodes, node] }
          : state.currentFlow,
      })),

      updateNode: (flowId, nodeId, updates) => set((state) => ({
        groups: state.groups.map((g) => ({
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
              : f
          ),
        })),
        currentFlow: state.currentFlow?.id === flowId
          ? {
              ...state.currentFlow,
              nodes: state.currentFlow.nodes.map((n) => {
                if (n.id !== nodeId) return n;
                
                // Merge updates, handling data object specifically
                const nextNode = { ...n, ...updates };
                if (updates.data) {
                  nextNode.data = { ...n.data, ...updates.data };
                }
                return nextNode;
              }),
            }
          : state.currentFlow,
      })),

      deleteNode: (flowId, nodeId) => set((state) => ({
        groups: state.groups.map((g) => ({
          ...g,
          flows: g.flows.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  nodes: f.nodes.filter((n) => n.id !== nodeId),
                  edges: f.edges.filter(
                    (e) => e.source !== nodeId && e.target !== nodeId
                  ),
                }
              : f
          ),
        })),
        currentFlow: state.currentFlow?.id === flowId
          ? {
              ...state.currentFlow,
              nodes: state.currentFlow.nodes.filter((n) => n.id !== nodeId),
              edges: state.currentFlow.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId
              ),
            }
          : state.currentFlow,
      })),

      addBubbleToNode: (flowId, nodeId, bubble) => set((state) => {
        const updateNodes = (nodes: FlowNode[]) =>
          nodes.map((n) =>
            n.id === nodeId && n.type === 'group' // Ensure it's a group node
              ? { ...n, data: { ...n.data, bubbles: [...(n.data.bubbles || []), bubble] } }
              : n
          );

        return {
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) =>
              f.id === flowId ? { ...f, nodes: updateNodes(f.nodes) } : f
            ),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? { ...state.currentFlow, nodes: updateNodes(state.currentFlow.nodes) }
            : state.currentFlow,
        };
      }),

      updateBubble: (flowId, nodeId, bubbleId, data, newType) => set((state) => {
        const updateNodes = (nodes: FlowNode[]) =>
          nodes.map((n) =>
            n.id === nodeId && n.type === 'group' // Ensure it's a group node
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
              : n
          );

        return {
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) =>
              f.id === flowId ? { ...f, nodes: updateNodes(f.nodes) } : f
            ),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? { ...state.currentFlow, nodes: updateNodes(state.currentFlow.nodes) }
            : state.currentFlow,
        };
      }),

      deleteBubble: (flowId, nodeId, bubbleId) => set((state) => {
        let deletedColumn: string | undefined;

        // 1. Remove the bubble and capture the deleted column
        const updatedGroups = state.groups.map((g) => ({
          ...g,
          flows: g.flows.map((f) => {
            if (f.id !== flowId) return f;

            const updatedNodes = f.nodes.map((n) => {
              if (n.id !== nodeId || n.type !== 'group') return n;

              const bubbles = n.data.bubbles || [];
              const targetBubble = bubbles.find(b => b.id === bubbleId);
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
            // If no column was found or bubble wasn't found, just return the state with the bubble removed
            const currentFlow = updatedGroups.flatMap(g => g.flows).find(f => f.id === flowId);
            return { groups: updatedGroups, currentFlow: currentFlow || state.currentFlow };
        }

        // 2. Reorganize columns based on the state *after* deletion
        const nodesAfterDeletion = updatedGroups
            .flatMap(g => g.flows)
            .find(f => f.id === flowId)?.nodes || [];

        const columnUpdates = reorganizeColumnsAfterDeletion(nodesAfterDeletion, deletedColumn);

        if (!columnUpdates) {
            // No subsequent columns to shift, return state with just the bubble removed
            const currentFlow = updatedGroups.flatMap(g => g.flows).find(f => f.id === flowId);
            return { groups: updatedGroups, currentFlow: currentFlow || state.currentFlow };
        }

        // 3. Apply column updates across all nodes in the flow
        const finalGroups = updatedGroups.map((g) => ({
            ...g,
            flows: g.flows.map((f) => {
                if (f.id !== flowId) return f;

                const finalNodes = f.nodes.map((n) => {
                    if (n.type !== 'group') return n;

                    const updatedBubbles = (n.data.bubbles || []).map(b => {
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

        // 4. Update state
        const currentFlow = finalGroups.flatMap(g => g.flows).find(f => f.id === flowId);

        return {
            groups: finalGroups,
            currentFlow: currentFlow || state.currentFlow,
        };
      }),

      reorderBubblesInNode: (flowId, nodeId, newBubbleOrder) => set((state) => {
        const updateFlowWithNormalization = (f: Flow): Flow => {
          if (f.id !== flowId) return f;
          
          const reorderedNodes = f.nodes.map((n) =>
            n.id === nodeId && n.type === 'group'
              ? { ...n, data: { ...n.data, bubbles: newBubbleOrder } }
              : n
          );
          // Apply normalization immediately after reorder (pass edges for group order)
          return { ...f, nodes: applyNormalizationToNodes(reorderedNodes, f.edges) };
        };

        return {
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) => updateFlowWithNormalization(f)),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? updateFlowWithNormalization(state.currentFlow)
            : state.currentFlow,
        };
      }),

      moveBubbleBetweenNodes: (flowId, sourceNodeId, targetNodeId, bubbleId, insertIndex) =>
        set((state) => {
          const updateFlowWithMove = (f: Flow): Flow => {
            if (f.id !== flowId) return f;
            
            // Find bubble in source node
            let movedBubble: BubbleData | null = null;

            const nodesAfterRemove = f.nodes.map((n) => {
              if (n.id !== sourceNodeId || n.type !== 'group') return n;
              const bubbles = n.data.bubbles || [];
              const found = bubbles.find((b) => b.id === bubbleId);
              if (found) movedBubble = found;
              return { ...n, data: { ...n.data, bubbles: bubbles.filter((b) => b.id !== bubbleId) } };
            });

            if (!movedBubble) return f;

            const nodesAfterAdd = nodesAfterRemove.map((n) => {
              if (n.id !== targetNodeId || n.type !== 'group') return n;
              const bubbles = [...(n.data.bubbles || [])];
              if (typeof insertIndex === 'number' && insertIndex >= 0) {
                bubbles.splice(insertIndex, 0, movedBubble!);
              } else {
                bubbles.push(movedBubble!);
              }
              return { ...n, data: { ...n.data, bubbles } };
            });

            // Apply normalization immediately after move (pass edges for group order)
            return { ...f, nodes: applyNormalizationToNodes(nodesAfterAdd, f.edges) };
          };

          return {
            groups: state.groups.map((g) => ({
              ...g,
              flows: g.flows.map((f) => updateFlowWithMove(f)),
            })),
            currentFlow: state.currentFlow?.id === flowId
              ? updateFlowWithMove(state.currentFlow)
              : state.currentFlow,
          };
        }),

      addEdge: (flowId, edge) => set((state) => {
        const updateFlowWithEdge = (f: Flow): Flow => {
          if (f.id !== flowId) return f;
          const newEdges = [...f.edges, edge];
          // Re-normalize columns when edges change (group order may have changed)
          return { ...f, edges: newEdges, nodes: applyNormalizationToNodes(f.nodes, newEdges) };
        };

        return {
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) => updateFlowWithEdge(f)),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? updateFlowWithEdge(state.currentFlow)
            : state.currentFlow,
        };
      }),

      deleteEdge: (flowId, edgeId) => set((state) => {
        const updateFlowWithoutEdge = (f: Flow): Flow => {
          if (f.id !== flowId) return f;
          const newEdges = f.edges.filter((e) => e.id !== edgeId);
          // Re-normalize columns when edges change (group order may have changed)
          return { ...f, edges: newEdges, nodes: applyNormalizationToNodes(f.nodes, newEdges) };
        };

        return {
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) => updateFlowWithoutEdge(f)),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? updateFlowWithoutEdge(state.currentFlow)
            : state.currentFlow,
        };
      }),

      publishFlow: async (flowId) => {
        const state = get();
        const { supabaseConfig, groups } = state;
        
        if (!supabaseConfig.isConnected) {
          return false;
        }

        const flow = groups
          .flatMap((g) => g.flows)
          .find((f) => f.id === flowId);

        if (!flow) return false;

        set((state) => ({
          groups: state.groups.map((g) => ({
            ...g,
            flows: g.flows.map((f) =>
              f.id === flowId ? { ...f, isPublished: true } : f
            ),
          })),
          currentFlow: state.currentFlow?.id === flowId
            ? { ...state.currentFlow, isPublished: true }
            : state.currentFlow,
        }));

        return true;
      },
    }),
    {
      name: 'type-builder-storage',
    }
  )
);