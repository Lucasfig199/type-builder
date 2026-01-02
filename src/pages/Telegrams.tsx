import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, RefreshCw, Trash2, X, ChevronDown, Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useOperationsStore } from "@/store/operationsStore";

type TelegramRow = {
  id: string;
  telegramId: string;
  nameFallback: string;
  status: string;
  copys: string[];
  raw: Record<string, any>;
};

const TABLE_NAME = "TELEGRAM_MACRO";

function normalizeCopyToken(v: string) {
  return v.trim();
}

function parseCopyCell(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((x) => normalizeCopyToken(x))
    .filter(Boolean);
}

function serializeCopyCell(copys: string[]) {
  const uniq = Array.from(new Set(copys.map((c) => normalizeCopyToken(c)).filter(Boolean)));
  return uniq.join(", ");
}

export default function Telegrams() {
  const navigate = useNavigate();
  const { operationId } = useParams();
  const { operations } = useOperationsStore();

  const operation = useMemo(
    () => operations.find((o) => o.id === operationId) ?? null,
    [operations, operationId],
  );

  const groupOptions = useMemo(() => {
    return operation?.groups.map((g) => g.name).filter(Boolean) ?? [];
  }, [operation]);

  const supabaseConfig = operation?.supabaseConfig;

  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<TelegramRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("__ALL__");

  const [selectedCopies, setSelectedCopies] = useState<string[]>([]);
  const [copiesOpen, setCopiesOpen] = useState(false);

  const canFetch = !!supabaseConfig?.isConnected && !!supabaseConfig?.url && !!supabaseConfig?.anonKey;

  const fetchTelegrams = useCallback(async () => {
    if (!operation) return;
    if (!canFetch) {
      toast.error("Conecte o Supabase desta operação antes de abrir TELEGRANS.");
      return;
    }

    setIsLoading(true);
    try {
      const url = `${supabaseConfig!.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?select=*`;
      const res = await fetch(url, {
        headers: {
          apikey: supabaseConfig!.anonKey,
          Authorization: `Bearer ${supabaseConfig!.anonKey}`,
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          toast.error(`Tabela ${TABLE_NAME} não foi encontrada`);
          return;
        }
        toast.error(`Erro ao buscar TELEGRANS (HTTP ${res.status})`);
        return;
      }

      const data = (await res.json()) as any[];

      const mapped: TelegramRow[] = data.map((r, idx) => {
        const telegramId =
          String(
            r["TELEGRAM-ID"] ??
              r.TELEGRAM_ID ??
              r["TELEGRAM_ID"] ??
              r["telegram-id"] ??
              r.telegram_id ??
              r.telegramId ??
              "",
          ).trim();

        const nameFallback = String(
          r.NOME ?? r.NAME ?? r.nome ?? r.name ?? r.ID ?? r.id ?? `telegram-${idx + 1}`,
        );

        const statusRaw =
          r["LIVRE_OCUPADO"] ??
          r.LIVRE_OCUPADO ??
          r["LIVRE-OCUPADO"] ??
          r["LIVRE OCUPADO"] ??
          r.STATUS ??
          r.status ??
          "";
        const status = String(statusRaw).trim() || "—";

        const copys = parseCopyCell(r.COPY ?? r.copy);

        const internalId = String(r.id ?? r.ID ?? r.uuid ?? r.UUID ?? nameFallback);

        return {
          id: internalId,
          telegramId: telegramId || nameFallback,
          nameFallback,
          status,
          copys,
          raw: r,
        };
      });

      setRows(mapped);
      setSelectedIds(new Set());
      lastClickedIndexRef.current = null;
    } finally {
      setIsLoading(false);
    }
  }, [operation, canFetch, supabaseConfig]);

  useEffect(() => {
    fetchTelegrams();
  }, [fetchTelegrams]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.status);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "__ALL__") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const allVisibleSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    return filteredRows.every((r) => selectedIds.has(r.id));
  }, [filteredRows, selectedIds]);

  const toggleRow = (rowId: string, indexInFiltered: number, isShift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (!isShift || lastClickedIndexRef.current === null) {
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        lastClickedIndexRef.current = indexInFiltered;
        return next;
      }

      const start = Math.min(lastClickedIndexRef.current, indexInFiltered);
      const end = Math.max(lastClickedIndexRef.current, indexInFiltered);

      const shouldSelect = !next.has(rowId);
      for (let i = start; i <= end; i++) {
        const id = filteredRows[i]?.id;
        if (!id) continue;
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }

      lastClickedIndexRef.current = indexInFiltered;
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldSelectAll = !allVisibleSelected;
      for (const r of filteredRows) {
        if (shouldSelectAll) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };

  const copyUsage = useMemo(() => {
    const total = rows.length;
    if (total === 0) return { entries: [], noCopyCount: 0, noCopyPercent: 0, total: 0 };

    const map = new Map<string, number>();
    let noCopyCount = 0;

    for (const r of rows) {
      if (r.copys.length === 0) {
        noCopyCount++;
      }
      for (const c of r.copys) {
        map.set(c, (map.get(c) ?? 0) + 1);
      }
    }

    const entries = Array.from(map.entries()).map(([copy, count]) => ({
      copy,
      percent: Math.round((count / total) * 100),
      count,
    }));

    entries.sort((a, b) => b.percent - a.percent || a.copy.localeCompare(b.copy));

    return {
      entries,
      noCopyCount,
      noCopyPercent: Math.round((noCopyCount / total) * 100),
      total,
    };
  }, [rows]);

  const handleAddCopy = useCallback(async () => {
    if (!operation) return;
    if (!canFetch) {
      toast.error("Conecte o Supabase desta operação primeiro.");
      return;
    }

    if (selectedCopies.length === 0) {
      toast.error("Selecione pelo menos uma COPY para aplicar.");
      return;
    }

    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos um Telegram");
      return;
    }

    const selected = rows.filter((r) => selectedIds.has(r.id));
    setIsLoading(true);

    try {
      for (const r of selected) {
        const nextCopys = Array.from(
          new Set(
            [...(r.copys || []), ...selectedCopies]
              .map((c) => normalizeCopyToken(c))
              .filter(Boolean),
          ),
        );
        const body = { COPY: serializeCopyCell(nextCopys) };

        const url = `${supabaseConfig!.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?id=eq.${encodeURIComponent(
          r.id,
        )}`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig!.anonKey,
            Authorization: `Bearer ${supabaseConfig!.anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          toast.error(`Falhou ao atualizar ${r.telegramId} (HTTP ${res.status})`);
          return;
        }
      }

      toast.success(`COPY(s) adicionada(s) em ${selected.length} Telegram(s)`);
      setCopiesOpen(false);
      await fetchTelegrams();
    } finally {
      setIsLoading(false);
    }
  }, [operation, canFetch, selectedCopies, rows, selectedIds, supabaseConfig, fetchTelegrams]);

  const handleRemoveCopySingle = useCallback(
    async (rowId: string, copyToRemove: string) => {
      if (!operation) return;
      if (!canFetch) {
        toast.error("Conecte o Supabase desta operação primeiro.");
        return;
      }

      const row = rows.find((r) => r.id === rowId);
      if (!row) return;

      const nextCopys = (row.copys || []).filter((c) => normalizeCopyToken(c) !== normalizeCopyToken(copyToRemove));
      const body = nextCopys.length > 0 ? { COPY: serializeCopyCell(nextCopys) } : { COPY: null };

      setIsLoading(true);
      try {
        const url = `${supabaseConfig!.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?id=eq.${encodeURIComponent(rowId)}`;
        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig!.anonKey,
            Authorization: `Bearer ${supabaseConfig!.anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          toast.error(`Falhou ao remover COPY de ${row.telegramId} (HTTP ${res.status})`);
          return;
        }

        toast.success(`COPY "${copyToRemove}" removida de ${row.telegramId}`);
        await fetchTelegrams();
      } finally {
        setIsLoading(false);
      }
    },
    [operation, canFetch, rows, supabaseConfig, fetchTelegrams],
  );

  const handleRemoveCopyBulk = useCallback(async () => {
    if (!operation) return;
    if (!canFetch) {
      toast.error("Conecte o Supabase desta operação primeiro.");
      return;
    }

    if (selectedCopies.length === 0) {
      toast.error("Selecione pelo menos uma COPY para remover.");
      return;
    }

    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos um Telegram");
      return;
    }

    const selected = rows.filter((r) => selectedIds.has(r.id));
    setIsLoading(true);

    try {
      for (const r of selected) {
        const nextCopys = (r.copys || []).filter((c) => !selectedCopies.includes(normalizeCopyToken(c)));
        const body = nextCopys.length > 0 ? { COPY: serializeCopyCell(nextCopys) } : { COPY: null };

        const url = `${supabaseConfig!.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?id=eq.${encodeURIComponent(
          r.id,
        )}`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig!.anonKey,
            Authorization: `Bearer ${supabaseConfig!.anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          toast.error(`Falhou ao atualizar ${r.telegramId} (HTTP ${res.status})`);
          return;
        }
      }

      toast.success(`COPY(s) removida(s) de ${selected.length} Telegram(s)`);
      setCopiesOpen(false);
      await fetchTelegrams();
    } finally {
      setIsLoading(false);
    }
  }, [operation, canFetch, selectedCopies, selectedIds, rows, supabaseConfig, fetchTelegrams]);

  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  const handleClearAllCopys = useCallback(async () => {
    if (!operation) return;
    if (!canFetch) {
      toast.error("Conecte o Supabase desta operação primeiro.");
      return;
    }

    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos um Telegram");
      return;
    }

    const selected = rows.filter((r) => selectedIds.has(r.id));
    setIsLoading(true);
    setShowClearAllDialog(false);

    try {
      for (const r of selected) {
        const url = `${supabaseConfig!.url}/rest/v1/${encodeURIComponent(TABLE_NAME)}?id=eq.${encodeURIComponent(r.id)}`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig!.anonKey,
            Authorization: `Bearer ${supabaseConfig!.anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ COPY: null }),
        });

        if (!res.ok) {
          toast.error(`Falhou ao limpar ${r.telegramId} (HTTP ${res.status})`);
          await fetchTelegrams();
          return;
        }
      }

      toast.success(`COPYs limpas com sucesso de ${selected.length} Telegram(s)`);
      await fetchTelegrams();
    } catch (err) {
      toast.error("Erro ao limpar COPYs");
      await fetchTelegrams();
    } finally {
      setIsLoading(false);
    }
  }, [operation, canFetch, selectedIds, rows, supabaseConfig, fetchTelegrams]);

  if (!operation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Operação não encontrada</h1>
          <Button onClick={() => navigate("/")}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-glow pointer-events-none" />

      <header className="relative border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/op/${operation.id}`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl font-bold truncate">TELEGRANS</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {operation.name} • {rows.length} Telegram(s)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={fetchTelegrams} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </Button>

              <div className="flex items-center gap-2">
                <Popover open={copiesOpen} onOpenChange={setCopiesOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border/60 bg-background/40 text-sm hover:bg-background/60"
                    >
                      <span className="max-w-[240px] truncate">
                        {selectedCopies.length === 0 ? "Selecionar COPYs" : selectedCopies.join(", ")}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-80" />
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    align="end"
                    side="bottom"
                    className="w-64 p-3 z-[100]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 text-xs text-muted-foreground">Copys / Grupos da operação</div>

                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                      {groupOptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Nenhum grupo encontrado</div>
                      ) : (
                        groupOptions.map((g) => {
                          const checked = selectedCopies.includes(g);
                          return (
                            <button
                              key={g}
                              type="button"
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-background/40 text-left"
                              onClick={() => {
                                setSelectedCopies((prev) => {
                                  if (prev.includes(g)) return prev.filter((x) => x !== g);
                                  return [...prev, g];
                                });
                              }}
                            >
                              <Checkbox checked={checked} />
                              <span className="text-sm truncate">{g}</span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-3 flex justify-between gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded-md text-sm text-muted-foreground border border-border/40"
                        onClick={() => setSelectedCopies([])}
                      >
                        Limpar
                      </button>

                      <button
                        type="button"
                        className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-sm"
                        onClick={() => setCopiesOpen(false)}
                      >
                        Fechar
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button size="sm" className="gap-2" onClick={handleAddCopy} disabled={isLoading || selectedCopies.length === 0}>
                  <Plus className="h-4 w-4" />
                  Adicionar COPY
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleRemoveCopyBulk}
                  disabled={isLoading || selectedCopies.length === 0 || selectedIds.size === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Remover COPY
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowClearAllDialog(true)}
                  disabled={isLoading || selectedIds.size === 0}
                >
                  <Eraser className="h-4 w-4" />
                  Limpar Tudo
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filtro:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Mostrar todos</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={toggleSelectAllVisible} disabled={filteredRows.length === 0}>
                {allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
              </Button>

              <span className="text-sm text-muted-foreground">{selectedCount} selecionado(s)</span>
            </div>

            {!canFetch && (
              <span className="text-sm text-destructive">Conecte o Supabase desta operação para carregar TELEGRAM_MACRO.</span>
            )}
          </div>
        </div>
      </header>

      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar COPYs</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que quer apagar a COPY de todos os {selectedIds.size} telegram(s) selecionado(s)? Isso vai deixar a coluna COPY vazia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllCopys}>Sim, limpar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="relative container mx-auto px-6 py-6 space-y-6">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Cobertura por COPY (um telegram pode ter mais de uma COPY)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {copyUsage.total === 0 ? (
              <div className="col-span-full text-sm text-muted-foreground">Nenhum telegram carregado.</div>
            ) : (
              <>
                {copyUsage.entries.map((c) => (
                  <div
                    key={c.copy}
                    className="p-4 rounded-xl bg-card border border-border shadow-card hover:border-primary/40 transition-colors text-center"
                  >
                    <div className="text-base font-bold truncate">{c.copy}</div>
                    <div className="mt-2 text-2xl font-bold">{c.percent}%</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {c.count}/{copyUsage.total}
                    </div>
                  </div>
                ))}
                {copyUsage.noCopyCount > 0 && (
                  <div
                    className="p-4 rounded-xl bg-card border border-border shadow-card hover:border-destructive/40 transition-colors text-center"
                  >
                    <div className="text-base font-bold truncate text-muted-foreground">SEM COPY</div>
                    <div className="mt-2 text-2xl font-bold">{copyUsage.noCopyPercent}%</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {copyUsage.noCopyCount}/{copyUsage.total}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <div className="grid grid-cols-[44px_1fr_160px_1.5fr] gap-3 px-4 py-3 border-b border-border text-xs text-muted-foreground">
            <div className="flex items-center justify-center">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAllVisible} />
            </div>
            <div>Telegram (TELEGRAM-ID)</div>
            <div>Status</div>
            <div>COPYs</div>
          </div>

          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-muted-foreground">Nenhum Telegram para exibir.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredRows.map((r, i) => {
                const checked = selectedIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[44px_1fr_160px_1.5fr] gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
                    onClick={(e) => {
                      const isShift = (e as any).shiftKey === true;
                      toggleRow(r.id, i, isShift);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        toggleRow(r.id, i, (e as any).shiftKey === true);
                      }
                    }}
                  >
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleRow(r.id, i, false)} />
                    </div>

                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.telegramId}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.nameFallback}</div>
                    </div>

                    <div className="flex items-center">
                      <Badge variant="outline" className="bg-background/40">
                        {r.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.copys.length === 0 ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        r.copys.map((c) => (
                          <span
                            key={`${r.id}-${c}`}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-foreground border border-border"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-sm">{c}</span>
                            <button
                              type="button"
                              className="ml-1 inline-flex items-center justify-center rounded-full p-1 hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLoading) handleRemoveCopySingle(r.id, c);
                              }}
                              aria-label={`Remover ${c}`}
                              title={`Remover ${c}`}
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}