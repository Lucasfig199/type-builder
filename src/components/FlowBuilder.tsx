import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Upload, Loader2, Pencil, Download, FileUp, ChevronDown, MessageSquare, Link, Clock, Image, ImagePlus, Video, VideoIcon, Mic, UserCheck, Anchor, Trash2, CreditCard } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  MeasuringStrategy,
  useDroppable,
  CollisionDetection,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GroupNode, BubbleItem } from './GroupNode';
import { StartNode } from './StartNode';
import NoteNode from './NoteNode';
import { NodePanel } from './NodePanel';
import { EditBubbleModal } from './EditBubbleModal';
import { EditNoteModal } from './EditNoteModal';
import { useWorkflowStore } from '@/store/workflowStore';
import { useOperationsStore } from '@/store/operationsStore';
import { Flow, NodeType, NodeData, NODE_LABELS, FlowNode, BubbleData, TimeMessageRule, NODE_PREFIXES } from '@/types/workflow';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/ConfirmDeleteModal';
import { useRafThrottle } from '@/hooks/useRafThrottle';
import {
  detectDuplicateColumns,
  getAllBubblesFromFlowNodes,
  getColumnKindForBubble,
  parseColumn,
  suggestNextAvailableColumn,
  buildColumn,
  COLUMN_LIMIT,
} from '@/lib/supabaseColumnMapping';
import { TimeFirstWarningModal } from '@/components/TimeFirstWarningModal';
import { encodePosicaoV2 } from '@/lib/posicaoEncoding';
import { encodeBlk } from '@/lib/blkEncoding';
import { getTempoPreset } from '@/hooks/useTempoPreset';
import { useGroupOrder } from '@/hooks/useGroupOrder';
import { Input } from '@/components/ui/input';
import { DeletableEdge } from '@/components/DeletableEdge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FlowBuilderProps {
  flow: Flow;
  onBack: () => void;
  operationId?: string;
}

const TABLE_NAME = 'TYPE_BUILDER';
const SCHEMA_VERSION = 1;

const nodeTypes = {
  group: GroupNode,
  start: StartNode,
  note: NoteNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

function getSupabaseErrorMessage(payload: unknown): string | null {
  if (!payload) return null;

  if (typeof payload === 'string') return payload;

  if (typeof payload === 'object') {
    const p = payload as any;
    if (typeof p.message === 'string' && p.message.trim()) return p.message;
    if (typeof p.details === 'string' && p.details.trim()) return p.details;
    if (typeof p.hint === 'string' && p.hint.trim()) return p.hint;
    if (typeof p.error === 'string' && p.error.trim()) return p.error;
  }

  return null;
}

interface FlowExport {
  schemaVersion: number;
  flowName: string;
  groupName: string;
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string }[];
  exportedAt: string;
}

export const FlowBuilder = ({ flow, onBack, operationId }: FlowBuilderProps) => {
  const workflowStore = useWorkflowStore();
  const operationsStore = useOperationsStore();

  const useOps = !!operationId;

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rf = useReactFlow();

  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingBubble, setEditingBubble] = useState<{ nodeId: string; bubble: BubbleItem } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null); // For standalone note nodes
  const [showMediaPreviews, setShowMediaPreviews] = useState(false);

  const [isEditingFlowName, setIsEditingFlowName] = useState(false);
  const [flowNameDraft, setFlowNameDraft] = useState(flow.name);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hoverPlaceholder, setHoverPlaceholder] = useState<{ groupId: string; index: number } | null>(null);
  const confirmImport = useConfirmDelete();

  // State for Time-first warning modal
  const [timeFirstWarning, setTimeFirstWarning] = useState<{
    open: boolean;
    pendingAction: (() => void) | null;
  }>({ open: false, pendingAction: null });

  const operations = operationsStore.operations;

  const groups = useMemo(() => {
    if (!useOps) return workflowStore.groups;
    const op = operations.find((o) => o.id === operationId);
    return op?.groups ?? [];
  }, [useOps, workflowStore.groups, operations, operationId]);

  const supabaseConfig = useMemo(() => {
    if (!useOps) return workflowStore.supabaseConfig;
    const op = operations.find((o) => o.id === operationId);
    return op?.supabaseConfig ?? { url: '', anonKey: '', isConnected: false };
  }, [useOps, workflowStore.supabaseConfig, operations, operationId]);

  const addNode = useCallback(
    (flowId: string, node: FlowNode) => {
      if (!useOps) return workflowStore.addNode(flowId, node);
      return operationsStore.addNode(operationId!, flowId, node);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const updateNode = useCallback(
    (flowId: string, nodeId: string, updates: Partial<FlowNode>) => {
      if (!useOps) return workflowStore.updateNode(flowId, nodeId, updates);
      return operationsStore.updateNode(operationId!, flowId, nodeId, updates);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const deleteNode = useCallback(
    (flowId: string, nodeId: string) => {
      if (!useOps) return workflowStore.deleteNode(flowId, nodeId);
      return operationsStore.deleteNode(operationId!, flowId, nodeId);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const addBubbleToNode = useCallback(
    (flowId: string, nodeId: string, bubble: BubbleData) => {
      if (!useOps) return workflowStore.addBubbleToNode(flowId, nodeId, bubble);
      return operationsStore.addBubbleToNode(operationId!, flowId, nodeId, bubble);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const updateBubble = useCallback(
    (flowId: string, nodeId: string, bubbleId: string, data: NodeData, newType?: NodeType) => {
      if (!useOps) return workflowStore.updateBubble(flowId, nodeId, bubbleId, data, newType);
      return operationsStore.updateBubble(operationId!, flowId, nodeId, bubbleId, data, newType);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const deleteBubble = useCallback(
    (flowId: string, nodeId: string, bubbleId: string) => {
      if (!useOps) return workflowStore.deleteBubble(flowId, nodeId, bubbleId);
      return operationsStore.deleteBubble(operationId!, flowId, nodeId, bubbleId);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const reorderBubblesInNode = useCallback(
    (flowId: string, nodeId: string, newBubbleOrder: BubbleData[]) => {
      if (!useOps) return workflowStore.reorderBubblesInNode(flowId, nodeId, newBubbleOrder);
      return operationsStore.reorderBubblesInNode(operationId!, flowId, nodeId, newBubbleOrder);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const addFlowEdge = useCallback(
    (flowId: string, edge: { id: string; source: string; target: string }) => {
      if (!useOps) return workflowStore.addEdge(flowId, edge);
      return operationsStore.addEdge(operationId!, flowId, edge);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const deleteFlowEdge = useCallback(
    (flowId: string, edgeId: string) => {
      if (!useOps) return workflowStore.deleteEdge(flowId, edgeId);
      return operationsStore.deleteEdge(operationId!, flowId, edgeId);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const updateFlow = useCallback(
    (flowId: string, updates: Partial<Flow>) => {
      if (!useOps) return workflowStore.updateFlow(flowId, updates);
      return operationsStore.updateFlow(operationId!, flowId, updates);
    },
    [useOps, workflowStore, operationsStore, operationId],
  );

  const currentFlow = useMemo(() => {
    for (const group of groups) {
      const found = group.flows.find((f) => f.id === flow.id);
      if (found) return found;
    }
    return flow;
  }, [groups, flow.id, flow]);

  useEffect(() => {
    if (!isEditingFlowName) setFlowNameDraft(currentFlow.name);
  }, [currentFlow.name, isEditingFlowName]);

  const currentGroup = useMemo(() => groups.find((g) => g.id === currentFlow.groupId) || null, [groups, currentFlow.groupId]);

  const availableFlows = useMemo(() => {
    for (const group of groups) {
      if (group.flows.some((f) => f.id === flow.id)) return group.flows;
    }
    return [];
  }, [groups, flow.id]);

  const getFlowNameById = useCallback(
    (flowId: string) => {
      const f = availableFlows.find((x) => x.id === flowId);
      return f ? f.name : null;
    },
    [availableFlows],
  );

  const allBubblesInFlow = useMemo(() => getAllBubblesFromFlowNodes(currentFlow.nodes), [currentFlow.nodes]);

  // Calculate group order based on edges (graph topology) or canvas position
  const { orderMap: groupOrderMap } = useGroupOrder(currentFlow.nodes, currentFlow.edges);

  const suggestColumnForType = useCallback(
    (type: NodeType) => {
      const kind = getColumnKindForBubble(type);
      return suggestNextAvailableColumn(allBubblesInFlow, kind);
    },
    [allBubblesInFlow],
  );

  // DELETE real no Supabase por id (linha única)
  const deleteRowById = useCallback(
    async (rowId: number) => {
      if (!supabaseConfig.isConnected) {
        toast.error('Conecte o Supabase antes de excluir.');
        return false;
      }
      const url = `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?id=eq.${encodeURIComponent(String(rowId))}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          Prefer: 'return=minimal',
        },
      });

      if (res.ok) return true;

      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();
      const msg = getSupabaseErrorMessage(payload);
      console.error('Supabase DELETE by id failed', { status: res.status, payload });
      toast.error(msg ? `Falha ao excluir no Supabase: ${msg}` : `Falha ao excluir no Supabase (HTTP ${res.status})`);
      return false;
    },
    [supabaseConfig],
  );

  // DELETE em massa por GRUPO (todas as linhas daquele grupo)
  const deleteRowsByGroup = useCallback(
    async (groupName: string) => {
      if (!supabaseConfig.isConnected) {
        toast.error('Conecte o Supabase antes de excluir.');
        return false;
      }
      const url =
        `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}` +
        `?GRUPO=eq.${encodeURIComponent(groupName)}`;

      try {
        const res = await fetch(url, {
          method: 'DELETE',
          headers: {
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
            Prefer: 'return=minimal',
          },
        });

        if (res.ok) return true;

        const contentType = res.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();
        const msg = getSupabaseErrorMessage(payload);
        console.error('Supabase DELETE by group failed', { status: res.status, payload });
        toast.error(msg ? `Falha ao excluir linhas do grupo: ${msg}` : `Falha ao excluir linhas do grupo (HTTP ${res.status})`);
        return false;
      } catch (err) {
        console.error('Supabase DELETE by group error', err);
        toast.error('Erro de rede ao excluir grupo no Supabase.');
        return false;
      }
    },
    [supabaseConfig],
  );

  // Note: Column normalization now happens inside the store after reorder/move operations

  const handleDeleteGroup = useCallback(
    async (nodeId: string) => {
      // Find the group node to get its label for Supabase deletion
      const nodeToDelete = currentFlow.nodes.find((n) => n.id === nodeId);
      const groupLabel = nodeToDelete?.data.label || '';

      // Delete from Supabase by GRUPO name (all rows with that group name)
      if (supabaseConfig.isConnected && groupLabel) {
        const ok = await deleteRowsByGroup(groupLabel);
        if (!ok) {
          // Continue with local deletion even if Supabase fails
          console.warn('Supabase delete failed, but proceeding with local deletion');
        }
      }

      // Delete from local state immediately without confirmation
      deleteNode(flow.id, nodeId);
      if (selectedGroupId === nodeId) setSelectedGroupId(null);

      toast.success('Grupo excluído!');
    },
    [
      currentFlow.nodes,
      deleteNode,
      deleteRowsByGroup,
      flow.id,
      selectedGroupId,
      supabaseConfig.isConnected,
    ],
  );

  const handleRenameGroup = useCallback(
    (nodeId: string, label: string) => {
      updateNode(flow.id, nodeId, { data: { label } } as Partial<FlowNode>);
      toast.success('Nome do grupo atualizado!');
    },
    [flow.id, updateNode],
  );

  const handleDeleteBubble = useCallback(
    (nodeId: string, bubbleId: string) => {
      deleteBubble(flow.id, nodeId, bubbleId);
      // Note: Normalization happens inside the store after deletion
    },
    [flow.id, deleteBubble],
  );

  const handleEditBubble = useCallback(
    (nodeId: string, bubbleId: string) => {
      const node = currentFlow.nodes.find((n) => n.id === nodeId);
      if (node) {
        const bubble = (node.data.bubbles || []).find((b) => b.id === bubbleId);
        if (bubble) setEditingBubble({ nodeId, bubble });
      }
    },
    [currentFlow.nodes],
  );

  const handleSaveBubble = useCallback(
    (bubbleId: string, data: NodeData) => {
      if (!editingBubble) return;
      updateBubble(flow.id, editingBubble.nodeId, bubbleId, data);
      toast.success('Bloco atualizado!');
    },
    [flow.id, editingBubble, updateBubble],
  );

  // Handler for saving note data (for bubbles inside groups - now unused since notes are standalone)
  const handleSaveNote = useCallback(
    (noteData: import('@/types/workflow').NoteData) => {
      // If editing a standalone note node
      if (editingNoteId) {
        const noteNode = currentFlow.nodes.find((n) => n.id === editingNoteId && n.type === 'note');
        if (noteNode) {
          updateNode(flow.id, editingNoteId, {
            data: { ...noteNode.data, note: noteData },
          } as Partial<FlowNode>);
          toast.success('Nota atualizada!');
        }
        setEditingNoteId(null);
        return;
      }
      // Legacy: bubble-based notes (no longer used)
      if (!editingBubble) return;
      const updatedData: NodeData = {
        ...editingBubble.bubble.data,
        note: noteData,
      };
      updateBubble(flow.id, editingBubble.nodeId, editingBubble.bubble.id, updatedData);
      toast.success('Nota atualizada!');
      setEditingBubble(null);
    },
    [flow.id, editingBubble, editingNoteId, currentFlow.nodes, updateBubble, updateNode],
  );

  // Handler for editing standalone note node
  const handleEditNoteNode = useCallback((nodeId: string) => {
    setEditingNoteId(nodeId);
  }, []);

  // Handler for deleting standalone note node
  const handleDeleteNoteNode = useCallback((nodeId: string) => {
    deleteNode(flow.id, nodeId);
    toast.success('Nota removida!');
  }, [flow.id, deleteNode]);

  const handleConvertBubbleType = useCallback(
    (bubbleId: string, newType: NodeType, newData: NodeData) => {
      if (!editingBubble) return;
      updateBubble(flow.id, editingBubble.nodeId, bubbleId, newData, newType);
    },
    [flow.id, editingBubble, updateBubble],
  );

  const handleChangeBubbleColumn = useCallback(
    (nodeId: string, bubbleId: string, column: string) => {
      const parsed = parseColumn(column);
      if (!parsed) {
        toast.error('Coluna inválida');
        return;
      }

      const normalized = `${parsed.kind}${parsed.index}`;
      const duplicates = allBubblesInFlow.some((b) => {
        if (b.id === bubbleId) return false;
        const col = b.data.supabaseColumn;
        if (!col) return false;
        const p = parseColumn(col);
        if (!p) return false;
        return `${p.kind}${p.index}` === normalized;
      });

      if (duplicates) {
        toast.error(`A coluna ${normalized} já está sendo usada em outro card do fluxo.`);
        return;
      }

      const node = currentFlow.nodes.find((n) => n.id === nodeId);
      const bubble = node?.type === 'group' ? (node.data.bubbles || []).find((b) => b.id === bubbleId) : null;
      if (!bubble) return;

      updateBubble(flow.id, nodeId, bubbleId, { ...bubble.data, supabaseColumn: normalized });
    },
    [allBubblesInFlow, currentFlow.nodes, flow.id, updateBubble],
  );

  const handleDropBubbleIntoGroup = useCallback(
    (nodeId: string, type: NodeType) => {
      const node = currentFlow.nodes.find((n) => n.id === nodeId);
      const bubblesInNode = (node?.data.bubbles || []) as BubbleData[];
      const insertIndex = bubblesInNode.length; // Inserting at end
      
      const performAdd = () => {
        const suggested = suggestColumnForType(type);
        if (!suggested) {
          toast.error(`Limite de colunas atingido (${type === 'time' ? 'T50' : 'M50'}).`);
          return;
        }

        let data: NodeData = { label: NODE_LABELS[type], supabaseColumn: suggested };

        // Apply tempo preset for Time cards
        if (type === 'time') {
          const tempoPreset = getTempoPreset(operationId);
          data.timeMin = tempoPreset.minSeconds;
          data.timeMax = tempoPreset.maxSeconds;
        }

        if (type === 'message-time') {
          data.timeMessageRules = [
            { id: uuidv4(), startTime: '06:00', endTime: '12:00', content: 'Bom dia!' },
            { id: uuidv4(), startTime: '12:01', endTime: '23:59', content: 'Boa tarde/noite!' },
          ];
        }

        if (type === 'photo-caption-time' || type === 'video-caption-time') {
          data.timeMediaRules = [
            { id: uuidv4(), startTime: '06:00', endTime: '12:00', mediaUrl: '', caption: '' },
          ];
        }

        const bubble: BubbleData = {
          id: uuidv4(),
          type,
          data,
        };

        addBubbleToNode(flow.id, nodeId, bubble);
        toast.success(`${NODE_LABELS[type]} adicionado!`);
      };
      
      performAdd();
    },
    [flow.id, addBubbleToNode, suggestColumnForType],
  );

  const handleReorderBubbles = useCallback(
    (nodeId: string, newOrder: BubbleItem[]) => {
      reorderBubblesInNode(flow.id, nodeId, newOrder);
      toast.success('Ordem dos blocos atualizada!');
    },
    [flow.id, reorderBubblesInNode],
  );


  const commitFlowName = useCallback(() => {
    const next = flowNameDraft.trim();
    if (!next) {
      toast.error('O nome do fluxo não pode ficar vazio');
      return;
    }
    updateFlow(flow.id, { name: next });
    toast.success('Nome do fluxo atualizado!');
    setIsEditingFlowName(false);
  }, [flow.id, flowNameDraft, updateFlow]);

  const cancelFlowName = useCallback(() => {
    setFlowNameDraft(currentFlow.name);
    setIsEditingFlowName(false);
  }, [currentFlow.name]);

  const buildSupabaseValueForBubble = useCallback(
    (bubble: BubbleData) => {
      const prefix = NODE_PREFIXES[bubble.type];

      if (bubble.type === 'time') {
        const min = bubble.data.timeMin ?? 5;
        const max = bubble.data.timeMax ?? 10;
        return prefix + `${min}-${max}`;
      }

      if (bubble.type === 'message-time') {
        const rules = bubble.data.timeMessageRules || [];
        const serializedRules = rules
          .map((r) => {
            // Remove semicolons from content to prevent parsing issues
            const content = r.content.replace(/;/g, ',');
            return `${r.startTime}-${r.endTime}-${content}`;
          })
          .join(';');
        return prefix + serializedRules;
      }

      if (bubble.type === 'photo-caption-time' || bubble.type === 'video-caption-time') {
        const rules = bubble.data.timeMediaRules || [];
        // Format: PREFIX;HH:MM|HH:MM|URL|CAPTION;...
        // Use | as field separator and ; as rule separator
        // Caption is NOT URL-encoded - it's sanitized on input (no ; | or newlines)
        const serializedRules = rules
          .map((r) => {
            // Caption is already sanitized, no encoding needed
            return `${r.startTime}|${r.endTime}|${r.mediaUrl}|${r.caption || ''}`;
          })
          .join(';');
        // Format: FT-C-T;rules or VD-C-T;rules (note: semicolon after prefix, not hyphen)
        const newPrefix = bubble.type === 'photo-caption-time' ? 'FT-C-T;' : 'VD-C-T;';
        return newPrefix + serializedRules;
      }

      let value = '';

      switch (bubble.type) {
        case 'message':
          value = bubble.data.content || '';
          break;
        case 'message-utm':
          // Request 1: Ensure prefix is MSG-UTM- and content is appended directly
          const contentUtm = `${bubble.data.content || ''} ${bubble.data.utm || ''}`.trim();
          return prefix + contentUtm;
        case 'photo':
          value = bubble.data.mediaUrl || '';
          break;
        case 'photo-caption':
          value = `${bubble.data.mediaUrl || ''} ${bubble.data.caption || ''}`.trim();
          break;
        case 'video':
          value = bubble.data.mediaUrl || '';
          break;
        case 'video-caption':
          value = `${bubble.data.mediaUrl || ''} ${bubble.data.caption || ''}`.trim();
          break;
        case 'audio':
          value = bubble.data.mediaUrl || '';
          break;
        case 'lead-respond':
          return prefix;
        case 'link-pix':
          return prefix;
        case 'hook': {
          const action = bubble.data.hookAction || 'add';

          // hookFlowId can be either a real flow id (created in UI) or a flow name (coming from Fetch)
          const hookFlowById = bubble.data.hookFlowId ? availableFlows.find((f) => f.id === bubble.data.hookFlowId) : null;
          const hookFlowByName = bubble.data.hookFlowId ? availableFlows.find((f) => f.name === bubble.data.hookFlowId) : null;
          const destName = (hookFlowById?.name || hookFlowByName?.name || bubble.data.content || bubble.data.hookFlowId || '').trim();

          if (action === 'delete') {
            return `APAGAR-GANCHO-${destName}`;
          }

          const hh = String(bubble.data.hookHours || 0).padStart(2, '0');
          const mm = String(bubble.data.hookMinutes || 0).padStart(2, '0');
          const timePart = `${hh}:${mm}`;
          value = destName ? `${destName}-${timePart}` : timePart;
          break;
        }
        case 'delete-hook': {
          const hookFlowById = bubble.data.hookFlowId ? availableFlows.find((f) => f.id === bubble.data.hookFlowId) : null;
          const hookFlowByName = bubble.data.hookFlowId ? availableFlows.find((f) => f.name === bubble.data.hookFlowId) : null;
          const destName = (hookFlowById?.name || hookFlowByName?.name || bubble.data.content || bubble.data.hookFlowId || '').trim();
          return prefix + destName;
        }
        case 'deliverable': {
          const action = bubble.data.deliverableAction;
          const deliverableFlow = bubble.data.deliverableFlowId ? availableFlows.find((f) => f.id === bubble.data.deliverableFlowId) : null;
          const flowName = (deliverableFlow?.name || '').trim();
          const actionPrefix = action === 'add' ? 'ADD-ENTREGA-FLUXO-' : 'DEL-ENTREGA-FLUXO-';
          return actionPrefix + flowName;
        }
        case 'reminder': {
          const action = bubble.data.reminderAction;
          // Try to find flow by ID first, then by name, then use content/raw value
          const flowById = bubble.data.reminderFlowId ? availableFlows.find((f) => f.id === bubble.data.reminderFlowId) : null;
          const flowByName = bubble.data.reminderFlowId ? availableFlows.find((f) => f.name === bubble.data.reminderFlowId) : null;
          const flowName = (flowById?.name || flowByName?.name || bubble.data.content || bubble.data.reminderFlowId || '').trim();
          if (action === 'add') {
            const hh = bubble.data.reminderHours;
            const mm = bubble.data.reminderMinutes;
            // Only export if both hours and minutes are defined
            if (hh !== undefined && mm !== undefined) {
              return `ADD-REL-${flowName}-${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }
            return `ADD-REL-${flowName}-__:__`; // Placeholder for incomplete
          }
          return `DEL-REL-${flowName}`;
        }
      }

      return prefix + value;
    },
    [availableFlows],
  );

  // ========== EXPORT / IMPORT ==========

  const handleExportFlow = useCallback(() => {
    if (!currentGroup) {
      toast.error('Grupo atual não encontrado.');
      return;
    }

    const exportData: FlowExport = {
      schemaVersion: SCHEMA_VERSION,
      flowName: currentFlow.name,
      groupName: currentGroup.name,
      nodes: currentFlow.nodes,
      edges: currentFlow.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      exportedAt: new Date().toISOString(),
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentGroup.name}__${currentFlow.name}__flow.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Fluxo exportado com sucesso!');
  }, [currentFlow, currentGroup]);

  const handleImportFlow = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const processImportedFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content) as FlowExport;

          // Validar schema
          if (typeof parsed.schemaVersion !== 'number') {
            toast.error('Arquivo inválido: falta schemaVersion.');
            return;
          }

          if (parsed.schemaVersion > SCHEMA_VERSION) {
            toast.error(`Versão do arquivo (${parsed.schemaVersion}) é mais recente que a suportada (${SCHEMA_VERSION}).`);
            return;
          }

          if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            toast.error('Arquivo inválido: nodes ou edges ausentes.');
            return;
          }

          // Confirmar substituição
          const confirmed = await confirmImport.confirm({
            title: 'Importar fluxo?',
            description: `Isso substituirá o canvas atual com o fluxo "${parsed.flowName}" do grupo "${parsed.groupName}". Você poderá publicar depois para salvar no Supabase.`,
            details: [
              { label: 'Fluxo', value: parsed.flowName },
              { label: 'Grupo', value: parsed.groupName },
              { label: 'Nós', value: `${parsed.nodes.length} nós` },
            ],
            confirmText: 'Importar',
            cancelText: 'Cancelar',
            danger: false,
          });
          if (!confirmed) return;

          // Gerar novos IDs para evitar conflitos
          const idMap = new Map<string, string>();

          const newNodes: FlowNode[] = parsed.nodes.map((n) => {
            const newId = uuidv4();
            idMap.set(n.id, newId);

            // Regenerar IDs dos bubbles e timeMessageRules
            const newBubbles = n.data.bubbles?.map((b: BubbleData) => {
              let newRules: TimeMessageRule[] | undefined;
              if (b.type === 'message-time' && b.data.timeMessageRules) {
                newRules = b.data.timeMessageRules.map(r => ({
                  ...r,
                  id: uuidv4(),
                }));
              }

              return {
                ...b,
                id: uuidv4(),
                data: {
                  ...b.data,
                  timeMessageRules: newRules,
                }
              };
            });

            return {
              ...n,
              id: newId,
              data: {
                ...n.data,
                bubbles: newBubbles,
              },
            };
          });

          const newEdges = parsed.edges.map((e) => ({
            id: uuidv4(),
            source: idMap.get(e.source) || e.source,
            target: idMap.get(e.target) || e.target,
          }));

          // Atualizar o fluxo com os novos nodes/edges
          updateFlow(flow.id, {
            nodes: newNodes,
            edges: newEdges,
            isPublished: false, // Marcar como não publicado pois foi importado
          });

          toast.success('Fluxo importado com sucesso! Publique para salvar no Supabase.');
        } catch (err) {
          console.error('Import error:', err);
          toast.error('Erro ao ler o arquivo JSON. Verifique se é um arquivo válido.');
        }
      };

      reader.onerror = () => {
        toast.error('Erro ao ler o arquivo.');
      };

      reader.readAsText(file);
    },
    [flow.id, updateFlow],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processImportedFile(file);
      }
      // Limpar o input para permitir reimportar o mesmo arquivo
      e.target.value = '';
    },
    [processImportedFile],
  );

  // ========== FIM EXPORT / IMPORT ==========

  const mapFlowNodesToReactFlowNodes = useCallback(
    (flowNodes: FlowNode[]): Node[] =>
      flowNodes.map((node) => {
        if (node.type === 'start') {
          return { id: node.id, type: 'start', position: node.position, data: node.data, draggable: true, selectable: true };
        }
        
        // Handle standalone note nodes
        if (node.type === 'note') {
          return {
            id: node.id,
            type: 'note',
            position: node.position,
            width: node.width || 280,
            height: node.height || 180,
            data: {
              ...node.data,
              onEdit: handleEditNoteNode,
              onDelete: handleDeleteNoteNode,
            },
            draggable: true,
            selectable: true,
          };
        }
        
        // Get order tag from groupOrderMap (G1, G2, etc.)
        const orderInfo = groupOrderMap.get(node.id);
        return {
          id: node.id,
          type: 'group',
          position: node.position,
          data: {
            ...node.data,
            showMediaPreviews,
            orderTag: orderInfo?.orderTag, // Add the order tag (G1, G2, etc.)
            onDeleteGroup: () => handleDeleteGroup(node.id),
            onRenameGroup: (label: string) => handleRenameGroup(node.id, label),
            getFlowNameById,
            onDeleteBubble: (bubbleId: string) => void handleDeleteBubble(node.id, bubbleId),
            onEditBubble: (bubbleId: string) => handleEditBubble(node.id, bubbleId),
            onDropBubbleIntoGroup: handleDropBubbleIntoGroup,
            onReorderBubbles: (nodeId: string, newOrder: BubbleItem[]) => handleReorderBubbles(nodeId, newOrder),
            onChangeBubbleColumn: handleChangeBubbleColumn,
            placeholderIndex: hoverPlaceholder?.groupId === node.id ? hoverPlaceholder.index : undefined,
            activeDragId,
          },
        };
      }),
    [
      getFlowNameById,
      handleDeleteGroup,
      handleRenameGroup,
      handleDeleteBubble,
      handleEditBubble,
      handleDropBubbleIntoGroup,
      handleReorderBubbles,
      handleChangeBubbleColumn,
      handleEditNoteNode,
      handleDeleteNoteNode,
      showMediaPreviews,
      hoverPlaceholder,
      activeDragId,
      groupOrderMap,
    ],
  );

  const initialNodes: Node[] = useMemo(() => mapFlowNodesToReactFlowNodes(currentFlow.nodes), [currentFlow.nodes, mapFlowNodesToReactFlowNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  const initialEdges: Edge[] = useMemo(
    () =>
      currentFlow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'deletable',
        data: { onDelete: () => {} },
        animated: true,
        style: { stroke: 'hsl(25 95% 53%)', strokeWidth: 2 },
      })),
    [currentFlow.edges],
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleDeleteConnection = useCallback(
    (edgeId: string) => {
      deleteFlowEdge(flow.id, edgeId);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [deleteFlowEdge, flow.id, setEdges],
  );

  useEffect(() => {
    setNodes(mapFlowNodesToReactFlowNodes(currentFlow.nodes));
    setEdges(
      currentFlow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'deletable',
        data: { onDelete: handleDeleteConnection },
        animated: true,
        style: { stroke: 'hsl(25 95% 53%)', strokeWidth: 2 },
      })),
    );
  }, [currentFlow.nodes, currentFlow.edges, mapFlowNodesToReactFlowNodes, setNodes, setEdges, handleDeleteConnection]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const newEdge = { id: uuidv4(), source: params.source, target: params.target };

      addFlowEdge(flow.id, newEdge);
      setEdges((eds) =>
        addEdge(
          { ...params, id: newEdge.id, type: 'deletable', data: { onDelete: handleDeleteConnection }, animated: true, style: { stroke: 'hsl(25 95% 53%)', strokeWidth: 2 } },
          eds,
        ),
      );
    },
    [flow.id, addFlowEdge, setEdges, handleDeleteConnection],
  );

  const persistNodePosition = useRafThrottle((node: Node) => {
    if (node.type !== 'group' && node.type !== 'start' && node.type !== 'note') return;
    updateNode(flow.id, node.id, { position: node.position } as Partial<FlowNode>);
  });

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => persistNodePosition(node), [persistNodePosition]);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== 'group' && node.type !== 'start' && node.type !== 'note') return;
      // For note nodes, also persist width/height if resized
      if (node.type === 'note') {
        updateNode(flow.id, node.id, { 
          position: node.position,
          width: node.width,
          height: node.height,
        } as Partial<FlowNode>);
      } else {
        updateNode(flow.id, node.id, { position: node.position } as Partial<FlowNode>);
      }
    },
    [flow.id, updateNode],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedGroupId(node.type === 'group' ? node.id : null), []);

      const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const targetElement = event.target as HTMLElement;
      const droppedInsideAGroupNode = !!targetElement.closest?.('.react-flow__node-group');
      if (droppedInsideAGroupNode) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const pos =
        typeof rf.screenToFlowPosition === 'function'
          ? rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          : { x: event.clientX - bounds.left, y: event.clientY - bounds.top };

      // Get the type from the drag data
      const typeRaw =
        (event.dataTransfer.getData('application/reactflow') || event.dataTransfer.getData('text/plain')) as NodeType;

      if (!typeRaw) {
        return;
      }

      // SPECIAL CASE: Note type creates a standalone note node (not a group with bubble)
      if (typeRaw === 'note') {
        const newNoteNode: FlowNode = {
          id: `NOTE:${uuidv4()}`,
          type: 'note',
          position: pos,
          width: 280,
          height: 180,
          data: {
            label: 'Bloco de Notas',
            note: {
              title: '',
              html: '',
              textPreview: '',
              style: {
                fontSize: 14,
                textColor: '#ffffff',
                bgColor: '#1e3a5f',
              },
              heightMode: 'md',
            },
          },
        };
        addNode(flow.id, newNoteNode);
        toast.success('Bloco de Notas criado!');
        return;
      }

      const performCreateGroup = () => {
        const suggested = suggestColumnForType(typeRaw);
        if (!suggested) {
          toast.error(`Limite de colunas atingido (${typeRaw === 'time' ? 'T50' : 'M50'}).`);
          return;
        }

        let data: NodeData = { label: NODE_LABELS[typeRaw], supabaseColumn: suggested };

        // Apply tempo preset for Time cards
        if (typeRaw === 'time') {
          const tempoPreset = getTempoPreset(operationId);
          data.timeMin = tempoPreset.minSeconds;
          data.timeMax = tempoPreset.maxSeconds;
        }

        if (typeRaw === 'message-time') {
          data.timeMessageRules = [
            { id: uuidv4(), startTime: '06:00', endTime: '12:00', content: 'Bom dia!' },
            { id: uuidv4(), startTime: '12:01', endTime: '23:59', content: 'Boa tarde/noite!' },
          ];
        }

        if (typeRaw === 'photo-caption-time' || typeRaw === 'video-caption-time') {
          data.timeMediaRules = [
            { id: uuidv4(), startTime: '06:00', endTime: '12:00', mediaUrl: '', caption: '' },
          ];
        }

        const newBubble: BubbleData = { id: uuidv4(), type: typeRaw, data };
        const groupCount = currentFlow.nodes.filter((n) => n.type === 'group').length + 1;

        const newNode: FlowNode = {
          id: uuidv4(),
          type: 'group',
          position: pos,
          data: { label: `Group #${groupCount}`, bubbles: [newBubble] },
        };

        addNode(flow.id, newNode);
        setSelectedGroupId(newNode.id);
        toast.success(`Novo grupo criado com ${NODE_LABELS[typeRaw]} (${suggested})!`);
      };
      
      // Check if dropping a Time card when there are no M cards in the flow
      if (typeRaw === 'time') {
        const allMBubbles = allBubblesInFlow.filter((b) => getColumnKindForBubble(b.type) === 'M');
        if (allMBubbles.length === 0) {
          // Time would be the first card
          setTimeFirstWarning({
            open: true,
            pendingAction: performCreateGroup,
          });
          return;
        }
      }
      
      performCreateGroup();
    },
    [addNode, currentFlow.nodes, flow.id, rf, suggestColumnForType, allBubblesInFlow],
  );

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dndMeasuring = useMemo(() => ({
    droppable: { strategy: MeasuringStrategy.WhileDragging },
  }), []);

  // Custom collision detection: prefer groups/bubbles, but fall back to canvas
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // First check if pointer is over any group or bubble
    const pointerCollisions = pointerWithin(args);
    
    // Filter out canvas-droppable from pointer collisions to check for real targets
    const groupRelatedCollisions = pointerCollisions.filter(c => {
      const id = String(c.id);
      return id.startsWith('group:') || c.data?.droppableContainer?.data?.current?.groupId;
    });
    
    if (groupRelatedCollisions.length > 0) {
      // Use closestCorners for better sorting within groups
      return closestCorners(args);
    }
    
    // No group-related collisions found, check if we're over the canvas
    const canvasCollision = pointerCollisions.find(c => String(c.id) === 'canvas-droppable');
    if (canvasCollision) {
      return [canvasCollision];
    }
    
    // Also check with rectIntersection as a fallback for canvas
    const rectCollisions = rectIntersection(args);
    const canvasRect = rectCollisions.find(c => String(c.id) === 'canvas-droppable');
    if (canvasRect && groupRelatedCollisions.length === 0) {
      return [canvasRect];
    }
    
    // Default to closestCorners
    return closestCorners(args);
  }, []);

  // Check if a drop target is the canvas (empty area) vs a group-related element
  const isCanvasDropTarget = useCallback((overId: string | null, overData: Record<string, unknown> | undefined): boolean => {
    // No target = treat as canvas
    if (!overId) return true;
    
    // Explicit canvas droppable ID
    if (overId === 'canvas-droppable') return true;
    
    // If it's group-related, it's NOT canvas
    if (overId.startsWith('group:')) return false;
    if (overData?.groupId) return false;
    if (overData?.sortable && (overData.sortable as any)?.containerId) return false;
    
    // If overData has isCanvas flag
    if (overData?.isCanvas) return true;
    
    return false;
  }, []);

  const handleCardDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setHoverPlaceholder(null);
  }, []);

  const handleCardDragOver = useCallback((event: DragOverEvent) => {
    const { over, active } = event;
    
    if (!over || !active) {
      setHoverPlaceholder(null);
      return;
    }

    const overId = String(over.id);
    const activeId = String(active.id);
    const sourceGroupId = (active.data.current as any)?.groupId as string | undefined;
    
    // Check if over canvas - no placeholder needed
    if (overId === 'canvas-droppable') {
      setHoverPlaceholder(null);
      return;
    }
    
    // Dropped on END zone (group:<id>:end)
    if (overId.includes(':end')) {
      const groupId = overId.replace('group:', '').replace(':end', '');
      const node = currentFlow.nodes.find((n) => n.type === 'group' && n.id === groupId);
      const bubbles = (node?.data.bubbles || []) as BubbleData[];
      setHoverPlaceholder({ groupId, index: bubbles.length });
      return;
    }
    
    // Dropped on group container
    if (overId.startsWith('group:')) {
      const groupId = overId.slice('group:'.length);
      const node = currentFlow.nodes.find((n) => n.type === 'group' && n.id === groupId);
      const bubbles = (node?.data.bubbles || []) as BubbleData[];
      // Show at end
      setHoverPlaceholder({ groupId, index: bubbles.length });
      return;
    }

    // Dropped on a bubble
    const destGroupId = (over.data.current as any)?.groupId as string | undefined;
    if (destGroupId) {
      const node = currentFlow.nodes.find((n) => n.type === 'group' && n.id === destGroupId);
      const bubbles = (node?.data.bubbles || []) as BubbleData[];
      const overIndex = bubbles.findIndex((b) => b.id === overId);
      
      if (overIndex >= 0) {
        // Calculate correct insert position considering if same group and direction
        const activeIndex = bubbles.findIndex((b) => b.id === activeId);
        let insertAt = overIndex;
        
        // Same group: if moving down, show placeholder after the target
        if (sourceGroupId === destGroupId && activeIndex >= 0 && activeIndex < overIndex) {
          insertAt = overIndex + 1;
        }
        
        setHoverPlaceholder({ groupId: destGroupId, index: insertAt });
        return;
      }
    }

    setHoverPlaceholder(null);
  }, [currentFlow.nodes]);

  const handleCardDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      const activeId = String(active.id);
      const sourceGroupId = (active.data.current as any)?.groupId as string | undefined;

      console.log('[DnD] onDragEnd start', {
        activeId,
        sourceGroupId,
        overId: over ? String(over.id) : null,
        overData: over?.data?.current,
      });

      // Reset states at the end regardless
      const cleanup = () => {
        setActiveDragId(null);
        setHoverPlaceholder(null);
      };

      if (!sourceGroupId) {
        cleanup();
        return;
      }

      // Helper function to create new group at drop position
      const createNewGroupWithCard = () => {
        const groupCount = currentFlow.nodes.filter((n) => n.type === 'group').length + 1;

        // Calculate drop position using activatorEvent + delta
        const ae = event.activatorEvent as MouseEvent | TouchEvent | undefined;
        const delta = event.delta;

        let clientX: number | null = null;
        let clientY: number | null = null;

        if (ae && 'clientX' in ae) {
          clientX = ae.clientX + (delta?.x ?? 0);
          clientY = ae.clientY + (delta?.y ?? 0);
        } else if (ae && 'touches' in ae && ae.touches[0]) {
          clientX = ae.touches[0].clientX + (delta?.x ?? 0);
          clientY = ae.touches[0].clientY + (delta?.y ?? 0);
        }

        const sourceNode = currentFlow.nodes.find((n) => n.type === 'group' && n.id === sourceGroupId);

        let position: { x: number; y: number } = {
          x: (sourceNode?.position?.x ?? 80) + 260,
          y: sourceNode?.position?.y ?? 80,
        };

        if (clientX !== null && clientY !== null) {
          position = rf.screenToFlowPosition({ x: clientX, y: clientY });
        }

        console.log('[DnD] creating new group at', { clientX, clientY, position });

        const newNode: FlowNode = {
          id: uuidv4(),
          type: 'group',
          position,
          data: { label: `Group #${groupCount}`, bubbles: [] },
        };

        console.log('[DnD] created new group', { newGroupId: newNode.id, position });

        addNode(flow.id, newNode);

        // Move bubble to new group (normalization happens inside the store)
        setTimeout(() => {
          if (useOps && operationId) {
            operationsStore.moveBubbleBetweenNodes(operationId, flow.id, sourceGroupId, newNode.id, activeId);
          } else {
            workflowStore.moveBubbleBetweenNodes(flow.id, sourceGroupId, newNode.id, activeId);
          }
        }, 0);

        setSelectedGroupId(newNode.id);
        toast.success('Novo grupo criado com o card!');
        cleanup();
      };

      // Dropped on empty canvas (no over target) -> create new group
      if (!over) {
        createNewGroupWithCard();
        return;
      }

      const overId = String(over.id);
      const overData = over.data.current as Record<string, unknown> | undefined;

      // Check if dropped on canvas (empty area) using our helper
      if (isCanvasDropTarget(overId, overData)) {
        console.log('[DnD] dropped on canvas, creating new group');
        createNewGroupWithCard();
        return;
      }

      // Determine destination
      let destGroupId: string | undefined;
      let insertIndex: number | undefined;

      // Handle END zone drop (group:<id>:end)
      if (overId.includes(':end')) {
        destGroupId = overId.replace('group:', '').replace(':end', '');
        const destNode = currentFlow.nodes.find((n) => n.type === 'group' && n.id === destGroupId);
        const destBubbles = (destNode?.data.bubbles || []) as BubbleData[];
        insertIndex = destBubbles.length;
      } else if (overId.startsWith('group:')) {
        destGroupId = overId.slice('group:'.length);
        // Dropped on container = insert at end
        const destNode = currentFlow.nodes.find((n) => n.type === 'group' && n.id === destGroupId);
        const destBubbles = (destNode?.data.bubbles || []) as BubbleData[];
        insertIndex = destBubbles.length;
      } else {
        destGroupId = (over.data.current as any)?.groupId as string | undefined;
        if (destGroupId) {
          const destNode = currentFlow.nodes.find((n) => n.type === 'group' && n.id === destGroupId);
          const destBubbles = (destNode?.data.bubbles || []) as BubbleData[];
          const overIndex = destBubbles.findIndex((b) => b.id === overId);
          insertIndex = overIndex >= 0 ? overIndex : destBubbles.length;
        }
      }

      console.log('[DnD] resolved destination', { destGroupId, insertIndex });

      // Safety check - if we somehow don't have a destGroupId, create new group
      if (!destGroupId) {
        console.log('[DnD] no destGroupId resolved, creating new group');
        createNewGroupWithCard();
        return;
      }

      // Get the bubble being moved
      const activeBubbleForCheck = (() => {
        const sourceNode = currentFlow.nodes.find((n) => n.id === sourceGroupId);
        const bubbles = (sourceNode?.data.bubbles || []) as BubbleData[];
        return bubbles.find((b) => b.id === activeId);
      })();
      
      const isTimeBubble = activeBubbleForCheck && getColumnKindForBubble(activeBubbleForCheck.type) === 'T';

      // Same group: reorder
      if (sourceGroupId === destGroupId) {
        const node = currentFlow.nodes.find((n) => n.type === 'group' && n.id === sourceGroupId);
        const bubbles = (node?.data.bubbles || []) as BubbleData[];
        const oldIndex = bubbles.findIndex((b) => b.id === activeId);
        
        let newIndex: number;
        
        // Dropped on end zone or group container = move to end
        if (overId.includes(':end') || overId.startsWith('group:')) {
          newIndex = bubbles.length - 1;
        } else {
          const overIndex = bubbles.findIndex((b) => b.id === overId);
          // If dragging down, we need to account for the item being removed
          if (overIndex > oldIndex) {
            newIndex = overIndex;
          } else {
            newIndex = overIndex;
          }
        }

        console.log('[DnD] same group reorder', { oldIndex, newIndex, bubblesCount: bubbles.length });

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          // Check if moving a Time bubble to first position (before any M)
          const performReorder = () => {
            const newOrder = arrayMove(bubbles, oldIndex, newIndex);
            reorderBubblesInNode(flow.id, sourceGroupId, newOrder);
            // Note: Normalization happens inside the store
            toast.success('Ordem atualizada!');
          };
          
          // Simulate the new order to check if Time would be before any M
          if (isTimeBubble) {
            const simulatedOrder = arrayMove(bubbles, oldIndex, newIndex);
            // Check if this Time bubble would be before any M in the simulated order
            const indexInSimulated = simulatedOrder.findIndex((b) => b.id === activeId);
            const anyMBefore = simulatedOrder.slice(0, indexInSimulated).some((b) => getColumnKindForBubble(b.type) === 'M');
            
            // Also check globally (other groups before this one)
            const globalMBefore = (() => {
              for (const n of currentFlow.nodes) {
                if (n.type !== 'group') continue;
                if (n.id === sourceGroupId) {
                  // We reached the current group, check simulatedOrder
                  return anyMBefore;
                }
                // Check if any M exists in previous groups
                const prevBubbles = (n.data.bubbles || []) as BubbleData[];
                if (prevBubbles.some((b) => getColumnKindForBubble(b.type) === 'M')) {
                  return true;
                }
              }
              return anyMBefore;
            })();
            
            if (!globalMBefore && indexInSimulated === 0) {
              // Time would be the first card globally
              setTimeFirstWarning({
                open: true,
                pendingAction: () => {
                  performReorder();
                  cleanup();
                },
              });
              return;
            }
          }
          
          performReorder();
        }
        cleanup();
        return;
      }

      // Different groups: move
      console.log('[DnD] moving between groups', { sourceGroupId, destGroupId, insertIndex });
      
      const performMove = () => {
        if (useOps && operationId) {
          operationsStore.moveBubbleBetweenNodes(operationId, flow.id, sourceGroupId, destGroupId, activeId, insertIndex);
        } else {
          workflowStore.moveBubbleBetweenNodes(flow.id, sourceGroupId, destGroupId, activeId, insertIndex);
        }
        // Note: Normalization happens inside the store
        toast.success('Card movido para outro grupo!');
      };
      
      // Check if moving a Time bubble to a position before any M
      if (isTimeBubble) {
        // Check if the destination would be before any M globally
        const targetInsertIndex = insertIndex ?? 0;
        
        // Simulate: would this Time be before any M after the move?
        let mFoundBefore = false;
        for (const n of currentFlow.nodes) {
          if (n.type !== 'group') continue;
          const bubbles = (n.data.bubbles || []) as BubbleData[];
          
          if (n.id === destGroupId) {
            // Check bubbles before insertIndex in destination
            for (let i = 0; i < targetInsertIndex && i < bubbles.length; i++) {
              if (getColumnKindForBubble(bubbles[i].type) === 'M') {
                mFoundBefore = true;
                break;
              }
            }
            break;
          }
          
          // Check all bubbles in groups before destination (excluding the one being moved)
          for (const b of bubbles) {
            if (b.id === activeId) continue; // Skip the bubble being moved
            if (getColumnKindForBubble(b.type) === 'M') {
              mFoundBefore = true;
              break;
            }
          }
          if (mFoundBefore) break;
        }
        
        if (!mFoundBefore) {
          setTimeFirstWarning({
            open: true,
            pendingAction: () => {
              performMove();
              cleanup();
            },
          });
          return;
        }
      }
      
      performMove();
      cleanup();
    },
    [
      addNode,
      currentFlow.nodes,
      flow.id,
      isCanvasDropTarget,
      operationId,
      operationsStore,
      reorderBubblesInNode,
      rf,
      useOps,
      workflowStore,
    ],
  );

  // Find the active bubble for overlay
  const activeBubble = useMemo(() => {
    if (!activeDragId) return null;
    for (const node of currentFlow.nodes) {
      if (node.type !== 'group') continue;
      const found = (node.data.bubbles || []).find((b: BubbleData) => b.id === activeDragId);
      if (found) return found as BubbleData;
    }
    return null;
  }, [activeDragId, currentFlow.nodes]);

  // Canvas droppable for catching drops outside of groups
  const { setNodeRef: setCanvasDroppableRef } = useDroppable({
    id: 'canvas-droppable',
    data: { isCanvas: true },
  });

  const handlePublish = async () => {
    if (!supabaseConfig.isConnected) {
      toast.error('Conecte ao Supabase primeiro');
      return;
    }

    if (!currentGroup) {
      toast.error('Não encontrei o grupo desse fluxo.');
      return;
    }

    if (allBubblesInFlow.length === 0) {
      toast.error('Adicione pelo menos um bloco ao fluxo');
      return;
    }

    const duplicates = detectDuplicateColumns(allBubblesInFlow);
    if (duplicates.length > 0) {
      toast.error(`Coluna duplicada: ${duplicates[0].column}. Ajuste antes de publicar.`);
      return;
    }

    for (const b of allBubblesInFlow) {
      const col = b.data.supabaseColumn;
      const parsed = col ? parseColumn(col) : null;
      if (!parsed) {
        toast.error('Existe card sem coluna definida (Mx/Tx). Defina antes de publicar.');
        return;
      }
    }

    setIsPublishing(true);

    try {
      const updatedAtIso = new Date().toISOString();

      // Generate POSICAO v2 JSON from current canvas state (preserves exact order and IDs)
      const posicaoStr = encodePosicaoV2(currentFlow.nodes, currentFlow.edges);

      // Encode notes to BLK column (separate from POSICAO)
      const blkStr = encodeBlk(currentFlow.nodes);

      const rowData: Record<string, string | null> = {
        GRUPO: currentGroup.name,
        FLUXO: currentFlow.name,
        UPDATED_AT: updatedAtIso,
        POSICAO: posicaoStr || null,
        BLK: blkStr, // Notes are saved here, not in POSICAO
      };

      for (const bubble of allBubblesInFlow) {
        const col = bubble.data.supabaseColumn!.toUpperCase();
        rowData[col] = buildSupabaseValueForBubble(bubble);
      }

      for (let i = 1; i <= COLUMN_LIMIT; i++) {
        const mCol = buildColumn('M', i).toUpperCase();
        const tCol = buildColumn('T', i).toUpperCase();
        if (!(mCol in rowData)) rowData[mCol] = null;
        if (!(tCol in rowData)) rowData[tCol] = null;
      }

      const url = `${supabaseConfig.url}/rest/v1/${TABLE_NAME}?on_conflict=GRUPO,FLUXO`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([rowData]),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text();

        console.error('Supabase publish failed:', { status: response.status, statusText: response.statusText, url, payload });

        const msg = getSupabaseErrorMessage(payload);

        if (response.status === 401 || response.status === 403) {
          toast.error(msg ? `Supabase bloqueou (RLS/permissões): ${msg}` : 'Supabase bloqueou a escrita (RLS/permissões).');
          return;
        }

        if (response.status === 404) {
          toast.error(`Planilha ${TABLE_NAME} não foi encontrada`);
          return;
        }

        if (response.status === 400) {
          toast.error(msg ? `Erro na tabela (HTTP 400): ${msg}` : 'Erro na tabela (HTTP 400). Veja o console.');
          return;
        }

        toast.error(msg ? `Erro ao publicar (HTTP ${response.status}): ${msg}` : `Erro ao publicar (HTTP ${response.status}). Veja o console.`);
        return;
      }

      updateFlow(flow.id, { isPublished: true });
      toast.success('Fluxo publicado com sucesso!');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="min-w-0">
            {!isEditingFlowName ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="nodrag text-left"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditingFlowName(true);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Duplo clique para renomear"
                >
                  <h1 className="text-xl font-bold truncate max-w-[48vw]">{currentFlow.name}</h1>
                </button>

                <button
                  type="button"
                  className="nodrag inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
                  onClick={() => setIsEditingFlowName(true)}
                  aria-label="Renomear fluxo"
                  title="Renomear"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="nodrag" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <Input
                  value={flowNameDraft}
                  onChange={(e) => setFlowNameDraft(e.target.value)}
                  className="h-9 w-[min(520px,70vw)] bg-background/40 border-border/60"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitFlowName();
                    if (e.key === 'Escape') cancelFlowName();
                  }}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Enter salva • Esc cancela</div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {currentFlow.nodes.length} nós • {currentFlow.isPublished ? 'Publicado' : 'Rascunho'}
              {selectedGroupId && ' • Grupo selecionado'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mídias</span>
            <Switch checked={showMediaPreviews} onCheckedChange={setShowMediaPreviews} />
          </div>

          {/* Dropdown Baixar/Importar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Baixar/Importar
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportFlow} className="gap-2 cursor-pointer">
                <Download className="h-4 w-4" />
                Baixar fluxo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportFlow} className="gap-2 cursor-pointer">
                <FileUp className="h-4 w-4" />
                Importar fluxo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={handlePublish} disabled={isPublishing || !supabaseConfig.isConnected} className="gap-2">
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publicando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Publicar
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        <NodePanel operationId={operationId} />

        <div 
          className="flex-1 relative" 
          ref={(node) => {
            // Combine both refs: reactFlowWrapper for position calculations and canvas droppable
            (reactFlowWrapper as React.MutableRefObject<HTMLDivElement | null>).current = node;
            setCanvasDroppableRef(node);
          }} 
          onDragOver={onCanvasDragOver} 
          onDrop={onCanvasDrop}
        >
          <DndContext
            sensors={dndSensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleCardDragStart}
            onDragOver={handleCardDragOver}
            onDragEnd={handleCardDragEnd}
            measuring={dndMeasuring}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              className="bg-background"
              panOnDrag={[2]}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(222 47% 16%)" />
              <Controls className="!bg-card !border-border" />
              <MiniMap nodeColor="hsl(199 89% 48%)" maskColor="hsl(222 47% 6% / 0.8)" />
            </ReactFlow>

            <DragOverlay dropAnimation={null}>
              {activeBubble && (
                <div className="rounded-xl bg-card border-2 border-primary shadow-2xl px-4 py-3 min-w-[280px] max-w-[360px] pointer-events-none rotate-1 scale-105">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0",
                      activeBubble.type === 'message' && "bg-node-message",
                      activeBubble.type === 'message-utm' && "bg-node-message-utm",
                      activeBubble.type === 'message-time' && "bg-node-message-time",
                      activeBubble.type === 'photo' && "bg-node-photo",
                      activeBubble.type === 'photo-caption' && "bg-node-photo",
                      activeBubble.type === 'photo-caption-time' && "bg-node-photo",
                      activeBubble.type === 'video' && "bg-node-video",
                      activeBubble.type === 'video-caption' && "bg-node-video",
                      activeBubble.type === 'video-caption-time' && "bg-node-video",
                      activeBubble.type === 'audio' && "bg-node-audio",
                      activeBubble.type === 'time' && "bg-node-time",
                      activeBubble.type === 'lead-respond' && "bg-node-lead",
                      activeBubble.type === 'hook' && "bg-node-hook",
                      activeBubble.type === 'delete-hook' && "bg-node-delete-hook",
                      activeBubble.type === 'link-pix' && "bg-node-link-pix",
                      activeBubble.type === 'deliverable' && "bg-node-deliverable",
                    )}>
                      {activeBubble.type === 'message' && <MessageSquare className="h-4 w-4" />}
                      {activeBubble.type === 'message-utm' && <Link className="h-4 w-4" />}
                      {activeBubble.type === 'message-time' && <Clock className="h-4 w-4" />}
                      {activeBubble.type === 'photo' && <Image className="h-4 w-4" />}
                      {activeBubble.type === 'photo-caption' && <ImagePlus className="h-4 w-4" />}
                      {activeBubble.type === 'photo-caption-time' && <ImagePlus className="h-4 w-4" />}
                      {activeBubble.type === 'video' && <Video className="h-4 w-4" />}
                      {activeBubble.type === 'video-caption' && <VideoIcon className="h-4 w-4" />}
                      {activeBubble.type === 'video-caption-time' && <VideoIcon className="h-4 w-4" />}
                      {activeBubble.type === 'audio' && <Mic className="h-4 w-4" />}
                      {activeBubble.type === 'time' && <Clock className="h-4 w-4" />}
                      {activeBubble.type === 'lead-respond' && <UserCheck className="h-4 w-4" />}
                      {activeBubble.type === 'hook' && <Anchor className="h-4 w-4" />}
                      {activeBubble.type === 'delete-hook' && <Trash2 className="h-4 w-4" />}
                      {activeBubble.type === 'link-pix' && <CreditCard className="h-4 w-4" />}
                      {activeBubble.type === 'deliverable' && <Anchor className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{activeBubble.data.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {activeBubble.data.content || activeBubble.data.mediaUrl || activeBubble.data.supabaseColumn}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Modal for regular bubbles (not notes) */}
      <EditBubbleModal
        isOpen={!!editingBubble && editingBubble.bubble.type !== 'note'}
        onClose={() => setEditingBubble(null)}
        bubble={editingBubble?.bubble || null}
        onSave={handleSaveBubble}
        onConvertType={handleConvertBubbleType}
        availableFlows={availableFlows}
        currentFlowId={flow.id}
      />

      {/* Modal for standalone note nodes */}
      <EditNoteModal
        open={!!editingNoteId}
        onClose={() => setEditingNoteId(null)}
        noteData={currentFlow.nodes.find((n) => n.id === editingNoteId && n.type === 'note')?.data.note}
        onSave={handleSaveNote}
      />

      {/* Modal de confirmação de importação */}
      {confirmImport.ConfirmDeleteModalComponent}

      {/* Modal de aviso Tempo como primeiro card */}
      <TimeFirstWarningModal
        open={timeFirstWarning.open}
        onCancel={() => setTimeFirstWarning({ open: false, pendingAction: null })}
        onContinue={() => {
          if (timeFirstWarning.pendingAction) {
            timeFirstWarning.pendingAction();
          }
          setTimeFirstWarning({ open: false, pendingAction: null });
        }}
      />
    </div>
  );
};