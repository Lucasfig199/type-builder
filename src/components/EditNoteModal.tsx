import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bold,
  Italic,
  Underline,
  List,
  Paintbrush,
  Type,
  Eraser,
} from 'lucide-react';
import { NoteData, NoteStyle } from '@/types/workflow';
import { cn } from '@/lib/utils';

interface EditNoteModalProps {
  open: boolean;
  onClose: () => void;
  noteData?: NoteData;
  onSave: (noteData: NoteData) => void;
}

const FONT_SIZES = [12, 14, 16, 18, 20, 24];

const COLOR_PRESETS = [
  '#ffffff', '#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6',
  '#fca5a5', '#fdba74', '#fde047', '#86efac', '#67e8f9', '#93c5fd', '#c4b5fd', '#f9a8d4',
];

const BG_COLOR_PRESETS = [
  '#1f2937', '#1e293b', '#1e3a5f', '#1a2e05', '#2d1b4e', '#3b1a1a', '#312e81', '#0f172a', '#111827',
  '#374151', '#475569', '#334155', '#3f3f46', '#52525b', '#171717', '#0a0a0a', 'transparent',
];

export const EditNoteModal = ({
  open,
  onClose,
  noteData,
  onSave,
}: EditNoteModalProps) => {
  const [title, setTitle] = useState(noteData?.title || '');
  const [fontSize, setFontSize] = useState(noteData?.style?.fontSize || 14);
  const [textColor, setTextColor] = useState(noteData?.style?.textColor || '#ffffff');
  const [bgColor, setBgColor] = useState(noteData?.style?.bgColor || '#1f2937');
  const [heightMode, setHeightMode] = useState<'sm' | 'md' | 'lg'>(noteData?.heightMode || 'md');
  
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialize editor content when modal opens
  useEffect(() => {
    if (open && editorRef.current) {
      editorRef.current.innerHTML = noteData?.html || '';
    }
  }, [open, noteData?.html]);

  // Reset state when noteData changes
  useEffect(() => {
    if (open) {
      setTitle(noteData?.title || '');
      setFontSize(noteData?.style?.fontSize || 14);
      setTextColor(noteData?.style?.textColor || '#ffffff');
      setBgColor(noteData?.style?.bgColor || '#1f2937');
      setHeightMode(noteData?.heightMode || 'md');
    }
  }, [open, noteData]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  const handleClearFormatting = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const text = range.toString();
      document.execCommand('insertText', false, text);
    }
    editorRef.current?.focus();
  }, []);

  const getTextPreview = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    return text.substring(0, 100);
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    const textPreview = getTextPreview(html);
    
    const data: NoteData = {
      title: title.trim() || undefined,
      html,
      textPreview,
      style: {
        fontSize,
        textColor,
        bgColor,
      },
      heightMode,
    };
    
    onSave(data);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-node-note flex items-center justify-center text-white">
              <Type className="h-4 w-4" />
            </div>
            Editar Bloco de Notas
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Title Input */}
          <div className="space-y-2">
            <Label htmlFor="note-title">Título (opcional)</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ideia de CTA, Atenção, Teste A/B..."
              className="bg-secondary"
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 p-2 rounded-lg bg-secondary border border-border">
            {/* Font Size */}
            <Select value={String(fontSize)} onValueChange={(v) => setFontSize(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Text Formatting */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand('bold')}
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand('italic')}
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand('underline')}
            >
              <Underline className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* List */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand('insertUnorderedList')}
            >
              <List className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Text Color */}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 relative">
                  <Type className="h-4 w-4" />
                  <div
                    className="absolute bottom-0.5 left-1 right-1 h-1 rounded-full"
                    style={{ backgroundColor: textColor }}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-2">
                  <Label className="text-xs">Cor do texto</Label>
                  <div className="grid grid-cols-9 gap-1">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "w-6 h-6 rounded border-2 transition-all",
                          textColor === color ? "border-primary scale-110" : "border-transparent hover:border-muted-foreground"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setTextColor(color)}
                      />
                    ))}
                  </div>
                  <Input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-8 w-full"
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* Background Color */}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 relative">
                  <Paintbrush className="h-4 w-4" />
                  <div
                    className="absolute bottom-0.5 left-1 right-1 h-1 rounded-full border border-border/50"
                    style={{ backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor }}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-2">
                  <Label className="text-xs">Cor de fundo da nota</Label>
                  <div className="grid grid-cols-9 gap-1">
                    {BG_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "w-6 h-6 rounded border-2 transition-all",
                          color === 'transparent' && "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,hsl(var(--muted))_3px,hsl(var(--muted))_6px)]",
                          bgColor === color ? "border-primary scale-110" : "border-muted-foreground/30 hover:border-muted-foreground"
                        )}
                        style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                        onClick={() => setBgColor(color)}
                      />
                    ))}
                  </div>
                  <Input
                    type="color"
                    value={bgColor === 'transparent' ? '#1f2937' : bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-8 w-full"
                  />
                </div>
              </PopoverContent>
            </Popover>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Clear Formatting */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleClearFormatting}
              title="Limpar formatação"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </div>

          {/* Editor */}
          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <div
              ref={editorRef}
              contentEditable
              className={cn(
                "min-h-[200px] max-h-[300px] overflow-y-auto p-4 rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary",
                "prose prose-invert prose-sm max-w-none"
              )}
              style={{
                fontSize: `${fontSize}px`,
                color: textColor,
                backgroundColor: bgColor === 'transparent' ? 'hsl(var(--secondary))' : bgColor,
              }}
              data-placeholder="Escreva suas anotações aqui..."
              onFocus={(e) => {
                if (e.currentTarget.innerHTML === '' || e.currentTarget.innerHTML === '<br>') {
                  e.currentTarget.innerHTML = '';
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Dica: Use Ctrl+B para negrito, Ctrl+I para itálico, Ctrl+U para sublinhado.
            </p>
          </div>

          {/* Height Mode */}
          <div className="space-y-2">
            <Label>Altura do preview no grupo</Label>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={heightMode === mode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHeightMode(mode)}
                >
                  {mode === 'sm' ? 'Compacto (1 linha)' : mode === 'md' ? 'Médio (2 linhas)' : 'Grande (4 linhas)'}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
