import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GroupList } from "@/components/GroupList";
import { FlowList } from "@/components/FlowList";
import { FlowBuilder } from "@/components/FlowBuilder";
import type { Group, Flow } from "@/types/workflow";
import { useOperationsStore, getOperationById } from "@/store/operationsStore";
import { OperationSupabaseConnect } from "@/components/OperationSupabaseConnect";
import { TelegramsButton } from "@/components/TelegramsButton";
import { FetchFlowsModal } from "@/components/FetchFlowsModal";

type View = "groups" | "flows" | "builder";

export default function OperationWorkspace() {
  const navigate = useNavigate();
  const { operationId } = useParams();
  const { operations, setCurrentOperation } = useOperationsStore();

  const operation = useMemo(() => getOperationById(operations, operationId ?? null), [operations, operationId]);

  const [currentView, setCurrentView] = useState<View>("groups");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);

  if (!operation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Operação não encontrada</h1>
          <Button onClick={() => navigate("/")}>Voltar</Button>
        </div>
      </div>
    );
  }

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
    setCurrentView("flows");
  };

  const handleSelectFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    setCurrentView("builder");
  };

  const handleBackToGroups = () => {
    setSelectedGroup(null);
    setCurrentView("groups");
  };

  const handleBackToFlows = () => {
    setSelectedFlow(null);
    setCurrentView("flows");
  };

  if (currentView === "builder" && selectedFlow) {
    return (
      <FlowBuilder
        operationId={operation.id}
        flow={selectedFlow}
        onBack={handleBackToFlows}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-glow pointer-events-none" />

      <header className="relative border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCurrentOperation(operation.id);
                  navigate("/");
                }}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow flex-shrink-0">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-bold truncate">{operation.name}</h1>
                <p className="text-xs text-muted-foreground truncate">Workspace da operação</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <OperationSupabaseConnect operationId={operation.id} />
              <FetchFlowsModal operationId={operation.id} />
              <TelegramsButton operationId={operation.id} />
            </div>
          </div>
        </div>
      </header>

      <main className="relative container mx-auto px-6 py-8">
        {currentView === "groups" && (
          <GroupList
            operationId={operation.id}
            onSelectGroup={handleSelectGroup}
          />
        )}

        {currentView === "flows" && selectedGroup && (
          <FlowList
            operationId={operation.id}
            group={selectedGroup}
            onBack={handleBackToGroups}
            onSelectFlow={handleSelectFlow}
          />
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
}