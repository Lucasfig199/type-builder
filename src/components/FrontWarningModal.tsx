import { useState, useCallback } from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface FrontWarningConfig {
  groupName: string;
  currentName: string;
  newName: string;
}

interface FrontWarningModalProps {
  open: boolean;
  config: FrontWarningConfig | null;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const FrontWarningModal = ({
  open,
  config,
  isLoading = false,
  onConfirm,
  onCancel,
}: FrontWarningModalProps) => {
  if (!config) return null;

  const { groupName, currentName, newName } = config;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isLoading && onCancel()}>
      <DialogContent className="sm:max-w-lg border-destructive/30 bg-card/95 backdrop-blur-xl shadow-2xl ring-2 ring-destructive/20">
        {/* Icon */}
        <div className="flex justify-center mb-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-destructive/20 ring-4 ring-destructive/30 animate-pulse">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold text-destructive flex items-center justify-center gap-2">
            <Lock className="h-5 w-5" />
            ⚠️ ATENÇÃO: FLUXO INICIAL
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-4 text-base leading-relaxed">
            O <strong className="text-foreground">primeiro fluxo</strong> do grupo precisa se chamar{' '}
            <code className="px-2 py-0.5 bg-destructive/10 text-destructive rounded font-bold">FRONT</code>.
            <br /><br />
            Se você mudar esse nome, o <strong className="text-destructive">backend pode parar de funcionar</strong> e o envio pode falhar.
          </DialogDescription>
        </DialogHeader>

        {/* Details block */}
        <div className="mt-4 p-4 rounded-lg bg-destructive/5 border-2 border-destructive/20 space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground font-medium min-w-[100px]">GRUPO:</span>
            <code className="text-foreground bg-background/50 px-2 py-0.5 rounded text-xs font-bold">
              {groupName}
            </code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground font-medium min-w-[100px]">Fluxo atual:</span>
            <code className="text-foreground bg-background/50 px-2 py-0.5 rounded text-xs font-bold">
              {currentName}
            </code>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground font-medium min-w-[100px]">Novo nome:</span>
            <code className="text-destructive bg-destructive/10 px-2 py-0.5 rounded text-xs font-bold">
              {newName}
            </code>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 border-primary/50 hover:bg-primary/10"
          >
            Cancelar (recomendado)
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 gap-2 bg-destructive hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              'Sim, alterar mesmo assim'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Hook para facilitar o uso do modal
export function useFrontWarning() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<FrontWarningConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((cfg: FrontWarningConfig): Promise<boolean> => {
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
    FrontWarningModalComponent: (
      <FrontWarningModal
        open={isOpen}
        config={config}
        isLoading={isLoading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
  };
}
