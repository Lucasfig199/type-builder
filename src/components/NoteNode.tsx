import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { Pencil, StickyNote, Trash2, GripVertical } from 'lucide-react';
import { NoteData } from '@/types/workflow';
import { cn } from '@/lib/utils';

export interface NoteNodeData {
  note?: NoteData;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

const DEFAULT_BG_COLOR = '#1e3a5f';
const DEFAULT_TEXT_COLOR = '#ffffff';

function NoteNode({ id, data, selected }: NodeProps) {
  const noteData = (data as NoteNodeData)?.note;
  const onEdit = (data as NoteNodeData)?.onEdit;
  const onDelete = (data as NoteNodeData)?.onDelete;

  const title = noteData?.title || '';
  const html = noteData?.html || '';
  const textPreview = noteData?.textPreview || '';
  const style = noteData?.style || {};
  const heightMode = noteData?.heightMode || 'md';

  const bgColor = style.bgColor || DEFAULT_BG_COLOR;
  const textColor = style.textColor || DEFAULT_TEXT_COLOR;
  const fontSize = style.fontSize || 14;

  // Calculate max lines based on height mode
  const maxLines = heightMode === 'sm' ? 2 : heightMode === 'lg' ? 8 : 4;

  const handleEdit = useCallback(() => {
    onEdit?.(id);
  }, [id, onEdit]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(id);
  }, [id, onDelete]);

  return (
    <>
      <NodeResizer 
        minWidth={200} 
        minHeight={120}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-3 !h-3 !bg-primary !border-primary"
      />
      
      <div
        className={cn(
          "rounded-xl shadow-lg overflow-hidden cursor-pointer transition-all duration-200",
          "border-2",
          selected ? "border-primary shadow-primary/20" : "border-transparent hover:border-border/60"
        )}
        style={{ 
          backgroundColor: bgColor,
          minWidth: 200,
          minHeight: 120,
          width: '100%',
          height: '100%',
        }}
        onDoubleClick={handleEdit}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.15)' }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="cursor-grab nodrag">
              <GripVertical className="h-4 w-4 opacity-50" style={{ color: textColor }} />
            </div>
            <StickyNote className="h-4 w-4 flex-shrink-0" style={{ color: textColor }} />
            <span 
              className="text-sm font-medium truncate"
              style={{ color: textColor }}
            >
              {title || 'Bloco de Notas'}
            </span>
          </div>
          
          <div className="flex items-center gap-1 nodrag">
            <button
              type="button"
              onClick={handleEdit}
              className="p-1.5 rounded-md transition-colors hover:bg-white/10"
              aria-label="Editar nota"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" style={{ color: textColor }} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-md transition-colors hover:bg-red-500/20"
              aria-label="Remover nota"
              title="Remover"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="p-3 overflow-hidden"
          style={{ 
            color: textColor,
            fontSize: `${fontSize}px`,
          }}
        >
          {html ? (
            <div 
              className="prose prose-sm max-w-none overflow-hidden"
              style={{ 
                color: textColor,
                display: '-webkit-box',
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p 
              className="text-sm italic opacity-60"
              style={{ color: textColor }}
            >
              Clique para escrever...
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(NoteNode);
