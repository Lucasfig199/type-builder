import { useRef, useState, useEffect, useCallback } from 'react';
import { NodeType, NODE_LABELS } from '@/types/workflow';
import {
  MessageSquare,
  Link,
  Image,
  Video,
  Mic,
  Clock,
  UserCheck,
  Anchor,
  ImagePlus,
  VideoIcon,
  CreditCard,
  Bell,
  MoreHorizontal,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTempoPreset } from '@/hooks/useTempoPreset';
import { toast } from 'sonner';

interface NodePanelProps {
  operationId?: string;
}

type NodeConfigItem = 
  | { type: NodeType; icon: React.ReactNode; color: string; isDivider?: never }
  | { isDivider: true; label: string; type?: never; icon?: never; color?: never };

const nodeTypeConfig: NodeConfigItem[] = [
  // Content nodes (above TAGS divider)
  { type: 'message', icon: <MessageSquare className="h-4 w-4" />, color: 'bg-node-message' },
  { type: 'message-time', icon: <Clock className="h-4 w-4" />, color: 'bg-node-message-time' },
  { type: 'message-utm', icon: <Link className="h-4 w-4" />, color: 'bg-node-message-utm' },
  { type: 'photo', icon: <Image className="h-4 w-4" />, color: 'bg-node-photo' },
  { type: 'photo-caption', icon: <ImagePlus className="h-4 w-4" />, color: 'bg-node-photo' },
  { type: 'photo-caption-time', icon: <ImagePlus className="h-4 w-4" />, color: 'bg-node-photo' },
  { type: 'video', icon: <Video className="h-4 w-4" />, color: 'bg-node-video' },
  { type: 'video-caption', icon: <VideoIcon className="h-4 w-4" />, color: 'bg-node-video' },
  { type: 'video-caption-time', icon: <VideoIcon className="h-4 w-4" />, color: 'bg-node-video' },
  { type: 'audio', icon: <Mic className="h-4 w-4" />, color: 'bg-node-audio' },
  { type: 'time', icon: <Clock className="h-4 w-4" />, color: 'bg-node-time' },
  
  // TAGS divider
  { isDivider: true, label: 'TAGS' },
  
  // Tag nodes (below TAGS divider) - no free text, only config via modal
  { type: 'lead-respond', icon: <UserCheck className="h-4 w-4" />, color: 'bg-node-lead' },
  { type: 'hook', icon: <Anchor className="h-4 w-4" />, color: 'bg-node-hook' },
  { type: 'reminder', icon: <Bell className="h-4 w-4" />, color: 'bg-node-reminder' },
  { type: 'link-pix', icon: <CreditCard className="h-4 w-4" />, color: 'bg-node-link-pix' },
  { type: 'deliverable', icon: <Anchor className="h-4 w-4" />, color: 'bg-node-deliverable' },
  { type: 'note', icon: <StickyNote className="h-4 w-4" />, color: 'bg-node-note' },
];

export const NodePanel = ({ operationId }: NodePanelProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [tempoPopoverOpen, setTempoPopoverOpen] = useState(false);
  
  // Tempo preset state
  const { preset, savePreset, resetToDefault, defaultPreset } = useTempoPreset(operationId);
  const [tempMin, setTempMin] = useState(String(preset.minSeconds));
  const [tempMax, setTempMax] = useState(String(preset.maxSeconds));

  // Sync temp values when preset changes
  useEffect(() => {
    setTempMin(String(preset.minSeconds));
    setTempMax(String(preset.maxSeconds));
  }, [preset]);

  // Track scroll position for header shadow
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 0);
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Auto-scroll during drag when near edges
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let animationFrameId: number | null = null;
    const SCROLL_ZONE = 60; // px from edge
    const SCROLL_SPEED = 8; // px per frame

    const handleDragOver = (e: DragEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY;

      // Cancel any existing animation
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      // Check if near top edge
      if (mouseY < rect.top + SCROLL_ZONE && container.scrollTop > 0) {
        const scroll = () => {
          container.scrollTop -= SCROLL_SPEED;
          if (container.scrollTop > 0) {
            animationFrameId = requestAnimationFrame(scroll);
          }
        };
        animationFrameId = requestAnimationFrame(scroll);
      }
      // Check if near bottom edge
      else if (mouseY > rect.bottom - SCROLL_ZONE && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
        const scroll = () => {
          container.scrollTop += SCROLL_SPEED;
          if (container.scrollTop < container.scrollHeight - container.clientHeight) {
            animationFrameId = requestAnimationFrame(scroll);
          }
        };
        animationFrameId = requestAnimationFrame(scroll);
      }
    };

    const handleDragEnd = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    container.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      container.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragend', handleDragEnd);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('text/plain', nodeType);
    event.dataTransfer.effectAllowed = 'move';

    const target = event.currentTarget as HTMLElement;
    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(target, 20, 20);
    }
  };

  const handleSaveTempoPreset = () => {
    const min = parseInt(tempMin, 10);
    const max = parseInt(tempMax, 10);

    if (isNaN(min) || isNaN(max)) {
      toast.error('Valores inválidos');
      return;
    }

    if (min < 0) {
      toast.error('Mínimo não pode ser negativo');
      return;
    }

    if (max <= min) {
      toast.error('Máximo deve ser maior que mínimo');
      return;
    }

    if (min > 999 || max > 999) {
      toast.error('Valores devem ser menores que 1000');
      return;
    }

    const success = savePreset({ minSeconds: min, maxSeconds: max });
    if (success) {
      toast.success(`Tempo padrão atualizado: ${min}–${max} seg`);
      setTempoPopoverOpen(false);
    }
  };

  const handleResetTempoPreset = () => {
    resetToDefault();
    setTempMin(String(defaultPreset.minSeconds));
    setTempMax(String(defaultPreset.maxSeconds));
    toast.success('Tempo padrão resetado para 5–10 seg');
  };

  const handleCancelTempoPreset = () => {
    setTempMin(String(preset.minSeconds));
    setTempMax(String(preset.maxSeconds));
    setTempoPopoverOpen(false);
  };

  return (
    <div className="w-72 bg-card border-r border-border h-full flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <div className={cn(
        "p-4 border-b border-border bg-card z-10 transition-shadow duration-200",
        isScrolled && "shadow-md"
      )}>
        <h3 className="font-semibold text-lg">Adicionar Bloco</h3>
        <p className="text-sm text-muted-foreground">Arraste para o canvas ou para um grupo</p>
      </div>

      {/* Scrollable List */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 scrollbar-thin"
        style={{
          scrollbarGutter: 'stable',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        {nodeTypeConfig.map((config, index) => {
          // Render divider
          if ('isDivider' in config && config.isDivider) {
            return (
              <div key={`divider-${index}`} className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {config.label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }
          
          // Type guard: at this point config has type, icon, color
          if (!('type' in config)) return null;

          // Special rendering for Time node with settings button
          if (config.type === 'time') {
            return (
              <div
                key={config.type}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary transition-colors text-left group hover:bg-muted cursor-grab"
                draggable
                onDragStart={(event) => onDragStart(event, config.type)}
              >
                <div
                  className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center text-white
                              group-hover:scale-110 transition-transform`}
                >
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{NODE_LABELS[config.type]}</span>
                  <div className="text-xs text-muted-foreground">
                    {preset.minSeconds}–{preset.maxSeconds} seg
                  </div>
                </div>
                
                {/* Settings button */}
                <TooltipProvider>
                  <Tooltip>
                    <Popover open={tempoPopoverOpen} onOpenChange={setTempoPopoverOpen}>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                            draggable={false}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>Configurar tempo padrão</p>
                      </TooltipContent>

                      <PopoverContent 
                        className="w-72" 
                        side="right" 
                        align="start"
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-sm">Tempo padrão</h4>
                            <p className="text-xs text-muted-foreground">
                              Para novos cards Tempo
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="tempo-min" className="text-xs">
                                Min (seg)
                              </Label>
                              <Input
                                id="tempo-min"
                                type="number"
                                min={0}
                                max={999}
                                value={tempMin}
                                onChange={(e) => setTempMin(e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="tempo-max" className="text-xs">
                                Max (seg)
                              </Label>
                              <Input
                                id="tempo-max"
                                type="number"
                                min={1}
                                max={999}
                                value={tempMax}
                                onChange={(e) => setTempMax(e.target.value)}
                                className="h-9"
                              />
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                            Novos cards Tempo: <span className="font-medium text-foreground">{tempMin}–{tempMax} seg</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={handleSaveTempoPreset}
                              className="flex-1"
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelTempoPreset}
                            >
                              Cancelar
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleResetTempoPreset}
                                    className="px-2"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Resetar para 5–10</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </Tooltip>
                </TooltipProvider>
              </div>
            );
          }

          // Render regular node item
          return (
            <div
              key={config.type}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary transition-colors text-left group hover:bg-muted cursor-grab"
              draggable
              onDragStart={(event) => onDragStart(event, config.type)}
            >
              <div
                className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center text-white
                            group-hover:scale-110 transition-transform`}
              >
                {config.icon}
              </div>
              <span className="font-medium text-sm">{NODE_LABELS[config.type]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
