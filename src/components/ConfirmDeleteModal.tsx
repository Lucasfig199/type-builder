import { useState, useCallback } from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface ConfirmDeleteConfig {
  title: string;
  description: string;
  details?: { label: string; value: string }[];
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmDeleteModalProps {
  open: boolean;
  config: ConfirmDeleteConfig | null;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal = ({
  open,
  config,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) => {
  if (!config) return null;

  const {
    title,
    description,
    details,
    confirmText = 'Apagar',
    cancelText = 'Cancelar',
    danger = true,
  } = config;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isLoading && onCancel()}>
      <DialogContent className="sm:max-w-md border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-2">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
            danger 
              ? 'bg-destructive/10 ring-2 ring-destructive/20' 
              : 'bg-primary/10 ring-2 ring-primary/20'
          }`}>
            {danger ? (
              <Trash2 className="h-7 w-7 text-destructive" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-primary" />
            )}
          </div>
        </div>

        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Details block */}
        {details && details.length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border/50 space-y-2">
            {details.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground font-medium min-w-[80px]">{item.label}:</span>
                <code className="text-foreground bg-background/50 px-2 py-0.5 rounded text-xs break-all">
                  {item.value}
                </code>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="mt-6 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 sm:flex-none gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Apagando...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Hook para facilitar o uso do modal
export function useConfirmDelete() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmDeleteConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((cfg: ConfirmDeleteConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig(cfg);
      setIsOpen(true);
      setResolveRef(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef) {
      resolveRef(true);
      setResolveRef(null);
    }
    setIsOpen(false);
    setConfig(null);
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    if (resolveRef) {
      resolveRef(false);
      setResolveRef(null);
    }
    setIsOpen(false);
    setConfig(null);
  }, [resolveRef]);

  return {
    isOpen,
    config,
    isLoading,
    setIsLoading,
    confirm,
    handleConfirm,
    handleCancel,
    ConfirmDeleteModalComponent: (
      <ConfirmDeleteModal
        open={isOpen}
        config={config}
        isLoading={isLoading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
  };
}
