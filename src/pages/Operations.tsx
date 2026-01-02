import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOperationsStore } from "@/store/operationsStore";

export default function Operations() {
  const navigate = useNavigate();
  const { operations, createOperation, updateOperation, deleteOperation, setCurrentOperation } = useOperationsStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingOp = useMemo(
    () => (editingId ? operations.find((o) => o.id === editingId) ?? null : null),
    [editingId, operations],
  );

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const openEdit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const op = operations.find((o) => o.id === id);
    if (!op) return;
    setEditingId(id);
    setEditName(op.name);
    setEditDesc(op.description || "");
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editingOp) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Digite um nome para a operação");
      return;
    }
    updateOperation(editingOp.id, { name, description: editDesc.trim() || undefined });
    toast.success("Operação atualizada!");
    setEditOpen(false);
    setEditingId(null);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Digite um nome para a operação");
      return;
    }
    createOperation(name, newDesc.trim() || undefined);
    setNewName("");
    setNewDesc("");
    setCreateOpen(false);
    toast.success("Operação criada!");
  };

  const openOperation = (id: string) => {
    setCurrentOperation(id);
    navigate(`/op/${id}`);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteOperation(id);
    toast.success("Operação deletada");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-glow pointer-events-none" />

      <header className="relative border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">Type Builder</h1>
              <p className="text-xs text-muted-foreground">Menu de Operações</p>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Operação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Operação</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      placeholder="Ex: Operação Black Friday"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descrição (opcional)</label>
                    <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Detalhes da operação..." />
                  </div>

                  <Button onClick={handleCreate} className="w-full">
                    Criar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={editOpen}
              onOpenChange={(v) => {
                setEditOpen(v);
                if (!v) setEditingId(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar Operação</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descrição (opcional)</label>
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditOpen(false);
                      setEditingId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={saveEdit}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="relative container mx-auto px-6 py-8">
        {operations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-24 h-24 rounded-full bg-gradient-primary/10 flex items-center justify-center mb-6">
              <FolderOpen className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Nenhuma operação criada</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Crie uma operação para organizar grupos e fluxos, com Supabase separado por operação.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Primeira Operação
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {operations.map((op, index) => (
              <div
                key={op.id}
                onClick={() => openOperation(op.id)}
                className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/50 
                           transition-all duration-300 cursor-pointer shadow-card hover:shadow-glow
                           animate-slide-up"
                style={{ animationDelay: `${index * 0.08}s` }}
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button
                    onClick={(e) => openEdit(e, op.id)}
                    className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    aria-label="Editar operação"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    onClick={(e) => handleDelete(e, op.id)}
                    className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                    aria-label="Deletar operação"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="w-12 h-12 rounded-lg bg-gradient-primary/20 flex items-center justify-center mb-4">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>

                <h3 className="text-lg font-semibold mb-1">{op.name}</h3>
                {op.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{op.description}</p>}

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{op.groups.length} grupos</span>
                  <span>•</span>
                  <span>{new Date(op.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
}