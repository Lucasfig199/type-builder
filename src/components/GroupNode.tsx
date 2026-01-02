import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeData, NodeType } from '@/types/workflow';
import {
  Anchor,
  Bell,
  ChevronsUpDown,
  Clock,
  CreditCard,
  GripVertical,
  Image,
  ImagePlus,
  Link,
  MessageSquare,
  Mic,
  Pencil,
  StickyNote,
  UserCheck,
  Video,
  VideoIcon,
  X,
} from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { buildColumn, COLUMN_LIMIT, getColumnKindForBubble, parseColumn } from '@/lib/supabaseColumnMapping';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MediaPreview } from '@/components/MediaPreview';
import { Input } from '@/components/ui/input';

const nodeIcons: Record<NodeType, React.ReactNode> = {
  message: <MessageSquare className="h-4 w-4" />,
  'message-utm': <Link className="h-4 w-4" />,
  'message-time': <Clock className="h-4 w-4" />,
  photo: <Image className="h-4 w-4" />,
  'photo-caption': <ImagePlus className="h-4 w-4" />,
  'photo-caption-time': <ImagePlus className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  'video-caption': <VideoIcon className="h-4 w-4" />,
  'video-caption-time': <VideoIcon className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  time: <Clock className="h-4 w-4" />,
  'lead-respond': <UserCheck className="h-4 w-4" />,
  hook: <Anchor className="h-4 w-4" />,
  'delete-hook': <X className="h-4 w-4" />,
  'link-pix': <CreditCard className="h-4 w-4" />,
  deliverable: <Anchor className="h-4 w-4" />,
  reminder: <Bell className="h-4 w-4" />,
  note: <StickyNote className="h-4 w-4" />,
  start: null,
};

// Helper to get dynamic icon background color for hook/reminder based on action
function getActionBasedColor(bubble: BubbleItem): string | null {
  if (bubble.type === 'hook') {
    const action = bubble.data.hookAction;
    if (action === 'add') return 'bg-green-600';
    if (action === 'delete') return 'bg-red-600';
    return null; // Not configured
  }
  if (bubble.type === 'reminder') {
    const action = bubble.data.reminderAction;
    if (action === 'add') return 'bg-green-600';
    if (action === 'delete') return 'bg-red-600';
    return null; // Not configured
  }
  return null;
}

const nodeColors: Record<NodeType, string> = {
  message: 'bg-node-message',
  'message-utm': 'bg-node-message-utm',
  'message-time': 'bg-node-message-time',
  photo: 'bg-node-photo',
  'photo-caption': 'bg-node-photo',
  'photo-caption-time': 'bg-node-photo',
  video: 'bg-node-video',
  'video-caption': 'bg-node-video',
  'video-caption-time': 'bg-node-video',
  audio: 'bg-node-audio',
  time: 'bg-node-time',
  'lead-respond': 'bg-node-lead',
  hook: 'bg-node-hook',
  'delete-hook': 'bg-node-delete-hook',
  'link-pix': 'bg-node-link-pix',
  deliverable: 'bg-node-deliverable',
  reminder: 'bg-node-reminder',
  note: 'bg-node-note',
  start: '',
};

export interface BubbleItem {
  id: string;
  type: NodeType;
  data: NodeData;
}

export interface GroupNodeData {
  label: string;
  bubbles?: BubbleItem[];
  showMediaPreviews?: boolean;
  orderTag?: string; // "G1", "G2", etc. (calculated from edges/position)
  onDeleteBubble?: (bubbleId: string) => void;
  onEditBubble?: (bubbleId: string) => void;
  onDeleteGroup?: () => void;
  onDropBubbleIntoGroup?: (nodeId: string, type: NodeType) => void;
  onReorderBubbles?: (nodeId: string, newOrder: BubbleItem[]) => void;
  onChangeBubbleColumn?: (nodeId: string, bubbleId: string, column: string) => void;
  onRenameGroup?: (label: string) => void;
  getFlowNameById?: (flowId: string) => string | null;
  placeholderIndex?: number;
  activeDragId?: string;
  [key: string]: unknown;
}

interface GroupNodeProps {
  id: string;
  data: GroupNodeData;
  selected?: boolean;
}

function StepBadge({
  value,
  options,
  onChange,
  isInvalid,
}: {
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  isInvalid?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "nodrag inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
            "bg-background/60 border border-border/70 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors",
            isInvalid && "border-destructive/60 text-destructive",
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label="Escolher etapa (coluna M/T)"
        >
          <span className="tabular-nums">{value?.toUpperCase() || '—'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-[140px] p-2" onClick={(e) => e.stopPropagation()}>
        <Select
          value={value?.toUpperCase()}
          onValueChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
        >
          <SelectTrigger className="nodrag h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}

function SortableBubble({
  nodeId,
  bubble,
  renderContent,
  onDeleteBubble,
  onEditBubble,
  hoveredBubble,
  setHoveredBubble,
  allBubbles,
  onChangeBubbleColumn,
  showMediaPreviews,
}: {
  nodeId: string;
  bubble: BubbleItem;
  renderContent: (bubble: BubbleItem) => React.ReactNode;
  onDeleteBubble?: (bubbleId: string) => void;
  onEditBubble?: (bubbleId: string) => void;
  hoveredBubble: string | null;
  setHoveredBubble: (id: string | null) => void;
  allBubbles: BubbleItem[];
  onChangeBubbleColumn?: (nodeId: string, bubbleId: string, column: string) => void;
  showMediaPreviews?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bubble.id,
    data: { groupId: nodeId },
  });

  // During drag, completely hide the original item (no ghost/transparent effect)
  // The DragOverlay handles the visual representation
  const style: React.CSSProperties = isDragging
    ? {
        opacity: 0,
        height: 0,
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        border: 'none',
      }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const kind = getColumnKindForBubble(bubble.type);
  const options = useMemo(() => {
    const arr: string[] = [];
    for (let i = 1; i <= COLUMN_LIMIT; i++) arr.push(buildColumn(kind, i));
    return arr;
  }, [kind]);

  const currentCol = bubble.data.supabaseColumn?.toUpperCase();
  const parsedCurrent = currentCol ? parseColumn(currentCol) : null;
  const isInvalid = currentCol ? !parsedCurrent : true;

  const handleChangeColumn = (column: string) => {
    const parsed = parseColumn(column);
    if (!parsed) {
      toast.error('Coluna inválida');
      return;
    }

    const normalized = buildColumn(parsed.kind, parsed.index);
    const hasDuplicate = allBubbles.some((b) => {
      if (b.id === bubble.id) return false;
      const bCol = b.data.supabaseColumn;
      if (!bCol) return false;
      const p = parseColumn(bCol);
      if (!p) return false;
      return buildColumn(p.kind, p.index) === normalized;
    });

    if (hasDuplicate) {
      toast.error(`A coluna ${normalized} já está sendo usada em outro card.`);
      return;
    }

    onChangeBubbleColumn?.(nodeId, bubble.id, normalized);
  };

  const mediaUrl = bubble.data.mediaUrl;
  const mediaCaption = bubble.data.caption;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/60 hover:border-border transition-all cursor-pointer",
      )}
      onMouseEnter={() => setHoveredBubble(bubble.id)}
      onMouseLeave={() => setHoveredBubble(null)}
      onClick={() => onEditBubble?.(bubble.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEditBubble?.(bubble.id);
      }}
    >
      <div
        className={cn(
          "nodrag absolute top-2 right-2 z-10 flex items-center gap-2 transition-opacity",
          hoveredBubble === bubble.id ? "opacity-100" : "opacity-70",
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Hide StepBadge for note type - notes don't have M#/T# columns */}
        {bubble.type !== 'note' && (
          <StepBadge value={currentCol} options={options} onChange={handleChangeColumn} isInvalid={isInvalid} />
        )}
        
        {/* Show NOTE badge for note type */}
        {bubble.type === 'note' && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium bg-node-note/20 border border-node-note/40 text-node-note">
            📝 NOTE
          </span>
        )}

        {onDeleteBubble && (
          <button
            type="button"
            onClick={() => onDeleteBubble?.(bubble.id)}
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "h-7 w-7 border border-border/70 bg-background/60 text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors",
            )}
            aria-label="Remover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-start gap-3 px-3 py-3 pr-24">
        <div
          className="nodrag cursor-grab p-1 rounded-md hover:bg-muted text-muted-foreground/70 mt-0.5"
          {...listeners}
          {...attributes}
          aria-label="Arrastar para reordenar/mover"
          title="Arrastar"
        >
          <GripVertical className="h-4 w-4 flex-shrink-0" />
        </div>

        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0",
          getActionBasedColor(bubble) || nodeColors[bubble.type]
        )}>
          {nodeIcons[bubble.type]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground leading-tight">{bubble.data.label}</div>

          <div className="mt-1 text-sm text-muted-foreground leading-snug whitespace-pre-wrap break-words line-clamp-2">
            {renderContent(bubble)}
          </div>

          {showMediaPreviews && (
            <div
              className="nodrag"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  "mt-2",
                  bubble.type === "audio" ? "-mx-3 -mb-1 w-[calc(100%+1.5rem)]" : "-mx-3 w-[calc(100%+1.5rem)]",
                )}
              >
                <MediaPreview
                  type={bubble.type}
                  url={mediaUrl}
                  caption={mediaCaption}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const GroupNode = memo(({ id, data, selected }: GroupNodeProps) => {
  const [hoveredBubble, setHoveredBubble] = useState<string | null>(null);

  const bubbles = data.bubbles ?? [];

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.label);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(data.label);
  }, [data.label, isEditingTitle]);

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `group:${id}`,
    data: { groupId: id },
  });

  // Droppable for the END of the list (explicit drop zone)
  const { setNodeRef: setEndDroppableRef, isOver: isOverEnd } = useDroppable({
    id: `group:${id}:end`,
    data: { groupId: id, isEndZone: true },
  });

  // HTML5 drop support ONLY for adding new blocks from the left panel (not used for moving cards)
  const handlePanelDragOver = useCallback(
    (event: React.DragEvent) => {
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (type) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    [],
  );

  const handlePanelDrop = useCallback(
    (event: React.DragEvent) => {
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type) return;
      event.preventDefault();
      event.stopPropagation();
      data.onDropBubbleIntoGroup?.(id, type);
    },
    [data, id],
  );

  const renderBubbleContent = (bubble: BubbleItem) => {
    const { type, data: bubbleData } = bubble;

    switch (type) {
      case 'message':
      case 'message-utm':
        return <span>{bubbleData.content || 'Mensagem vazia'}</span>;
      case 'message-time': {
        const count = bubbleData.timeMessageRules?.length || 0;
        return <span>{count} regra{count !== 1 ? 's' : ''} de tempo</span>;
      }
      case 'photo':
      case 'photo-caption':
        return <span>{bubbleData.caption || bubbleData.mediaUrl || 'Foto'}</span>;
      case 'photo-caption-time': {
        const count = bubbleData.timeMediaRules?.length || 0;
        return <span>{count} regra{count !== 1 ? 's' : ''} de tempo</span>;
      }
      case 'video':
      case 'video-caption':
        return <span>{bubbleData.caption || bubbleData.mediaUrl || 'Vídeo'}</span>;
      case 'video-caption-time': {
        const count = bubbleData.timeMediaRules?.length || 0;
        return <span>{count} regra{count !== 1 ? 's' : ''} de tempo</span>;
      }
      case 'audio':
        return <span>{bubbleData.mediaUrl || 'Áudio'}</span>;
      case 'time': {
        const min = bubbleData.timeMin ?? 5;
        const max = bubbleData.timeMax ?? 10;
        return <span>{min}-{max} seg</span>;
      }
      case 'lead-respond':
        return <span>Aguardando resposta</span>;
      case 'link-pix':
        return <span>Ativa entrega após pagamento</span>;
      case 'hook': {
        const action = bubbleData.hookAction || 'add';
        const flowNameById = bubbleData.hookFlowId ? data.getFlowNameById?.(bubbleData.hookFlowId) : null;
        const flowName = flowNameById || bubbleData.content || bubbleData.hookFlowId;
        if (action === 'delete') {
          return <span>{flowName ? `Apagar: ${flowName}` : 'Selecione um fluxo'}</span>;
        }
        const hh = String(bubbleData.hookHours || 0).padStart(2, '0');
        const mm = String(bubbleData.hookMinutes || 0).padStart(2, '0');
        return (
          <span>
            {flowName ? `${flowName} • ` : ''}
            {hh}:{mm}
          </span>
        );
      }
      case 'delete-hook': {
        const flowNameById = bubbleData.hookFlowId ? data.getFlowNameById?.(bubbleData.hookFlowId) : null;
        const flowName = flowNameById || bubbleData.content || bubbleData.hookFlowId;
        return <span>{flowName ? `Apagar: ${flowName}` : 'Selecione um fluxo'}</span>;
      }
      case 'deliverable': {
        const action = bubbleData.deliverableAction;
        const flowName = bubbleData.deliverableFlowId ? data.getFlowNameById?.(bubbleData.deliverableFlowId) : null;
        if (!action || !flowName) {
          return <span>Configure ação e fluxo</span>;
        }
        return <span>{action === 'add' ? 'Adicionar' : 'Apagar'}: {flowName}</span>;
      }
      case 'reminder': {
        const action = bubbleData.reminderAction;
        // Try to get flow name by ID, fallback to content (which stores the name from Supabase)
        const flowNameById = bubbleData.reminderFlowId ? data.getFlowNameById?.(bubbleData.reminderFlowId) : null;
        const flowName = flowNameById || bubbleData.content || bubbleData.reminderFlowId;
        if (!action || !flowName) {
          return <span>Configure ação e fluxo</span>;
        }
        if (action === 'add') {
          const hh = bubbleData.reminderHours;
          const mm = bubbleData.reminderMinutes;
          if (hh === undefined || mm === undefined) {
            return <span>ADD • {flowName} • --:--</span>;
          }
          return <span>ADD • {flowName} • {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span>;
        }
        return <span>DEL • {flowName}</span>;
      }
      case 'note': {
        const note = bubbleData.note;
        const title = note?.title;
        const preview = note?.textPreview || 'Clique para escrever...';
        const heightMode = note?.heightMode || 'md';
        const lineClamp = heightMode === 'sm' ? 'line-clamp-1' : heightMode === 'lg' ? 'line-clamp-4' : 'line-clamp-2';
        return (
          <div className="space-y-0.5">
            {title && <div className="font-medium text-foreground text-xs">{title}</div>}
            <span className={cn(lineClamp, !note?.html && 'italic text-muted-foreground/70')}>
              {preview}
            </span>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const commitTitle = useCallback(() => {
    const next = titleDraft.trim();
    if (!next) {
      toast.error('O nome do grupo não pode ficar vazio');
      return;
    }
    data.onRenameGroup?.(next);
    setIsEditingTitle(false);
  }, [data, titleDraft]);

  const cancelTitle = useCallback(() => {
    setTitleDraft(data.label);
    setIsEditingTitle(false);
  }, [data.label]);

  return (
    <div
      ref={setDroppableRef}
      data-group-id={id}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
      className={cn(
        "group relative min-w-[340px] max-w-[420px] rounded-xl bg-card border-2 shadow-node transition-all duration-200",
        selected ? "border-primary shadow-glow" : "border-border hover:border-primary/50",
        isOver && "border-primary ring-2 ring-primary/50",
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-4 !h-4 !bg-primary !border-2 !border-card" style={{ left: -8 }} />
      <Handle type="source" position={Position.Right} className="!w-4 !h-4 !bg-node-video !border-2 !border-card" style={{ right: -8 }} />

      {data.onDeleteGroup && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onDeleteGroup?.();
          }}
          className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-destructive flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity shadow-lg nodrag"
        >
          <X className="h-3 w-3 text-destructive-foreground" />
        </button>
      )}

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          {!isEditingTitle ? (
            <div
              className="text-left flex-1 min-w-0 cursor-grab flex items-center gap-2"
              onMouseDown={(e) => {
                if (e.detail === 2) {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }
              }}
              title="Duplo clique para renomear"
            >
              {data.orderTag && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap">
                  {data.orderTag}
                </span>
              )}
              <h3 className="font-semibold text-foreground truncate">{data.label}</h3>
            </div>
          ) : (
            <div className="nodrag flex-1" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="h-8 bg-background/40 border-border/60"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') cancelTitle();
                }}
              />
              <div className="mt-1 text-[11px] text-muted-foreground">Enter salva • Esc cancela</div>
            </div>
          )}

          {!isEditingTitle && (
            <button
              type="button"
              className="nodrag inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Renomear grupo"
              title="Renomear"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2 min-h-[72px]">
        {bubbles.length === 0 && !data.activeDragId ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Arraste blocos aqui</div>
        ) : (
          <SortableContext items={bubbles.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {bubbles.map((bubble, idx) => {
                const isBeingDragged = data.activeDragId === bubble.id;
                const showPlaceholderBefore = 
                  data.placeholderIndex !== undefined && 
                  data.placeholderIndex === idx && 
                  data.activeDragId !== bubble.id;
                
                return (
                  <div key={bubble.id}>
                    {showPlaceholderBefore && (
                      <div className="h-14 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center text-sm text-primary font-medium mb-2 animate-pulse">
                        ↓ Soltar aqui ↓
                      </div>
                    )}
                    <SortableBubble
                      nodeId={id}
                      bubble={bubble}
                      renderContent={renderBubbleContent}
                      onDeleteBubble={data.onDeleteBubble}
                      onEditBubble={data.onEditBubble}
                      hoveredBubble={hoveredBubble}
                      setHoveredBubble={setHoveredBubble}
                      allBubbles={bubbles}
                      onChangeBubbleColumn={data.onChangeBubbleColumn}
                      showMediaPreviews={data.showMediaPreviews}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        )}
        
        {/* END DROP ZONE - Only visible and highlighted when actively hovering near end */}
        <div
          ref={setEndDroppableRef}
          className={cn(
            "rounded-xl border-2 border-dashed flex items-center justify-center text-sm font-medium transition-all duration-200",
            // Hide completely when not dragging
            !data.activeDragId && "h-0 opacity-0 overflow-hidden border-none",
            // When dragging but NOT hovering end: small neutral placeholder
            data.activeDragId && !isOverEnd && (data.placeholderIndex === undefined || data.placeholderIndex < bubbles.length) && 
              "h-6 border-border/40 bg-transparent text-transparent",
            // Highlight when hovering end zone OR placeholder indicates end position
            data.activeDragId && (isOverEnd || (data.placeholderIndex !== undefined && data.placeholderIndex >= bubbles.length)) &&
              "h-14 border-primary bg-primary/10 text-primary animate-pulse"
          )}
        >
          {data.activeDragId && (isOverEnd || (data.placeholderIndex !== undefined && data.placeholderIndex >= bubbles.length)) && (
            "↓ Soltar no final ↓"
          )}
        </div>
        
        {/* Show placeholder when group is empty and being hovered */}
        {bubbles.length === 0 && data.activeDragId && isOver && !isOverEnd && (
          <div className="h-14 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center text-sm text-primary font-medium animate-pulse">
            ↓ Soltar aqui ↓
          </div>
        )}
      </div>
    </div>
  );
});

GroupNode.displayName = 'GroupNode';