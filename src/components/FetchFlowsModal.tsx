import { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Loader2,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useOperationsStore } from "@/store/operationsStore";
import { v4 as uuidv4 } from "uuid";
import type { Group, Flow, FlowNode, BubbleData, NodeType, TimeMessageRule, TimeMediaRule } from "@/types/workflow";
import { NODE_LABELS } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { 
  parsePosicaoAuto, 
  distributeBubblesByPosicao, 
  distributeBubblesByPosicaoV2,
  isPosicaoV2,
  type ParsedLayoutV2,
  type ParsedGroup 
} from "@/lib/posicaoEncoding";
import { decodeBlk, blkNotesToFlowNodes } from "@/lib/blkEncoding";

const TABLE_NAME = "TYPE_BUILDER";

interface SupabaseRow {
  id: number;
  GRUPO: string;
  FLUXO: string;
  POSICAO?: string | null;
  BLK?: string | null; // Notes column
  [key: string]: unknown; // M1..M50, T1..T50
}

interface ParsedFlow {
  grupo: string;
  fluxo: string;
  bubbles: BubbleData[];
  stepCount: number;
  preview: string[];
  posicao?: string | null; // Store raw POSICAO for later use
  blk?: string | null; // Notes data
}

interface GroupedFlows {
  [grupo: string]: ParsedFlow[];
}

interface FetchFlowsModalProps {
  operationId: string;
  disabled?: boolean;
}

// Parse column value to determine bubble type and data
function parseColumnValue(value: string, columnName: string): BubbleData | null {
  if (!value || typeof value !== "string") return null;

  const val = value.trim();
  if (!val) return null;

  let type: NodeType = "message";
  let data: BubbleData["data"] = { label: "", supabaseColumn: columnName.toUpperCase() };

  // Detect prefix and parse - CRITICAL: Check longer prefixes FIRST to avoid false matches
  // Order matters: FT-C-T- must be checked before FT-C-, VD-C-T- before VD-C-, etc.
  
  if (val.startsWith("MSG-UTM-")) {
    type = "message-utm";
    const content = val.slice(8);
    const parts = content.split(" ");
    data.label = NODE_LABELS["message-utm"];
    data.content = parts.slice(0, -1).join(" ") || content;
    data.utm = parts.length > 1 ? parts[parts.length - 1] : "";
  } else if (val.startsWith("MSG-TEMPO-")) {
    type = "message-time";
    const rulesStr = val.slice(10);
    const rules: TimeMessageRule[] = rulesStr.split(";").map((r) => {
      const parts = r.split("-");
      return {
        id: uuidv4(),
        startTime: parts[0] || "00:00",
        endTime: parts[1] || "23:59",
        content: parts.slice(2).join("-") || "",
      };
    });
    data.label = NODE_LABELS["message-time"];
    data.timeMessageRules = rules;
  } else if (val.startsWith("MSG-")) {
    type = "message";
    data.label = NODE_LABELS["message"];
    data.content = val.slice(4);
  } else if (val.startsWith("FT-C-T;")) {
    // FORMAT: FT-C-T;HH:MM|HH:MM|URL|CAPTION;...
    type = "photo-caption-time";
    const rulesStr = val.slice(7); // Remove "FT-C-T;" prefix
    const rules: TimeMediaRule[] = rulesStr.split(";").filter(Boolean).map((r) => {
      const parts = r.split("|");
      const startTime = parts[0] || "00:00";
      const endTime = parts[1] || "23:59";
      const mediaUrl = parts[2] || "";
      // Caption is NOT URL-encoded, read directly
      const caption = parts[3] || "";
      return {
        id: uuidv4(),
        startTime,
        endTime,
        mediaUrl,
        caption: caption || undefined,
      };
    });
    data.label = NODE_LABELS["photo-caption-time"];
    data.timeMediaRules = rules;
  } else if (val.startsWith("FT-C-T-")) {
    // LEGACY FORMAT: FT-C-T-... (hyphen-based, will be migrated on save)
    type = "photo-caption-time";
    const rulesStr = val.slice(7); // Remove "FT-C-T-" prefix
    const rules: TimeMediaRule[] = rulesStr.split(";").filter(Boolean).map((r) => {
      // Legacy format: start-end-url[-caption] with hyphen separators
      const parts = r.split("-");
      if (parts.length >= 3) {
        const start = parts[0] || "00:00";
        const end = parts[1] || "23:59";
        const fullStr = parts.slice(2).join("-");
        const httpIdx = fullStr.indexOf("http");
        let mediaUrl = "";
        let caption = "";
        if (httpIdx !== -1) {
          const urlAndCaption = fullStr.substring(httpIdx);
          const spaceInUrl = urlAndCaption.indexOf(" ");
          if (spaceInUrl !== -1) {
            mediaUrl = urlAndCaption.substring(0, spaceInUrl);
            caption = urlAndCaption.substring(spaceInUrl + 1);
          } else {
            mediaUrl = urlAndCaption;
          }
        } else {
          mediaUrl = fullStr;
        }
        return {
          id: uuidv4(),
          startTime: start,
          endTime: end,
          mediaUrl,
          caption: caption || undefined,
        };
      }
      return {
        id: uuidv4(),
        startTime: "00:00",
        endTime: "23:59",
        mediaUrl: r,
        caption: undefined,
      };
    });
    data.label = NODE_LABELS["photo-caption-time"];
    data.timeMediaRules = rules;
  } else if (val.startsWith("VD-C-T;")) {
    // FORMAT: VD-C-T;HH:MM|HH:MM|URL|CAPTION;...
    type = "video-caption-time";
    const rulesStr = val.slice(7); // Remove "VD-C-T;" prefix
    const rules: TimeMediaRule[] = rulesStr.split(";").filter(Boolean).map((r) => {
      const parts = r.split("|");
      const startTime = parts[0] || "00:00";
      const endTime = parts[1] || "23:59";
      const mediaUrl = parts[2] || "";
      // Caption is NOT URL-encoded, read directly
      const caption = parts[3] || "";
      return {
        id: uuidv4(),
        startTime,
        endTime,
        mediaUrl,
        caption: caption || undefined,
      };
    });
    data.label = NODE_LABELS["video-caption-time"];
    data.timeMediaRules = rules;
  } else if (val.startsWith("VD-C-T-")) {
    // LEGACY FORMAT: VD-C-T-... (hyphen-based, will be migrated on save)
    type = "video-caption-time";
    const rulesStr = val.slice(7); // Remove "VD-C-T-" prefix
    const rules: TimeMediaRule[] = rulesStr.split(";").filter(Boolean).map((r) => {
      const parts = r.split("-");
      if (parts.length >= 3) {
        const start = parts[0] || "00:00";
        const end = parts[1] || "23:59";
        const fullStr = parts.slice(2).join("-");
        const httpIdx = fullStr.indexOf("http");
        let mediaUrl = "";
        let caption = "";
        if (httpIdx !== -1) {
          const urlAndCaption = fullStr.substring(httpIdx);
          const spaceInUrl = urlAndCaption.indexOf(" ");
          if (spaceInUrl !== -1) {
            mediaUrl = urlAndCaption.substring(0, spaceInUrl);
            caption = urlAndCaption.substring(spaceInUrl + 1);
          } else {
            mediaUrl = urlAndCaption;
          }
        } else {
          mediaUrl = fullStr;
        }
        return {
          id: uuidv4(),
          startTime: start,
          endTime: end,
          mediaUrl,
          caption: caption || undefined,
        };
      }
      return {
        id: uuidv4(),
        startTime: "00:00",
        endTime: "23:59",
        mediaUrl: r,
        caption: undefined,
      };
    });
    data.label = NODE_LABELS["video-caption-time"];
    data.timeMediaRules = rules;
  } else if (val.startsWith("FT-C-")) {
    type = "photo-caption";
    const content = val.slice(5);
    const parts = content.split(" ");
    data.label = NODE_LABELS["photo-caption"];
    data.mediaUrl = parts[0] || "";
    data.caption = parts.slice(1).join(" ") || "";
  } else if (val.startsWith("FT-")) {
    type = "photo";
    data.label = NODE_LABELS["photo"];
    data.mediaUrl = val.slice(3);
  } else if (val.startsWith("VD-C-")) {
    type = "video-caption";
    const content = val.slice(5);
    const parts = content.split(" ");
    data.label = NODE_LABELS["video-caption"];
    data.mediaUrl = parts[0] || "";
    data.caption = parts.slice(1).join(" ") || "";
  } else if (val.startsWith("VD-")) {
    type = "video";
    data.label = NODE_LABELS["video"];
    data.mediaUrl = val.slice(3);
  } else if (val.startsWith("AU-")) {
    type = "audio";
    data.label = NODE_LABELS["audio"];
    data.mediaUrl = val.slice(3);
  } else if (val.startsWith("T-")) {
    // This is handled by T columns, but just in case
    type = "time";
    const timeStr = val.slice(2);
    const [min, max] = timeStr.split("-").map(Number);
    data.label = NODE_LABELS["time"];
    data.timeMin = isNaN(min) ? 5 : min;
    data.timeMax = isNaN(max) ? 10 : max;
  } else if (val === "LD") {
    type = "lead-respond";
    data.label = NODE_LABELS["lead-respond"];
  } else if (val === "LK-PIX") {
    type = "link-pix";
    data.label = NODE_LABELS["link-pix"];
  } else if (val.startsWith("ADD-ENTREGA-FLUXO-")) {
    type = "deliverable";
    data.label = NODE_LABELS["deliverable"];
    data.deliverableAction = "add";
    data.content = val.slice(18);
  } else if (val.startsWith("DEL-ENTREGA-FLUXO-")) {
    type = "deliverable";
    data.label = NODE_LABELS["deliverable"];
    data.deliverableAction = "delete";
    data.content = val.slice(18);
  } else if (val.startsWith("ADD-REL-")) {
    type = "reminder";
    data.label = NODE_LABELS["reminder"];
    data.reminderAction = "add";
    // Format: ADD-REL-FLUXO-HH:MM
    const content = val.slice(8);
    // Find the time part (HH:MM) - look for pattern like -XX:XX at the end
    const timeMatch = content.match(/-(\d{1,2}):(\d{1,2})$/);
    if (timeMatch) {
      const flowName = content.substring(0, content.lastIndexOf("-" + timeMatch[1] + ":" + timeMatch[2]));
      data.reminderFlowId = flowName; // Store as reminderFlowId for dropdown matching
      data.content = flowName;
      data.reminderHours = parseInt(timeMatch[1]) || 0;
      data.reminderMinutes = parseInt(timeMatch[2]) || 0;
    } else {
      // Fallback: no time found, just store flow name
      data.reminderFlowId = content;
      data.content = content;
    }
  } else if (val.startsWith("DEL-REL-")) {
    type = "reminder";
    data.label = NODE_LABELS["reminder"];
    data.reminderAction = "delete";
    // Format: DEL-REL-FLUXO (no time) - but handle legacy DEL-REL-FLUXO-HH:MM
    const content = val.slice(8);
    // Check if there's a legacy time pattern at the end and ignore it
    const timeMatch = content.match(/-(\d{1,2}):(\d{1,2})$/);
    if (timeMatch) {
      // Legacy format with time - extract just the flow name, ignore time
      const flowName = content.substring(0, content.lastIndexOf("-" + timeMatch[1] + ":" + timeMatch[2]));
      data.reminderFlowId = flowName;
      data.content = flowName;
    } else {
      // Normal format without time
      data.reminderFlowId = content;
      data.content = content;
    }
  } else if (val.startsWith("APAGAR-GANCHO-")) {
    type = "hook";
    data.label = NODE_LABELS["hook"];
    data.hookAction = "delete";
    data.content = val.slice(14);
  } else if (val.startsWith("GANCHO-")) {
    type = "hook";
    data.label = NODE_LABELS["hook"];
    data.hookAction = "add";
    // Format: GANCHO-<FLUXO>-<HH:MM> (e.g., GANCHO-FRONT-00:10)
    const content = val.slice(7); // Remove "GANCHO-" prefix
    // Find the time part (HH:MM) at the end - pattern like -XX:XX
    const timeMatch = content.match(/-(\d{1,2}):(\d{1,2})$/);
    if (timeMatch) {
      const flowName = content.substring(0, content.lastIndexOf("-" + timeMatch[1] + ":" + timeMatch[2]));
      data.hookFlowId = flowName; // Store flow name for dropdown matching
      data.content = flowName;
      data.hookHours = parseInt(timeMatch[1]) || 0;
      data.hookMinutes = parseInt(timeMatch[2]) || 0;
    } else {
      // Fallback: no time found, treat entire content as flow name
      data.hookFlowId = content;
      data.content = content;
      data.hookHours = 0;
      data.hookMinutes = 0;
    }
  } else {
    // Fallback: treat as plain message
    type = "message";
    data.label = NODE_LABELS["message"];
    data.content = val;
  }

  return {
    id: uuidv4(),
    type,
    data,
  };
}

// Parse T column (time)
function parseTColumn(value: string, columnName: string): BubbleData | null {
  if (!value || typeof value !== "string") return null;

  const val = value.trim();
  if (!val) return null;

  // T column format: "T-5-10" or just "5-10"
  const cleanVal = val.startsWith("T-") ? val.slice(2) : val;
  const [min, max] = cleanVal.split("-").map(Number);

  return {
    id: uuidv4(),
    type: "time",
    data: {
      label: NODE_LABELS["time"],
      supabaseColumn: columnName.toUpperCase(),
      timeMin: isNaN(min) ? 5 : min,
      timeMax: isNaN(max) ? 10 : max,
    },
  };
}

// Parse a Supabase row into bubbles
function parseSupabaseRow(row: SupabaseRow): ParsedFlow {
  const bubbles: BubbleData[] = [];

  // Parse M1..M50
  for (let i = 1; i <= 50; i++) {
    const key = `M${i}`;
    const value = row[key];
    if (value && typeof value === "string") {
      const bubble = parseColumnValue(value, key);
      if (bubble) bubbles.push(bubble);
    }
  }

  // Parse T1..T50
  for (let i = 1; i <= 50; i++) {
    const key = `T${i}`;
    const value = row[key];
    if (value && typeof value === "string") {
      const bubble = parseTColumn(value, key);
      if (bubble) bubbles.push(bubble);
    }
  }

  // Generate preview (first 3 M columns content)
  const preview: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const key = `M${i}`;
    const value = row[key];
    if (value && typeof value === "string") {
      const truncated = value.length > 50 ? value.slice(0, 50) + "..." : value;
      preview.push(`M${i}: ${truncated}`);
    }
  }

  return {
    grupo: row.GRUPO || "Sem Grupo",
    fluxo: row.FLUXO || "Sem Nome",
    bubbles,
    stepCount: bubbles.length,
    preview,
    posicao: row.POSICAO,
    blk: row.BLK,
  };
}

export function FetchFlowsModal({ operationId, disabled }: FetchFlowsModalProps) {
  const { operations, setOperationSupabaseConfig, createGroup, createFlow, updateFlow } =
    useOperationsStore();

  const operation = useMemo(
    () => operations.find((o) => o.id === operationId) ?? null,
    [operations, operationId]
  );

  const supabaseConfig = operation?.supabaseConfig ?? {
    url: "",
    anonKey: "",
    isConnected: false,
  };

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [groupedFlows, setGroupedFlows] = useState<GroupedFlows>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [selectedPreview, setSelectedPreview] = useState<ParsedFlow | null>(null);

  const allFlowKeys = useMemo(() => {
    const keys: string[] = [];
    Object.entries(groupedFlows).forEach(([grupo, flows]) => {
      flows.forEach((f) => keys.push(`${grupo}::${f.fluxo}`));
    });
    return keys;
  }, [groupedFlows]);

  const handleFetch = useCallback(async () => {
    if (!supabaseConfig.isConnected) {
      toast.error("Conecte o Supabase primeiro");
      return;
    }

    setIsLoading(true);
    setGroupedFlows({});
    setSelectedFlows(new Set());
    setSelectedPreview(null);

    try {
      const url = `${supabaseConfig.url}/rest/v1/${TABLE_NAME}?select=*`;
      const response = await fetch(url, {
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast.error(`Tabela ${TABLE_NAME} não encontrada`);
        } else {
          toast.error(`Erro ao buscar dados: HTTP ${response.status}`);
        }
        return;
      }

      const rows: SupabaseRow[] = await response.json();

      if (rows.length === 0) {
        toast.info("Nenhum fluxo encontrado no Supabase");
        return;
      }

      // Parse and group flows
      const grouped: GroupedFlows = {};
      rows.forEach((row) => {
        const parsed = parseSupabaseRow(row);
        if (!grouped[parsed.grupo]) {
          grouped[parsed.grupo] = [];
        }
        // Check if this flow already exists in the group
        const existing = grouped[parsed.grupo].find((f) => f.fluxo === parsed.fluxo);
        if (!existing) {
          grouped[parsed.grupo].push(parsed);
        }
      });

      setGroupedFlows(grouped);
      setExpandedGroups(new Set(Object.keys(grouped)));
      toast.success(`Encontrados ${rows.length} registros em ${Object.keys(grouped).length} grupos`);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Erro ao conectar com o Supabase");
    } finally {
      setIsLoading(false);
    }
  }, [supabaseConfig]);

  const toggleGroup = useCallback((grupo: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) {
        next.delete(grupo);
      } else {
        next.add(grupo);
      }
      return next;
    });
  }, []);

  const toggleFlowSelection = useCallback((grupo: string, fluxo: string) => {
    const key = `${grupo}::${fluxo}`;
    setSelectedFlows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFlows(new Set(allFlowKeys));
  }, [allFlowKeys]);

  const deselectAll = useCallback(() => {
    setSelectedFlows(new Set());
  }, []);

  const handleImport = useCallback(
    (importAll: boolean) => {
      const toImport = importAll ? allFlowKeys : Array.from(selectedFlows);

      if (toImport.length === 0) {
        toast.error("Selecione pelo menos um fluxo para importar");
        return;
      }

      // Track created groups by name to avoid duplicates
      const createdGroupsMap: Record<string, Group> = {};
      
      // Pre-populate with existing groups
      const existingGroups = operation?.groups ?? [];
      existingGroups.forEach((g) => {
        createdGroupsMap[g.name] = g;
      });

      let groupsCreated = 0;
      let flowsCreated = 0;
      let hasLegacyLayout = false;

      toImport.forEach((key) => {
        const [grupo, fluxo] = key.split("::");
        const parsedFlow = groupedFlows[grupo]?.find((f) => f.fluxo === fluxo);
        if (!parsedFlow) return;

        // Find or create group using the map
        let targetGroup = createdGroupsMap[grupo];
        if (!targetGroup) {
          targetGroup = createGroup(operationId, grupo);
          createdGroupsMap[grupo] = targetGroup; // Cache the created group
          groupsCreated++;
        }

        // Parse POSICAO - auto-detect v1 or v2 format
        const posicaoResult = parsedFlow.posicao ? parsePosicaoAuto(parsedFlow.posicao) : null;
        const isV2 = parsedFlow.posicao ? isPosicaoV2(parsedFlow.posicao) : false;
        
        let groupNodes: FlowNode[];
        let noteNodes: FlowNode[] = []; // Standalone note nodes from BLK column
        let reconstructedEdges: { id: string; source: string; target: string }[] = [];
        let startNodePos: { x: number; y: number } = { x: 50, y: 50 }; // Default start-node position
        
        // Parse notes from BLK column (new format)
        if (parsedFlow.blk) {
          const parsedNotes = decodeBlk(parsedFlow.blk);
          noteNodes = blkNotesToFlowNodes(parsedNotes);
        }
        
        if (isV2 && posicaoResult && 'version' in posicaoResult) {
          // V2 format: use exact group IDs, positions, and edges from snapshot
          // CRITICAL: 100% LOSSLESS restoration - NO sorting, NO reordering, NO edge inference
          const layout = posicaoResult as ParsedLayoutV2;
          const distributedGroups = distributeBubblesByPosicaoV2(parsedFlow.bubbles, layout);
          
          // Reconstruct groups in EXACT order from layout (preserving original IDs and positions)
          groupNodes = distributedGroups.map((dg) => ({
            id: dg.groupId, // Use the ORIGINAL group ID from snapshot
            type: "group" as const,
            position: { 
              x: dg.x, 
              y: dg.y 
            },
            data: {
              label: dg.title,
              bubbles: dg.bubbles, // Bubbles already in correct order from distributeBubblesByPosicaoV2
            },
          }));

          // CRITICAL: Reconstruct ALL edges exactly as saved (including start-node connections)
          // NO edge inference, NO automatic connections - only what was explicitly saved
          for (const edge of layout.edges) {
            reconstructedEdges.push({
              id: uuidv4(),
              source: edge.source,
              target: edge.target,
            });
          }
          
          // Use saved start-node position if available
          if (layout.startNodePosition) {
            startNodePos = layout.startNodePosition;
          }
        } else if (posicaoResult && Array.isArray(posicaoResult)) {
          // V1 legacy format: use column-based distribution
          const legacyGroups = posicaoResult as ParsedGroup[];
          const distributedGroups = distributeBubblesByPosicao(parsedFlow.bubbles, legacyGroups);
          
          groupNodes = distributedGroups.map((dg, idx) => ({
            id: uuidv4(),
            type: "group" as const,
            position: { 
              x: dg.x ?? (250 + idx * 450), 
              y: dg.y ?? 50 
            },
            data: {
              label: dg.groupLabel,
              bubbles: dg.bubbles,
            },
          }));
          hasLegacyLayout = true;
        } else {
          // No POSICAO at all: put all bubbles in one group
          hasLegacyLayout = true;
          groupNodes = [{
            id: uuidv4(),
            type: "group" as const,
            position: { x: 250, y: 50 },
            data: {
              label: "Etapas",
              bubbles: parsedFlow.bubbles,
            },
          }];
        }

        // Build final edges array (LOSSLESS)
        // CRITICAL: NEVER infer/create edges on import.
        // - If V2 snapshot has edges: use them exactly (including start-node connections).
        // - If V1/legacy/no POSICAO: keep [] (no dotted orange lines).
        const edges: { id: string; source: string; target: string }[] = reconstructedEdges;


        // Check if flow already exists - get fresh reference from store
        const freshGroup = useOperationsStore.getState().operations
          .find((o) => o.id === operationId)?.groups
          .find((g) => g.id === targetGroup!.id);
        
        const existingFlow = freshGroup?.flows.find((f) => f.name === fluxo);
        if (existingFlow) {
          // Update existing flow with new structure
          updateFlow(operationId, existingFlow.id, {
            nodes: [
              { id: "start-node", type: "start" as const, position: startNodePos, data: { label: "Início" } },
              ...groupNodes,
              ...noteNodes, // Add standalone note nodes from BLK
            ],
            edges,
            isPublished: true,
          });
        } else {
          // Create new flow
          const newFlow = createFlow(operationId, targetGroup.id, fluxo);

          updateFlow(operationId, newFlow.id, {
            nodes: [
              { id: "start-node", type: "start" as const, position: startNodePos, data: { label: "Início" } },
              ...groupNodes,
              ...noteNodes, // Add standalone note nodes from BLK
            ],
            edges,
            isPublished: true,
          });

          flowsCreated++;
        }
      });


      let message = `Importados: ${flowsCreated} fluxos`;
      if (groupsCreated > 0) {
        message += `, ${groupsCreated} grupos criados`;
      }
      toast.success(message);
      
      if (hasLegacyLayout) {
        toast.info("Alguns fluxos têm layout antigo (v1/sem POSICAO) - layout pode não estar 100% fiel", { duration: 5000 });
      }
      
      setOpen(false);
    },
    [allFlowKeys, selectedFlows, groupedFlows, operation, operationId, createGroup, createFlow, updateFlow]
  );

  const handleFlowClick = useCallback((parsedFlow: ParsedFlow) => {
    setSelectedPreview(parsedFlow);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={disabled || !supabaseConfig.isConnected}
        >
          <Download className="h-4 w-4" />
          Fetch Fluxos
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Importar Fluxos do Supabase
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Fetch Button */}
          <div className="flex items-center gap-2">
            <Button onClick={handleFetch} disabled={isLoading} className="gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Buscar do Supabase
                </>
              )}
            </Button>

            {Object.keys(groupedFlows).length > 0 && (
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Selecionar todos
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Limpar seleção
                </Button>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex flex-1 gap-4 min-h-0">
            {/* Tree View */}
            <ScrollArea className="flex-1 border rounded-lg p-3">
              {Object.keys(groupedFlows).length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Clique em "Buscar do Supabase" para carregar os fluxos
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(groupedFlows).map(([grupo, flows]) => (
                    <div key={grupo} className="space-y-1">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(grupo)}
                        className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                      >
                        {expandedGroups.has(grupo) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <FolderOpen className="h-4 w-4 text-primary" />
                        <span className="font-medium">{grupo}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {flows.length} fluxo{flows.length !== 1 ? "s" : ""}
                        </span>
                      </button>

                      {/* Flow Items */}
                      {expandedGroups.has(grupo) && (
                        <div className="ml-6 space-y-1">
                          {flows.map((f) => {
                            const key = `${grupo}::${f.fluxo}`;
                            const isSelected = selectedFlows.has(key);
                            const isPreview = selectedPreview?.fluxo === f.fluxo && selectedPreview?.grupo === grupo;

                            return (
                              <div
                                key={key}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                                  isPreview
                                    ? "bg-primary/10 border border-primary/30"
                                    : "hover:bg-muted/50"
                                )}
                                onClick={() => handleFlowClick(f)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleFlowSelection(grupo, f.fluxo)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="flex-1 truncate">{f.fluxo}</span>
                                <span className="text-xs text-muted-foreground">
                                  {f.stepCount} etapa{f.stepCount !== 1 ? "s" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Preview Panel */}
            {selectedPreview && (
              <div className="w-64 border rounded-lg p-3 space-y-3">
                <div>
                  <h4 className="font-medium text-sm">Preview</h4>
                  <p className="text-xs text-muted-foreground">{selectedPreview.fluxo}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedPreview.stepCount} etapa{selectedPreview.stepCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {selectedPreview.preview.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Primeiras mensagens:</p>
                    {selectedPreview.preview.map((line, i) => (
                      <p key={i} className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {Object.keys(groupedFlows).length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button onClick={() => handleImport(true)} className="gap-2">
                <Check className="h-4 w-4" />
                Importar Tudo ({allFlowKeys.length})
              </Button>

              <Button
                variant="outline"
                onClick={() => handleImport(false)}
                disabled={selectedFlows.size === 0}
                className="gap-2"
              >
                <Check className="h-4 w-4" />
                Importar Selecionados ({selectedFlows.size})
              </Button>

              <Button variant="ghost" onClick={() => setOpen(false)} className="ml-auto">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
