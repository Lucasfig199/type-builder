import { useMemo, useState } from 'react';
import { Plus, FolderOpen, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useWorkflowStore } from '@/store/workflowStore';
import { useOperationsStore } from '@/store/operationsStore';
import { Group } from '@/types/workflow';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/ConfirmDeleteModal';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  operationId?: string;
}

const TABLE_NAME = 'TYPE_BUILDER';

export const GroupList = ({ onSelectGroup, operationId }: GroupListProps) => {
  const workflowStore = useWorkflowStore();
  const operationsStore = useOperationsStore();

  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const confirmDelete = useConfirmDelete();

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

  const createGroup = (name: string, description?: string) => {
    if (!operationId) return workflowStore.createGroup(name, description);
    return operationsStore.createGroup(operationId, name, description);
  };

  const deleteGroupFromStore = (groupId: string) => {
    if (!operationId) return workflowStore.deleteGroup(groupId);
    return operationsStore.deleteGroup(operationId, groupId);
  };

  const updateGroup = (groupId: string, updates: Partial<Group>) => {
    if (!operationId) return workflowStore.updateGroup(groupId, updates);
    return operationsStore.updateGroup(operationId, groupId, updates);
  };

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const editingGroup = useMemo(
    () => (editingGroupId ? groups.find((g) => g.id === editingGroupId) ?? null : null),
    [editingGroupId, groups],
  );

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Validation for duplicate group names
  const normalizeGroupName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  
  const isGroupNameDuplicate = (name: string, excludeId?: string) => {
    const normalized = normalizeGroupName(name);
    if (!normalized) return false;
    return groups.some(g => 
      g.id !== excludeId && normalizeGroupName(g.name) === normalized
    );
  };

  const newGroupNameError = isGroupNameDuplicate(newGroupName) ? 'Já existe um grupo com este nome' : '';
  const editGroupNameError = editingGroupId && isGroupNameDuplicate(editName, editingGroupId) ? 'Já existe um grupo com este nome' : '';

  const openEdit = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditDescription(group.description || '');
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingGroup) return;

    const nextName = editName.trim();
    if (!nextName) {
      toast.error('Digite um nome para o grupo');
      return;
    }

    if (editGroupNameError) {
      toast.error('Já existe um grupo com este nome');
      return;
    }

    updateGroup(editingGroup.id, { name: nextName, description: editDescription.trim() || undefined });
    toast.success('Grupo atualizado!');
    setEditOpen(false);
    setEditingGroupId(null);
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error('Digite um nome para o grupo');
      return;
    }

    if (newGroupNameError) {
      toast.error('Já existe um grupo com este nome');
      return;
    }

    createGroup(newGroupName, newGroupDescription);
    setNewGroupName('');
    setNewGroupDescription('');
    setIsDialogOpen(false);
    toast.success('Grupo criado com sucesso!');
  };

  // DELETE de todas as linhas do grupo no Supabase
  const deleteGroupFromSupabase = async (groupName: string): Promise<boolean> => {
    if (!supabaseConfig.isConnected) {
      // Se não está conectado, apenas remove da UI
      return true;
    }

    const url = `${supabaseConfig.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?GRUPO=eq.${encodeURIComponent(groupName)}`;

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

      console.error('Supabase DELETE group failed', { status: res.status, payload });

      const msg = typeof payload === 'object' && payload?.message ? payload.message : `HTTP ${res.status}`;
      toast.error(`Falha ao excluir do Supabase: ${msg}`);
      return false;
    } catch (err) {
      console.error('Supabase DELETE group error', err);
      toast.error('Erro de rede ao excluir do Supabase');
      return false;
    }
  };

  const handleDeleteGroup = async (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();

    const confirmed = await confirmDelete.confirm({
      title: 'Apagar grupo?',
      description: 'Isso vai remover o grupo do seu workflow e apagar também no Supabase.',
      details: [
        { label: 'GRUPO', value: group.name },
        { label: 'Ação', value: `DELETE WHERE GRUPO = '${group.name}'` },
      ],
      confirmText: 'Apagar grupo',
      danger: true,
    });

    if (!confirmed) return;

    setDeletingGroupId(group.id);
    confirmDelete.setIsLoading(true);

    try {
      const ok = await deleteGroupFromSupabase(group.name);
      if (!ok) return;

      deleteGroupFromStore(group.id);
      toast.success('Grupo excluído com sucesso (Supabase e UI).');
    } finally {
      setDeletingGroupId(null);
      confirmDelete.setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Meus Grupos</h2>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Grupo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Grupo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Grupo</label>
                <Input
                  placeholder="Ex: Vendas Q4"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !newGroupNameError && handleCreateGroup()}
                  className={newGroupNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {newGroupNameError && (
                  <p className="text-sm text-destructive">{newGroupNameError}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Input
                  placeholder="Descreva o propósito deste grupo..."
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateGroup} className="w-full" disabled={!!newGroupNameError}>
                Criar Grupo
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) setEditingGroupId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Grupo</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome do Grupo</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !editGroupNameError && handleSaveEdit()}
                  autoFocus
                  className={editGroupNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {editGroupNameError && (
                  <p className="text-sm text-destructive">{editGroupNameError}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setEditingGroupId(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={!!editGroupNameError}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-gradient-primary/10 flex items-center justify-center mb-6">
            <FolderOpen className="h-12 w-12 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhum grupo criado</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Crie seu primeiro grupo para organizar seus fluxos de mensagens. Cada grupo pode conter múltiplos fluxos.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Primeiro Grupo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group, index) => (
            <div
              key={group.id}
              onClick={() => onSelectGroup(group)}
              className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/50 
                         transition-all duration-300 cursor-pointer shadow-card hover:shadow-glow
                         animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                  onClick={(e) => openEdit(e, group)}
                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  aria-label="Editar grupo"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  onClick={(e) => handleDeleteGroup(e, group)}
                  disabled={deletingGroupId === group.id}
                  className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors disabled:opacity-50"
                  aria-label="Deletar grupo"
                >
                  {deletingGroupId === group.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="w-12 h-12 rounded-lg bg-gradient-primary/20 flex items-center justify-center mb-4">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>

              <h3 className="text-lg font-semibold mb-1">{group.name}</h3>
              {group.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{group.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{group.flows.length} fluxos</span>
                <span>•</span>
                <span>{new Date(group.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDelete.ConfirmDeleteModalComponent}
    </div>
  );
};
