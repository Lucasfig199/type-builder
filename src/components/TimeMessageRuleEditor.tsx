import { useCallback } from 'react';
import { TimeMessageRule, NodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TimeMessageRuleEditorProps {
  formData: NodeData;
  setFormData: (data: NodeData) => void;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(time: string): boolean {
  return TIME_REGEX.test(time);
}

function timeToMinutes(time: string): number {
  if (!isValidTime(time)) return -1;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function validateRules(rules: TimeMessageRule[]): boolean {
  let isValid = true;
  const timeSlots: { start: number; end: number; id: string }[] = [];

  for (const rule of rules) {
    if (!rule.content.trim()) {
      toast.error('Mensagem não pode ser vazia.');
      isValid = false;
      continue;
    }

    if (!isValidTime(rule.startTime) || !isValidTime(rule.endTime)) {
      toast.error('Formato de hora inválido (HH:MM).');
      isValid = false;
      continue;
    }

    const startMinutes = timeToMinutes(rule.startTime);
    const endMinutes = timeToMinutes(rule.endTime);

    if (startMinutes >= endMinutes) {
      toast.error(`Hora de Início (${rule.startTime}) deve ser anterior à Hora de Fim (${rule.endTime}).`);
      isValid = false;
      continue;
    }

    timeSlots.push({ start: startMinutes, end: endMinutes, id: rule.id });
  }

  if (!isValid) return false;

  // Check for overlaps (optional warning)
  for (let i = 0; i < timeSlots.length; i++) {
    for (let j = i + 1; j < timeSlots.length; j++) {
      const slotA = timeSlots[i];
      const slotB = timeSlots[j];

      // Overlap condition: (A_start < B_end) AND (B_start < A_end)
      if (slotA.start < slotB.end && slotB.start < slotA.end) {
        toast.warning('Faixas de horário se sobrepõem. Isso pode causar comportamento inesperado.');
        // We allow overlap but warn the user.
      }
    }
  }

  return true;
}

export const TimeMessageRuleEditor = ({ formData, setFormData }: TimeMessageRuleEditorProps) => {
  const rules = formData.timeMessageRules || [];

  const updateRules = useCallback(
    (newRules: TimeMessageRule[]) => {
      setFormData({ ...formData, timeMessageRules: newRules });
    },
    [formData, setFormData],
  );

  const handleAddRule = () => {
    const newRule: TimeMessageRule = {
      id: uuidv4(),
      startTime: '06:00',
      endTime: '23:59',
      content: 'Nova mensagem baseada no tempo.',
    };
    updateRules([...rules, newRule]);
  };

  const handleUpdateRule = (id: string, updates: Partial<TimeMessageRule>) => {
    const newRules = rules.map((rule) =>
      rule.id === id ? { ...rule, ...updates } : rule,
    );
    updateRules(newRules);
  };

  const handleDeleteRule = (id: string) => {
    const newRules = rules.filter((rule) => rule.id !== id);
    updateRules(newRules);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Defina mensagens baseadas na hora do dia (HH:MM).</p>

      {rules.length === 0 && (
        <div className="text-center py-4 border border-dashed border-border rounded-md text-muted-foreground text-sm">
          Nenhuma regra de tempo definida.
        </div>
      )}

      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className={cn(
              "p-4 rounded-lg border bg-secondary/40 space-y-3",
              (!isValidTime(rule.startTime) || !isValidTime(rule.endTime) || !rule.content.trim())
                ? "border-destructive/50"
                : "border-border/60",
            )}
          >
            <div className="flex justify-between items-start">
              <Label className="text-xs font-semibold text-primary">Regra #{index + 1}</Label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                onClick={() => handleDeleteRule(rule.id)}
                aria-label="Excluir regra"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor={`start-${rule.id}`} className="text-xs">Início (HH:MM)</Label>
                <Input
                  id={`start-${rule.id}`}
                  type="text"
                  placeholder="00:00"
                  value={rule.startTime}
                  onChange={(e) => handleUpdateRule(rule.id, { startTime: e.target.value })}
                  className={cn(
                    "h-8 text-sm",
                    !isValidTime(rule.startTime) && "border-destructive",
                  )}
                  maxLength={5}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`end-${rule.id}`} className="text-xs">Fim (HH:MM)</Label>
                <Input
                  id={`end-${rule.id}`}
                  type="text"
                  placeholder="23:59"
                  value={rule.endTime}
                  onChange={(e) => handleUpdateRule(rule.id, { endTime: e.target.value })}
                  className={cn(
                    "h-8 text-sm",
                    !isValidTime(rule.endTime) && "border-destructive",
                  )}
                  maxLength={5}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`content-${rule.id}`} className="text-xs">Mensagem</Label>
              <Textarea
                id={`content-${rule.id}`}
                placeholder="Digite a mensagem para esta faixa de horário..."
                value={rule.content}
                onChange={(e) => handleUpdateRule(rule.id, { content: e.target.value })}
                rows={2}
                className={cn(
                  "text-sm",
                  !rule.content.trim() && "border-destructive",
                )}
              />
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={handleAddRule} className="w-full gap-2">
        <Plus className="h-4 w-4" />
        Adicionar Faixa
      </Button>
    </div>
  );
  
};

export { validateRules as validateTimeMessageRules };