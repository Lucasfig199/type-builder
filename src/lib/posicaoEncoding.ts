/**
 * POSICAO Encoding/Decoding Utilities
 * 
 * V2 Format: Compact JSON with stable column references and exact order
 * {
 *   "v": 2,
 *   "vp": [panX, panY, zoom],                          // viewport (optional)
 *   "go": ["groupId1", "groupId2", ...],               // group order (exact render order)
 *   "g": {                                              // groups data
 *     "groupId1": [x, y, "title", ["M1", "M2", "T1", ...]], // uses COLUMN names, not bubble IDs
 *     "groupId2": [x, y, "title", ["M3", "T2", "M4", ...]]
 *   },
 *   "e": [["sourceGroupId", "targetGroupId"], ...]     // edges between groups
 * }
 * 
 * KEY INSIGHT: We use supabaseColumn (M1, M2, T1, etc.) instead of bubble IDs
 * because bubble IDs are regenerated on each fetch, but columns are stable.
 * 
 * V1 Legacy Format: v1|g:GroupName@x,y{M1,M2,T1};g:Group2@x,y{M3,M4}
 */

import type { FlowNode, BubbleData, FlowEdge } from "@/types/workflow";

const VERSION_2 = 2;
const VERSION_1_PREFIX = "v1";

// ============ V2 Types ============

export interface PosicaoV2 {
  v: 2;
  vp?: [number, number, number]; // [panX, panY, zoom]
  sn?: [number, number]; // start-node position [x, y]
  go: string[]; // group order (array of group IDs in exact visual order)
  g: Record<string, [number, number, string, string[]]>; // groupId -> [x, y, title, columnNames[]]
  e?: [string, string][]; // ALL edges including start-node connections: [source, target][]
  // Standalone note nodes: noteId -> [x, y, w, h, noteDataJSON]
  n?: Record<string, [number, number, number, number, string]>;
}

export interface ParsedGroupV2 {
  groupId: string;
  x: number;
  y: number;
  title: string;
  columns: string[]; // supabase column names (M1, M2, T1, etc.) in exact order
}

export interface ParsedLayoutV2 {
  version: 2;
  viewport?: { x: number; y: number; zoom: number };
  startNodePosition?: { x: number; y: number };
  groups: ParsedGroupV2[];
  edges: { source: string; target: string }[]; // ALL edges including start-node connections
  // Standalone note nodes
  notes?: { id: string; x: number; y: number; width: number; height: number; noteData: any }[];
}

// ============ V1 Legacy Types ============

export interface ParsedGroup {
  label: string;
  x?: number;
  y?: number;
  bubbleColumns: string[]; // e.g., ["M1", "M2", "T1"]
}

// ============ V2 Encoding ============

/**
 * Encode canvas state into POSICAO v2 JSON string (minified)
 * Uses supabaseColumn (M1, M2, etc.) as stable identifiers instead of bubble IDs
 */
export function encodePosicaoV2(
  nodes: FlowNode[],
  edges: FlowEdge[],
  viewport?: { x: number; y: number; zoom: number }
): string {
  const groupNodes = nodes.filter((n) => n.type === "group");
  const startNode = nodes.find((n) => n.type === "start");
  
  // Note: Notes are now saved in BLK column, NOT in POSICAO
  if (groupNodes.length === 0) return "";

  const posicao: PosicaoV2 = {
    v: VERSION_2,
    go: [],
    g: {},
  };

  // Add viewport if provided
  if (viewport) {
    posicao.vp = [
      Math.round(viewport.x * 100) / 100,
      Math.round(viewport.y * 100) / 100,
      Math.round(viewport.zoom * 100) / 100,
    ];
  }

  // Save start-node position
  if (startNode) {
    posicao.sn = [
      Math.round(startNode.position.x),
      Math.round(startNode.position.y),
    ];
  }

  // Preserve the exact order of groups
  for (const node of groupNodes) {
    const groupId = node.id;
    const x = Math.round(node.position.x);
    const y = Math.round(node.position.y);
    const title = node.data.label || "Group";
    
    const bubbles: BubbleData[] = node.data.bubbles || [];
    const columns = bubbles
      .map((b) => b.data.supabaseColumn?.toUpperCase())
      .filter((col): col is string => !!col);

    posicao.go.push(groupId);
    posicao.g[groupId] = [x, y, title, columns];
  }

  // Note: Notes are now saved in BLK column, NOT in POSICAO

  // Save ALL edges
  const validNodeIds = new Set<string>();
  validNodeIds.add("start-node");
  groupNodes.forEach((n) => validNodeIds.add(n.id));

  const validEdges = edges.filter((e) => {
    return validNodeIds.has(e.source) && validNodeIds.has(e.target);
  });

  posicao.e = validEdges.map((e) => [e.source, e.target]);

  return JSON.stringify(posicao);
}

/**
 * Legacy: Encode canvas state into POSICAO v1 string format
 * @deprecated Use encodePosicaoV2 instead
 */
export function encodePosicao(nodes: FlowNode[]): string {
  const groupNodes = nodes.filter((n) => n.type === "group");

  if (groupNodes.length === 0) return "";

  const groupParts = groupNodes.map((node) => {
    const label = node.data.label || "Group";
    const x = Math.round(node.position.x);
    const y = Math.round(node.position.y);
    
    // Get bubble columns in order
    const bubbles: BubbleData[] = node.data.bubbles || [];
    const columns = bubbles
      .map((b) => b.data.supabaseColumn?.toUpperCase())
      .filter((col): col is string => !!col);
    
    // Escape special characters in label (replace : ; @ { } with _)
    const safeLabel = label.replace(/[:;@{}]/g, "_");
    
    return `g:${safeLabel}@${x},${y}{${columns.join(",")}}`;
  });

  return `${VERSION_1_PREFIX}|${groupParts.join(";")}`;
}

// ============ V2 Parsing ============

/**
 * Parse POSICAO string - auto-detects v1 or v2
 */
export function parsePosicaoAuto(posicao: string | null | undefined): ParsedLayoutV2 | ParsedGroup[] | null {
  if (!posicao || typeof posicao !== "string") return null;

  const trimmed = posicao.trim();
  
  // Try V2 JSON first
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as PosicaoV2;
      if (parsed.v === 2) {
        return parsePosicaoV2(parsed);
      }
    } catch {
      // Not valid JSON, fall through to v1
    }
  }

  // Try V1 legacy format
  if (trimmed.startsWith(`${VERSION_1_PREFIX}|`)) {
    return parsePosicao(trimmed);
  }

  return null;
}

/**
 * Parse V2 JSON structure into layout data
 */
export function parsePosicaoV2(data: PosicaoV2): ParsedLayoutV2 {
  const result: ParsedLayoutV2 = {
    version: 2,
    groups: [],
    edges: [],
    notes: [],
  };

  // Parse viewport
  if (data.vp && Array.isArray(data.vp) && data.vp.length >= 3) {
    result.viewport = {
      x: data.vp[0],
      y: data.vp[1],
      zoom: data.vp[2],
    };
  }

  // Parse start-node position
  if (data.sn && Array.isArray(data.sn) && data.sn.length >= 2) {
    result.startNodePosition = {
      x: data.sn[0],
      y: data.sn[1],
    };
  }

  // Parse groups in the EXACT order specified by `go`
  if (Array.isArray(data.go)) {
    for (const groupId of data.go) {
      const groupData = data.g?.[groupId];
      if (groupData && Array.isArray(groupData) && groupData.length >= 4) {
        result.groups.push({
          groupId,
          x: groupData[0],
          y: groupData[1],
          title: groupData[2],
          columns: groupData[3] || [],
        });
      }
    }
  }

  // Parse ALL edges - NO inference, exact restoration
  if (Array.isArray(data.e)) {
    for (const edge of data.e) {
      if (Array.isArray(edge) && edge.length >= 2) {
        result.edges.push({
          source: edge[0],
          target: edge[1],
        });
      }
    }
  }

  // Parse standalone note nodes
  if (data.n && typeof data.n === "object") {
    for (const [noteId, noteArr] of Object.entries(data.n)) {
      if (Array.isArray(noteArr) && noteArr.length >= 5) {
        let noteData = {};
        try {
          noteData = JSON.parse(noteArr[4]);
        } catch {}
        result.notes!.push({
          id: noteId,
          x: noteArr[0],
          y: noteArr[1],
          width: noteArr[2],
          height: noteArr[3],
          noteData,
        });
      }
    }
  }

  return result;
}

/**
 * Parse V1 legacy POSICAO string into structured data
 */
export function parsePosicao(posicao: string | null | undefined): ParsedGroup[] | null {
  if (!posicao || typeof posicao !== "string") return null;

  const trimmed = posicao.trim();
  if (!trimmed.startsWith(`${VERSION_1_PREFIX}|`)) return null;

  const content = trimmed.slice(VERSION_1_PREFIX.length + 1);
  if (!content) return null;

  const groups: ParsedGroup[] = [];

  // Split by ; but be careful with nested content
  const groupStrings = content.split(";").filter((s) => s.trim());

  for (const groupStr of groupStrings) {
    const parsed = parseGroupString(groupStr.trim());
    if (parsed) {
      groups.push(parsed);
    }
  }

  return groups.length > 0 ? groups : null;
}

function parseGroupString(str: string): ParsedGroup | null {
  // Format: g:GroupName@x,y{M1,M2,T1}
  if (!str.startsWith("g:")) return null;

  const afterG = str.slice(2);

  // Find @ position for coordinates
  const atIndex = afterG.indexOf("@");
  // Find { position for columns
  const braceStart = afterG.indexOf("{");
  const braceEnd = afterG.lastIndexOf("}");

  let label: string;
  let x: number | undefined;
  let y: number | undefined;
  let bubbleColumns: string[] = [];

  if (atIndex === -1 && braceStart === -1) {
    // Simple format: g:GroupName
    label = afterG;
  } else if (atIndex !== -1 && braceStart !== -1) {
    // Full format: g:GroupName@x,y{M1,M2}
    label = afterG.slice(0, atIndex);
    const coordPart = afterG.slice(atIndex + 1, braceStart);
    const [xStr, yStr] = coordPart.split(",");
    x = parseInt(xStr, 10);
    y = parseInt(yStr, 10);
    if (isNaN(x)) x = undefined;
    if (isNaN(y)) y = undefined;

    if (braceEnd > braceStart) {
      const columnsPart = afterG.slice(braceStart + 1, braceEnd);
      bubbleColumns = columnsPart.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    }
  } else if (atIndex === -1 && braceStart !== -1) {
    // Format without coords: g:GroupName{M1,M2}
    label = afterG.slice(0, braceStart);
    if (braceEnd > braceStart) {
      const columnsPart = afterG.slice(braceStart + 1, braceEnd);
      bubbleColumns = columnsPart.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    }
  } else {
    // Format with coords but no braces: g:GroupName@x,y
    label = afterG.slice(0, atIndex);
    const coordPart = afterG.slice(atIndex + 1);
    const [xStr, yStr] = coordPart.split(",");
    x = parseInt(xStr, 10);
    y = parseInt(yStr, 10);
    if (isNaN(x)) x = undefined;
    if (isNaN(y)) y = undefined;
  }

  return {
    label: label || "Group",
    x,
    y,
    bubbleColumns,
  };
}

// ============ Distribution Helpers ============

/**
 * Distribute bubbles into groups based on V2 layout (by COLUMN, preserving exact order)
 * This matches bubbles to groups using supabaseColumn (M1, M2, T1, etc.)
 */
export function distributeBubblesByPosicaoV2(
  bubbles: BubbleData[],
  layout: ParsedLayoutV2
): { groupId: string; x: number; y: number; title: string; bubbles: BubbleData[] }[] {
  // Create a map of COLUMN -> bubble for quick lookup
  // Column names are stable across sessions (M1, M2, T1, etc.)
  const bubbleByColumn = new Map<string, BubbleData>();
  for (const b of bubbles) {
    const col = b.data.supabaseColumn?.toUpperCase();
    if (col) {
      bubbleByColumn.set(col, b);
    }
  }

  const result: { groupId: string; x: number; y: number; title: string; bubbles: BubbleData[] }[] = [];
  const assignedColumns = new Set<string>();

  // Process groups in the EXACT order from layout.groups (which came from `go`)
  for (const pg of layout.groups) {
    const groupBubbles: BubbleData[] = [];

    // Add bubbles in the EXACT order specified by columns array
    for (const col of pg.columns) {
      const bubble = bubbleByColumn.get(col);
      if (bubble) {
        groupBubbles.push(bubble);
        assignedColumns.add(col);
      }
    }

    result.push({
      groupId: pg.groupId,
      x: pg.x,
      y: pg.y,
      title: pg.title,
      bubbles: groupBubbles,
    });
  }

  // Handle any unassigned bubbles (new columns added after last publish)
  // Append them to the last group or create a new group
  const unassignedBubbles: BubbleData[] = [];
  for (const b of bubbles) {
    const col = b.data.supabaseColumn?.toUpperCase();
    if (col && !assignedColumns.has(col)) {
      unassignedBubbles.push(b);
    }
  }

  if (unassignedBubbles.length > 0) {
    if (result.length > 0) {
      // Add to last group
      result[result.length - 1].bubbles.push(...unassignedBubbles);
    } else {
      // No groups exist, create default
      result.push({
        groupId: `fallback-${Date.now()}`,
        x: 250,
        y: 50,
        title: "Etapas",
        bubbles: unassignedBubbles,
      });
    }
  }

  return result;
}

/**
 * Distribute bubbles into groups based on V1 POSICAO (by column name)
 * @deprecated Use distributeBubblesByPosicaoV2 for v2 format
 */
export function distributeBubblesByPosicao(
  bubbles: BubbleData[],
  posicaoGroups: ParsedGroup[]
): { groupLabel: string; x?: number; y?: number; bubbles: BubbleData[] }[] {
  // Create a map of column -> bubble for quick lookup
  const bubbleByColumn = new Map<string, BubbleData>();
  for (const b of bubbles) {
    const col = b.data.supabaseColumn?.toUpperCase();
    if (col) {
      bubbleByColumn.set(col, b);
    }
  }

  const result: { groupLabel: string; x?: number; y?: number; bubbles: BubbleData[] }[] = [];
  const assignedColumns = new Set<string>();

  for (const pg of posicaoGroups) {
    const groupBubbles: BubbleData[] = [];

    for (const col of pg.bubbleColumns) {
      const bubble = bubbleByColumn.get(col);
      if (bubble) {
        groupBubbles.push(bubble);
        assignedColumns.add(col);
      }
    }

    result.push({
      groupLabel: pg.label,
      x: pg.x,
      y: pg.y,
      bubbles: groupBubbles,
    });
  }

  // Handle any unassigned bubbles (put in first group or create new one)
  const unassignedBubbles: BubbleData[] = [];
  for (const b of bubbles) {
    const col = b.data.supabaseColumn?.toUpperCase();
    if (col && !assignedColumns.has(col)) {
      unassignedBubbles.push(b);
    }
  }

  if (unassignedBubbles.length > 0) {
    if (result.length > 0) {
      // Add to first group
      result[0].bubbles.push(...unassignedBubbles);
    } else {
      // Create a default group
      result.push({
        groupLabel: "Etapas",
        bubbles: unassignedBubbles,
      });
    }
  }

  return result;
}

/**
 * Check if a POSICAO string is v2 format
 */
export function isPosicaoV2(posicao: string | null | undefined): boolean {
  if (!posicao || typeof posicao !== "string") return false;
  const trimmed = posicao.trim();
  if (!trimmed.startsWith("{")) return false;
  
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.v === 2;
  } catch {
    return false;
  }
}
