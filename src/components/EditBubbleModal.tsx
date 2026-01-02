import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NODE_LABELS, NodeData, Flow, NodeType } from '@/types/workflow';
import { BubbleItem } from './GroupNode';
import { TimeMessageRuleEditor, validateTimeMessageRules } from './TimeMessageRuleEditor';
import { TimeMediaRuleEditor, validateTimeMediaRules } from './TimeMediaRuleEditor';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

// Helper to detect if a URL field contains a time-based prefix (wrong card type)
function detectWrongCardType(url: string): { detected: boolean; correctType: NodeType | null; typeName: string } {
  if (!url) return { detected: false, correctType: null, typeName: '' };
  
  const trimmed = url.trim();
  
  // Detect both new format (FT-C-T;) and legacy format (FT-C-T-)
  if (trimmed.startsWith('FT-C-T;') || trimmed.startsWith('FT-C-T-') || (trimmed.startsWith('T-') && trimmed.includes('http'))) {
    return { detected: true, correctType: 'photo-caption-time', typeName: 'Foto + Caption Tempo' };
  }
  if (trimmed.startsWith('VD-C-T;') || trimmed.startsWith('VD-C-T-')) {
    return { detected: true, correctType: 'video-caption-time', typeName: 'Vídeo + Caption Tempo' };
  }
  if (trimmed.startsWith('MSG-TEMPO-')) {
    return { detected: true, correctType: 'message-time', typeName: 'Mensagem + Tempo' };
  }
  
  return { detected: false, correctType: null, typeName: '' };
}

interface EditBubbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  bubble: BubbleItem | null;
  onSave: (bubbleId: string, data: NodeData) => void;
  onConvertType?: (bubbleId: string, newType: NodeType, newData: NodeData) => void;
  availableFlows?: Flow[];
  currentFlowId?: string;
}

export const EditBubbleModal = ({
  isOpen,
  onClose,
  bubble,
  onSave,
  onConvertType,
  availableFlows = [],
  currentFlowId = '',
}: EditBubbleModalProps) => {
  const [formData, setFormData] = useState<NodeData>({ label: '' });
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [detectedWrongType, setDetectedWrongType] = useState<{ correctType: NodeType | null; typeName: string }>({ correctType: null, typeName: '' });

  useEffect(() => {
    if (bubble) {
      // Normalize fetched TAG references:
      // When coming from Fetch, some fields may store the FLOW *name* instead of the internal id.
      // We map name -> id when possible so the dropdown selects correctly.
      const next: NodeData = { ...bubble.data };

      if ((bubble.type === 'hook' || bubble.type === 'delete-hook') && next.hookFlowId) {
        const byId = availableFlows.find((f) => f.id === next.hookFlowId);
        if (!byId) {
          const byName = availableFlows.find((f) => f.name === next.hookFlowId) ||
            (next.content ? availableFlows.find((f) => f.name === next.content) : undefined);
          if (byName) next.hookFlowId = byName.id;
        }
      }

      setFormData(next);

      // Check for wrong card type on open (sanity check)
      if ((bubble.type === 'photo' || bubble.type === 'photo-caption' || 
           bubble.type === 'video' || bubble.type === 'video-caption') && bubble.data.mediaUrl) {
        const check = detectWrongCardType(bubble.data.mediaUrl);
        if (check.detected) {
          setDetectedWrongType({ correctType: check.correctType, typeName: check.typeName });
          setShowConvertDialog(true);
        }
      }
    }
  }, [bubble, availableFlows]);

  if (!bubble) return null;

  const handleSave = () => {
    if (bubble.type === 'message-time') {
      const rules = formData.timeMessageRules || [];
      if (rules.length === 0) {
        toast.error('Adicione pelo menos uma regra de tempo.');
        return;
      }
      if (!validateTimeMessageRules(rules)) {
        return;
      }
    }

    if (bubble.type === 'photo-caption-time' || bubble.type === 'video-caption-time') {
      const rules = formData.timeMediaRules || [];
      if (rules.length === 0) {
        toast.error('Adicione pelo menos uma regra de tempo.');
        return;
      }
      if (!validateTimeMediaRules(rules)) {
        return;
      }
    }

    if (bubble.type === 'delete-hook') {
      if (!formData.hookFlowId) {
        toast.error('Selecione um fluxo para apagar.');
        return;
      }
    }

    if (bubble.type === 'hook') {
      const action = formData.hookAction || 'add';
      if (!formData.hookFlowId) {
        toast.error('Selecione um fluxo.');
        return;
      }
      if (action === 'add') {
        // Validate time is set
        if ((formData.hookHours || 0) === 0 && (formData.hookMinutes || 0) === 0) {
          toast.error('Defina o tempo para ativar o gancho.');
          return;
        }
      }
    }

    if (bubble.type === 'reminder') {
      if (!formData.reminderAction) {
        toast.error('Selecione uma ação (Adicionar ou Apagar).');
        return;
      }
      if (!formData.reminderFlowId) {
        toast.error('Selecione um fluxo.');
        return;
      }
      // Only validate time for "add" action
      if (formData.reminderAction === 'add') {
        const hh = formData.reminderHours;
        const mm = formData.reminderMinutes;
        // Both must be defined (not undefined/null)
        if (hh === undefined || hh === null || mm === undefined || mm === null) {
          toast.error('Preencha o horário completo (horas e minutos).');
          return;
        }
      }
    }

    if (bubble.type === 'deliverable') {
      if (!formData.deliverableAction) {
        toast.error('Selecione uma ação (Adicionar ou Apagar).');
        return;
      }
      if (!formData.deliverableFlowId) {
        toast.error('Selecione um fluxo.');
        return;
      }
    }

    // Sanity check before saving: detect wrong card type in URL fields
    if ((bubble.type === 'photo' || bubble.type === 'photo-caption' || 
         bubble.type === 'video' || bubble.type === 'video-caption') && formData.mediaUrl) {
      const check = detectWrongCardType(formData.mediaUrl);
      if (check.detected) {
        setDetectedWrongType({ correctType: check.correctType, typeName: check.typeName });
        setShowConvertDialog(true);
        return;
      }
    }

    onSave(bubble.id, formData);
    onClose();
  };

  const handleConvert = () => {
    if (!detectedWrongType.correctType || !onConvertType || !bubble) {
      setShowConvertDialog(false);
      return;
    }
    
    // Parse the content from the URL field and create proper data for the new type
    const url = formData.mediaUrl || '';
    let newData: NodeData = { label: NODE_LABELS[detectedWrongType.correctType] };
    
    if (detectedWrongType.correctType === 'photo-caption-time' || detectedWrongType.correctType === 'video-caption-time') {
      // Parse both new format (FT-C-T; or VD-C-T;) and legacy format (FT-C-T- or VD-C-T-)
      const isPhoto = detectedWrongType.correctType === 'photo-caption-time';
      const newPrefix = isPhoto ? 'FT-C-T;' : 'VD-C-T;';
      const legacyPrefix = isPhoto ? 'FT-C-T-' : 'VD-C-T-';
      
      let rulesStr = '';
      let isNewFormat = false;
      
      if (url.startsWith(newPrefix)) {
        rulesStr = url.slice(7);
        isNewFormat = true;
      } else if (url.startsWith(legacyPrefix)) {
        rulesStr = url.slice(7);
        isNewFormat = false;
      } else if (url.startsWith('T-')) {
        rulesStr = url.slice(2);
        isNewFormat = false;
      }
      
      const rules = rulesStr.split(';').filter(Boolean).map((r) => {
        if (isNewFormat) {
          // New format: HH:MM|HH:MM|URL|CAPTION (no encoding)
          const parts = r.split('|');
          const startTime = parts[0] || '00:00';
          const endTime = parts[1] || '23:59';
          const mediaUrl = parts[2] || '';
          // Caption is NOT URL-encoded, read directly
          const caption = parts[3] || '';
          return {
            id: uuidv4(),
            startTime,
            endTime,
            mediaUrl,
            caption: caption || undefined,
          };
        } else {
          // Legacy format: start-end-url[-caption] with hyphen separators
          const parts = r.split('-');
          if (parts.length >= 3) {
            const start = parts[0] || '00:00';
            const end = parts[1] || '23:59';
            const fullStr = parts.slice(2).join('-');
            const httpIdx = fullStr.indexOf('http');
            let mediaUrl = '';
            let caption = '';
            if (httpIdx !== -1) {
              const urlAndCaption = fullStr.substring(httpIdx);
              const spaceInUrl = urlAndCaption.indexOf(' ');
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
            startTime: '00:00',
            endTime: '23:59',
            mediaUrl: r,
            caption: undefined,
          };
        }
      });
      
      newData.timeMediaRules = rules;
    } else if (detectedWrongType.correctType === 'message-time') {
      // Parse MSG-TEMPO- format
      const rulesStr = url.startsWith('MSG-TEMPO-') ? url.slice(10) : url;
      const rules = rulesStr.split(';').map((r) => {
        const parts = r.split('-');
        return {
          id: uuidv4(),
          startTime: parts[0] || '00:00',
          endTime: parts[1] || '23:59',
          content: parts.slice(2).join('-') || '',
        };
      });
      newData.timeMessageRules = rules;
    }
    
    onConvertType(bubble.id, detectedWrongType.correctType, newData);
    setShowConvertDialog(false);
    onClose();
    toast.success(`Card convertido para ${detectedWrongType.typeName}`);
  };

  const otherFlows = availableFlows.filter((f) => f.id !== currentFlowId);
  const nodeType = bubble.type;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Editar {NODE_LABELS[nodeType]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {(nodeType === 'message' || nodeType === 'message-utm') && (
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite sua mensagem..."
                value={formData.content || ''}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={4}
              />
            </div>
          )}

          {nodeType === 'message-time' && (
            <TimeMessageRuleEditor formData={formData} setFormData={setFormData} />
          )}

          {(nodeType === 'photo' || nodeType === 'photo-caption') && (
            <>
              <div className="space-y-2">
                <Label>URL da Foto</Label>
                <Input
                  placeholder="https://exemplo.com/foto.jpg"
                  value={formData.mediaUrl || ''}
                  onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                />
              </div>
              {nodeType === 'photo-caption' && (
                <div className="space-y-2">
                  <Label>Caption</Label>
                  <Textarea
                    placeholder="Legenda da foto..."
                    value={formData.caption || ''}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    rows={3}
                  />
                </div>
              )}
            </>
          )}

          {nodeType === 'photo-caption-time' && (
            <TimeMediaRuleEditor formData={formData} setFormData={setFormData} mediaType="photo" />
          )}

          {(nodeType === 'video' || nodeType === 'video-caption') && (
            <>
              <div className="space-y-2">
                <Label>URL do Vídeo</Label>
                <Input
                  placeholder="https://exemplo.com/video.mp4"
                  value={formData.mediaUrl || ''}
                  onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                />
              </div>
              {nodeType === 'video-caption' && (
                <div className="space-y-2">
                  <Label>Caption</Label>
                  <Textarea
                    placeholder="Legenda do vídeo..."
                    value={formData.caption || ''}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    rows={3}
                  />
                </div>
              )}
            </>
          )}

          {nodeType === 'video-caption-time' && (
            <TimeMediaRuleEditor formData={formData} setFormData={setFormData} mediaType="video" />
          )}

          {nodeType === 'audio' && (
            <div className="space-y-2">
              <Label>URL do Áudio</Label>
              <Input
                placeholder="https://exemplo.com/audio.mp3"
                value={formData.mediaUrl || ''}
                onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
              />
            </div>
          )}

          {nodeType === 'time' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Defina o intervalo de tempo aleatório (em minutos)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mínimo</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.timeMin || 5}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        timeMin: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máximo</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.timeMax || 10}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        timeMax: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {nodeType === 'lead-respond' && (
            <div className="p-4 bg-node-lead/10 rounded-lg border border-node-lead/20">
              <p className="text-sm text-muted-foreground">
                Este bloco indica que o fluxo deve aguardar uma resposta do lead.
              </p>
            </div>
          )}

          {nodeType === 'link-pix' && (
            <div className="p-4 bg-node-link-pix/10 rounded-lg border border-node-link-pix/20 space-y-2">
              <p className="text-sm font-semibold text-foreground">Link / Pix</p>
              <p className="text-sm text-muted-foreground">
                A partir desta etapa, se o lead pagar, ele pode receber o entregável.
              </p>
              <div className="mt-3 px-3 py-2 bg-background/50 rounded-md">
                <p className="text-xs font-mono text-node-link-pix">LK-PIX</p>
              </div>
            </div>
          )}

          {nodeType === 'deliverable' && (
            <>
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select
                  value={formData.deliverableAction || ''}
                  onValueChange={(value: 'add' | 'delete') => 
                    setFormData({ ...formData, deliverableAction: value, deliverableFlowId: undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Adicionar</SelectItem>
                    <SelectItem value="delete">Apagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.deliverableAction && (
                <div className="space-y-2">
                  <Label>Selecionar Fluxo</Label>
                  <Select
                    value={formData.deliverableFlowId || ''}
                    onValueChange={(value) => setFormData({ ...formData, deliverableFlowId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fluxo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFlows.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          {flow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.deliverableAction && formData.deliverableFlowId && (
                <div className="p-3 rounded-lg bg-node-deliverable/10 border border-node-deliverable/20">
                  <p className="text-xs text-muted-foreground mb-1">Será exportado como:</p>
                  <p className="text-sm font-mono text-node-deliverable">
                    {formData.deliverableAction === 'add' ? 'ADD' : 'DEL'}-ENTREGA-FLUXO-
                    {availableFlows.find(f => f.id === formData.deliverableFlowId)?.name || ''}
                  </p>
                </div>
              )}
            </>
          )}

          {nodeType === 'hook' && (
            <>
              <div className="space-y-2">
                <Label>Modo do Gancho</Label>
                <Select
                  value={formData.hookAction || 'add'}
                  onValueChange={(value: 'add' | 'delete') => 
                    setFormData({ ...formData, hookAction: value, hookFlowId: undefined, hookHours: 0, hookMinutes: 0 })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Adicionar Gancho</SelectItem>
                    <SelectItem value="delete">Apagar Gancho</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{formData.hookAction === 'delete' ? 'Fluxo para Apagar' : 'Fluxo de Destino'}</Label>
                <Select
                  value={formData.hookFlowId || ''}
                  onValueChange={(value) => setFormData({ ...formData, hookFlowId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um fluxo" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherFlows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.hookAction === 'delete' && (
                  <p className="text-xs text-muted-foreground">
                    O gancho do fluxo selecionado será removido do lead.
                  </p>
                )}
              </div>

              {(formData.hookAction !== 'delete') && (
                <div className="space-y-2">
                  <Label>Tempo para ativar (HH:MM)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        placeholder="00"
                        value={formData.hookHours ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hookHours: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">Horas</span>
                    </div>
                    <div>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="00"
                        value={formData.hookMinutes ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hookMinutes: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">Minutos</span>
                    </div>
                  </div>
                </div>
              )}

              {formData.hookFlowId && (() => {
                const flowName =
                  otherFlows.find((f) => f.id === formData.hookFlowId)?.name ||
                  otherFlows.find((f) => f.name === formData.hookFlowId)?.name ||
                  formData.content ||
                  '';

                return (
                  <div className={`p-3 rounded-lg ${formData.hookAction === 'delete' ? 'bg-destructive/10 border border-destructive/20' : 'bg-node-hook/10 border border-node-hook/20'}`}>
                    
                    <p className="text-xs text-muted-foreground mb-1">Será exportado como:</p>
                    <p className={`text-sm font-mono ${formData.hookAction === 'delete' ? 'text-destructive' : 'text-node-hook'}`}>
                      {formData.hookAction === 'delete'
                        ? `APAGAR-GANCHO-${flowName}`
                        : `GANCHO-${flowName}-${String(formData.hookHours || 0).padStart(2, '0')}:${String(formData.hookMinutes || 0).padStart(2, '0')}`}
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          {nodeType === 'delete-hook' && (
            <>
              <div className="space-y-2">
                <Label>Fluxo para Apagar</Label>
                <Select
                  value={formData.hookFlowId || ''}
                  onValueChange={(value) => setFormData({ ...formData, hookFlowId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um fluxo" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherFlows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O gancho do fluxo selecionado será removido do lead.
                </p>
              </div>

              {formData.hookFlowId && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm font-mono text-destructive">
                    APAGAR-GANCHO-{otherFlows.find(f => f.id === formData.hookFlowId)?.name || ''}
                  </p>
                </div>
              )}
            </>
          )}

          {nodeType === 'reminder' && (
            <>
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select
                  value={formData.reminderAction || ''}
                  onValueChange={(value: 'add' | 'delete') => 
                    setFormData({ ...formData, reminderAction: value, reminderFlowId: undefined, reminderHours: undefined, reminderMinutes: undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Adicionar</SelectItem>
                    <SelectItem value="delete">Apagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.reminderAction && (
                <>
                  <div className="space-y-2">
                    <Label>Fluxo</Label>
                    <Select
                      value={formData.reminderFlowId || ''}
                      onValueChange={(value) => setFormData({ ...formData, reminderFlowId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um fluxo">
                          {/* Show current value - either matched flow name or the raw value from Supabase */}
                          {formData.reminderFlowId && (
                            availableFlows.find(f => f.id === formData.reminderFlowId)?.name ||
                            availableFlows.find(f => f.name === formData.reminderFlowId)?.name ||
                            formData.content ||
                            formData.reminderFlowId
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableFlows.map((flow) => (
                          <SelectItem key={flow.id} value={flow.id}>
                            {flow.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.reminderAction === 'add' && (
                    <div className="space-y-2">
                      <Label>Tempo para ativar (HH:MM)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Input
                            type="number"
                            min={0}
                            max={23}
                            placeholder="00"
                            value={formData.reminderHours ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setFormData({ ...formData, reminderHours: undefined });
                              } else {
                                const num = Math.min(23, Math.max(0, parseInt(val) || 0));
                                setFormData({ ...formData, reminderHours: num });
                              }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">Horas</span>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            placeholder="00"
                            value={formData.reminderMinutes ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setFormData({ ...formData, reminderMinutes: undefined });
                              } else {
                                const num = Math.min(59, Math.max(0, parseInt(val) || 0));
                                setFormData({ ...formData, reminderMinutes: num });
                              }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">Minutos</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {formData.reminderAction && formData.reminderFlowId && (
                <div className="p-3 rounded-lg bg-node-reminder/10 border border-node-reminder/20">
                  <p className="text-xs text-muted-foreground mb-1">Será exportado como:</p>
                  <p className="text-sm font-mono text-node-reminder">
                    {(() => {
                      // Get the flow name - try by ID first, then by name match, then use content/raw value
                      const flowById = availableFlows.find(f => f.id === formData.reminderFlowId);
                      const flowByName = availableFlows.find(f => f.name === formData.reminderFlowId);
                      const flowName = flowById?.name || flowByName?.name || formData.content || formData.reminderFlowId || '';
                      
                      if (formData.reminderAction === 'add') {
                        if (formData.reminderHours !== undefined && formData.reminderMinutes !== undefined) {
                          return `ADD-REL-${flowName}-${String(formData.reminderHours).padStart(2, '0')}:${String(formData.reminderMinutes).padStart(2, '0')}`;
                        }
                        return <span className="text-muted-foreground italic">Preencha o horário para exportar</span>;
                      }
                      return `DEL-REL-${flowName}`;
                    })()}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Convert card type dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tipo de card incorreto detectado</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo deste campo parece ser do tipo <strong>{detectedWrongType.typeName}</strong>. 
              Deseja converter este card para o tipo correto?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConvertDialog(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert}>
              Converter agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};