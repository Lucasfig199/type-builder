import { useMemo, useState, useEffect, useCallback } from 'react';
import { Plus, ArrowLeft, Play, Trash2, GitBranch, Pencil, Loader2, Lock, GripVertical, MoreHorizontal, Copy, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useWorkflowStore } from '@/store/workflowStore';
import { useOperationsStore } from '@/store/operationsStore';
import { Group, Flow } from '@/types/workflow';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/ConfirmDeleteModal';
import { useFrontWarning } from '@/components/FrontWarningModal';
import { useFlowOrder } from '@/hooks/useFlowOrder';
import { useLocalFlowOrder } from '@/hooks/useLocalFlowOrder';
import { v4 as uuidv4 } from 'uuid';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FlowListProps {
  group: Group;
  onBack: () => void;
  onSelectFlow: (flow: Flow) => void;
  operationId?: string;
}

const TABLE_NAME = 'TYPE_BUILDER';
const FRONT_FLOW_NAME = 'FRONT';

// ============== Sortable Flow Card Component ==============
interface SortableFlowCardProps {
  flow: Flow;
  index: number;
  isInitial: boolean;
  isDragging: boolean;
  deletingFlowId: string | null;
  onSelect: (flow: Flow) => void;
  onEdit: (e: React.MouseEvent, flow: Flow) => void;
  onDelete: (e: React.MouseEvent, flow: Flow) => void;
  onDuplicate: (flow: Flow) => void;
  onMove: (flow: Flow) => void;
}

function SortableFlowCard({
  flow,
  index,
  isInitial,
  isDragging,
  deletingFlowId,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onMove,
}: SortableFlowCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isItemDragging,
  } = useSortable({ id: flow.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 0.1}s`,
  };

  if (isItemDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-6 rounded-xl bg-primary/10 border-2 border-dashed border-primary/50 opacity-50"
      >
        <div className="h-[140px]" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/50 
                 transition-all duration-300 cursor-pointer shadow-card hover:shadow-glow
                 animate-slide-up"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-4 left-4 p-1.5 rounded-lg bg-muted/50 hover:bg-muted cursor-grab active:cursor-grabbing
                   opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Action buttons - [lápis] [lixo] [3 pontos] */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button
          onClick={(e) => onEdit(e, flow)}
          className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          aria-label="Editar fluxo"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          onClick={(e) => onDelete(e, flow)}
          disabled={deletingFlowId === flow.id}
          className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors disabled:opacity-50"
          aria-label="Deletar fluxo"
        >
          {deletingFlowId === flow.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>

        {/* 3-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Mais opções"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(flow);
              }}
              className="cursor-pointer"
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicar fluxo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onMove(flow);
              }}
              className="cursor-pointer"
            >
              <FolderInput className="h-4 w-4 mr-2" />
              Mover para...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Card content - clickable */}
      <div onClick={() => onSelect(flow)}>
        <div className="flex items-center gap-3 mb-4 pl-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Play className="h-5 w-5 text-primary-foreground" />
          </div>
          {isInitial && (
            <span className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1 font-medium">
              <Lock className="h-3 w-3" />
              INICIAL
            </span>
          )}
          {flow.isPublished && (
            <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              Publicado
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold mb-2 pl-8">{flow.name}</h3>

        <div className="flex items-center gap-4 text-sm text-muted-foreground pl-8">
          <span>{flow.nodes.length} nós</span>
          <span>•</span>
          <span>Atualizado {new Date(flow.updatedAt).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
    </div>
  );
}

// ============== Drag Overlay Component ==============
interface DragOverlayCardProps {
  flow: Flow;
  isInitial: boolean;
}

function DragOverlayCard({ flow, isInitial }: DragOverlayCardProps) {
  return (
    <div className="p-6 rounded-xl bg-card border-2 border-primary shadow-glow cursor-grabbing">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
          <Play className="h-5 w-5 text-primary-foreground" />
        </div>
        {isInitial && (
          <span className="px-2 py-1 text-xs rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1 font-medium">
            <Lock className="h-3 w-3" />
            INICIAL
          </span>
        )}
        {flow.isPublished && (
          <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
            Publicado
          </span>
        )}
      </div>
      <h3 className="text-lg font-semibold mb-2">{flow.name}</h3>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{flow.nodes.length} nós</span>
      </div>
    </div>
  );
}

// ============== Main FlowList Component ==============
export const FlowList = ({ group, onBack, onSelectFlow, operationId }: FlowListProps) => {
  const workflowStore = useWorkflowStore();
  const operationsStore = useOperationsStore();

  const [deletingFlowId, setDeletingFlowId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orderedFlowIds, setOrderedFlowIds] = useState<string[]>([]);
  const confirmDelete = useConfirmDelete();
  const frontWarning = useFrontWarning();

  // Move modal state
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [flowToMove, setFlowToMove] = useState<Flow | null>(null);
  const [selectedTargetGroupId, setSelectedTargetGroupId] = useState<string>('');

  const groups = useMemo(() => {
    if (!operationId) return workflowStore.groups;
    const op = operationsStore.operations.find((o) => o.id === operationId);
    return op?.groups ?? [];
  }, [operationId, workflowStore.groups, operationsStore.operations]);

  const supabaseConfig = useMemo(() => {
    if (!operationId) return workflowStore.supabaseConfig;
    const op = operationsStore.operations.find((o) => o.id === operationId);
    return op?.supabaseConfig ?? { url: '', anonKey: '', isConnected: false };
  }, [operationId, workflowStore.supabaseConfig, operationsStore.operations]);

  const currentGroup = useMemo(() => groups.find((g) => g.id === group.id) || group, [groups, group]);

  const { saveFlowOrder, fetchFlowOrder, isSaving } = useFlowOrder({
    supabaseConfig,
    groupName: currentGroup.name,
  });

  const { applyLocalOrder, setLocalOrder } = useLocalFlowOrder(operationId, currentGroup.id);

  const createFlow = (groupId: string, name: string) => {
    if (!operationId) return workflowStore.createFlow(groupId, name);
    return operationsStore.createFlow(operationId, groupId, name);
  };

  const deleteFlowFromStore = (flowId: string) => {
    if (!operationId) return workflowStore.deleteFlow(flowId);
    return operationsStore.deleteFlow(operationId, flowId);
  };

  const updateFlow = (flowId: string, updates: Partial<Flow>) => {
    if (!operationId) return workflowStore.updateFlow(flowId, updates);
    return operationsStore.updateFlow(operationId, flowId, updates);
  };

  // Function to add a flow directly to a group (for duplicate/move)
  const addFlowToGroup = useCallback((targetGroupId: string, flow: Flow) => {
    if (!operationId) {
      // Direct state update for workflowStore
      const targetGroup = workflowStore.groups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        workflowStore.updateGroup(targetGroupId, {
          flows: [...targetGroup.flows, flow],
        });
      }
    } else {
      operationsStore.addFlowToGroup(operationId, targetGroupId, flow);
    }
  }, [operationId, workflowStore.groups, operationsStore]);

  const removeFlowFromGroup = useCallback((sourceGroupId: string, flowId: string) => {
    if (!operationId) {
      const sourceGroup = workflowStore.groups.find(g => g.id === sourceGroupId);
      if (sourceGroup) {
        workflowStore.updateGroup(sourceGroupId, {
          flows: sourceGroup.flows.filter(f => f.id !== flowId),
        });
      }
    } else {
      operationsStore.removeFlowFromGroup(operationId, sourceGroupId, flowId);
    }
  }, [operationId, workflowStore.groups, operationsStore]);

  const [newFlowName, setNewFlowName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Determina qual fluxo é o INICIAL (nome === FRONT, case-insensitive)
  const frontFlowId = useMemo(() => {
    const frontFlow = currentGroup.flows.find(
      (f) => f.name.trim().toUpperCase() === FRONT_FLOW_NAME
    );
    return frontFlow?.id ?? null;
  }, [currentGroup.flows]);

  // Sincroniza a ordem dos fluxos: prioriza localStorage, depois Supabase, depois ordem original
  useEffect(() => {
    if (currentGroup.flows.length === 0) {
      setOrderedFlowIds([]);
      return;
    }

    const currentIds = currentGroup.flows.map((f) => f.id);
    
    // SEMPRE aplicar ordem local primeiro (localStorage)
    const localOrdered = applyLocalOrder(currentIds);
    
    // Se a ordem local retornou algo diferente do input, significa que temos ordem salva
    const hasLocalOrder = JSON.stringify(localOrdered) !== JSON.stringify(currentIds) || 
      localStorage.getItem(`flowOrder:${operationId ?? 'default'}:${currentGroup.id}`) !== null;
    
    if (hasLocalOrder) {
      setOrderedFlowIds(localOrdered);
      // Atualiza localStorage para remover IDs que não existem mais
      setLocalOrder(localOrdered);
      return;
    }

    // Se não tem ordem local, tenta buscar do Supabase (apenas na primeira vez)
    const initFromSupabase = async () => {
      const orderMap = await fetchFlowOrder();
      
      if (orderMap && orderMap.size > 0) {
        const sorted = [...currentGroup.flows].sort((a, b) => {
          const orderA = orderMap.get(a.name) ?? Infinity;
          const orderB = orderMap.get(b.name) ?? Infinity;
          return orderA - orderB;
        });
        const newOrder = sorted.map((f) => f.id);
        setOrderedFlowIds(newOrder);
        // Salva no localStorage para próximas vezes
        setLocalOrder(newOrder);
      } else {
        setOrderedFlowIds(currentIds);
      }
    };

    initFromSupabase();
  }, [currentGroup.id, currentGroup.flows, applyLocalOrder, setLocalOrder, fetchFlowOrder, operationId]);

  // Fluxos ordenados pela ordem local
  const sortedFlows = useMemo(() => {
    const flowMap = new Map(currentGroup.flows.map((f) => [f.id, f]));
    return orderedFlowIds
      .map((id) => flowMap.get(id))
      .filter((f): f is Flow => f !== undefined);
  }, [currentGroup.flows, orderedFlowIds]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = orderedFlowIds.indexOf(active.id as string);
    const newIndex = orderedFlowIds.indexOf(over.id as string);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedFlowIds, oldIndex, newIndex);
    setOrderedFlowIds(newOrder);
    
    // Save to localStorage immediately (silencioso, sem erro)
    // NÃO salva no Supabase aqui - só vai pro Supabase no "Publicar"
    setLocalOrder(newOrder);
  }, [orderedFlowIds, setLocalOrder]);

  const activeFlow = activeId ? currentGroup.flows.find((f) => f.id === activeId) : null;

  const editingFlow = useMemo(
    () => (editingFlowId ? currentGroup.flows.find((f) => f.id === editingFlowId) ?? null : null),
    [editingFlowId, currentGroup.flows],
  );

  // Verifica se é o fluxo inicial (FRONT)
  const isInitialFlow = (flowId: string) => flowId === frontFlowId;

  const openEdit = (e: React.MouseEvent, flow: Flow) => {
    e.stopPropagation();
    setEditingFlowId(flow.id);
    setEditName(flow.name);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingFlow) return;
    let next = editName.trim();
    if (!next) {
      toast.error('Digite um nome para o fluxo');
      return;
    }

    // Se é o fluxo inicial e está tentando mudar de FRONT
    const isFirstFlow = isInitialFlow(editingFlow.id);
    const normalizedNext = next.toUpperCase();
    
    // Auto-corrige "front" para "FRONT"
    if (isFirstFlow && normalizedNext === FRONT_FLOW_NAME && next !== FRONT_FLOW_NAME) {
      next = FRONT_FLOW_NAME;
    }

    // Se é o primeiro fluxo e está mudando para algo diferente de FRONT
    if (isFirstFlow && next !== FRONT_FLOW_NAME) {
      const confirmed = await frontWarning.confirm({
        groupName: currentGroup.name,
        currentName: editingFlow.name,
        newName: next,
      });

      if (!confirmed) {
        // Usuário cancelou, volta o nome para FRONT
        setEditName(FRONT_FLOW_NAME);
        return;
      }
    }

    updateFlow(editingFlow.id, { name: next });
    toast.success('Fluxo atualizado!');
    setEditOpen(false);
    setEditingFlowId(null);
  };

  const handleCreateFlow = () => {
    // Se o grupo não tem fluxos, o primeiro deve ser FRONT automaticamente
    const isFirstFlow = currentGroup.flows.length === 0;
    const flowName = isFirstFlow ? FRONT_FLOW_NAME : newFlowName.trim();

    if (!isFirstFlow && !flowName) {
      toast.error('Digite um nome para o fluxo');
      return;
    }

    const flow = createFlow(group.id, flowName);
    setNewFlowName('');
    setIsDialogOpen(false);
    
    if (isFirstFlow) {
      toast.success('Fluxo inicial FRONT criado automaticamente!');
    } else {
      toast.success('Fluxo criado com sucesso!');
    }
    
    onSelectFlow(flow);
  };

  // ============== Duplicate Flow ==============
  const handleDuplicateFlow = useCallback((flow: Flow) => {
    // Generate copy name with "(Cópia)", "(Cópia 2)", etc.
    const baseName = flow.name.replace(/\s*\(Cópia(?:\s+\d+)?\)$/, '');
    const existingNames = new Set(currentGroup.flows.map(f => f.name));
    
    let copyName = `${baseName} (Cópia)`;
    let copyNumber = 2;
    while (existingNames.has(copyName)) {
      copyName = `${baseName} (Cópia ${copyNumber})`;
      copyNumber++;
    }

    const newFlow: Flow = {
      ...flow,
      id: uuidv4(),
      name: copyName,
      isPublished: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addFlowToGroup(currentGroup.id, newFlow);
    
    // Update local order to include new flow
    const newOrder = [...orderedFlowIds, newFlow.id];
    setOrderedFlowIds(newOrder);
    setLocalOrder(newOrder);

    toast.success(`Fluxo duplicado como "${copyName}"`);
  }, [currentGroup, orderedFlowIds, addFlowToGroup, setLocalOrder]);

  // ============== Move Flow ==============
  const handleOpenMoveModal = useCallback((flow: Flow) => {
    setFlowToMove(flow);
    setSelectedTargetGroupId('');
    setMoveModalOpen(true);
  }, []);

  const handleMoveFlow = useCallback(() => {
    if (!flowToMove || !selectedTargetGroupId) return;

    const targetGroup = groups.find(g => g.id === selectedTargetGroupId);
    if (!targetGroup) return;

    // Create flow copy for target group
    const movedFlow: Flow = {
      ...flowToMove,
      groupId: selectedTargetGroupId,
      updatedAt: new Date(),
    };

    // Remove from current group
    removeFlowFromGroup(currentGroup.id, flowToMove.id);
    
    // Add to target group
    addFlowToGroup(selectedTargetGroupId, movedFlow);

    // Update local order to remove the moved flow
    const newOrder = orderedFlowIds.filter(id => id !== flowToMove.id);
    setOrderedFlowIds(newOrder);
    setLocalOrder(newOrder);

    toast.success(`Fluxo movido para "${targetGroup.name}"`);
    setMoveModalOpen(false);
    setFlowToMove(null);
  }, [flowToMove, selectedTargetGroupId, groups, currentGroup.id, orderedFlowIds, removeFlowFromGroup, addFlowToGroup, setLocalOrder]);

  // DELETE do fluxo no Supabase por GRUPO + FLUXO
  const deleteFlowFromSupabase = async (groupName: string, flowName: string): Promise<boolean> => {
    if (!supabaseConfig.isConnected) {
      return true;
    }

    const url =
      `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}` +
      `?GRUPO=eq.${encodeURIComponent(groupName)}&FLUXO=eq.${encodeURIComponent(flowName)}`;

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

      console.error('Supabase DELETE flow failed', { status: res.status, payload });

      const msg = typeof payload === 'object' && payload?.message ? payload.message : `HTTP ${res.status}`;
      toast.error(`Falha ao excluir do Supabase: ${msg}`);
      return false;
    } catch (err) {
      console.error('Supabase DELETE flow error', err);
      toast.error('Erro de rede ao excluir do Supabase');
      return false;
    }
  };

  const handleDeleteFlow = async (e: React.MouseEvent, flow: Flow) => {
    e.stopPropagation();

    const confirmed = await confirmDelete.confirm({
      title: 'Apagar fluxo?',
      description: 'Isso vai remover o fluxo do seu workflow e apagar também no Supabase.',
      details: [
        { label: 'GRUPO', value: currentGroup.name },
        { label: 'FLUXO', value: flow.name },
        { label: 'Ação', value: `DELETE WHERE GRUPO = '${currentGroup.name}' AND FLUXO = '${flow.name}'` },
      ],
      confirmText: 'Apagar fluxo',
      danger: true,
    });

    if (!confirmed) return;

    setDeletingFlowId(flow.id);
    confirmDelete.setIsLoading(true);

    try {
      const ok = await deleteFlowFromSupabase(currentGroup.name, flow.name);
      if (!ok) return;

      deleteFlowFromStore(flow.id);
      
      // Update local order
      const newOrder = orderedFlowIds.filter(id => id !== flow.id);
      setLocalOrder(newOrder);
      
      toast.success('Fluxo excluído com sucesso (Supabase e UI).');
    } finally {
      setDeletingFlowId(null);
      confirmDelete.setIsLoading(false);
    }
  };

  // Available groups for move (excluding current group)
  const availableGroupsForMove = useMemo(() => 
    groups.filter(g => g.id !== currentGroup.id),
    [groups, currentGroup.id]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{currentGroup.name}</h2>
          {currentGroup.description && <p className="text-muted-foreground">{currentGroup.description}</p>}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Fluxo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {currentGroup.flows.length === 0 ? 'Criar Fluxo Inicial' : 'Criar Novo Fluxo'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {currentGroup.flows.length === 0 ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                      <Lock className="h-4 w-4" />
                      Fluxo Inicial Obrigatório
                    </div>
                    <p className="text-sm text-muted-foreground">
                      O primeiro fluxo de cada grupo deve se chamar <code className="px-1.5 py-0.5 bg-primary/20 rounded font-bold">FRONT</code>. 
                      Isso é necessário para o backend funcionar corretamente.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    <span className="text-sm text-muted-foreground">Nome do fluxo:</span>
                    <code className="px-2 py-1 bg-primary/10 text-primary rounded font-bold">FRONT</code>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome do Fluxo</label>
                  <Input
                    placeholder="Ex: 15MIN, RETORNO, etc."
                    value={newFlowName}
                    onChange={(e) => setNewFlowName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFlow()}
                  />
                </div>
              )}
              <Button onClick={handleCreateFlow} className="w-full">
                {currentGroup.flows.length === 0 ? 'Criar Fluxo FRONT' : 'Criar Fluxo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) setEditingFlowId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Fluxo</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Fluxo</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setEditingFlowId(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={saveEdit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move Flow Modal */}
        <Dialog open={moveModalOpen} onOpenChange={setMoveModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mover fluxo</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {flowToMove && (
                <p className="text-sm text-muted-foreground">
                  Movendo <span className="font-semibold text-foreground">"{flowToMove.name}"</span> para outro grupo.
                </p>
              )}
              
              {availableGroupsForMove.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 rounded-lg bg-muted/50 border border-border">
                  Não há outros grupos disponíveis. Crie outro grupo primeiro.
                </p>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Selecione o grupo de destino</label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availableGroupsForMove.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => setSelectedTargetGroupId(g.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedTargetGroupId === g.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }`}
                      >
                        <div className="font-medium">{g.name}</div>
                        {g.description && (
                          <div className="text-sm text-muted-foreground truncate">{g.description}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">{g.flows.length} fluxos</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleMoveFlow} 
                disabled={!selectedTargetGroupId || availableGroupsForMove.length === 0}
              >
                Mover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {currentGroup.flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-gradient-primary/10 flex items-center justify-center mb-6">
            <GitBranch className="h-12 w-12 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhum fluxo criado</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Crie seu primeiro fluxo de mensagens para começar a construir suas automações de comunicação.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Primeiro Fluxo
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedFlowIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedFlows.map((flow, index) => (
                <SortableFlowCard
                  key={flow.id}
                  flow={flow}
                  index={index}
                  isInitial={isInitialFlow(flow.id)}
                  isDragging={activeId === flow.id}
                  deletingFlowId={deletingFlowId}
                  onSelect={onSelectFlow}
                  onEdit={openEdit}
                  onDelete={handleDeleteFlow}
                  onDuplicate={handleDuplicateFlow}
                  onMove={handleOpenMoveModal}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeFlow && (
              <DragOverlayCard
                flow={activeFlow}
                isInitial={isInitialFlow(activeFlow.id)}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modais */}
      {confirmDelete.ConfirmDeleteModalComponent}
      {frontWarning.FrontWarningModalComponent}
    </div>
  );
};
