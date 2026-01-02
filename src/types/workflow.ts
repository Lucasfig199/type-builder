export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  flows: Flow[];
}

export interface Flow {
  id: string;
  name: string;
  groupId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
}

export type NodeType =
  | 'start'
  | 'message'
  | 'message-utm'
  | 'message-time' // New
  | 'photo'
  | 'photo-caption'
  | 'photo-caption-time'
  | 'video'
  | 'video-caption'
  | 'video-caption-time'
  | 'audio'
  | 'time'
  | 'lead-respond'
  | 'hook'
  | 'delete-hook'
  | 'link-pix'
  | 'deliverable'
  | 'reminder'
  | 'note'; // Bloco de Notas (visual-only, not exported)

export interface BubbleData {
  id: string;
  type: NodeType;
  data: NodeData;
}

export interface TimeMessageRule {
  id: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  content: string;
}

export interface TimeMediaRule {
  id: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  mediaUrl: string;
  caption?: string;
}

export interface FlowNode {
  id: string;
  type: 'group' | 'start' | 'note';
  position: { x: number; y: number };
  // Note nodes can have width/height for resizing
  width?: number;
  height?: number;
  data: {
    label: string;
    bubbles?: BubbleData[];
    // For note nodes
    note?: NoteData;
  };
}

export interface NoteStyle {
  fontSize?: number;
  textColor?: string;
  bgColor?: string;
}

export interface NoteData {
  title?: string;
  html?: string;
  textPreview?: string;
  style?: NoteStyle;
  heightMode?: 'sm' | 'md' | 'lg';
}

export interface NodeData {
  label: string;

  /**
   * Id real (bigserial) da linha no Supabase (TYPE_BUILDER)
   * usada para DELETE ao excluir este bloco.
   */
  supabaseRowId?: number;

  /**
   * Coluna Mx/Tx usada apenas para publicação/ordem (não é usada para exclusão agora).
   */
  supabaseColumn?: string;

  content?: string;
  utm?: string;
  caption?: string;
  mediaUrl?: string;
  timeMin?: number;
  timeMax?: number;

  hookFlowId?: string;
  hookHours?: number;
  hookMinutes?: number;

  // New field for message-time
  timeMessageRules?: TimeMessageRule[];

  // New field for photo-caption-time and video-caption-time
  timeMediaRules?: TimeMediaRule[];

  // New fields for deliverable
  deliverableAction?: 'add' | 'delete';
  deliverableFlowId?: string;

  // New fields for reminder (Relembrar)
  reminderAction?: 'add' | 'delete';
  reminderFlowId?: string;
  reminderHours?: number;
  reminderMinutes?: number;

  // Unified hook mode
  hookAction?: 'add' | 'delete';

  // Note block data (visual-only, not exported to backend)
  note?: NoteData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export const NODE_PREFIXES: Record<NodeType, string> = {
  start: 'INICIO',
  message: 'MSG-',
  'message-utm': 'MSG-UTM-',
  'message-time': 'MSG-TEMPO-',
  photo: 'FT-',
  'photo-caption': 'FT-C-',
  'photo-caption-time': 'FT-C-T-',
  video: 'VD-',
  'video-caption': 'VD-C-',
  'video-caption-time': 'VD-C-T-',
  audio: 'AU-',
  time: 'T-',
  'lead-respond': 'LD',
  hook: 'GANCHO-',
  'delete-hook': 'APAGAR-GANCHO-',
  'link-pix': 'LK-PIX',
  deliverable: '', // Dynamic prefix based on action (ADD-ENTREGA-FLUXO- or DEL-ENTREGA-FLUXO-)
  reminder: '', // Dynamic prefix based on action (ADD-REL- or DEL-REL-)
  note: '', // Visual-only, not exported to backend
};

export const NODE_LABELS: Record<NodeType, string> = {
  start: 'Início',
  message: 'Mensagem',
  'message-utm': 'Mensagem + UTM',
  'message-time': 'Mensagem + Tempo',
  photo: 'Foto',
  'photo-caption': 'Foto + Caption',
  'photo-caption-time': 'Foto + Caption Tempo',
  video: 'Vídeo',
  'video-caption': 'Vídeo + Caption',
  'video-caption-time': 'Vídeo + Caption Tempo',
  audio: 'Áudio',
  time: 'Tempo',
  'lead-respond': 'Lead Responde',
  hook: 'Gancho',
  'delete-hook': 'Apagar Gancho',
  'link-pix': 'Link / Pix',
  deliverable: 'Entregável',
  reminder: 'Relembrar',
  note: 'Bloco de Notas',
};