import { memo, useMemo, useState } from "react";
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DeletableEdgeData = {
  onDelete?: (edgeId: string) => void;
};

export const DeletableEdge = memo((props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
    selected,
  } = props;

  const [isHovering, setIsHovering] = useState(false);

  const [edgePath, labelX, labelY] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  const onDelete = (data as DeletableEdgeData | undefined)?.onDelete;

  return (
    <>
      {/* Path "hit-area" para hover fácil sem afetar visual */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />

      {/* Path visível (mantém estilo do app) */}
      <path
        d={edgePath}
        fill="none"
        stroke="hsl(25 95% 53%)"
        strokeWidth={2}
        strokeDasharray="6 6"
        className={cn("transition-opacity", selected ? "opacity-100" : "opacity-90")}
        style={style}
        markerEnd={markerEnd}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />

      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            aria-label="Remover conexão"
            className={cn(
              "pointer-events-auto inline-flex items-center justify-center",
              "h-6 w-6 rounded-full border border-border/60 bg-card/80 backdrop-blur",
              "text-muted-foreground hover:text-destructive hover:bg-destructive/15",
              "shadow-sm transition-all",
              "opacity-0 scale-95",
              isHovering && "opacity-100 scale-100",
            )}
            style={{ transitionDuration: "140ms" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(id);
            }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

DeletableEdge.displayName = "DeletableEdge";