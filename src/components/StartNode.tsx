import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play } from 'lucide-react';

interface StartNodeProps {
  data: {
    label: string;
  };
}

export const StartNode = memo(({ data }: StartNodeProps) => {
  return (
    <div className="relative w-40 rounded-xl bg-gradient-primary border-2 border-primary shadow-glow p-4 text-primary-foreground flex items-center justify-center">
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-primary-foreground !border-2 !border-primary"
        style={{ right: -8 }}
      />
      <Play className="h-5 w-5 mr-2" />
      <span className="font-semibold">{data.label}</span>
    </div>
  );
});

StartNode.displayName = 'StartNode';