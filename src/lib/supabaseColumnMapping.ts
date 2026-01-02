import { BubbleData, NodeType, FlowNode } from "@/types/workflow";

export type ColumnKind = "M" | "T";

export const COLUMN_LIMIT = 50;

export function isTimeBubble(type: NodeType) {
  return type === "time";
}

// Note type is visual-only and should be excluded from M#/T# calculations
export function isVisualOnlyBubble(type: NodeType) {
  return type === "note";
}

export function getColumnKindForBubble(type: NodeType): ColumnKind {
  return isTimeBubble(type) ? "T" : "M";
}

export function buildColumn(kind: ColumnKind, index: number) {
  return `${kind}${index}`;
}

export function parseColumn(col: string): { kind: ColumnKind; index: number } | null {
  const m = col.trim().toUpperCase().match(/^([MT])(\d{1,2})$/);
  if (!m) return null;
  const kind = m[1] as ColumnKind;
  const index = Number(m[2]);
  if (!Number.isFinite(index) || index < 1 || index > COLUMN_LIMIT) return null;
  return { kind, index };
}

export function getUsedColumns(bubbles: BubbleData[], kind: ColumnKind): Set<string> {
  const used = new Set<string>();
  for (const b of bubbles) {
    const bKind = getColumnKindForBubble(b.type);
    if (bKind !== kind) continue;

    const col = b.data.supabaseColumn;
    if (!col) continue;

    const parsed = parseColumn(col);
    if (!parsed || parsed.kind !== kind) continue;

    used.add(buildColumn(kind, parsed.index));
  }
  return used;
}

export function suggestNextAvailableColumn(bubbles: BubbleData[], kind: ColumnKind): string | null {
  const used = getUsedColumns(bubbles, kind);
  for (let i = 1; i <= COLUMN_LIMIT; i++) {
    const col = buildColumn(kind, i);
    if (!used.has(col)) return col;
  }
  return null;
}

export function getAllBubblesFromFlowNodes(nodes: FlowNode[]): BubbleData[] {
  const all: BubbleData[] = [];
  for (const n of nodes) {
    if (n.type === "group" && n.data?.bubbles) {
      all.push(...(n.data.bubbles as BubbleData[]));
    }
  }
  return all;
}

export function detectDuplicateColumns(bubbles: BubbleData[]): { column: string; bubbleIds: string[] }[] {
  const map = new Map<string, string[]>();

  for (const b of bubbles) {
    const col = b.data.supabaseColumn?.trim().toUpperCase();
    if (!col) continue;

    const parsed = parseColumn(col);
    if (!parsed) continue;

    const normalized = buildColumn(parsed.kind, parsed.index);
    const arr = map.get(normalized) ?? [];
    arr.push(b.id);
    map.set(normalized, arr);
  }

  return Array.from(map.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([column, bubbleIds]) => ({ column, bubbleIds }));
}

/**
 * Reorganizes M/T columns in a flow after a bubble with a specific column is deleted.
 * This shifts all subsequent columns of the same kind down by one index.
 *
 * @param nodes The array of FlowNodes in the current flow (after the bubble has been removed).
 * @param deletedColumn The column string (e.g., 'M9') that was just deleted.
 * @returns A map of bubble IDs to their new column string, or null if no change is needed.
 */
export function reorganizeColumnsAfterDeletion(
  nodes: FlowNode[],
  deletedColumn: string,
): Map<string, string> | null {
  const deletedParsed = parseColumn(deletedColumn);
  if (!deletedParsed) return null;

  const { kind: deletedKind, index: deletedIndex } = deletedParsed;

  const allBubbles = getAllBubblesFromFlowNodes(nodes);
  const updates = new Map<string, string>();

  for (const bubble of allBubbles) {
    const currentColumn = bubble.data.supabaseColumn;
    if (!currentColumn) continue;

    const parsed = parseColumn(currentColumn);
    if (!parsed) continue;

    // Only reorganize columns of the same kind (M or T) and index greater than the deleted one
    if (parsed.kind === deletedKind && parsed.index > deletedIndex) {
      const newIndex = parsed.index - 1;
      const newColumn = buildColumn(deletedKind, newIndex);
      updates.set(bubble.id, newColumn);
    }
  }

  return updates.size > 0 ? updates : null;
}

/**
 * SIMPLIFIED NORMALIZATION - ÚNICA REGRA:
 * 
 * M# = contador crescente simples (1,2,3...) para todos os cards que NÃO são Tempo
 * T# = contador crescente simples (1,2,3...) para todos os cards do tipo Tempo
 * 
 * Ordem baseada apenas na ordem visual dos cards (top → bottom) dentro de cada grupo,
 * processando grupos na ordem em que aparecem no array nodes.
 * 
 * Para normalização com ordem de grupos, use normalizeColumnsWithGroupOrder().
 */
export function normalizeAllColumns(nodes: FlowNode[]): Map<string, string> | null {
  const updates = new Map<string, string>();

  // Collect all bubbles in order
  const allBubblesInOrder: { bubble: BubbleData; kind: "M" | "T" }[] = [];
  
  for (const node of nodes) {
    if (node.type !== "group") continue;
    const bubbles = (node.data?.bubbles || []) as BubbleData[];
    for (const bubble of bubbles) {
      // Skip visual-only bubbles (notes) - they don't get M#/T# columns
      if (isVisualOnlyBubble(bubble.type)) continue;
      const kind = getColumnKindForBubble(bubble.type);
      allBubblesInOrder.push({ bubble, kind });
    }
  }

  // REGRA ÚNICA: contadores sequenciais simples
  let mCounter = 0;
  let tCounter = 0;
  
  for (const { bubble, kind } of allBubblesInOrder) {
    let nextColumn: string;
    
    if (kind === "M") {
      mCounter += 1;
      nextColumn = buildColumn("M", mCounter);
    } else {
      tCounter += 1;
      nextColumn = buildColumn("T", tCounter);
    }
    
    // Check if update is needed
    const current = bubble.data.supabaseColumn?.trim().toUpperCase();
    const currentParsed = current ? parseColumn(current) : null;
    const currentNormalized = currentParsed ? buildColumn(currentParsed.kind, currentParsed.index) : null;
    
    if (currentNormalized !== nextColumn) {
      updates.set(bubble.id, nextColumn);
    }
  }

  return updates.size > 0 ? updates : null;
}

/**
 * SIMPLIFIED NORMALIZATION - ÚNICA REGRA:
 * 
 * M# = contador crescente simples (1,2,3...) para todos os cards que NÃO são Tempo
 * T# = contador crescente simples (1,2,3...) para todos os cards do tipo Tempo
 * 
 * Ordem baseada APENAS em:
 * 1. Ordem dos grupos (G1 → G2 → G3...)
 * 2. Ordem visual dos cards dentro do grupo (top → bottom)
 * 
 * SEM lógica de "T baseado no M anterior", SEM exceções, SEM regras extras.
 */
export function normalizeColumnsWithGroupOrder(
  nodes: FlowNode[],
  groupOrder: string[]
): Map<string, string> | null {
  const updates = new Map<string, string>();

  // Create a map of nodeId -> node for quick lookup
  const nodeMap = new Map<string, FlowNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Collect all bubbles in GROUP ORDER (G1 cards first, then G2, then G3...)
  const allBubblesInOrder: { bubble: BubbleData; kind: "M" | "T" }[] = [];
  
  // First: process groups in the specified order
  for (const groupId of groupOrder) {
    const node = nodeMap.get(groupId);
    if (!node || node.type !== "group") continue;
    
    const bubbles = (node.data?.bubbles || []) as BubbleData[];
    for (const bubble of bubbles) {
      // Skip visual-only bubbles (notes) - they don't get M#/T# columns
      if (isVisualOnlyBubble(bubble.type)) continue;
      const kind = getColumnKindForBubble(bubble.type);
      allBubblesInOrder.push({ bubble, kind });
    }
    nodeMap.delete(groupId); // Mark as processed
  }

  // Then: process any remaining groups (not in groupOrder - shouldn't happen normally)
  for (const [, node] of nodeMap) {
    if (node.type !== "group") continue;
    const bubbles = (node.data?.bubbles || []) as BubbleData[];
    for (const bubble of bubbles) {
      // Skip visual-only bubbles (notes) - they don't get M#/T# columns
      if (isVisualOnlyBubble(bubble.type)) continue;
      const kind = getColumnKindForBubble(bubble.type);
      allBubblesInOrder.push({ bubble, kind });
    }
  }

  // REGRA ÚNICA: contadores sequenciais simples
  let mCounter = 0;
  let tCounter = 0;
  
  for (const { bubble, kind } of allBubblesInOrder) {
    let nextColumn: string;
    
    if (kind === "M") {
      mCounter += 1;
      nextColumn = buildColumn("M", mCounter);
    } else {
      tCounter += 1;
      nextColumn = buildColumn("T", tCounter);
    }
    
    // Check if update is needed
    const current = bubble.data.supabaseColumn?.trim().toUpperCase();
    const currentParsed = current ? parseColumn(current) : null;
    const currentNormalized = currentParsed ? buildColumn(currentParsed.kind, currentParsed.index) : null;
    
    if (currentNormalized !== nextColumn) {
      updates.set(bubble.id, nextColumn);
    }
  }

  return updates.size > 0 ? updates : null;
}
