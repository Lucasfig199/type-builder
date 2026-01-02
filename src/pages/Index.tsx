import { useState } from 'react';
import { Zap } from 'lucide-react';
import { SupabaseConnect } from '@/components/SupabaseConnect';
import { GroupList } from '@/components/GroupList';
import { FlowList } from '@/components/FlowList';
import { FlowBuilder } from '@/components/FlowBuilder';
import { Group, Flow } from '@/types/workflow';

type View = 'groups' | 'flows' | 'builder';

const Index = () => {
  const [currentView, setCurrentView] = useState<View>('groups');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
    setCurrentView('flows');
  };

  const handleSelectFlow = (flow: Flow) => {
    setSelectedFlow(flow);
    setCurrentView('builder');
  };

  const handleBackToGroups = () => {
    setSelectedGroup(null);
    setCurrentView('groups');
  };

  const handleBackToFlows = () => {
    setSelectedFlow(null);
    setCurrentView('flows');
  };

  if (currentView === 'builder' && selectedFlow) {
    return <FlowBuilder flow={selectedFlow} onBack={handleBackToFlows} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Background glow effect */}
      <div className="fixed inset-0 bg-gradient-glow pointer-events-none" />
      
      {/* Header */}
      <header className="relative border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Type Builder</h1>
                <p className="text-xs text-muted-foreground">Workflow de Mensagens</p>
              </div>
            </div>
            <SupabaseConnect />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative container mx-auto px-6 py-8">
        {currentView === 'groups' && (
          <GroupList onSelectGroup={handleSelectGroup} />
        )}
        
        {currentView === 'flows' && selectedGroup && (
          <FlowList 
            group={selectedGroup} 
            onBack={handleBackToGroups}
            onSelectFlow={handleSelectFlow}
          />
        )}
      </main>

      {/* Footer gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
};

export default Index;