import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TimeFirstWarningModalProps {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}

export function TimeFirstWarningModal({
  open,
  onCancel,
  onContinue,
}: TimeFirstWarningModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-500">
            ⚠️ Atenção: Tempo como primeira etapa
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Se esse <strong>Tempo</strong> for o primeiro card, ele será{" "}
              <strong>T1</strong> e só será ativado depois do <strong>M1</strong>.
            </p>
            <p>Tem certeza que deseja continuar?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onContinue}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Continuar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
